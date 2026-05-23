---
"@fusion/engine": patch
---

fix(engine): verify resumed worktree branches aren't bootstrap-misbound

`acquireTaskWorktree` short-circuited the resume path when
`task.worktree` existed on disk and classified `ok`, handing the
worktree back to the executor without inspecting its branch history.
If the branch had been created from a poisoned local-main tip (a
sibling task's commit), the executor preflight would later flag every
intermediate landing as foreign and the task would loop through
contamination recovery until pausing for human adjudication
(observed in the FN-5475 cascade).

The resume path now computes a fresh merge-base against local `main`
(falling back to `origin/main`) and runs `classifyBootstrapMisbinding`
on the branch. When the range is purely foreign with zero own commits,
it re-anchors the branch inline via `reanchorBranchToBase` and emits a
`branch:reanchor` audit event with `trigger: "resume-misbinding"`.

Mixed contamination (own + foreign, or non-attributed commits) is
deliberately left to the executor's existing primary path so the
richer adjudication flow still applies.
