// transport/trpc/routers/character — the character-card surface (core/Tier-4-Transport.md). authed; owner-scoped.
// Thin: validate → `ctx.services.character.<verb>` → map errors. Input shapes derive from
// `@orb/contracts/character`. The two synthetic group-character ops are chat-injected internals (act on a
// resolved room `ownerId`, not a request principal) — NOT exposed here.

import { characterListCursorSchema, characterListSortSchema, createCharacterSchema, updateCharacterSchema } from "@orb/contracts/character";
import { GREETING_TRANSFORM_IDS } from "@orb/contracts/preset";
import type { CharacterId, CharacterSnapshotId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

/** The greeting studio's picked transform KINDS — DERIVED from the catalog's id tuple, never re-spelled. */
const greetingTransformIds = z.array(z.enum(GREETING_TRANSFORM_IDS));

export const characterRouter = t.router({
  create: authedProcedure
    .input(z.object({ input: createCharacterSchema }))
    .mutation(({ ctx, input }) => ctx.services.character.create({ principal: ctx.auth, input: input.input })),

  get: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .query(({ ctx, input }) => ctx.services.character.get({ principal: ctx.auth, characterId: input.characterId })),

  // Keyset-paged (core/Tier-4-Transport.md thin pass-through; core/Spine-Testing.md). `sort` + `cursor` derive
  // from `@orb/contracts/character` (never re-spelled here). `cursor` rides as ONE sort-discriminated object
  // field — tRPC's `infiniteQueryOptions` threads exactly one `cursor` field through as the page param,
  // overwriting it wholesale on every next-page fetch (a sibling would go stale). `sort` is a separate
  // top-level input (part of the query key), so changing it resets the infinite query's pages.
  list: authedProcedure
    .input(
      z
        .object({
          sort: characterListSortSchema.optional(),
          cursor: characterListCursorSchema.optional(),
          limit: z.number().int().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.character.list({
        principal: ctx.auth,
        ...(input?.sort !== undefined ? { sort: input.sort } : {}),
        ...(input?.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
      }),
    ),

  update: authedProcedure.input(z.object({ characterId: brandedId<CharacterId>(), input: updateCharacterSchema })).mutation(({ ctx, input }) =>
    ctx.services.character.update({
      principal: ctx.auth,
      characterId: input.characterId,
      input: input.input,
    }),
  ),

  remove: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .mutation(({ ctx, input }) => ctx.services.character.remove({ principal: ctx.auth, characterId: input.characterId })),

  duplicate: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .mutation(({ ctx, input }) => ctx.services.character.duplicate({ principal: ctx.auth, characterId: input.characterId })),

  bulkRemove: authedProcedure
    .input(z.object({ characterIds: z.array(brandedId<CharacterId>()).min(1) }))
    .mutation(({ ctx, input }) => ctx.services.character.bulkRemove({ principal: ctx.auth, characterIds: input.characterIds })),

  bulkArchive: authedProcedure.input(z.object({ characterIds: z.array(brandedId<CharacterId>()).min(1), archived: z.boolean() })).mutation(({ ctx, input }) =>
    ctx.services.character.bulkArchive({
      principal: ctx.auth,
      characterIds: input.characterIds,
      archived: input.archived,
    }),
  ),

  bulkAddCardTag: authedProcedure
    .input(
      z.object({
        tagName: z.string().min(1),
        characterIds: z.array(brandedId<CharacterId>()).min(1),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.character.bulkAddCardTag({
        principal: ctx.auth,
        tagName: input.tagName,
        characterIds: input.characterIds,
      }),
    ),

  bulkRemoveCardTag: authedProcedure
    .input(
      z.object({
        tagName: z.string().min(1),
        characterIds: z.array(brandedId<CharacterId>()).min(1),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.character.bulkRemoveCardTag({
        principal: ctx.auth,
        tagName: input.tagName,
        characterIds: input.characterIds,
      }),
    ),

  snapshot: authedProcedure.input(z.object({ characterId: brandedId<CharacterId>(), label: z.string().nullish() })).mutation(({ ctx, input }) =>
    ctx.services.character.snapshot({
      principal: ctx.auth,
      characterId: input.characterId,
      ...(input.label !== undefined ? { label: input.label } : {}),
    }),
  ),

  listSnapshots: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .query(({ ctx, input }) => ctx.services.character.listSnapshots({ principal: ctx.auth, characterId: input.characterId })),

  getSnapshot: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), snapshotId: brandedId<CharacterSnapshotId>() }))
    .query(({ ctx, input }) => ctx.services.character.getSnapshot({ principal: ctx.auth, characterId: input.characterId, snapshotId: input.snapshotId })),

  restore: authedProcedure
    .input(
      z.object({
        characterId: brandedId<CharacterId>(),
        snapshotId: brandedId<CharacterSnapshotId>(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.character.restore({
        principal: ctx.auth,
        characterId: input.characterId,
        snapshotId: input.snapshotId,
      }),
    ),

  // Greeting studio (audit §3): owner-gated bounded completions that RETURN text and NEVER write — the
  // client appends the accepted result to `characters.greetings` via `character.update`. Honest wire schemas
  // (no z.any): branded id + plain strings (the host's free-text steer +, for rewrite, the base greeting
  // text) + the picked transform KINDS. `transforms` is ENUM-validated, never prompt text: the fragment
  // bytes are `preset.greetingTransform.*` prose slots the verb resolves from the caller's preset (the
  // templating fork, ARM B — owner 2026-08-09), the same doctrine `guidedSteerSchema.gameSteer` states.
  rewriteGreeting: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), greeting: z.string(), steer: z.string(), transforms: greetingTransformIds.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.character.rewriteGreeting({
        principal: ctx.auth,
        characterId: input.characterId,
        greeting: input.greeting,
        steer: input.steer,
        ...(input.transforms === undefined ? {} : { transforms: input.transforms }),
      }),
    ),

  generateGreeting: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), steer: z.string(), transforms: greetingTransformIds.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.character.generateGreeting({
        principal: ctx.auth,
        characterId: input.characterId,
        steer: input.steer,
        ...(input.transforms === undefined ? {} : { transforms: input.transforms }),
      }),
    ),
});
