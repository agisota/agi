---
"@runfusion/fusion": patch
---

fix(FN-4811): use process-wide executingTaskLock to block parallel execute() across instances

After commit 82f80e72f added a per-instance `this.executing.add()` synchronous claim, production STILL produced two `execute()` invocations for the same task ID that both reached "Executor detected stale merge state" and both generated runIds within 1 second of each other (FN-4809: y2nb + 9gde at 02:48:17–18 UTC; FN-4814 / FN-4811 cascade). The only viable explanation is that there is more than one `TaskExecutor` instance in the process (engine restart race, multi-project hybrid runtime, etc.).

Adds a module-level singleton `executingTaskLock` in `active-session-registry.ts` shared across all `TaskExecutor` instances. `TaskExecutor.execute()` synchronously claims the lock immediately after the `executorLog.log` entry; if `tryClaim()` returns false (someone else owns the lock), the call bails. Every existing `this.executing.delete()` site also releases the lock. Per-instance `this.executing` is kept for back-compat with the many `this.executing.has()` checks throughout `executor.ts`.

Test setup in `executor-test-helpers.ts` clears the process-wide lock in `resetExecutorMocks()` so it doesn't leak across tests.
