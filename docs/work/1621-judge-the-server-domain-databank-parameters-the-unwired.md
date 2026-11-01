---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/databank parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/databank`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `DatabankService.listAttachments.params.includeText` | `server/src/domain/databank/contract/service.ts:257` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

1 row: applied 0, kept 1, handed off 0, owner questions 0.

Kept: `DatabankService.listAttachments.params.includeText`. `listAttachments` takes `GetDocumentParams` (`packages/server/src/domain/databank/contract/service.ts:257`), shared with `databank.get`, whose `includeText` is a live tRPC input key (`packages/contracts/src/databank/index.ts:465`, `transport/trpc/routers/databank.ts:63`) and is read by `verbs/get.ts:14`. A router input key with writers is wire; the field is not dead. Narrowing `listAttachments` to its own params type is a new type, not a delete.

Survey: codegraph_explore on DatabankService listAttachments includeText; literal `rg` for includeText across packages, tests, tooling, scripts: writers in the router, the client (`databank-detail-surface.tsx:278`) and nine tests.
