---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/discovery parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/discovery`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `readOwnedSegmentVectorsByChat.cap` | `server/src/domain/discovery/persistence/embed-store-reads.ts:915` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

1 row: applied 1, kept 0, handed off 0, owner questions 0.

Applied: `readOwnedSegmentVectorsByChat.cap`. The only caller, `domain/discovery/verbs/similar-chats.ts:42`, passes none. The OOM guard keeps its name: the limit now reads `SIMILAR_CHATS_SEG_CAP` (20_000) directly.

Survey: codegraph_explore on the function via the discovery persistence reads; ast-grep `readOwnedSegmentVectorsByChat($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1 call; literal `rg`: same hit.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.node.json` exit 0; `pnpm lint:eslint` on the two edited server files exit 0; `pnpm test tests/support/node/corpus-knowledge.int.test.ts` (similar chats) passed with import-bundle: passed.
