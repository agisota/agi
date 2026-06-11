---
"@runfusion/fusion": patch
---

Resolve the standard triage planning prompt from the selected workflow IR planning node instead of the removed engine-side `TRIAGE_SYSTEM_PROMPT` duplicate. The built-in `default-triage` prompt is now the canonical policy source for `builtin:coding`; where the old copies disagreed, the surviving canonical subtask-split threshold is `MORE THAN 7 implementation steps` (with the matching `MORE THAN 3 different packages/modules` guidance). Fast-mode triage continues to use `FAST_TRIAGE_SYSTEM_PROMPT` unchanged.
