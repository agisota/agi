---
"@runfusion/fusion": patch
---

Engine: self-heal `git worktree add` failures classified as "missing but already registered worktree" by pruning the stale registration and retrying once. Recovery is observable via new run-audit events `worktree:stale-registration-detected`, `worktree:stale-registration-recovered`, `worktree:stale-registration-recovery-failed`.
