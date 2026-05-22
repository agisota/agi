// FN-5448 accepted branch (a): exempted — ghost-review must not demote
// recently stranded-completed promotions when all implementation steps are done.
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskStore } from "@fusion/core";
import { SelfHealingManager } from "../../self-healing.js";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-5448-RI",
    title: "completed-task oscillation fixture",
    description: "regression harness",
    column: "todo",
    paused: false,
    status: null,
    error: null,
    branch: "fusion/fn-5448-fixture",
    worktree: null,
    steps: [{ name: "Implement", status: "done" as const }],
    workflowStepResults: [],
    dependencies: [],
    log: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    columnMovedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Task;
}

function createStore(task: Task, settings: Record<string, unknown> = {}): TaskStore & EventEmitter {
  const emitter = new EventEmitter() as TaskStore & EventEmitter;
  const audits: any[] = [];
  (emitter as any).__audits = audits;

  (emitter as any).getSettings = vi.fn().mockResolvedValue({
    autoMerge: true,
    globalPause: false,
    enginePaused: false,
    taskStuckTimeoutMs: 600_000,
    ...settings,
  });
  (emitter as any).listTasks = vi.fn().mockImplementation(async ({ column }: { column?: string } = {}) => {
    if (!column || task.column === column) return [task];
    return [];
  });
  (emitter as any).logEntry = vi.fn().mockImplementation(async (_taskId: string, action: string) => {
    task.log = task.log ?? [];
    task.log.push({ timestamp: new Date(Date.now()).toISOString(), action } as any);
  });
  (emitter as any).updateTask = vi.fn().mockImplementation(async (_taskId: string, patch: Partial<Task>) => {
    Object.assign(task, patch, { updatedAt: new Date(Date.now()).toISOString() });
    return task;
  });
  (emitter as any).moveTask = vi.fn().mockImplementation(async (_taskId: string, column: string) => {
    task.column = column as any;
    const now = new Date(Date.now()).toISOString();
    task.updatedAt = now;
    task.columnMovedAt = now;
    return task;
  });
  (emitter as any).recordRunAuditEvent = vi.fn().mockImplementation(async (event: any) => {
    audits.push(event);
  });

  return emitter;
}

describe("FN-5448 reliability interactions: completed-task oscillation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("branch (a) exempted: ghost-review does not demote recently recovered completed todo tasks", async () => {
    const task = createTask();
    const store = createStore(task, { taskStuckTimeoutMs: 600_000, autoMerge: true });
    const recoverCompletedTask = vi.fn().mockImplementation(async (strandedTask: Task) => {
      const now = new Date(Date.now()).toISOString();
      Object.assign(strandedTask, {
        column: "in-review",
        status: null,
        error: null,
        columnMovedAt: now,
        updatedAt: now,
      });
      return true;
    });

    const manager = new SelfHealingManager(store, {
      rootDir: "/tmp/repo",
      recoverCompletedTask,
      getExecutingTaskIds: () => new Set<string>(),
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    expect(await manager.recoverStrandedCompletedTodoTasks()).toBe(1);
    expect(recoverCompletedTask).toHaveBeenCalledTimes(1);
    expect(task.column).toBe("in-review");

    vi.advanceTimersByTime(600_001);
    const ghostRecovered = await manager.recoverGhostReviewTasks();

    expect(ghostRecovered).toBe(0);
    expect(task.column).toBe("in-review");
    expect((store.moveTask as any).mock.calls).toEqual([]);

    manager.stop();
  });

  it("FN-5147: autoMerge false keeps in-review task unchanged after timeout", async () => {
    const task = createTask();
    const store = createStore(task, { taskStuckTimeoutMs: 600_000, autoMerge: false });
    const recoverCompletedTask = vi.fn().mockImplementation(async (strandedTask: Task) => {
      const now = new Date(Date.now()).toISOString();
      Object.assign(strandedTask, {
        column: "in-review",
        status: null,
        error: null,
        columnMovedAt: now,
        updatedAt: now,
      });
      return true;
    });

    const manager = new SelfHealingManager(store, {
      rootDir: "/tmp/repo",
      recoverCompletedTask,
      getExecutingTaskIds: () => new Set<string>(),
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    expect(await manager.recoverStrandedCompletedTodoTasks()).toBe(1);
    expect(task.column).toBe("in-review");

    vi.advanceTimersByTime(600_001);
    expect(await manager.recoverGhostReviewTasks()).toBe(0);
    expect(task.column).toBe("in-review");
    expect((store.moveTask as any).mock.calls).toEqual([]);

    manager.stop();
  });
});
