---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: rpg
---

# Own-key reads on relationship-hint labels

## What

`packages/server/src/domain/rpg/substrate/reminder.ts` (`hints[label]`) and `packages/server/src/domain/rpg/substrate/delta.ts` (`ctx.relationshipHints[label]`) index a plain object by a host-written custom relationship label. The label `constructor` reads the inherited `Object` function, passes the non-empty check, and puts the function source into the model prompt as `constructor (function Object() …)`. Items 1156 and 1257 fixed the same inherited-key read on the tracker and attribute planes with `readOwnKey` from `@orb/kit/objects`; these two sites were outside their lists.

## Why

A host-chosen label is untrusted at this boundary, and prompt text built from an inherited member is a prompt defect the model cannot tell from content.

## Done when

Both sites read through `readOwnKey`; a reminder test and a delta test with a `constructor` relationship label show the prompt carries no inherited member and the label renders as the host wrote it; an ast-grep sweep of `packages/server/src/domain/rpg` for `$X[$Y]` with a string-typed label finds no remaining inherited-key read, with the scanned count recorded.

## Evidence

Filled at landing: what ran and where its output is.
