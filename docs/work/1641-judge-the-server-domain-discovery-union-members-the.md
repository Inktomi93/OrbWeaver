---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/discovery union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `server/domain/discovery`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `GENRES.fantasy` | `server/src/domain/discovery/verbs/distill.ts:59` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.science-fiction` | `server/src/domain/discovery/verbs/distill.ts:60` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.modern` | `server/src/domain/discovery/verbs/distill.ts:61` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.historical` | `server/src/domain/discovery/verbs/distill.ts:62` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.horror` | `server/src/domain/discovery/verbs/distill.ts:63` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.romance` | `server/src/domain/discovery/verbs/distill.ts:64` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.slice-of-life` | `server/src/domain/discovery/verbs/distill.ts:65` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.adventure` | `server/src/domain/discovery/verbs/distill.ts:66` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.mystery` | `server/src/domain/discovery/verbs/distill.ts:67` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.comedy` | `server/src/domain/discovery/verbs/distill.ts:68` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.drama` | `server/src/domain/discovery/verbs/distill.ts:69` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `GENRES.supernatural` | `server/src/domain/discovery/verbs/distill.ts:70` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `TONES.lighthearted` | `server/src/domain/discovery/verbs/distill.ts:75` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `TONES.romantic` | `server/src/domain/discovery/verbs/distill.ts:75` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `TONES.comedic` | `server/src/domain/discovery/verbs/distill.ts:75` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `TONES.gritty` | `server/src/domain/discovery/verbs/distill.ts:75` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `TONES.wholesome` | `server/src/domain/discovery/verbs/distill.ts:75` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `TONES.melancholic` | `server/src/domain/discovery/verbs/distill.ts:75` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `TONES.whimsical` | `server/src/domain/discovery/verbs/distill.ts:75` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `TONES.sensual` | `server/src/domain/discovery/verbs/distill.ts:75` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
