---
"@runfusion/fusion": patch
---

Resolve the built-in reviewer base prompt from the workflow IR `review` node instead of an engine-local `REVIEWER_SYSTEM_PROMPT` duplicate. The canonical reviewer policy now lives in the `default-reviewer` agent prompt / built-in workflow seam, with reconciled superset content that preserves the FN-5928/FN-6229 surface-enumeration and symptom-verification gates, undersplit-task guidance, test-quality rules, worktree-boundary review, and the embedded port-4040 safety rule.
