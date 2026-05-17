import { describe, it, expect, vi, beforeEach } from "vitest";
import "../executor-test-helpers.js";
import { TaskExecutor } from "../../executor.js";
import { createFnAgent } from "../../pi.js";
import { createMockStore, mockedExecSync, resetExecutorMocks } from "../executor-test-helpers.js";

const mockedCreateFnAgent = vi.mocked(createFnAgent);

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "FN-4917-T",
    title: "Task",
    description: "Desc",
    column: "in-progress",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as any;
}

describe("reliability interactions: FN-4917 worktree incomplete session-start", () => {
  beforeEach(() => {
    resetExecutorMocks();
    mockedExecSync.mockReturnValue("");
  });

  it.each([
    ["missing", "Refusing to start coding agent in missing worktree: /tmp/wt"],
    ["incomplete", "Refusing to start coding agent in incomplete worktree: /tmp/wt"],
    ["unregistered", "Refusing to start coding agent in unregistered git worktree: /tmp/wt"],
  ])("executor auto-recovers %s session-start failures", async (classification, errorText) => {
    const store = createMockStore();
    const events: any[] = [];
    store.recordRunAuditEvent = vi.fn(async (event: any) => events.push(event));

    let task = makeTask({ worktree: "/tmp/wt", branch: "fusion/fn-4917-t" });
    store.getTask.mockImplementation(async () => task);
    store.updateTask.mockImplementation(async (_id: string, updates: any) => {
      task = { ...task, ...updates };
      return task;
    });
    store.moveTask.mockImplementation(async (_id: string, column: string, _opts?: any) => {
      task = { ...task, column };
    });

    mockedCreateFnAgent.mockRejectedValueOnce(new Error(errorText));

    const executor = new TaskExecutor(store, process.cwd());
    await executor.execute(task);

    expect(task.column).toBe("todo");
    expect(task.status).not.toBe("failed");
    expect(task.worktreeSessionRetryCount).toBe(1);
    expect(task.worktree).toBeNull();
    expect(task.branch).toBeNull();
    expect(task.sessionFile).toBeNull();
    const mutationTypes = events.map((e) => e.mutationType);
    const firstDetectedIndex = mutationTypes.indexOf("worktree:incomplete-detected");
    const firstRecoveredIndex = mutationTypes.indexOf("worktree:auto-recovered");
    expect(firstDetectedIndex).toBeGreaterThanOrEqual(0);
    expect(firstRecoveredIndex).toBeGreaterThan(firstDetectedIndex);
    const sessionStartEvent = events.find((e) => e.mutationType === "worktree:incomplete-detected" && e.metadata?.source === "session-start");
    expect(sessionStartEvent?.metadata?.classification).toBe(classification);
    expect(events.some((e) => e.mutationType === "worktree:incomplete-detected" && e.metadata?.source === "resume")).toBe(true);
    expect(store.logEntry.mock.calls.some((call: unknown[]) => String(call[1] ?? "").includes("Refusing to start coding agent"))).toBe(false);
  });

  it("preserves progress when steps already completed", async () => {
    const store = createMockStore();
    let task = makeTask({
      worktree: "/tmp/wt",
      branch: "fusion/fn-4917-t",
      steps: [
        { id: "1", title: "done", status: "done" },
        { id: "2", title: "next", status: "pending" },
      ],
    });
    store.recordRunAuditEvent = vi.fn(async () => undefined);
    store.getTask.mockImplementation(async () => task);
    store.updateTask.mockImplementation(async (_id: string, updates: any) => {
      task = { ...task, ...updates };
      return task;
    });

    mockedCreateFnAgent.mockRejectedValueOnce(new Error("Refusing to start coding agent in incomplete worktree: /tmp/wt"));

    const executor = new TaskExecutor(store, process.cwd());
    await executor.execute(task);

    expect(store.moveTask).toHaveBeenCalledWith("FN-4917-T", "todo", { preserveProgress: true });
  });

  it("escalates when session-start auto-recovery reaches retry cap", async () => {
    const store = createMockStore();
    const events: any[] = [];
    let task = makeTask({ worktree: "/tmp/wt", branch: "fusion/fn-4917-t", worktreeSessionRetryCount: 3 });
    store.recordRunAuditEvent = vi.fn(async (event: any) => events.push(event));
    store.getTask.mockImplementation(async () => task);
    store.updateTask.mockImplementation(async (_id: string, updates: any) => {
      task = { ...task, ...updates };
      return task;
    });

    mockedCreateFnAgent.mockRejectedValueOnce(new Error("Refusing to start coding agent in incomplete worktree: /tmp/wt"));

    const executor = new TaskExecutor(store, process.cwd());
    await executor.execute(task);

    expect(store.moveTask).not.toHaveBeenCalledWith("FN-4917-T", "todo", expect.anything());
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "git", mutationType: "worktree:auto-recovered", metadata: expect.objectContaining({ action: "escalate-exhausted" }) }),
    ]));
  });

  it("does not intercept unrelated session-start failures", async () => {
    const store = createMockStore();
    let task = makeTask({ worktree: "/tmp/wt", branch: "fusion/fn-4917-t" });
    store.recordRunAuditEvent = vi.fn(async () => undefined);
    store.getTask.mockImplementation(async () => task);
    store.updateTask.mockImplementation(async (_id: string, updates: any) => {
      task = { ...task, ...updates };
      return task;
    });

    mockedCreateFnAgent.mockRejectedValueOnce(new Error("model API key missing"));

    const executor = new TaskExecutor(store, process.cwd());
    await executor.execute(task);

    expect(store.moveTask).toHaveBeenCalledWith("FN-4917-T", "in-review");
    expect(store.recordRunAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ mutationType: "worktree:auto-recovered" }));
  });
});
