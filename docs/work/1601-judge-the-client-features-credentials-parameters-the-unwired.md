---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/credentials parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/credentials`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AvailableConnectionEditorBody.#0.onRemoved` | `client/src/features/credentials/components/connection-editor.tsx:110` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `AvailableConnectionEditorBody.#0.removalFinalFocus` | `client/src/features/credentials/components/connection-editor.tsx:110` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `patch.part.providerId` | `client/src/features/credentials/components/connection-editor.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (12 calls) |
| `patch.part.credentialId` | `client/src/features/credentials/components/connection-editor.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (12 calls) |
| `patch.part.api` | `client/src/features/credentials/components/connection-editor.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (12 calls) |
| `groupModelEntries.options.cap` | `client/src/features/credentials/lib/model-picker-model.ts:283` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
