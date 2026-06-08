---
"@runfusion/fusion": patch
---

Allow failed agents to be stopped and deleted consistently across the dashboard and CLI guidance.

Agents in the error state can now transition to paused, the dashboard exposes delete actions for failed agents in list/detail views, and regression coverage protects the updated behavior.
