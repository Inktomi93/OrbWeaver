// transport/trpc/routers/tag — the descriptive-label surface (core/Tier-4-Transport.md). authed; owner-scoped
// (tags are personal labels, no resource-role). Thin: validate → `ctx.services.tag.<verb>` → map errors.
// Wire input shapes + axes derive from `@orb/contracts/tag` (no inline re-spell — §7.4).

import { createTagSchema, tagStatusSchema, tagTargetTypeSchema, updateTagSchema } from "@orb/contracts/tag";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

export const tagRouter = t.router({
  createTag: authedProcedure
    .input(z.object({ input: createTagSchema }))
    .mutation(({ ctx, input }) => ctx.services.tag.createTag({ principal: ctx.auth, input: input.input })),

  // @test-fixture: the CT typed-read template verb — the client-data CTs (create-entity-mutation.ct.tsx,
  // _ct-stories.tsx) pair createTag + listTags as the optimistic-cache fixture; production reads run through
  // listTagsWithUsage. Ships as the always-available CT surface, no other client consumer.
  listTags: authedProcedure.query(({ ctx }) => ctx.services.tag.listTags({ principal: ctx.auth })),

  updateTag: authedProcedure
    .input(z.object({ tagId: typeIdSchema(ID_PREFIX.tag), patch: updateTagSchema }))
    .mutation(({ ctx, input }) => ctx.services.tag.updateTag({ principal: ctx.auth, tagId: input.tagId, patch: input.patch })),

  removeTag: authedProcedure
    .input(z.object({ tagId: typeIdSchema(ID_PREFIX.tag) }))
    .mutation(({ ctx, input }) => ctx.services.tag.removeTag({ principal: ctx.auth, tagId: input.tagId })),

  mergeTags: authedProcedure
    .input(z.object({ sourceTagId: typeIdSchema(ID_PREFIX.tag), targetTagId: typeIdSchema(ID_PREFIX.tag) }))
    .mutation(({ ctx, input }) =>
      ctx.services.tag.mergeTags({
        principal: ctx.auth,
        sourceTagId: input.sourceTagId,
        targetTagId: input.targetTagId,
      }),
    ),

  listTagsWithUsage: authedProcedure.query(({ ctx }) => ctx.services.tag.listTagsWithUsage({ principal: ctx.auth })),

  // The character library's filter-chip vocabulary — the same owned rows as listTagsWithUsage, projected to
  // the four fields a chip reads. Split off because the rail was paying 433KB of five-junction management
  // rows to paint eight chips (side-eye 2026-08-18 P2-6). No input: the vocabulary is keyless, so cycling a
  // chip never re-keys (and never refetches) it.
  listTagFilterVocabulary: authedProcedure.query(({ ctx }) => ctx.services.tag.listTagFilterVocabulary({ principal: ctx.auth })),

  // The Accept/Reject review queue: the owner's STAGED (`pending`) character-tag suggestions (PD-40 distill +
  // import staged card tags). `characterId` narrows to one editor's suggestions; absent = the whole inbox.
  listPendingSuggestions: authedProcedure.input(z.object({ characterId: typeIdSchema(ID_PREFIX.character).optional() }).optional()).query(({ ctx, input }) =>
    ctx.services.tag.listPendingSuggestions({
      principal: ctx.auth,
      ...(input?.characterId !== undefined ? { characterId: input.characterId } : {}),
    }),
  ),

  pruneUnusedTags: authedProcedure.mutation(({ ctx }) => ctx.services.tag.pruneUnusedTags({ principal: ctx.auth })),

  setTagOrder: authedProcedure
    .input(z.object({ orderedIds: z.array(typeIdSchema(ID_PREFIX.tag)).min(1) }))
    .mutation(({ ctx, input }) => ctx.services.tag.setTagOrder({ principal: ctx.auth, orderedIds: input.orderedIds })),

  attachTag: authedProcedure
    .input(
      z.object({
        tagId: typeIdSchema(ID_PREFIX.tag),
        targetType: tagTargetTypeSchema,
        // @orb-waive no-raw-id(targetId): polymorphic ref — targetId is a plain wire string, branded per targetType at the junction dispatch (tag params).
        targetId: z.string().min(1),
        status: tagStatusSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.tag.attachTag({
        principal: ctx.auth,
        tagId: input.tagId,
        targetType: input.targetType,
        targetId: input.targetId,
        ...(input.status !== undefined ? { status: input.status } : {}),
      }),
    ),

  detachTag: authedProcedure
    .input(
      z.object({
        tagId: typeIdSchema(ID_PREFIX.tag),
        targetType: tagTargetTypeSchema,
        // @orb-waive no-raw-id(targetId): polymorphic ref — targetId is a plain wire string, branded per targetType at the junction dispatch (tag params).
        targetId: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.tag.detachTag({
        principal: ctx.auth,
        tagId: input.tagId,
        targetType: input.targetType,
        targetId: input.targetId,
      }),
    ),
});
