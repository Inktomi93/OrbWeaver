// transport/trpc/routers/poses — the BYO pose-library READ surface (comfyui-control §4.12.2, C6c; the picker's
// BYO half, C6d). authed; owner-scoped off the session `Principal` (never a user-supplied owner) through the
// `asset_id → assets.ownerId` join in the verb. The IMPORT (byte ingest) is NOT here — like every asset upload
// it rides a multipart `entry/http` route (bytes don't belong in a tRPC JSON body); this router is the JSON read.

import { z } from "zod";
import { authedProcedure, t } from "../trpc";

export const posesRouter = t.router({
  // The caller's own BYO skeletons, newest-first, optional category filter. Owner-scoped in the query WHERE.
  listOwned: authedProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(({ ctx, input }) => ctx.services.assets.listOwnedPoses({ principal: ctx.auth, category: input.category })),
});
