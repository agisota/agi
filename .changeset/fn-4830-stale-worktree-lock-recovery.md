---
"@runfusion/fusion": patch
---

Auto-recover native worktree-create failures caused by stale git `index.lock` files. Fusion now classifies stale vs active lock contention, retries creation once after safe stale-lock removal, and emits dedicated `worktree:stale-lock-*` run-audit events for detection and outcome visibility.
