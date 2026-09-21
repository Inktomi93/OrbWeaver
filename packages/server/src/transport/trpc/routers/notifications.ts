// transport/trpc/routers/notifications — the per-user durable inbox CRUD surface (PD-23;
// core/Tier-4-Transport.md §"per-user notifications subscription"). The verbs delegate to the
// `notifications` domain (caller-scoped — every read/write is scoped to `principal.userId` inside the
// verb).
//
// THE INBOX TRIO IS `authedProcedure` (#1627, 2026-09-05 — PD-106's ruling survives, its INPUT changed).
// The whole router rode `multiHumanProcedure` because every notification SOURCE was multi-human
// (invite/kick/host-handoff delivery), so a deployment that cannot seat a second human (single-user, or
// local with the `localMultiUser` AppSetting off — the B4 axis) refused the inbox as NOT_FOUND. Single-human sources
// now exist and were writing durable rows nobody on such a deployment could read: `plugin-disabled` (the
// crash policy notifying the INSTALLING OWNER — `domain/plugin/activation/crash-policy.ts`) and
// `automation-notice` (the auto-disable notice to the rule AUTHOR, including the owner-GLOBAL lane that
// has no chat at all — `domain/automation/engine/dispatch.ts::notifyAutoDisabled`), with the plugin
// CONSENT prompt (#924/#1041) joining them. The BELT ITSELF IS UNTOUCHED — `multiHumanProcedure` still
// carries `presence` below and the whole invites router; what changed is which surfaces are multi-human.
//
// WHAT HOLDS THE TRIO NOW, stated so the widening can be checked rather than trusted: none of the three
// takes a user id, so no wire shape can NAME another inbox, and each verb scopes on `principal.userId` in
// the persistence WHERE clause (`selectInbox` / `markAllReadScoped` / `dismissScoped` all pin
// `recipient_user_id`, so a foreign row matches nothing and `dismiss` collapses to the leak-free
// NOT_FOUND). That partition is the ONLY belt left between two principals' inboxes, which is why all three
// are now PROBED — no longer EXEMPT — in `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`,
// each with a planted-omission control.
//
// The live inbox stream used to live here as `notifications`. It FOLDED into the multiplexed socket at
// SSE-1 S3: it is now the `notifications` ROOM (`transport/trpc/stream/sources/notifications.ts`), carrying
// the same durable-first resume (live listener first, `list`-paged replay of `seq > cursor`, then live). The
// PD-106 belt travelled with it onto that room's `authorizeAttach` and came OFF there with #1627 for the same
// reason it came off here — the room is `authedProcedure` reachable and self-scoped by `principal.userId`. The
// PD-70 presence ref-count and the host-return `drainDeferredTurns` edge moved to the socket with it
// (`routers/stream.ts`, spec §5.6 — owner-ruled §14.4).
//
// `presence` (#1039) is the DISCLOSURE half of that same ref-count, and it homes here because presence was
// designed as part of the D16 human-to-human invite/notifications system — `PresenceView` already lives in
// `@orb/contracts/notifications`, so a second router would have split one concept across two front doors. It
// is the one procedure on this router that does NOT delegate to `ctx.services`: presence is transport-owned
// state (D16 — "presence → transport"), read through `ctx.presence` exactly as `routers/stream.ts` does.
// Riding `multiHumanProcedure` with its siblings is deliberate rather than incidental: online-state about
// OTHER humans is a multi-human surface, so a deployment that cannot seat a second human refuses it as
// nonexistent, and the client only renders the People section on such a deployment anyway.

import { NOTIFICATIONS_LIST_MAX_LIMIT, PRESENCE_READ_MAX_USER_IDS } from "@orb/contracts/notifications";
import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { readPresenceDisclosure } from "../presence-disclosure.ts";
import { authedProcedure, multiHumanProcedure, t } from "../trpc.ts";

export const notificationsRouter = t.router({
  list: authedProcedure
    .input(z.object({ cursor: z.number().optional(), limit: z.number().int().min(1).max(NOTIFICATIONS_LIST_MAX_LIMIT).optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.services.notifications.list({
        principal: ctx.auth,
        ...(input?.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
      }),
    ),

  markAllRead: authedProcedure.mutation(({ ctx }) => ctx.services.notifications.markAllRead({ principal: ctx.auth })),

  dismiss: authedProcedure.input(z.object({ notificationId: typeIdSchema(ID_PREFIX.notification) })).mutation(({ ctx, input }) =>
    ctx.services.notifications.dismiss({
      principal: ctx.auth,
      notificationId: input.notificationId,
    }),
  ),

  // Presence disclosure (#1039) — "which of these people are online right now". The AUDIENCE decision and
  // the seam a later membership tightening edits live in `presence-disclosure.ts`; this line is wire
  // plumbing only, so the policy can never end up half-stated in two places. The `.max()` is the trust
  // boundary: an over-bound ask is a BAD_REQUEST before the registry is touched.
  presence: multiHumanProcedure
    .input(z.object({ userIds: z.array(brandedId<UserId>()).min(1).max(PRESENCE_READ_MAX_USER_IDS) }))
    .query(({ ctx, input }) => readPresenceDisclosure(ctx.presence, input.userIds)),
});
