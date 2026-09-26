---
kind: adr
status: active
updated: 2026-09-24
---

# Pre-commit runs the static tier over the working change

## Context

Pre-commit ran the whole static tier. Every whole run waits for the host-wide whole-run slot that every worktree on both accounts shares (`tooling/src/verify/lib/whole-run-queue.ts`). The whole static tier runs for minutes, and the cross-file structure policies take most of that time. `tooling/src/verify/lib/history.ts` records each run's stage durations. When several lanes committed at once, each commit waited inside its hook behind other checkouts' runs. Lanes then committed with `LEFTHOOK_EXCLUDE=check git commit`, which skips every pre-commit check.

## Decision

Pre-commit and pre-merge-commit run `pnpm verify --static --changed`, by owner ruling. This runs the static-tier stages over the working change against `HEAD`, plus untracked files. A scoped run takes no whole-run slot.

- Biome, ESLint and depcruise read the changed files.
- The type check runs every native program whose import closure contains a changed file. A deleted file selects every program.
- The structure walk runs the file-local policies over the changed files.
- A whole-only stage runs its whole command when its path trigger matches (`tooling/src/verify/lib/registry-triggers.ts`).

The whole static tier stays the verdict for done. It runs at pre-push inside `verify --push`, and as the merge-train barrier on main. Homes: `lefthook.yml` and `docs/law/UNIFIED-VERIFICATION-DESIGN.md` §4.3.

## Consequences

- A commit does not prove the cross-file structure policies or `deps:knip`. They run at pre-push and at the barrier. A half-registration across two maps can commit clean and fail at the barrier.
- Type-aware ESLint rules judge only the changed files. A change that breaks such a rule in an unchanged importer fails at the barrier.
- The structure walk prints every policy it defers, so each commit's output shows the gap.
- A green commit is a scoped green. A lane never calls work done on it.

## Alternatives rejected

- Keep the whole static tier at commit: the shared slot makes every commit on the box wait behind the longest run.
- Raise the slot count: two whole runs at once take longer than two in sequence, and load-sensitive stages flake.
- Run the `changed` tier at commit: it adds related node and component tests, which belong at push.
- Bypass the hook per commit: it skips every check, not only the slow ones.
