---
"@runfusion/fusion": patch
---

Update the built-in compound-engineering workflow so its Review stage runs the `compound-engineering:ce-code-review` skill directly. The redundant generic reviewer seam node was removed, leaving the CE code-review gate as the sole review stage.
