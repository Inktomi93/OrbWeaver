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

Counts: 20 rows = 20 kept (12 `GENRES`, 8 `TONES`).

- Every member is a value of `z.enum(GENRES)` and `z.enum(TONES)` in `DISTILL_PAYLOAD` (`packages/server/src/domain/discovery/verbs/distill.ts:84,86`). That schema is the structured-output grammar sent to the model (`projectJsonSchema`, line 92) and the validator for its reply (`runStructuredTurn`, line 294); the model picks a member and `upsertSummary` stores it in `character_summaries.genre` and `.tone` (line 349). Old stored rows hold every current member. Dropping one reshapes the request schema and orphans stored rows, so it is an inference decision: not applied.
- Survey: codegraph_explore `GENRES TONES distill.ts discovery distillSchema` (one caller each, `DISTILL_PAYLOAD`); ast-grep string-literal scan over `packages tests tooling` (5913 `.ts`, 1524 `.tsx`): `"science-fiction"` 5, `"slice-of-life"` 4, `"wholesome"` 4, `"supernatural"` 2, all ts, 0 tsx; the non-`distill.ts` hits are the character seeder tags (`packages/server/src/domain/character/seeder/cards.ts`) and test corpus responders. The whole of `distill.ts` was read.
- No code change.
