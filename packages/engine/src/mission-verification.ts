/**
 * Mission behavioral-verification capability (U3).
 *
 * The Validator Run's read-only AI judge cannot run code, so its "pass" on a
 * *behavioral* assertion is advisory only (U2). This module supplies the
 * authoritative, NON-MUTATING verification step that confirms a behavioral/bug
 * assertion by exercising the implemented code.
 *
 * Channels:
 * - **test-execution** (this unit): run the project's scoped test suite / an
 *   agent-supplied regression test against a disposable checkout at a trusted
 *   revision, through an explicit isolating sandbox backend.
 * - **app-driving** (later unit U5/U8): drive a running app instance. Not
 *   implemented here — the capability surface is structured so it can be added
 *   without reshaping callers.
 *
 * Safety invariants enforced here (the boundary, not a convention):
 * - R18: execute under an *isolating* sandbox backend (bubblewrap / sandbox-exec)
 *   with a scrubbed env allowlist; FAIL CLOSED to a non-pass when no isolating
 *   backend is available — never fall through to the unrestricted native backend.
 * - R19: the command is built from a fixed, system-owned template into which only
 *   a validated test-file path is substituted; shell metacharacters are rejected.
 * - R11/R17: verification runs against a disposable checkout at the integration
 *   SHA (never the pruned live worktree, never the repo root); the source tree
 *   that feeds diff/merge is asserted git-clean after a run.
 * - R5/AE5: agent-supplied proof must FAIL on a second disposable checkout at
 *   `git merge-base` (a revision the agent does not control) and PASS on the
 *   implementation; a test that passes on both is rejected.
 * - R9: inconclusive / timeout / setup failure resolves to a non-pass.
 * - R10: no board / mission writes happen here.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { TaskStore } from "@fusion/core";
import type { SandboxCapabilities } from "./sandbox/index.js";
import { __setSandboxBackendForTests, resolveSandboxBackend } from "./sandbox/index.js";
import type { SandboxBackend } from "./sandbox/index.js";
import { detectBwrap } from "./sandbox/bubblewrap-detect.js";
import { detectSandboxExec } from "./sandbox/sandbox-exec-detect.js";
import { runVerificationCommand } from "./verification-utils.js";
import { createLogger } from "./logger.js";

const execAsync = promisify(exec);
const verifyLog = createLogger("mission-verify");

// ── Verdict types ───────────────────────────────────────────────────────────

/**
 * Outcome of a verification run for a single behavioral assertion.
 *
 * - `pass`: behavior confirmed by execution.
 * - `fail`: behavior observed wrong (the defect still reproduces / proof rejected).
 * - `inconclusive`: verification could not run or conclude (no isolating backend,
 *   timeout, setup failure, rejected/invalid proof input). First-class and
 *   distinct from `fail`: it must NOT spawn remediation (handled by later units),
 *   but in this unit it never resolves to a default pass either.
 */
export type VerificationVerdict = "pass" | "fail" | "inconclusive";

/** Why a verification run reached its verdict (for durable observability later). */
export interface VerificationOutcome {
  verdict: VerificationVerdict;
  /** Human-readable reason, suitable for surfacing in a failure record. */
  reason: string;
  /** The assertion this outcome corresponds to. */
  assertionId: string;
  /** Optional summarized command output for the failure record. */
  detail?: string;
}

/** Shape of agent-supplied executable proof (a regression test). */
export interface VerificationProof {
  /**
   * Path to the regression test file, relative to the checkout root. Validated
   * to reject shell metacharacters and path escapes before use (R19).
   */
  testFilePath: string;
}

