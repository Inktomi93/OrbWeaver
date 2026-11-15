---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: rpg
plan: typed-enforcers
---

# Decide whether the host-pressed dangling-pointer detach claims the room

## What

`setRpgPointer` with `null` writes through `commitHostFencedWrite` under a `ClaimExempt` listed in `tooling/src/eslint/room-token-mint.ts`. The detach runs only when the host presses the detach control (`packages/client/src/features/rpg/components/rpg-error-state.tsx`), and it is host-gated in `packages/server/src/domain/rpg/verbs/game/detach-dangling-pointer.ts`. The claim-before-write ruling claims on an explicit host write and names no non-claiming heal. The exemption keeps the behaviour the detach had before the room tokens: it never claimed. A room started as a game carries its pointer from the creation batch in `packages/server/src/domain/chat/verbs/start-chat.ts`, so the detach can land on an unclaimed husk when that husk's game row has vanished. Only the host reaches it: a husk is hidden from every member's list, and the only way to seat a second human is an invite, and minting one claims the room.

## Why

The exemption has no sentence in the ruling behind it. The security review reads the detach as an explicit host write that the ruling says claims.

## Done when

Default: the detach claims. The `setRpgPointer` exemption row leaves `ROOM_TOKEN_MINT_SITES`, the detach spends an admission from its host gate, and a test shows a detach on a husk claims it. If the owner rules otherwise, the ruling names the detach as non-claiming and the exemption reason cites that sentence.

## Evidence

Filled at landing: what ran and where its output is.
