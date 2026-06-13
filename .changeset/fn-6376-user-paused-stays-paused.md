---
"@runfusion/fusion": patch
---

Ensure only explicit user actions unpause user-paused tasks. Engine self-healing, agent resume cascades, dashboard agent-state resume fallback, heartbeat recovery, and approval-decision resume no longer clear `userPaused` or auto-unpause tasks the user paused.
