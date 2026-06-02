---
"@runfusion/fusion": patch
---

CLI auto-launch now honors the persisted `cliOnboardingCompletedAt` marker so onboarding fires only once, even when the Central DB step was skipped during `fn onboard`.
