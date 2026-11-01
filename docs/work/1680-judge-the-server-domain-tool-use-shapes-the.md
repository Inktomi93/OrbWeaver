---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/tool-use shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/tool-use`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ToolCallInput` / `ToolCallInput` | `server/src/domain/tool-use/contract/params.ts:9` | reexport-chain | delete | export it from its home, not through `inference/src/contract/index.ts` |
| `ToolCallRecord` / `ToolCallRecord` | `server/src/domain/tool-use/contract/results.ts:11` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 2 rows = 2 applied. 0 kept, 0 handed off, 0 owner questions.

- `ToolCallInput` reexport-chain: applied. The `contract/params.ts` re-export is deleted; its importer (`verbs/execute-tool-calls.ts`) imports it from `@orb/inference`. `ToolCallRecord` reexport-chain: applied. The `contract/results.ts` re-export is deleted; the two importers import it from `@orb/contracts/chat`. The tool-use door never exported either (rg and ast-grep over ts 5949 / tsx 1525 tracked files); `codegraph_explore` listed the callers under `domain/tool-use`, chat and plugin.
- Check: `pnpm typecheck packages/server/tsconfig.json` exit 0.
