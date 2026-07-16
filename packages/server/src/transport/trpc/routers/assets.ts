// transport/trpc/routers/assets — the owned-asset + gallery surface (gallery-design §1.2/§1.3). authed;
// owner-scoped. Thin: validate with the `@orb/contracts/assets` wire schemas → `ctx.services.assets.<verb>`
// passing the resolved `Principal` as the actor (the same actor-passing shape as the other routers). The
// upload/blob-serve paths are NOT here — they are the non-tRPC `entry/http` registrars (multipart + byte
// serve); this router is the JSON verb surface (list/curate).

import {
  galleryAddParamsSchema,
  galleryItemIdSchema,
  galleryListParamsSchema,
  listOwnedParamsSchema,
  resolveBlobRefsParamsSchema,
  resolveChatBlobRefsParamsSchema,
} from "@orb/contracts/assets";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

export const assetsRouter = t.router({
  listOwned: authedProcedure.input(listOwnedParamsSchema).query(({ ctx, input }) => ctx.services.assets.listOwned({ principal: ctx.auth, ...input })),

  addToGallery: authedProcedure.input(galleryAddParamsSchema).mutation(({ ctx, input }) => ctx.services.assets.addToGallery({ principal: ctx.auth, ...input })),

  removeFromGallery: authedProcedure.input(z.object({ galleryItemId: galleryItemIdSchema })).mutation(({ ctx, input }) =>
    ctx.services.assets.removeFromGallery({
      principal: ctx.auth,
      galleryItemId: input.galleryItemId,
    }),
  ),

  listGallery: authedProcedure.input(galleryListParamsSchema).query(({ ctx, input }) => ctx.services.assets.listGallery({ principal: ctx.auth, ...input })),

  // #67 — resolve inline-message `asset:<id>` refs → `(assetId, hash)` for render. Owner scoped to the
  // SESSION principal (never a user-supplied owner); the client builds `blobUrl(hash)` from each pair.
  resolveBlobRefs: authedProcedure
    .input(resolveBlobRefsParamsSchema)
    .query(({ ctx, input }) => ctx.services.assets.resolveOwnedAssetRefs(ctx.auth.userId, input.assetIds)),

  // #67 co-participant render — the CHAT-SCOPED sibling: resolve `asset:<id>` refs a viewer sees in `chatId`,
  // including a PRESENT co-participant's attachments (not just the caller's own). The caller (session
  // principal) is passed as `callerId`; the gate is STRUCTURAL (`message_assets` reference in `chatId` +
  // owner present + caller present), so a non-participant caller or an asset not attached in this chat
  // resolves to nothing (leak-free — the same gate as the model render path).
  resolveChatBlobRefs: authedProcedure
    .input(resolveChatBlobRefsParamsSchema)
    .query(({ ctx, input }) => ctx.services.assets.resolveChatAssetRefs(ctx.auth.userId, input.chatId, input.assetIds)),
});
