// transport/trpc/routers/tag â the descriptive-label surface (core/Tier-4-Transport.md). authed; owner-scoped
// (tags are personal labels, no resource-role). Thin: validate â `ctx.services.tag.<verb>` â map errors.
// Wire input shapes + axes derive from `@orb/contracts/tag` (no inline re-spell â Â§7.4).

import {
  createTagSchema,
  tagStatusSchema,
  tagTargetTypeSchema,
  updateTagSchema,
} from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

export const tagRouter = t.router({
  createTag: authedProcedure
    .input(z.object({ input: createTagSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.tag.createTag({ principal: ctx.auth, input: input.input }),
    ),

  getTag: authedProcedure
    .input(z.object({ tagId: brandedId<TagId>() }))
    .query(({ ctx, input }) =>
      ctx.services.tag.getTag({ principal: ctx.auth, tagId: input.tagId }),
    ),

  listTags: authedProcedure.query(({ ctx }) => ctx.services.tag.listTags({ principal: ctx.auth })),

  updateTag: authedProcedure
    .input(z.object({ tagId: brandedId<TagId>(), patch: updateTagSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.tag.updateTag({ principal: ctx.auth, tagId: input.tagId, patch: input.patch }),
    ),

  removeTag: authedProcedure
    .input(z.object({ tagId: brandedId<TagId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.tag.removeTag({ principal: ctx.auth, tagId: input.tagId }),
    ),

  listTagsWithUsage: authedProcedure.query(({ ctx }) =>
    ctx.services.tag.listTagsWithUsage({ principal: ctx.auth }),
  ),

  pruneUnusedTags: authedProcedure.mutation(({ ctx }) =>
    ctx.services.tag.pruneUnusedTags({ principal: ctx.auth }),
  ),

  setTagOrder: authedProcedure
    .input(z.object({ orderedIds: z.array(brandedId<TagId>()).min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.tag.setTagOrder({ principal: ctx.auth, orderedIds: input.orderedIds }),
    ),

  attachTag: authedProcedure
    .input(
      z.object({
        tagId: brandedId<TagId>(),
        targetType: tagTargetTypeSchema,
        // biome-ignore lint/plugin/no-raw-id: polymorphic ref — targetId is a plain wire string, branded per targetType at the junction dispatch (tag params).
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
        tagId: brandedId<TagId>(),
        targetType: tagTargetTypeSchema,
        // biome-ignore lint/plugin/no-raw-id: polymorphic ref — targetId is a plain wire string, branded per targetType at the junction dispatch (tag params).
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

  bulkAttachTag: authedProcedure
    .input(
      z.object({
        tagIds: z.array(brandedId<TagId>()).min(1),
        targetType: tagTargetTypeSchema,
        // biome-ignore lint/plugin/no-raw-id: polymorphic ref — targetId is a plain wire string, branded per targetType at the junction dispatch (tag params).
        targetId: z.string().min(1),
        status: tagStatusSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.tag.bulkAttachTag({
        principal: ctx.auth,
        tagIds: input.tagIds,
        targetType: input.targetType,
        targetId: input.targetId,
        ...(input.status !== undefined ? { status: input.status } : {}),
      }),
    ),
});
