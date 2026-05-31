---
"@runfusion/fusion": patch
---

Fixes an executor worktree self-heal gap where `task.worktree` could be recorded as a nested subdirectory of a valid git worktree root.

When a nested path is detected under a registered worktree inside the configured worktrees directory, Fusion now re-anchors `task.worktree` to the actual git top-level and continues execution. Genuine mismatches (repo root, outside configured worktrees dir, or unregistered top-level) still fail with existing `wrong_toplevel` and liveness guard behavior.
