import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { BranchGroup, MergeTargetResolution, Settings, Task, TaskStore } from "@fusion/core";
import { resolveEffectiveGroupAutoMerge, resolveTaskMergeTarget } from "@fusion/core";

const execAsync = promisify(exec);

export interface BranchGroupMergeRouting {
  branchGroup: BranchGroup;
  mergeTarget: MergeTargetResolution;
}

export interface BranchGroupPromotionDecision {
  eligible: boolean;
  groupAutoMerge: boolean;
  reason:
    | "group-automerge-disabled"
    | "settings-automerge-disabled"
    | "global-pause"
    | "engine-paused"
    | "eligible";
}

/**
 * Evaluates branch-group → default-branch PROMOTION eligibility only.
 * This does not perform promotion and does not govern member → group-integration
 * routing, which stays on the FN-5782 task-level auto-merge path.
 */
export function evaluateBranchGroupPromotion(input: {
  group: Pick<BranchGroup, "id" | "branchName" | "autoMerge" | "status">;
  settings: Pick<Settings, "autoMerge" | "globalPause" | "enginePaused">;
}): BranchGroupPromotionDecision {
  const groupAutoMerge = resolveEffectiveGroupAutoMerge(input.group, input.settings);
  if (input.settings.globalPause) {
    return { eligible: false, reason: "global-pause", groupAutoMerge };
  }
  if (input.settings.enginePaused) {
    return { eligible: false, reason: "engine-paused", groupAutoMerge };
  }
  if (!groupAutoMerge) {
    if (input.group.autoMerge === false) {
      return { eligible: false, reason: "group-automerge-disabled", groupAutoMerge };
    }
    return { eligible: false, reason: "settings-automerge-disabled", groupAutoMerge };
  }
  if (!input.settings.autoMerge) {
    return { eligible: false, reason: "settings-automerge-disabled", groupAutoMerge };
  }
  return { eligible: true, reason: "eligible", groupAutoMerge };
}

async function ensureGroupBranchExists(rootDir: string, branchName: string, startPoint: string): Promise<void> {
  const quotedBranch = JSON.stringify(`refs/heads/${branchName}`);
  try {
    await execAsync(`git show-ref --verify --quiet ${quotedBranch}`, { cwd: rootDir });
    return;
  } catch {
    await execAsync(`git branch ${JSON.stringify(branchName)} ${JSON.stringify(startPoint)}`, { cwd: rootDir });
  }
}

export async function resolveBranchGroupMergeRouting(input: {
  task: Pick<Task, "branchContext" | "baseBranch">;
  store: Pick<TaskStore, "getBranchGroup">;
  projectDefaultBranch: string;
  rootDir?: string;
}): Promise<BranchGroupMergeRouting | null> {
  if (input.task.branchContext?.assignmentMode !== "shared") {
    return null;
  }

  const groupId = input.task.branchContext.groupId;
  const branchGroup = input.store.getBranchGroup(groupId);
  if (!branchGroup) {
    return null;
  }

  if (input.rootDir) {
    await ensureGroupBranchExists(input.rootDir, branchGroup.branchName, input.projectDefaultBranch);
  }

  return {
    branchGroup,
    mergeTarget: resolveTaskMergeTarget(input.task, {
      projectDefaultBranch: input.projectDefaultBranch,
      branchGroup,
    }),
  };
}
