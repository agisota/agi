---
"@runfusion/fusion": minor
---

Persist GitHub source issue closure timestamps and use them for exact Command Center "Fixed by Fusion" date bucketing, falling back to task `updatedAt` only when the real close time has not been observed.
