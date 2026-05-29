---
"@runfusion/fusion": minor
---

Add a branch-strategy dropdown to the New Task dialog with project-default, auto-new, existing, and custom-new modes.

New tasks now submit `branchSelection`, and `auto-new` derives a persisted branch name using `fusion/{task-id}-{short-name}`.
