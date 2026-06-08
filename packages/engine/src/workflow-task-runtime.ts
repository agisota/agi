import type { Settings, TaskDetail, WorkflowIr } from "@fusion/core";
import { resolveWorkflowIrForTask, type WorkflowIrResolverStore } from "@fusion/core";

import {
  WorkflowGraphExecutor,
  type WorkflowGraphExecutorDeps,
  type WorkflowNodeOutcome,
} from "./workflow-graph-executor.js";
import type { WorkflowCustomNodeRunner, WorkflowLegacySeams } from "./workflow-node-handlers.js";

export type WorkflowTaskRuntimeDisposition = "completed" | "failed";

export interface WorkflowTaskRuntimeResult {
  disposition: WorkflowTaskRuntimeDisposition;
  outcome: WorkflowNodeOutcome;
  visitedNodeIds: string[];
  context: Record<string, unknown>;
  reason?: string;
}

export interface WorkflowTaskRuntimeDeps extends Omit<WorkflowGraphExecutorDeps, "seams" | "runCustomNode"> {
  store: WorkflowIrResolverStore;
  seams: WorkflowLegacySeams;
  runCustomNode: WorkflowCustomNodeRunner;
  onEvent?: (event: { type: "start" | "terminal"; taskId: string; detail: string }) => void;
}

/**
 * WorkflowTaskRuntime is the workflow-engine execution facade.
 *
 * It always resolves a task to a workflow IR: explicit selections resolve to
 * their selected workflow, and tasks without a selection resolve to the built-in
 * coding workflow through `resolveWorkflowIrForTask`. This is intentionally
 * different from `WorkflowGraphTaskRunner`, whose current contract still models
 * "no selection" as legacy fallback.
 */
export class WorkflowTaskRuntime {
  public constructor(private readonly deps: WorkflowTaskRuntimeDeps) {}

  private emit(type: "start" | "terminal", taskId: string, detail: string): void {
    try {
      this.deps.onEvent?.({ type, taskId, detail });
    } catch {
      // Diagnostics must never affect execution.
    }
  }

  public async run(
    task: TaskDetail,
    settings: (Pick<Settings, "experimentalFeatures"> & Partial<Settings>) | undefined,
  ): Promise<WorkflowTaskRuntimeResult> {
    this.emit("start", task.id, "resolve-workflow");

    const workflowId = this.resolveWorkflowId(task.id);
    let ir: WorkflowIr;
    try {
      ir = await resolveWorkflowIrForTask(this.deps.store, task.id);
    } catch (err) {
      const reason = `workflow-resolution-error: ${err instanceof Error ? err.message : String(err)}`;
      this.emit("terminal", task.id, `failed:${reason}`);
      return {
        disposition: "failed",
        outcome: "failure",
        visitedNodeIds: [],
        context: {},
        reason,
      };
    }

    const invoked: string[] = [];
    const wrappedSeams = this.wrapSeams(invoked);
    const wrappedRunCustomNode: WorkflowCustomNodeRunner = (node, nodeTask, context) => {
      invoked.push(node.id);
      return this.deps.runCustomNode(node, nodeTask, context);
    };
    const executor = new WorkflowGraphExecutor({
      ...this.deps,
      seams: wrappedSeams,
      runCustomNode: wrappedRunCustomNode,
      // WorkflowTaskRuntime is the execution engine, so internally the graph
      // executor is authoritative even before the old feature flag plumbing is
      // deleted from legacy entry points.
      runId: this.deps.runId ?? `${task.id}:${workflowId}`,
    });

    const runtimeSettings = forceWorkflowGraphExecutor(settings);
    let result: Awaited<ReturnType<WorkflowGraphExecutor["run"]>>;
    try {
      result = await executor.run(task, runtimeSettings, ir);
    } catch (err) {
      const reason = `workflow-execution-error: ${err instanceof Error ? err.message : String(err)}`;
      this.emit("terminal", task.id, `failed:${reason}`);
      return {
        disposition: "failed",
        outcome: "failure",
        visitedNodeIds: invoked,
        context: {},
        reason,
      };
    }
    const disposition: WorkflowTaskRuntimeDisposition = result.outcome === "success" ? "completed" : "failed";
    this.emit("terminal", task.id, disposition);
    return {
      disposition,
      outcome: result.outcome,
      visitedNodeIds: result.visitedNodeIds,
      context: result.context,
    };
  }

  private resolveWorkflowId(taskId: string): string {
    try {
      return this.deps.store.getTaskWorkflowSelection(taskId)?.workflowId ?? "builtin:coding";
    } catch {
      return "builtin:coding";
    }
  }

  private wrapSeams(invoked: string[]): WorkflowLegacySeams {
    const seams = this.deps.seams;
    return {
      planning: (task, context) => {
        invoked.push("planning");
        return seams.planning(task, context);
      },
      execute: (task, context) => {
        invoked.push("execute");
        return seams.execute(task, context);
      },
      review: (task, context) => {
        invoked.push("review");
        return seams.review(task, context);
      },
      merge: (task, context) => {
        invoked.push("merge");
        return seams.merge(task, context);
      },
      schedule: (task, context) => {
        invoked.push("schedule");
        return seams.schedule(task, context);
      },
      ...(seams.stepExecute
        ? {
            stepExecute: (task, context) => {
              invoked.push("step-execute");
              return seams.stepExecute!(task, context);
            },
          }
        : {}),
      ...(seams.stepReview
        ? {
            stepReview: (task, context, config) => {
              invoked.push("step-review");
              return seams.stepReview!(task, context, config);
            },
          }
        : {}),
    };
  }
}

function forceWorkflowGraphExecutor(
  settings: (Pick<Settings, "experimentalFeatures"> & Partial<Settings>) | undefined,
): Pick<Settings, "experimentalFeatures"> & Partial<Settings> {
  return {
    ...(settings ?? {}),
    experimentalFeatures: {
      ...(settings?.experimentalFeatures ?? {}),
      workflowGraphExecutor: true,
    },
  };
}
