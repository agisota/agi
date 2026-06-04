---
"@runfusion/fusion": minor
---

Add workflow-defined custom columns with composable traits, behind the `experimentalFeatures.workflowColumns` flag (off by default).

Workflows can now define their own columns, each carrying composable traits (declarative flags plus lifecycle hooks) instead of the fixed `triage → todo → in-progress → in-review → done → archived` pipeline. The dashboard board renders one lane per workflow in use, and graphs gain `hold`, `split`, and `join` nodes for passive dwell and parallel fan-out/join branches. The built-in default workflow reproduces today's pipeline verbatim, and migration rewrites zero task rows — a null workflow selection resolves to the default workflow at read time. With the flag off, the legacy board, transitions, and engine behavior are unchanged.
