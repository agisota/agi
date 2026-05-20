---
"@runfusion/fusion": patch
---

Add durable mergeQueue table (schema v89) and TaskStore lease API (enqueue / acquireLease / releaseLease / recoverExpiredLeases) as the foundation for FN-5240 in-review handoff durability. No engine behavior change yet; merger/executor wiring lands in FN-5241/FN-5243.
