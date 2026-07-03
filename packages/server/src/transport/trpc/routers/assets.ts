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
} from "@orb/contracts/assets";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

export const assetsRouter = t.router({
  listOwned: authedProcedure
    .input(listOwnedParamsSchema)
    .query(({ ctx, input }) => ctx.services.assets.listOwned({ principal: ctx.auth, ...input })),

  addToGallery: authedProcedure
    .input(galleryAddParamsSchema)
    .mutation(({ ctx, input }) =>
      ctx.services.assets.addToGallery({ principal: ctx.auth, ...input }),
    ),

  removeFromGallery: authedProcedure
    .input(z.object({ galleryItemId: galleryItemIdSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.assets.removeFromGallery({
        principal: ctx.auth,
        galleryItemId: input.galleryItemId,
      }),
    ),

  listGallery: authedProcedure
    .input(galleryListParamsSchema)
    .query(({ ctx, input }) => ctx.services.assets.listGallery({ principal: ctx.auth, ...input })),
});
