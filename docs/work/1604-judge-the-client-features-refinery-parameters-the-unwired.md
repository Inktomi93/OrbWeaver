---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/refinery parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/refinery`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `patch.next.touched` | `client/src/features/refinery/components/manual-rewrite-dialog.tsx:67` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

One row: one applied, none kept, none handed off, no owner questions.

`patch` in `packages/client/src/features/refinery/components/manual-rewrite-dialog.tsx` now takes `Partial<Omit<DraftState, "touched">>`; it always writes `touched: true` itself, so no caller can or does supply it. Literal `rg` for `touched` across `features/refinery` read: the other hits are prose. Proof: client typecheck clean; no CT mounts `ManualRewriteDialog`.
