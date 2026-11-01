---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/character parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/character`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `buildCardEmbedText.userName` | `server/src/domain/character/substrate/embed-text.ts:53` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `buildCardEmbedText.maxTokens` | `server/src/domain/character/substrate/embed-text.ts:53` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

2 rows: applied 2, kept 0, handed off 0, owner questions 0.

Applied: `buildCardEmbedText.userName` (now the named constant `USER_PLACEHOLDER_NAME`) and `buildCardEmbedText.maxTokens` (now the named `EMBED_WINDOW_TOKENS`). Both callers, `packages/server/src/domain/character/verbs/load-card-text.ts:19` and `scripts/generate-seed-vectors.ts:79`, pass the card only. The comment that said the caller passes the engine window was false and is gone.

Survey: codegraph_explore on buildCardEmbedText; ast-grep `buildCardEmbedText($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 2 call sites; literal `rg` for DEFAULT_EMBED_WINDOW_TOKENS, userName, maxTokens in the file's callers: no other reader.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.node.json` exit 0; `pnpm test` card-embed-ledgers and encoder-route-snapshot: 2 files, 3 passed.
