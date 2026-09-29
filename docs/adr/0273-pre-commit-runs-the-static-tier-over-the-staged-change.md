---
kind: adr
status: superseded
updated: 2026-09-26
supersedes: docs/adr/0223-scoped-static-at-commit.md
superseded-by: docs/adr/0274-the-commit-gate-runs-only-what-narrows-to-the-staged-files.md
---

# Pre-commit runs the static tier over the staged change

## Context

Pre-commit ran the whole static tier. Every whole run waits for the host-wide whole-run slot that every worktree on both accounts shares (`tooling/src/verify/lib/whole-run-queue.ts`). The whole static tier runs for minutes, and the cross-file structure policies take most of that time. When several lanes committed at once, each commit waited inside its hook behind other checkouts' runs, and lanes then skipped every check with `LEFTHOOK_EXCLUDE=check`. A commit gate scoped to the working change also judges files the commit does not record: an unstaged edit or an untracked file can fail a commit that never touches it.

## Decision

Pre-commit and pre-merge-commit run `pnpm verify --static --changed staged`, by owner ruling. This runs the static-tier stages over the index against `HEAD`, with deletions and renames kept: what the commit records. An unstaged or untracked file is out of scope. Lefthook hides the unstaged hunks of a partially staged file while the hook runs, so each checked file holds its staged bytes; `lefthook.yml` requires the lefthook version that does. A scoped run takes no whole-run slot.

- Biome, ESLint and depcruise read the staged files.
- The type check runs every native program whose import closure contains a staged file. A deleted file selects every program.
- The structure walk runs the file-local policies over the staged files.
- A whole-only stage runs its whole command when its path trigger matches (`tooling/src/verify/lib/registry-triggers.ts`). A markdown-only change triggers none of the stages that read no markdown.

The whole static tier stays the verdict for done. It runs at pre-push inside `verify --push`, and as the merge-train barrier on main. Homes: `lefthook.yml`, `tooling/src/verify/lib/selection.ts` and `docs/law/UNIFIED-VERIFICATION-DESIGN.md` §4.3. Enforcers: `tests/tooling/verify/ops/staged-selection.suite.int.test.ts`, `tests/tooling/verify/lib/run-argv.test.ts` and `tests/tooling/verify/lib/registry.test.ts`.

## Consequences

- A commit does not prove the cross-file structure policies or `deps:knip`. They run at pre-push and at the barrier. A half-registration across two maps can commit clean and fail at the barrier.
- Type-aware ESLint rules judge only the staged files. A change that breaks such a rule in an unchanged importer fails at the barrier.
- A whole-project stage reads the checkout, so a fully unstaged or untracked file can still move its verdict. Stage related files together.
- The structure walk prints every policy it defers, so each commit's output shows the gap.
- A green commit is a scoped green. A lane never calls work done on it.

## Alternatives rejected

- Keep the whole static tier at commit: the shared slot makes every commit on the box wait behind the longest run.
- Raise the slot count: two whole runs at once take longer than two in sequence, and load-sensitive stages flake.
- Run the `changed` tier at commit: it adds related node and component tests, which belong at push.
- Bypass the hook per commit: it skips every check, not only the slow ones.
- Scope to the working change and untracked files: it judges files the commit does not record.
- Pass lefthook's staged file list to verify: it drops deleted paths, so a delete-only commit would skip the type check.
- Judge a snapshot of the index in a separate worktree: complete, but a second install per checkout and a custom hook layer, where lefthook's own hiding covers the common case.
