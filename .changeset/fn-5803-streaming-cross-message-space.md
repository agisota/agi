---
"@runfusion/fusion": patch
---

Repair dropped spaces after sentence-ending punctuation when streamed agent text is split across separate assistant messages by tool-call round-trips (chat and agent logs), by tracking a per-session running tail at the shared engine streaming-delta chokepoints. Completes FN-5789, which only covered within-message boundaries.