/** Input describing a single behavioral assertion to verify. */
export interface VerificationRequest {
  assertionId: string;
  /** The assertion text (for logging / reason building). */
  assertion: string;
  /** Board task id associated with the feature, used for verification-command logging. */
  taskId?: string;
  /**
   * The trusted revision (integration SHA) whose checkout the implementation is
   * verified against. When absent, verification is inconclusive (cannot
   * materialize a trusted checkout).
   */
  integrationSha?: string;
  /**
   * The `git merge-base` revision (feature branch vs base branch) used as the
   * pre-fix baseline for agent-supplied proof. Not agent-controlled.
   */
  mergeBaseSha?: string;
  /** Optional agent-supplied executable proof. */
  proof?: VerificationProof;
  /** Abort signal to bound the run. */
  signal?: AbortSignal;
}

/**
 * Injected verification capability. Mirrors the `createFnAgent` injection
 * pattern so MissionExecutionLoop can swap a real implementation for a mock in
 * tests. Optional on the loop: when absent, behavioral assertions resolve to a
 * non-pass without invoking any execution (preserving existing behavior for
 * call sites that do not inject a capability).
 */
export interface VerificationCapability {
  verifyBehavioralAssertion(request: VerificationRequest): Promise<VerificationOutcome>;
}

// ── Command-template safety (R19) ─────────────────────────────────────────────

/**
 * Characters that could break out of the fixed command template or inject
 * additional shell behavior. Agent-supplied test paths containing any of these
 * are rejected before execution.
 */
