---
kind: plan
status: active
updated: 2026-09-23
---

# Expressions: portraits that change with the mood of a reply

## Goal

A character's portrait changes with the classified mood of each reply, from a sprite set the user uploads or generates.

## Shape

**Already built:** the image-sheet preparation substrate (`sliceGrid` and the matte helpers in `packages/server/src/kit/image-matte/index.ts`, with the local-light matte backend in `packages/inference/src/backends/local-light/`), and the optional classify injection seam on chat. The domain, persistence, classify hook and client portrait swap are not built.

The design (D49):

- **Sprite set.** `character_sprites` rows bind `(characterId, label)` to an asset in the per-user CAS (D21), managed by plain CRUD verbs. Labels are normalized and validated (`^[a-z0-9_-]{1,32}$`); the GoEmotions list is a suggestion, never a whitelist. Roster members may see a roster character's sprites, which needs a one-line D21 amendment.
- **Generation on demand.** An `expressions-sprite-sheet` workload prompts one sheet through injected imagery, slices the grid, mattes each cell (the local-light background-removal model when configured, a corner-flood fallback otherwise), and stores each cell. Expressions owns the sprite rows; imagery owns none.
- **Classification per turn.** A post-turn hook (`onTurnCompleted(chatId, messageId, variantId)`, an optional injected op that is a no-op when unwired) classifies the completed reply with a closed-label prompt, using structured output when the model supports it and snap-to-label otherwise, then emits one ephemeral bus event. Classification is off by default, skips speakers without sprites, and never blocks or fails a turn.
- **Client stage.** A single-sprite holder crossfades to the matching sprite; in a group it shows the most recent classified speaker.
- **Out:** VN compositors, live2d, VRM and talking heads. The chat background stays a theme token, not this domain.

## Open questions

- Build now or keep parked: `docs/work/0049-expressions-program.md`.
- Re-derive the bus event member and the D21 blob-route amendment against current contracts before building.

## Rejected

- Classifying in the browser: classification runs server-side against the resolved credential.
- Imagery owning sprite rows: generation is consumed by injection; expressions owns what it writes.
- A multi-sprite group layer in v1: deferred.

## Coupled sites

- a new expressions domain under `packages/server/src/domain/` and its contracts
- `packages/db/src/schema/` (the sprite table, as a forward migration) and the `sprite` asset kind
- `packages/server/src/domain/chat/` (the post-turn hook seam)
- `packages/server/src/domain/workloads/` (the sprite-sheet workload)
- the client stage in `packages/client/src/features/chat/`

## Test plan

- A byte-identity pin: a deploy without expressions produces identical turns.
- Classify tests: snap-to-label against the closed set, and a classify failure never fails the turn.
- Sprite-sheet workload tests over a planted grid, including partial-failure and rerun idempotency.
- A CT for the crossfade and the swipe-back cache.
