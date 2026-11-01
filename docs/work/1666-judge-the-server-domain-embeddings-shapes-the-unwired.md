---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/embeddings shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/embeddings`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `GenerationReceipt` / `GenerationReceipt` | `server/src/domain/embeddings/contract/generation.ts:3` | reexport-chain | delete | export it from its home, not through `contracts/src/embeddings/index.ts` |
| `PruneMemoryBlocksParams` / `PruneMemoryBlocksParams` | `server/src/domain/embeddings/contract/params.ts:7` | reexport-chain | delete | export it from its home, not through `contracts/src/embeddings/index.ts` |
| `StoreResult` / `StoreResult` | `server/src/domain/embeddings/contract/results.ts:3` | reexport-chain | delete | export it from its home, not through `contracts/src/embeddings/index.ts` |
| `EmbeddingsContext` / `EmbeddingsAssemblyContext` | `server/src/domain/embeddings/index.ts:10` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 4 rows = 4 applied. 0 kept, 0 handed off, 0 owner questions.

- `GenerationReceipt`, `PruneMemoryBlocksParams`, `StoreResult` reexport-chain: applied. The `domain/embeddings/contract` re-exports are deleted (`contract/generation.ts` held only that line and is removed); 9 importer files take the types from `@orb/contracts/embeddings` (plan from importers of each re-export module, `move-import-names`; ast-grep ts 5949 / tsx 1525 tracked files). The contracts side is untouched. `codegraph_explore` on the three symbols and `EmbeddingsAssemblyContext` showed their homes in `packages/contracts/src/embeddings/owner-ops.ts` and no consumer outside the domain contract.
- `EmbeddingsContext` / `EmbeddingsAssemblyContext` renamed-reexport: applied. The door exports the declared name; the one importer is renamed. The inner `EmbeddingsContext` is a different type.
- Check: `pnpm typecheck packages/server/tsconfig.json` exit 0.
