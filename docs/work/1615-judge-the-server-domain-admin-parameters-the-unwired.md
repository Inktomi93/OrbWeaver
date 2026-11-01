---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/admin parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/admin`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AdminCardEmbedDeps.store.input.force` | `server/src/domain/admin/contract/ops.ts:26` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

1 row: applied 0, kept 1, handed off 0, owner questions 0.

Kept: `AdminCardEmbedDeps.store.input.force`. The param type is the shared `CardTextStoreInput` (`packages/contracts/src/embeddings/card-store.ts:15`), and its `force` is supplied by the embeddings corpus sweep (`packages/server/src/domain/embeddings/verbs/embed-corpus.ts:44` through `CardTextStoreParams`) and read at `verbs/store.ts:96`. Only the admin caller (`domain/admin/verbs/card-embed.ts:20`) omits it; deleting the field would break the sweep.

Survey: codegraph_explore on AdminCardEmbedDeps and the card embed ops; literal `rg` for `CardTextStoreInput` and `force` across packages and tests; ast-grep not applicable (type member, no call).
