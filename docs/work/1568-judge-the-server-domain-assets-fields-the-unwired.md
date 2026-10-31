---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/assets fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/assets`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `BackfillResult.mismatched` | `server/src/domain/assets/contract/maintenance.ts:46` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/backfill-avatars.ts:71`) |
| `BackfillResult.dryRun` | `server/src/domain/assets/contract/maintenance.ts:47` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/backfill-avatars.ts:71`) |
| `GcResult.dryRun` | `server/src/domain/assets/contract/maintenance.ts:65` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/collect-garbage.ts:98`) |
| `ReapResult.checked` | `server/src/domain/assets/contract/maintenance.ts:72` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/reap-if-orphan.ts:36`) |
| `ReapResult.reaped` | `server/src/domain/assets/contract/maintenance.ts:73` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/reap-if-orphan.ts:36`) |
| `FsckResult.scannedRows` | `server/src/domain/assets/contract/maintenance.ts:88` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/fsck.ts:73`) |
| `FsckResult.scannedBlobs` | `server/src/domain/assets/contract/maintenance.ts:89` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/fsck.ts:73`) |
| `RebuildResult.created` | `server/src/domain/assets/contract/maintenance.ts:106` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/rebuild-from-tree.ts:45`) |
| `RebuildResult.existing` | `server/src/domain/assets/contract/maintenance.ts:107` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/rebuild-from-tree.ts:45`) |
| `AssetMetadata.size` | `server/src/domain/assets/contract/results.ts:12` | never-read | delete | delete the field and its writes (`server/src/domain/assets/verbs/get-metadata.ts:25`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Applied: `BackfillResult.mismatched` and `.dryRun`, `GcResult.dryRun`, `AssetMetadata.size`. The workloads still take `dryRun` from their own params. `ReapResult` and `RebuildResult` had no field a caller reads, so `reapIfOrphan` and `rebuildFromTree` resolve void and their counters are gone.

Reclassed to keep: `FsckResult.scannedRows` and `scannedBlobs`. `packages/server/src/foundation/observability/debug/routes.ts:545` serializes the whole `fsck()` result on `/api/_debug/db/assets`, so an operator reads them.

Ran `pnpm test tests/server/domain/assets/gc-import-overlap.int.test.ts tests/server/domain/assets/verbs/collect-garbage.int.test.ts` (exit 0) and `pnpm typecheck packages/server/tsconfig.json` (exit 0). The full typecheck and the rescan run once at the end of the lane.
