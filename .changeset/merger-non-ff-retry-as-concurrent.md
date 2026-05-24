---
"@fusion/engine": patch
---

fix(merger): treat non-FF ref-advance as concurrent-advance so it triggers retry

When the merger's squash commit was built off a stale integration tip (integration moved between squash prep and `update-ref`), the FF guard in `advanceIntegrationBranchRef` correctly refused the swap with reason `non-fast-forward-advance` — but the caller in `merger.ts` only mapped `concurrent-advance` to `IntegrationBranchConcurrentAdvanceError`. The non-FF case fell through as a plain `Error`, failing the task instead of routing to the FN-4500/FN-5083 rebind/retry path. Both reasons share a root cause (integration tip moved during the merge window), so they now share the retry path. Observed on FN-5576.
