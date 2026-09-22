// transport/trpc/routers/character — the character-card surface (core/Tier-4-Transport.md). authed; owner-scoped.
// Thin: validate → `ctx.services.character.<verb>` → map errors. Input shapes derive from
// `@orb/contracts/character`. The two synthetic group-character ops are chat-injected internals (act on a
// resolved room `ownerId`, not a request principal) — NOT exposed here.

import {
  CHARACTER_LIST_MAX_LIMIT,
  characterBulkTagResultSchema,
  characterListCursorSchema,
  characterListSortSchema,
  createCharacterSchema,
  updateCharacterSchema,
} from "@orb/contracts/character";
import { GREETING_TRANSFORM_IDS } from "@orb/contracts/preset";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

/** The greeting studio's picked transform KINDS — DERIVED from the catalog's id tuple, never re-spelled. */
const greetingTransformIds = z.array(z.enum(GREETING_TRANSFORM_IDS));

export const characterRouter = t.router({
  create: authedProcedure
    .input(z.object({ input: createCharacterSchema }))
    .mutation(({ ctx, input }) => ctx.services.character.create({ principal: ctx.auth, input: input.input })),

  get: authedProcedure
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character) }))
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
          // The CEILING, enforced at the trust boundary: an over-bound ask is a BAD_REQUEST naming the
          // bound, never a silently trimmed page (see `CHARACTER_LIST_MAX_LIMIT`'s note in contracts).
          limit: z.number().int().min(1).max(CHARACTER_LIST_MAX_LIMIT).optional(),
          // The LENSES (owner ruling 2026-08-13 — the `chat.listChats` shape). All optional and all part of
          // the query key, so changing one resets the pages rather than filtering a stale set. The two
          // booleans are TRI-STATE: absent = unfiltered, never `false`.
          search: z.string().optional(),
          starred: z.boolean().optional(),
          archived: z.boolean().optional(),
          includeTagIds: z.array(typeIdSchema(ID_PREFIX.tag)).optional(),
          excludeTagIds: z.array(typeIdSchema(ID_PREFIX.tag)).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.character.list({
        principal: ctx.auth,
        ...(input?.sort !== undefined ? { sort: input.sort } : {}),
        ...(input?.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
        ...(input?.search !== undefined ? { search: input.search } : {}),
        ...(input?.starred !== undefined ? { starred: input.starred } : {}),
        ...(input?.archived !== undefined ? { archived: input.archived } : {}),
        ...(input?.includeTagIds !== undefined ? { includeTagIds: input.includeTagIds } : {}),
        ...(input?.excludeTagIds !== undefined ? { excludeTagIds: input.excludeTagIds } : {}),
      }),
    ),

  // The GROUP-BY-TAG CENSUS (#1696) — the same LENS axes `list` takes and none of its paging ones. A census
  // that could be sorted, cursored or limited would be window-dependent again, which is exactly the defect
  // it exists to close, so those three are not in the shape at all.
  listTagGroups: authedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          starred: z.boolean().optional(),
          archived: z.boolean().optional(),
          includeTagIds: z.array(typeIdSchema(ID_PREFIX.tag)).optional(),
          excludeTagIds: z.array(typeIdSchema(ID_PREFIX.tag)).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.character.listTagGroups({
        principal: ctx.auth,
        ...(input?.search !== undefined ? { search: input.search } : {}),
        ...(input?.starred !== undefined ? { starred: input.starred } : {}),
        ...(input?.archived !== undefined ? { archived: input.archived } : {}),
        ...(input?.includeTagIds !== undefined ? { includeTagIds: input.includeTagIds } : {}),
        ...(input?.excludeTagIds !== undefined ? { excludeTagIds: input.excludeTagIds } : {}),
      }),
    ),

  update: authedProcedure.input(z.object({ characterId: typeIdSchema(ID_PREFIX.character), input: updateCharacterSchema })).mutation(({ ctx, input }) =>
    ctx.services.character.update({
      principal: ctx.auth,
      characterId: input.characterId,
      input: input.input,
    }),
  ),

  remove: authedProcedure
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character) }))
    .mutation(({ ctx, input }) => ctx.services.character.remove({ principal: ctx.auth, characterId: input.characterId })),

  duplicate: authedProcedure
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character) }))
    .mutation(({ ctx, input }) => ctx.services.character.duplicate({ principal: ctx.auth, characterId: input.characterId })),

  bulkRemove: authedProcedure
    .input(z.object({ characterIds: z.array(typeIdSchema(ID_PREFIX.character)).min(1) }))
    .mutation(({ ctx, input }) => ctx.services.character.bulkRemove({ principal: ctx.auth, characterIds: input.characterIds })),

  bulkArchive: authedProcedure
    .input(z.object({ characterIds: z.array(typeIdSchema(ID_PREFIX.character)).min(1), archived: z.boolean() }))
    .mutation(({ ctx, input }) =>
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
        characterIds: z.array(typeIdSchema(ID_PREFIX.character)).min(1),
      }),
    )
    .output(characterBulkTagResultSchema)
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
        characterIds: z.array(typeIdSchema(ID_PREFIX.character)).min(1),
      }),
    )
    .output(characterBulkTagResultSchema)
    .mutation(({ ctx, input }) =>
      ctx.services.character.bulkRemoveCardTag({
        principal: ctx.auth,
        tagName: input.tagName,
        characterIds: input.characterIds,
      }),
    ),

  snapshot: authedProcedure.input(z.object({ characterId: typeIdSchema(ID_PREFIX.character), label: z.string().nullish() })).mutation(({ ctx, input }) =>
    ctx.services.character.snapshot({
      principal: ctx.auth,
      characterId: input.characterId,
      ...(input.label !== undefined ? { label: input.label } : {}),
    }),
  ),

  listSnapshots: authedProcedure
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character) }))
    .query(({ ctx, input }) => ctx.services.character.listSnapshots({ principal: ctx.auth, characterId: input.characterId })),

  getSnapshot: authedProcedure
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character), snapshotId: typeIdSchema(ID_PREFIX.characterSnapshot) }))
    .query(({ ctx, input }) => ctx.services.character.getSnapshot({ principal: ctx.auth, characterId: input.characterId, snapshotId: input.snapshotId })),

  restore: authedProcedure
    .input(
      z.object({
        characterId: typeIdSchema(ID_PREFIX.character),
        snapshotId: typeIdSchema(ID_PREFIX.characterSnapshot),
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
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character), greeting: z.string(), steer: z.string(), transforms: greetingTransformIds.optional() }))
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
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character), steer: z.string(), transforms: greetingTransformIds.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.character.generateGreeting({
        principal: ctx.auth,
        characterId: input.characterId,
        steer: input.steer,
        ...(input.transforms === undefined ? {} : { transforms: input.transforms }),
      }),
    ),
});
