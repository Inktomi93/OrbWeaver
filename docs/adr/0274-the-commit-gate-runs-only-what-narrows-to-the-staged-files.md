---
kind: adr
status: active
updated: 2026-09-26
supersedes: docs/adr/0273-pre-commit-runs-the-static-tier-over-the-staged-change.md
---

# The commit gate runs only what narrows to the staged files

## Context

Pre-commit ran every static-tier stage over the staged change, one after another, and a whole-command stage ran its whole command whenever its path trigger matched. Most triggers admit any non-markdown path, so a code commit paid for `types:testd`, `ledgers:fresh`, `types:ownership`, `config:biome-rule-liveness`, `config:knip-negative-liveness` and, for an instrument change, `tests:instrument-affected`. Measured on one tooling commit (4 cores): 360 seconds, 221 of them in whole commands that pre-push runs again inside the whole static tier. Lanes again bypassed the hook to get work committed.

## Decision

Pre-commit and pre-merge-commit run `pnpm verify --static --changed staged`, by owner ruling. The `staged` selection is the index against `HEAD`, with deletions and renames kept: what the commit records. An unstaged or untracked file is out of scope. Lefthook hides the unstaged hunks of a partially staged file while the hook runs, so each checked file holds its staged bytes; `lefthook.yml` requires the lefthook version that does. A scoped run takes no whole-run slot.

At commit, only the stages that narrow to the staged files run:

- Biome, ESLint and depcruise read the staged files.
- The doc formatter checks the staged files under the doc trees. A staged markdown file outside them runs the whole doc check, which takes seconds.
- The type check runs every native program whose import closure contains a staged file. A deleted file selects every program.
- The structure walk runs the file-local policies over the staged files.

Every stage in `WHOLE_COMMAND_PATH_TRIGGERS` (`tooling/src/verify/lib/registry-triggers.ts`) runs its whole command or nothing. At commit it is deferred when its path trigger matches and skipped when it does not. The rule has no per-stage list: a new whole-command row is deferred at commit by construction, and `deps:knip`, which has no trigger, defers as before. Other scoped selections (`verify --changed`, `--file`, `--package`, `--scope`) still run a triggered whole command.

The commit gate runs its stages in sequence, like every other run.

The whole static tier stays the verdict for done. It runs at pre-push inside `verify --push`, and as the merge-train barrier on main. Homes: `lefthook.yml`, `tooling/src/verify/lib/selection.ts`, `tooling/src/verify/lib/registry-triggers.ts`, `tooling/src/verify/ops/run.ts` and `docs/law/UNIFIED-VERIFICATION-DESIGN.md` §4.3. Enforcers: `tests/tooling/verify/ops/staged-selection.suite.int.test.ts`, `tests/tooling/verify/lib/run-argv.test.ts` and `tests/tooling/verify/lib/registry.test.ts`.

## Consequences

- On 4 cores and 15 GB, a five-file commit across `tooling/src/_shared` takes 184 seconds. `types:native` is the largest stage.
- `reports/verify-history.jsonl` records each run's `wallMs` beside the stage sum.
- A commit proves no whole-tree reconciliation. Every row of `WHOLE_COMMAND_PATH_TRIGGERS` and every cross-file structure policy runs at pre-push and at the barrier, and the commit's summary names each one it deferred. A stale ledger or a broken `.test-d.ts` assertion can commit clean and fail the push.
- Type-aware ESLint rules judge only the staged files. A change that breaks such a rule in an unchanged importer fails at the barrier.
- A whole-project stage reads the checkout, so a fully unstaged or untracked file can still move its verdict. Stage related files together.
- A green commit is a scoped green. A lane never calls work done on it.

## Alternatives rejected

- Defer only the three slowest whole commands: `types:ownership` alone costs more than both linters, and a cost list goes stale as stages change.
- Keep the whole-command stages at commit: the push repeats every one of them, so the commit pays twice for one verdict.
- Run the commit gate's stages at the same time: type-aware ESLint, tsc and the structure walk each hold gigabytes, and together they exceed a 15 GB box.
- Keep the whole static tier at commit: the shared slot makes every commit on the box wait behind the longest run.
- Raise the slot count: two whole runs at once take longer than two in sequence, and load-sensitive stages flake.
- Run the `changed` tier at commit: it adds related node and component tests, which belong at push.
- Bypass the hook per commit: it skips every check, not only the slow ones.
- Scope to the working change and untracked files: it judges files the commit does not record.
- Pass lefthook's staged file list to verify: it drops deleted paths, so a delete-only commit would skip the type check.
- Judge a snapshot of the index in a separate worktree: complete, but a second install per checkout and a custom hook layer, where lefthook's own hiding covers the common case.
