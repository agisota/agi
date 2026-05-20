import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../store.js";

describe("TaskStore engineActiveSinceMs hydration floor", () => {
  let rootDir: string;
  let globalDir: string;
  let store: TaskStore;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "store-engine-active-since-"));
    globalDir = join(rootDir, ".fusion-global-settings");
    store = new TaskStore(rootDir, globalDir, { inMemoryDb: true });
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  async function seedTask(id: string, column: "in-review" | "todo" | "in-progress", paused: boolean, ageMs: number) {
    const movedAt = new Date(Date.now() - ageMs).toISOString();
    await store.createTaskWithReservedId(
      { description: id, column },
      { taskId: id, createdAt: movedAt, updatedAt: movedAt, applyDefaultWorkflowSteps: true },
    );

    const db = (store as unknown as { db: { prepare: (sql: string) => { run: (...params: unknown[]) => unknown } } }).db;
    db.prepare(`UPDATE tasks SET paused = ?, mergeDetails = ?, log = ?, columnMovedAt = ?, updatedAt = ? WHERE id = ?`).run(
      paused ? 1 : 0,
      JSON.stringify({}),
      JSON.stringify([]),
      movedAt,
      movedAt,
      id,
    );
  }

  it("FN-5223 suppresses stale signals until activation floor ages out", async () => {
    const ageMs = 14 * 24 * 60 * 60_000;
    await seedTask("FN-5223-REVIEW", "in-review", true, ageMs);
    await seedTask("FN-5223-STALLED", "in-review", false, ageMs);
    await seedTask("FN-5223-AGE", "in-progress", false, ageMs);
    await seedTask("FN-5223-TODO", "todo", true, ageMs);

    await store.updateSettings({
      engineActiveSinceMs: Date.now(),
      engineActivationGraceMs: 5 * 60_000,
      stalePausedReviewThresholdMs: 60_000,
      inReviewStalledThresholdMs: 60_000,
      staleInProgressWarningMs: 60_000,
      staleInProgressCriticalMs: 120_000,
      stalePausedTodoThresholdMs: 60_000,
    });

    let tasks = await store.listTasks();
    expect(tasks.find((task) => task.id === "FN-5223-REVIEW")?.stalePausedReview).toBeUndefined();
    expect(tasks.find((task) => task.id === "FN-5223-STALLED")?.inReviewStalled).toBeUndefined();
    expect(tasks.find((task) => task.id === "FN-5223-AGE")?.ageStaleness).toBeUndefined();
    expect(tasks.find((task) => task.id === "FN-5223-TODO")?.stalePausedTodo).toBeUndefined();

    await store.updateSettings({ engineActiveSinceMs: Date.now() - 20 * 60_000 });
    tasks = await store.listTasks();
    const restoredAge = tasks.find((task) => task.id === "FN-5223-AGE")?.ageStaleness?.code === "task-age-staleness";
    const restoredTodo = tasks.find((task) => task.id === "FN-5223-TODO")?.stalePausedTodo?.code === "stale-paused-todo";
    expect(restoredAge || restoredTodo).toBe(true);
  });
});
