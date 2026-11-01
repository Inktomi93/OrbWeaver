---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/import parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/import`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `openStagedFile.noFollowFlag` | `server/src/domain/import/workload-contributions.ts:128` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

1 row: applied 1, kept 0, handed off 0, owner questions 0. Path-containment guard: flagged for the reviewer.

Applied: `openStagedFile.noFollowFlag`. The one caller (`domain/import/workload-contributions.ts:151`) passes none, and no test passes `null` (literal `rg` for noFollow and O_NOFOLLOW in tests finds only `tests/support/node/backup-folder.ts:23`, an unrelated open). The guard itself is unchanged: the open still ORs the host `O_NOFOLLOW` into `O_RDONLY`, and the fstat/lstat inode check still covers a platform where the constant is not a number; only the dead override seam is gone.

Survey: codegraph_explore on the staged-file open via the import workload; ast-grep `openStagedFile($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1 call.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.node.json` exit 0; `pnpm lint:eslint` on the file exit 0; `pnpm test tests/server/domain/import/loader/import-bundle.int.test.ts` passed (with corpus-knowledge: 2 files, 21 passed).
