---
"@fusion/engine": patch
"@fusion/dashboard": patch
---

fix(engine,dashboard): close 7 code-review findings on the mergeAdvanceAutoSync hook

Tightens the freshly-landed merger auto-sync feature based on a structured code review.

**Data-loss fixes in `syncWorktreeToHead`:**
- Untracked-file restore now compares against `git ls-tree -r --name-only HEAD` to detect when the new tip introduced a tracked file at the same path; collisions are reported in `untrackedSkippedAsTracked` and the user's bytes stay in the stage dir instead of clobbering the merged content.
- When `git apply --3way` fails because a patched file was deleted/renamed at the new tip (`--diff-filter=U` returns nothing because nothing got staged), `conflictedFiles` falls back to parsing `diff --git a/<p> b/<p>` headers out of the captured patch — so the conflict surfaces with the right file names instead of `[]`.
- `git ls-files` / `diff` calls now pass `-c core.quotePath=false` so paths with non-ASCII or special characters round-trip through `copyFileSync` instead of failing on backslash-escaped octal tokens.
- The stash-and-ff path re-verifies `rev-parse HEAD === newSha` immediately before each destructive `reset --hard HEAD`; a concurrent merger advance now bails with `skipped-head-not-at-new-sha` (with the captured patch preserved on disk) instead of applying the patch against the wrong tree.
- The stage dir is now tracked with a `preserveStageDir` flag in a `try/finally`: it is rm'd on all clean paths and on `skipped-head-not-at-new-sha` exits, but preserved whenever the user's edits live only in `patchPath` (pop-conflict, untracked-collides-with-tracked, reset failure, outer exception).
- Patch is written to disk before the apply attempt, not only on failure, so a crash between snapshot and apply doesn't lose the user's edits.

**Multi-worktree-same-branch fix:**
- New `getRegisteredWorktreeBranches` helper in `worktree-pool.ts` returns ALL `(branch, worktreePath)` entries rather than collapsing duplicates into a `Map<branch, path>`. Multiple worktrees can legitimately share a branch when the user created secondary checkouts via `git worktree add --force -b`; the merger now syncs every one of them instead of silently skipping all but the last.

**Contract + surfacing fixes:**
- JSDoc on `merge:auto-sync` GitMutationType now documents the actually-emitted outcome strings (`clean-sync`, `synced-with-edits-restored`, `synced-with-pop-conflict`, `skipped-*`, `failed`, `enumeration-failed`, `exception`) and the actual `stage` enum, replacing the obsolete `smartPull`-shaped strings.
- `GET /api/tasks/merge-advance-events` now joins `merge:auto-sync` events within a ±5min window of each advance and returns them in a new `autoSync: AutoSyncOutcome[]` field; `useMergeAdvanceNotice` exposes the same shape so the banner can surface pop-conflicts (including `patchPath` pointing at the user's saved edits) instead of leaving them in a black hole.

**Hygiene:**
- Merger's setting read now uses `normalizeMergeAdvanceAutoSyncMode(settings.mergeAdvanceAutoSync)` (the exported normalizer) instead of an inline equality check + `as unknown` cast that bypassed type-checking.

**New backstop tests** in `merger-auto-sync.slow.test.ts`:
- Untracked file colliding with a newly-tracked path is NOT overwritten and the merged content survives.
- `git apply --3way` failure on a file deleted at the new tip populates `conflictedFiles` from the patch header.

**Route test** asserts `autoSync` outcomes are joined onto the matching advance event within the time window.
