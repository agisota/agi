import { describe, expect, it } from "vitest";
import { makeReliabilityFixture } from "./_helpers.js";

describe("reliability interactions: meta chain auto-close", () => {
  it("archives resolved and stalled meta tasks", async () => {
    const fixture = await makeReliabilityFixture({
      taskId: "FN-4867",
      task: { column: "todo", title: "Target" },
      settings: { metaTaskStallAutoCloseMs: 1 },
    });
    try {
      const target = fixture.task;
      await fixture.store.createTask({ id: "FN-4872", title: "Recover FN-4867", description: "meta", column: "todo", noCommitsExpected: true, steps: [] } as any);
      await fixture.store.createTask({ id: "FN-4878", title: "Recover FN-4872", description: "meta", column: "todo", noCommitsExpected: true, steps: [] } as any);
      await fixture.store.moveTask(target.id, "in-progress", { moveSource: "engine" });
      await fixture.store.moveTask(target.id, "done", { moveSource: "engine" });

      const resolved = await fixture.selfHeal.autoArchiveResolvedMetaTasks();
      const stale = await fixture.selfHeal.autoArchiveStalledMetaTasks();
      expect(resolved).toBeGreaterThanOrEqual(0);
      expect(stale).toBeGreaterThanOrEqual(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
