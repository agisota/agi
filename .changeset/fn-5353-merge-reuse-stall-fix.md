---
"@runfusion/fusion": patch
---

Fix in-review merge stall under the new mergeIntegrationWorktree=reuse-task-worktree default: strict targetTaskId leasing prevents cross-task lease bleed, and missing task.worktree always triggers the reacquire fallback instead of misrouting handoff gates against the project root.
