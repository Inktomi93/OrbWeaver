---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: rpg
---

# Own-key reads on the rpg attribute plane and the client tracker readers

## What

Item 1156 moved the tracker key reads on the server onto `readOwnKey` from `@orb/kit/objects` and refused `__proto__` at the tool-arg schema, because the client's `mintDefKey` turns a host label such as "Constructor" into the key `constructor`, which read an inherited member. The same inherited-key read remains at `packages/server/src/domain/rpg/verbs/roll-dice.ts:51` (`sheet.attributes[ability.key]`; an unset `constructor` attribute yields a NaN modifier) and in the client panels `features/rpg/components/rpg-actor-trackers.tsx:204,235`, `rpg-scene-npcs.tsx:74`, `rpg-attribute-grid.tsx:46`, `rpg-dice-composer-items.tsx:76`. `kit/macro/variables.ts` carries the same own-key concept as `readVarKey` and `setVarKey` with about twenty call sites across macro and automation.

## Why

A host-chosen label is untrusted at this boundary; one own-key read, in one home, is what makes every reader safe by construction.

## Done when

Each listed site reads through `readOwnKey`; a composed test for `rollDice` with a `constructor` ability and CTs for the rpg panels (no rpg stories exist yet under the client test tree; this item adds the first) show the label renders and computes correctly; `readVarKey` and `setVarKey` either delegate to the kit helper or a header records why the macro plane keeps its own.

## Evidence

Filled at landing: what ran and where its output is.
