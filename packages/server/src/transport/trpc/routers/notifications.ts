// transport/trpc/routers/notifications — the per-user durable inbox surface + the resumable subscription
// (PD-23; core/Tier-4-Transport.md §"per-user notifications subscription"). The CRUD verbs delegate to the
// `notifications` domain (caller-scoped — every read/write is scoped to `principal.userId` inside the
// verb). EVERY procedure here rides `multiHumanProcedure` — the PD-106 single-user capability belt: the
// inbox is a multi-human surface (invite/kick/host-handoff delivery), so a `single-user` deployment
// refuses the whole router as NOT_FOUND. Transport owns ONLY the subscription: it adopts the
// `chat.streamMessages` resume shape — every yield `tracked()`, `lastEventId` replay, DURABLE-FIRST /
// fan-out-second — wired over the inbox's durable `list` (cursor = `seq`) + the transport-owned live bus
// (`notifications-bus`).
//
// Resume contract: on RECONNECT (`lastEventId` present) the stream replays the durable rows with
// `seq > lastEventId` (ascending) from the table, THEN attaches the live bus — so an event that landed
// while disconnected is never missed (it was `record`ed before any fan-out). On FIRST subscribe (no
// `lastEventId`) it does NOT replay the whole inbox (the client already loaded it via `list`); it just
// goes live. The live listener is attached BEFORE the replay so the gap between the two carries no loss;
// the overlap is deduped by the monotonic `seq`.

import type { Principal } from "@orb/contracts/identity";
import type { NotificationId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import type { InboxView, NotificationsService } from "#domain/notifications";
import { subscribeNotifications } from "../notifications-bus";
import { withSubscriptionErrors } from "../subscriptions";
import { multiHumanProcedure, t } from "../trpc";

// Bound the reconnect replay so a client that resumes from a very old cursor can't page its whole inbox in
// one subscribe; older-than-this is the client's job to refetch via `list`.
const REPLAY_PAGE = 100;
const MAX_REPLAY_PAGES = 10;

export const notificationsRouter = t.router({
  list: multiHumanProcedure
    .input(z.object({ cursor: z.number().optional(), limit: z.number().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.services.notifications.list({
        principal: ctx.auth,
        ...(input?.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
      }),
    ),

  markRead: multiHumanProcedure
    .input(z.object({ notificationId: brandedId<NotificationId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.notifications.markRead({
        principal: ctx.auth,
        notificationId: input.notificationId,
      }),
    ),

  dismiss: multiHumanProcedure
    .input(z.object({ notificationId: brandedId<NotificationId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.notifications.dismiss({
        principal: ctx.auth,
        notificationId: input.notificationId,
      }),
    ),

  // The per-user durable inbox stream (PD-23). `withSubscriptionErrors` converts a thrown domain error
  // (e.g. from the durable `list` replay) into a typed frame — a subscription bypasses the
  // domain-error middleware, so without it a throw would surface as a spurious 500 (Esoteric #5).
  notifications: multiHumanProcedure
    // biome-ignore lint/plugin/no-raw-id: lastEventId is the SSE resume cursor (a `seq` string set by tRPC's Last-Event-ID), not a branded entity id.
    .input(z.object({ lastEventId: z.string().nullish() }).optional())
    .subscription(({ ctx, input, signal }) => {
      const sig = signal ?? new AbortController().signal;
      // Presence (PD-70): the per-user notifications stream IS the device-liveness signal — every device holds
      // one, so ref-count this connection (released on `sig` abort) and cast-gating sees the user as present.
      ctx.presence.connect(ctx.auth.userId, sig);
      return withSubscriptionErrors(
        notificationStream(ctx.services.notifications, ctx.auth, input?.lastEventId ?? null, sig),
      );
    }),
});

// The durable-first per-user notification generator.
async function* notificationStream(
  service: NotificationsService,
  principal: Principal,
  lastEventId: string | null,
  signal: AbortSignal | undefined,
): AsyncGenerator<TrackedEnvelope<InboxView>> {
  const resumeSeq = parseResumeSeq(lastEventId);
  // Attach the live listener FIRST (`on()` buffers from this point) so the replay→live gap loses nothing.
  const live = subscribeNotifications(principal.userId, signal ?? new AbortController().signal);
  let maxSeq = resumeSeq ?? 0;

  if (resumeSeq !== null) {
    for (const view of await collectSince(service, principal, resumeSeq)) {
      yield tracked(String(view.seq), view);
      maxSeq = view.seq;
    }
  }

  for await (const view of live) {
    // Dedup the replay/live overlap (and any out-of-order delivery) by the monotonic `seq`.
    if (view.seq <= maxSeq) {
      continue;
    }
    yield tracked(String(view.seq), view);
    maxSeq = view.seq;
  }
}

// Page the durable inbox (newest-first) for rows newer than `resumeSeq`, returned ASCENDING for replay.
async function collectSince(
  service: NotificationsService,
  principal: Principal,
  resumeSeq: number,
): Promise<InboxView[]> {
  const missed: InboxView[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < MAX_REPLAY_PAGES; page++) {
    // biome-ignore lint/performance/noAwaitInLoops: cursor paging is inherently sequential — each page's cursor depends on the prior page's result.
    const res = await service.list({
      principal,
      limit: REPLAY_PAGE,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    for (const view of res.items) {
      if (view.seq > resumeSeq) {
        missed.push(view);
      }
    }
    const oldest = res.items.at(-1);
    if (res.nextCursor === null || (oldest !== undefined && oldest.seq <= resumeSeq)) {
      break;
    }
    cursor = res.nextCursor;
  }
  missed.reverse();
  return missed;
}

// A finite, non-error resume cursor, or `null` (first subscribe / a malformed or sentinel id).
function parseResumeSeq(lastEventId: string | null): number | null {
  if (lastEventId === null) {
    return null;
  }
  const parsed = Number(lastEventId);
  return Number.isFinite(parsed) ? parsed : null;
}
