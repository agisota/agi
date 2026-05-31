import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, afterEach } from "vitest";
import { evaluateBranchGroupPromotion, resolveBranchGroupMergeRouting } from "../group-merge-coordinator.js";

const dirs: string[] = [];

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "fusion-group-route-"));
  dirs.push(dir);
  execSync("git init -b main", { cwd: dir, stdio: "ignore" });
  execSync("git config user.name test", { cwd: dir });
  execSync("git config user.email test@example.com", { cwd: dir });
  execSync("echo hi > a.txt", { cwd: dir, shell: "/bin/bash" });
  execSync("git add . && git commit -m init", { cwd: dir, stdio: "ignore", shell: "/bin/bash" });
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("evaluateBranchGroupPromotion", () => {
  const baseGroup = {
    id: "BG-1",
    branchName: "fusion/groups/planning-x",
    autoMerge: true,
    status: "open" as const,
  };

  const baseSettings: {
    autoMerge: boolean;
    globalPause: boolean;
    enginePaused: boolean;
  } = {
    autoMerge: true,
    globalPause: false,
    enginePaused: false,
  };

  it("returns eligible when pauses are off and automerge resolves true", () => {
    const decision = evaluateBranchGroupPromotion({
      group: baseGroup,
      settings: baseSettings,
    });

    expect(decision).toEqual({
      eligible: true,
      reason: "eligible",
      groupAutoMerge: true,
    });
  });

  it("returns group-automerge-disabled when group autoMerge is false", () => {
    const decision = evaluateBranchGroupPromotion({
      group: { ...baseGroup, autoMerge: false },
      settings: baseSettings,
    });

    expect(decision).toEqual({
      eligible: false,
      reason: "group-automerge-disabled",
      groupAutoMerge: false,
    });
  });

  it("returns settings-automerge-disabled when settings autoMerge is false", () => {
    const withDefaultedGroup = evaluateBranchGroupPromotion({
      group: { ...baseGroup, autoMerge: undefined as unknown as boolean },
      settings: { ...baseSettings, autoMerge: false },
    });
    expect(withDefaultedGroup).toEqual({
      eligible: false,
      reason: "settings-automerge-disabled",
      groupAutoMerge: false,
    });

    const withExplicitGroupTrue = evaluateBranchGroupPromotion({
      group: { ...baseGroup, autoMerge: true },
      settings: { ...baseSettings, autoMerge: false },
    });
    expect(withExplicitGroupTrue).toEqual({
      eligible: false,
      reason: "settings-automerge-disabled",
      groupAutoMerge: true,
    });
  });

  it("returns global-pause before other gates", () => {
    const decision = evaluateBranchGroupPromotion({
      group: { ...baseGroup, autoMerge: true },
      settings: { ...baseSettings, globalPause: true, autoMerge: false },
    });

    expect(decision).toEqual({
      eligible: false,
      reason: "global-pause",
      groupAutoMerge: true,
    });
  });

  it("returns engine-paused before automerge gate when global pause is off", () => {
    const decision = evaluateBranchGroupPromotion({
      group: { ...baseGroup, autoMerge: true },
      settings: { ...baseSettings, enginePaused: true, autoMerge: false },
    });

    expect(decision).toEqual({
      eligible: false,
      reason: "engine-paused",
      groupAutoMerge: true,
    });
  });
});

describe("resolveBranchGroupMergeRouting", () => {
  it("returns null for non-shared tasks", async () => {
    const routing = await resolveBranchGroupMergeRouting({
      task: { branchContext: { groupId: "BG-1", source: "planning", assignmentMode: "per-task-derived" } },
      store: { getBranchGroup: () => null } as any,
      projectDefaultBranch: "main",
    });
    expect(routing).toBeNull();
  });

  it("creates the group branch when missing", async () => {
    const rootDir = makeRepo();
    const branchGroup = {
      id: "BG-1",
      sourceType: "planning",
      sourceId: "planning:x",
      branchName: "fusion/groups/planning-x",
      autoMerge: false,
      prState: "none",
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const routing = await resolveBranchGroupMergeRouting({
      task: { branchContext: { groupId: "BG-1", source: "planning", assignmentMode: "shared" } },
      store: { getBranchGroup: () => branchGroup } as any,
      projectDefaultBranch: "main",
      rootDir,
    });

    expect(routing?.mergeTarget.branch).toBe(branchGroup.branchName);
    const branch = execSync(`git rev-parse --verify refs/heads/${branchGroup.branchName}`, { cwd: rootDir, encoding: "utf8" }).trim();
    expect(branch).toMatch(/^[a-f0-9]{40}$/);
  });
});
