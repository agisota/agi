---
"@runfusion/fusion": patch
---

Removed the `collapsible`, `collapseStorageKey`, and `collapsedLabel` props from `WorkflowSelector`. Callers should stop passing these props; workflow selectors now always render expanded.
