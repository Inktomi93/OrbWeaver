// transport/trpc/routers/notifications — the per-user durable inbox CRUD surface (PD-23;
// core/Tier-4-Transport.md §"per-user notifications subscription"). The verbs delegate to the
// `notifications` domain (caller-scoped — every read/write is scoped to `principal.userId` inside the
// verb). EVERY procedure here rides `multiHumanProcedure` — the PD-106 capability belt: the inbox is a
// multi-human surface (invite/kick/host-handoff delivery), so a deployment that cannot seat a second
// human (single-user, or local with `LOCAL_MULTI_USER` off — the B4 axis, FINAL-Auth-Modes §9) refuses
// the whole router as NOT_FOUND.
//
// The live inbox stream used to live here as `notifications`. It FOLDED into the multiplexed socket at
// SSE-1 S3: it is now the `notifications` ROOM (`transport/trpc/stream/sources/notifications.ts`), carrying
// the same durable-first resume (live listener first, `list`-paged replay of `seq > cursor`, then live) with
// the same PD-106 belt — relocated from this router's middleware onto that room's `authorizeAttach`, because
// the socket itself must stay reachable on a single-user deployment for its user/chat/rpg rooms. The
// PD-70 presence ref-count and the host-return `drainDeferredTurns` edge moved to the socket with it
// (`routers/stream.ts`, spec §5.6 — owner-ruled §14.4).

import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import type { NotificationId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { multiHumanProcedure, t } from "../trpc.ts";

export const notificationsRouter = t.router({
  list: multiHumanProcedure
    .input(z.object({ cursor: z.number().optional(), limit: z.number().int().min(1).max(NOTIFICATIONS_LIST_MAX_LIMIT).optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.services.notifications.list({
        principal: ctx.auth,
        ...(input?.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
      }),
    ),

  markAllRead: multiHumanProcedure.mutation(({ ctx }) => ctx.services.notifications.markAllRead({ principal: ctx.auth })),

  dismiss: multiHumanProcedure.input(z.object({ notificationId: brandedId<NotificationId>() })).mutation(({ ctx, input }) =>
    ctx.services.notifications.dismiss({
      principal: ctx.auth,
      notificationId: input.notificationId,
    }),
  ),
});
