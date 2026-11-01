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

Six rows: three applied, three kept, none handed off, no owner questions.

| Row | Result |
| - | - |
| `AvailableConnectionEditorBody.#0.onRemoved` | applied: the body's props type is now `Omit<ConnectionEditorProps, "onRemoved" \| "removalFinalFocus">` in `packages/client/src/features/credentials/components/connection-editor.tsx`. The props stay on `ConnectionEditorProps`: `connections-list-section.tsx:148,156` supplies them and the sibling branch reads them at `connection-editor.tsx:87,90` (`ConnectionEditorUnavailable`) |
| `AvailableConnectionEditorBody.#0.removalFinalFocus` | applied: same edit |
| `patch.part.providerId` | kept: `part` is the router's `connection.update` patch type (`Parameters<typeof update.mutate>[0]["patch"]`); `providerId` is read through `EMBED_SPACE_FIELDS` at `connection-editor.tsx:180` |
| `patch.part.api` | kept: same reader (`EMBED_SPACE_FIELDS` lists `api`, `packages/contracts/src/inference/capability/embedding.ts:49`) |
| `patch.part.credentialId` | kept: a member of the router patch input; removing it needs a contract change, outside this item |
| `groupModelEntries.options.cap` | applied in `packages/client/src/features/credentials/lib/model-picker-model.ts`; the one caller `model-picker.tsx:328` passes no cap, so `MODEL_PICKER_RENDER_CAP` is used directly |

Survey: `codegraph_explore` on the editor and model-picker symbols; literal `rg` for `onRemoved`, `removalFinalFocus`, `groupModelEntries`, `AvailableConnectionEditorBody` read (the `removalFinalFocus` hits in `features/chat` are a different prop). Proof: client typecheck clean; `connections-list-focus.ct.tsx` result in the lane report.