const SHELL_METACHARACTERS = /[;&|`$(){}<>!*?\[\]\\"'\n\r\t\0]/;

/**
 * Validate an agent-supplied test-file path. Returns the normalized path when
 * safe, or `null` when it must be rejected (R19).
 *
 * Rejects: empty, absolute paths, parent-dir escapes, shell metacharacters,
 * and leading dashes (which could be read as command flags).
 */
export function validateTestPath(rawPath: unknown): string | null {
  if (typeof rawPath !== "string") return null;
  const path = rawPath.trim();
  if (path.length === 0) return null;
  if (SHELL_METACHARACTERS.test(path)) return null;
  if (path.startsWith("/")) return null; // must be relative to the checkout
  if (path.startsWith("-")) return null; // could be parsed as a flag
  // Reject parent-dir escapes (any `..` segment).
  const segments = path.split("/");
  if (segments.some((seg) => seg === "..")) return null;
  return path;
}

/**
 * Build the verification command from the fixed system-owned template. Only a
 * pre-validated test path may be substituted (R19). Callers MUST pass a path
 * already run through {@link validateTestPath}; this function re-checks and
 * throws on violation as a defense-in-depth guard.
 */
export function buildVerificationCommand(template: string, validatedTestPath?: string): string {
  if (validatedTestPath !== undefined) {
    if (validateTestPath(validatedTestPath) === null) {
      throw new Error(`Refusing to build verification command: invalid test path ${JSON.stringify(validatedTestPath)}`);
    }
    if (!template.includes("{testPath}")) {
      throw new Error("Verification command template must contain a {testPath} placeholder when a test path is supplied");
    }
    return template.replace("{testPath}", validatedTestPath);
  }
  // Whole-suite invocation: the template must not reference a test path.
  return template.replace("{testPath}", "").trimEnd();
}

// ── Isolating-backend selection (R18, fail-closed) ────────────────────────────

/**
 * Result of selecting an isolating sandbox backend for verification.
 */
export interface IsolatingBackendSelection {
  /** The backend id to request from `resolveSandboxBackend`, or null if none. */
  backendId: SandboxCapabilities["id"] | null;
  /** Why no isolating backend is available (when backendId is null). */
  reason?: string;
}

/**
 * Describes the detected availability of isolating backends on this host.
 * Injectable for tests so we don't shell out to detect bwrap/sandbox-exec.
 */
export interface IsolatingBackendProbe {
  platform: NodeJS.Platform;
  bubblewrapAvailable: boolean;
  sandboxExecAvailable: boolean;
}

/**
 * Choose an isolating backend, failing closed. Returns `backendId: null` (a
 * non-pass signal) when no isolating backend is available — verification must
 * NEVER fall through to the unrestricted native backend (R18).
 */
export function selectIsolatingBackend(probe: IsolatingBackendProbe): IsolatingBackendSelection {
  if (probe.platform === "linux" && probe.bubblewrapAvailable) {
    return { backendId: "bubblewrap" };
  }
  if (probe.platform === "darwin" && probe.sandboxExecAvailable) {
    return { backendId: "sandbox-exec" };
  }
  return {
    backendId: null,
    reason: `no isolating sandbox backend available (platform=${probe.platform}, bwrap=${probe.bubblewrapAvailable}, sandbox-exec=${probe.sandboxExecAvailable})`,
  };
}

// ── Environment scrubbing (R18) ───────────────────────────────────────────────

/**
 * Environment variables permitted into the verification child process. Anything
 * not on the allowlist (API keys, auth tokens, DB credentials, agent logs) is
 * dropped so agent-authored code executes with a minimal environment.
 */
export const VERIFICATION_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "TERM",
  "NODE_ENV",
  // pnpm / corepack need these to resolve the package manager in the checkout.
  "PNPM_HOME",
  "COREPACK_HOME",
  "npm_config_registry",
] as const;

/**
 * Produce a scrubbed environment containing only allowlisted keys from the
 * source environment, with `CI=1` forced for deterministic test runs.
 */
export function scrubEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const scrubbed: NodeJS.ProcessEnv = {};
  for (const key of VERIFICATION_ENV_ALLOWLIST) {
    const value = source[key];
    if (value !== undefined) {
      scrubbed[key] = value;
    }
  }
  // Force deterministic, non-interactive execution.
  scrubbed.CI = "1";
  return scrubbed;
}

// ── Disposable checkout materialization (R11/R17) ─────────────────────────────

/** A disposable checkout the verification run can execute against. */
export interface DisposableCheckout {
  /** Absolute path to the checkout root (under a run-unique tmpdir). */
  dir: string;
  /** Tear the checkout down unconditionally (idempotent). */
  dispose(): Promise<void>;
}

/**
 * Materializes disposable checkouts at a trusted revision. Injectable so tests
 * can supply a fixture checkout without invoking git.
 */
export interface CheckoutMaterializer {
  /**
   * Create a disposable checkout of `rootDir` at `revision` under a run-unique
   * tmpdir. The implementation MUST NOT mutate the source tree at `rootDir`.
   */
  materialize(rootDir: string, revision: string): Promise<DisposableCheckout>;
  /**
   * Assert that the source tree feeding diff/merge is git-clean (byte-identical)
   * — the R17 post-condition. Throws if dirty.
   */
  assertSourceClean(rootDir: string): Promise<void>;
}

/**
 * Default git-backed materializer: `git worktree add --detach <tmp> <revision>`
 * produces an isolated checkout without touching the source working tree, and
 * `git status --porcelain` on the source confirms cleanliness afterwards.
 */
export class GitCheckoutMaterializer implements CheckoutMaterializer {
  async materialize(rootDir: string, revision: string): Promise<DisposableCheckout> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fn-verify-"));
    // `git worktree add --detach` checks out the revision into a throwaway dir
    // without modifying the source working tree.
    await execAsync(`git worktree add --detach ${JSON.stringify(dir)} ${JSON.stringify(revision)}`, {
      cwd: rootDir,
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      dir,
      dispose: async () => {
        try {
          await execAsync(`git worktree remove --force ${JSON.stringify(dir)}`, {
            cwd: rootDir,
            timeout: 30_000,
          });
        } catch (err) {
          verifyLog.warn(`Failed to remove verification worktree ${dir}:`, err);
        }
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      },
    };
  }

  async assertSourceClean(rootDir: string): Promise<void> {
    const { stdout } = await execAsync("git status --porcelain", {
      cwd: rootDir,
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (stdout.trim().length > 0) {
      throw new Error(`Source tree is not git-clean after verification run:\n${stdout.trim()}`);
    }
  }
}

/** Probe the host for isolating-backend availability (cached by the detectors). */
async function probeIsolatingBackends(): Promise<IsolatingBackendProbe> {
  const [bwrap, sandboxExec] = await Promise.all([
    detectBwrap().catch(() => ({ available: false })),
    detectSandboxExec().catch(() => ({ available: false })),
  ]);
  return {
    platform: process.platform,
    bubblewrapAvailable: bwrap.available,
    sandboxExecAvailable: sandboxExec.available,
  };
}

// ── Test-execution verification capability ────────────────────────────────────

export interface TestExecutionVerificationOptions {
  /** Task store, reused by runVerificationCommand for command logging. */
  store: TaskStore;
  /** Repo root whose source tree must remain git-clean. */
  rootDir: string;
  /**
   * Fixed, system-owned command template. Must contain `{testPath}` when an
   * agent-supplied proof path is used. Example: `pnpm vitest run {testPath}`.
   */
  commandTemplate: string;
  /** Injectable checkout materializer (defaults to git-backed). */
  materializer?: CheckoutMaterializer;
  /** Injectable backend probe (defaults to host detection). */
  probeBackends?: () => Promise<IsolatingBackendProbe>;
  /**
   * Injectable factory for the isolating sandbox backend, given the selected
   * backend id. Defaults to `resolveSandboxBackend({ backendId })`. Injectable so
   * tests can supply a scripted backend without mutating global sandbox state.
   */
  backendFactory?: (backendId: SandboxCapabilities["id"]) => SandboxBackend;
  /** Injectable env source (defaults to process.env). */
  envSource?: NodeJS.ProcessEnv;
}

/**
 * The test-execution channel of the verification run. Confirms a behavioral
 * assertion by running the suite / an agent-supplied regression test against a
 * disposable checkout at the integration SHA, under an isolating sandbox
 * backend with a scrubbed env. Fails closed to a non-pass on any setup failure.
 *
 * App-driving is NOT handled here; a later unit dispatches UI/bug assertions to
 * an app-driving channel. This class is the canonical pattern that channel will
 * mirror.
 */
export class TestExecutionVerificationCapability implements VerificationCapability {
  private readonly store: TaskStore;
  private readonly rootDir: string;
  private readonly commandTemplate: string;
  private readonly materializer: CheckoutMaterializer;
  private readonly probeBackends: () => Promise<IsolatingBackendProbe>;
  private readonly backendFactory: (backendId: SandboxCapabilities["id"]) => SandboxBackend;
  private readonly envSource: NodeJS.ProcessEnv;

  constructor(options: TestExecutionVerificationOptions) {
    this.store = options.store;
    this.rootDir = options.rootDir;
    this.commandTemplate = options.commandTemplate;
    this.materializer = options.materializer ?? new GitCheckoutMaterializer();
    this.probeBackends = options.probeBackends ?? probeIsolatingBackends;
    this.backendFactory = options.backendFactory ?? ((backendId) => resolveSandboxBackend({ backendId }));
    this.envSource = options.envSource ?? process.env;
  }

  async verifyBehavioralAssertion(request: VerificationRequest): Promise<VerificationOutcome> {
    const { assertionId } = request;

    // R11: a trusted revision is required to materialize a disposable checkout.
    if (!request.integrationSha) {
      return this.inconclusive(assertionId, "no integration SHA available to materialize a trusted checkout");
    }

    // R19: validate any agent-supplied proof path BEFORE doing any work.
    let validatedTestPath: string | undefined;
    if (request.proof) {
      const safe = validateTestPath(request.proof.testFilePath);
      if (safe === null) {
        return this.inconclusive(
          assertionId,
          `agent-supplied test path rejected (invalid or contains shell metacharacters): ${JSON.stringify(request.proof.testFilePath)}`,
        );
      }
      validatedTestPath = safe;
    }

    // R18: select an isolating backend, fail closed when none is available.
    const probe = await this.probeBackends();
    const selection = selectIsolatingBackend(probe);
    if (selection.backendId === null) {
      return this.inconclusive(assertionId, selection.reason ?? "no isolating sandbox backend available");
    }

    const command = buildVerificationCommand(this.commandTemplate, validatedTestPath);
    const scrubbedEnv = scrubEnv(this.envSource);
    const logTaskId = request.taskId ?? `verify-${assertionId}`;

    // Route runVerificationCommand through the explicitly-selected isolating
    // backend rather than the no-arg native fallback (R18). runVerificationCommand
    // resolves its backend via the no-arg resolveSandboxBackend(), so we pin the
    // selected isolating backend via the test-override hook for the duration of
    // the run and unconditionally restore afterwards.
    const isolating = this.backendFactory(selection.backendId);
    const restoreBackend = () => __setSandboxBackendForTests(null);
    __setSandboxBackendForTests(isolating);

    let implCheckout: DisposableCheckout | undefined;
    let baselineCheckout: DisposableCheckout | undefined;
    try {
      implCheckout = await this.materializer.materialize(this.rootDir, request.integrationSha);

      const implResult = await runVerificationCommand(
        this.store,
        implCheckout.dir,
        logTaskId,
        command,
        "test",
        request.signal,
        verifyLog,
        "reviewer",
        scrubbedEnv,
      );

      // R5/AE5: agent-supplied proof must fail on the merge-base baseline and
      // pass on the implementation. A test that passes on both is not exercising
      // the defect — reject it.
      if (validatedTestPath) {
        if (!request.mergeBaseSha) {
          return this.inconclusive(assertionId, "no merge-base SHA available to validate agent-supplied proof");
        }
        baselineCheckout = await this.materializer.materialize(this.rootDir, request.mergeBaseSha);
        const baselineResult = await runVerificationCommand(
          this.store,
          baselineCheckout.dir,
          logTaskId,
          command,
          "test",
          request.signal,
          verifyLog,
          "reviewer",
          scrubbedEnv,
        );

        if (baselineResult.success && implResult.success) {
          return {
            verdict: "fail",
            assertionId,
            reason: "agent-supplied proof passes on both the pre-fix baseline and the implementation; it does not exercise the defect",
            detail: "pass-on-both rejected (R5/AE5)",
          };
        }
        if (!baselineResult.success && implResult.success) {
          return { verdict: "pass", assertionId, reason: "regression test fails on the pre-fix baseline and passes on the implementation" };
        }
        // Fails on the implementation → defect still reproduces.
        return {
          verdict: "fail",
          assertionId,
          reason: "regression test does not pass on the implementation; behavior not confirmed",
          detail: implResult.stderr || implResult.stdout || undefined,
        };
      }

      // Whole-suite channel: pass only when the suite passes.
      if (implResult.success) {
        return { verdict: "pass", assertionId, reason: "verification suite passed on the implementation checkout" };
      }
      return {
        verdict: "fail",
        assertionId,
        reason: "verification suite failed on the implementation checkout; behavior not confirmed",
        detail: implResult.stderr || implResult.stdout || undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // R9: any setup/exec failure (timeout, abort, materialization error) is a
      // non-pass; we route it to inconclusive (infra, not behavioral).
      return this.inconclusive(assertionId, `verification run could not complete: ${message}`);
    } finally {
      restoreBackend();
      await implCheckout?.dispose();
      await baselineCheckout?.dispose();
      // R17: the source tree feeding diff/merge must be byte-clean afterwards.
      try {
        await this.materializer.assertSourceClean(this.rootDir);
      } catch (cleanErr) {
        verifyLog.error("Verification post-condition violated (source not git-clean):", cleanErr);
        throw cleanErr instanceof Error ? cleanErr : new Error(String(cleanErr));
      }
    }
  }

  private inconclusive(assertionId: string, reason: string): VerificationOutcome {
    return { verdict: "inconclusive", assertionId, reason };
  }
}
