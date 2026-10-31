---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/discovery fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/discovery`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `DuplicateComputeStats.ownersProcessed` | `server/src/domain/discovery/contract/results.ts:5` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/duplicates/generate.ts:123`) |
| `DuplicateChatComputeStats.ownersProcessed` | `server/src/domain/discovery/contract/results.ts:14` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/duplicates/generate.ts:316`) |
| `ThemeComputeStats.ownersProcessed` | `server/src/domain/discovery/contract/results.ts:25` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/themes/generate.ts:212`) |
| `CooccurrenceStats.ownersProcessed` | `server/src/domain/discovery/contract/results.ts:52` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/cooccurrence/generate.ts:213`) |
| `CooccurrenceStats.hubTokensDropped` | `server/src/domain/discovery/contract/results.ts:64` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/cooccurrence/generate.ts:223`) |
| `StoryTimeBackfillStats.stamped` | `server/src/domain/discovery/contract/results.ts:69` | unreferenced | delete | delete the field |
| `CardDistillTarget.characterId` | `server/src/domain/discovery/persistence/card-reads.ts:24` | unreferenced | delete | delete the field |
| `CardDistillTarget.ownerId` | `server/src/domain/discovery/persistence/card-reads.ts:25` | unreferenced | delete | delete the field |
| `HubVector.id` | `server/src/domain/discovery/persistence/embed-store-reads.ts:69` | unreferenced | delete | delete the field |
| `HubVector.embedding` | `server/src/domain/discovery/persistence/embed-store-reads.ts:71` | unreferenced | delete | delete the field |
| `HubVector.contentHash` | `server/src/domain/discovery/persistence/embed-store-reads.ts:72` | unreferenced | delete | delete the field |
| `OwnedDigestVector.topicAnchor` | `server/src/domain/discovery/persistence/embed-store-reads.ts:88` | unreferenced | delete | delete the field |
| `TierKDigestRow.tier` | `server/src/domain/discovery/persistence/embed-store-reads.ts:593` | unreferenced | delete | delete the field |
| `TierKDigestRow.blockIdx` | `server/src/domain/discovery/persistence/embed-store-reads.ts:594` | unreferenced | delete | delete the field |
| `CharacterMessageSample.content` | `server/src/domain/discovery/persistence/message-reads.ts:48` | unreferenced | delete | delete the field |
| `CharacterMessageSample.createdAt` | `server/src/domain/discovery/persistence/message-reads.ts:49` | unreferenced | delete | delete the field |
| `CardFacetRow.avatarHash` | `server/src/domain/discovery/persistence/summary-reads.ts:35` | unreferenced | delete | delete the field |
| `DistillateRow.elevatorPitch` | `server/src/domain/discovery/persistence/summary-reads.ts:61` | unreferenced | delete | delete the field |
| `DistillateRow.tags` | `server/src/domain/discovery/persistence/summary-reads.ts:62` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
