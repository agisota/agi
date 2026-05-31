---
"@runfusion/fusion": minor
---

Add a branch-group promotion eligibility hook to the engine merge lifecycle via `evaluateBranchGroupPromotion`, and emit `merge:branch-group-promotion-gated` audit telemetry whenever shared-group member landings are evaluated for downstream group→default promotion readiness.
