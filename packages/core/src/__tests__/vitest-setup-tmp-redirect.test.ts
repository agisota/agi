import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const createdPaths: string[] = [];

function remember(path: string): string {
  createdPaths.push(path);
  return path;
}

function expectUnderWorkerRoot(path: string): void {
  const workerRoot = process.env.FUSION_TEST_WORKER_ROOT;
  expect(workerRoot).toBeTruthy();
  expect(path.startsWith(`${workerRoot}${sep}`)).toBe(true);
  expect(dirname(path)).toBe(join(workerRoot!, `redir-${process.pid}`));
}

afterEach(() => {
  for (const path of createdPaths.splice(0).reverse()) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("vitest setup tmpdir mkdtemp redirect", () => {
  it("redirects sync mkdtemp prefixes rooted directly at the OS temp dir", () => {
    const path = remember(mkdtempSync(join(tmpdir(), "fn-redirect-sync-")));

    expectUnderWorkerRoot(path);
  });

  it("redirects async mkdtemp prefixes rooted directly at the OS temp dir", async () => {
    const path = remember(await mkdtemp(join(tmpdir(), "fn-redirect-async-")));

    expectUnderWorkerRoot(path);
  });

  it("redirects the realpath spelling of the OS temp dir when it differs", () => {
    const realTmpdir = realpathSync(tmpdir());
    if (realTmpdir === tmpdir()) {
      expect(realTmpdir).toBe(tmpdir());
      return;
    }

    const path = remember(mkdtempSync(join(realTmpdir, "fn-redirect-realpath-")));

    expectUnderWorkerRoot(path);
  });

  it("leaves nested temp-root prefixes unchanged", () => {
    const parent = remember(join(tmpdir(), `fn-redirect-parent-${process.pid}-${Date.now()}`));
    mkdirSync(parent, { recursive: true });

    const path = remember(mkdtempSync(join(parent, "nested-")));

    expect(path.startsWith(`${parent}${sep}`)).toBe(true);
  });

  it("leaves non-string prefixes untouched", () => {
    const prefix = Buffer.from(join(tmpdir(), "fn-redirect-buffer-"));

    const path = remember(mkdtempSync(prefix));

    expect(path.startsWith(`${tmpdir()}${sep}`)).toBe(true);
  });
});
