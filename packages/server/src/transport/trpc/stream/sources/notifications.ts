// Room source: `notifications` — the per-user durable inbox stream (SSE-1 §4.2/S3), MOVED from
// `routers/notifications.ts::notifications` (`notificationStream` + `collectSince`, bodies intact). The
// durable-first ordering is unchanged; only the transport underneath moved and the resume cursor moved from
// the tracked envelope's id onto the frame's own `seq` (§3.3 — the socket's tracked id is a per-socket
// ordinal, so a durable cursor has to travel INSIDE the frame).
//
// Attach the live listener FIRST (`on()` buffers from that instant), replay the durable rows newer than the
// room's cursor from the inbox `list` (newest-first paging, returned ASCENDING), then drain live — the
// overlap deduped by the monotonic `seq`. A CURSOR-LESS attach replays NOTHING and goes straight live: the
// client already loaded the inbox through `notifications.list`, and re-sending the whole inbox on a first
// attach would be a second copy of a read it just did. That is the same first-subscribe-vs-reconnect
// asymmetry `lastEventId` expressed before the fold.
//
// AUTHZ — THE PD-106 MULTI-HUMAN BELT, RELOCATED FROM THE PROCEDURE TO THIS ATTACH. The inbox is a
// multi-human surface (invite/kick/host-handoff delivery), so a deployment that cannot seat a second human
// refuses it as NONEXISTENT — a uniform NOT_FOUND, never a FORBIDDEN that advertises the capability. The
// belt could not stay on the procedure: the socket itself is `authedProcedure` by design (a single-user
// deployment must still get its user/chat/rpg rooms), so the belt is a per-ROOM concern and this is the room.
// The verdict, its code, and its security event are the middleware's, verbatim — only the site moved.
// Everything BELOW the attach is self-scoped: the channel key IS `principal.userId` and the durable `list`
// is caller-scoped inside the verb, so there is no per-yield re-gate (there never was one).
//
// LIVE-ONLY IN CONTENT, DURABLE IN RECOVERY. The client consumer treats every frame as a pure "refetch the
// inbox" trigger, but the room is genuinely RESUMABLE (a durable `notifications` table + `list` cursor), which
// is what makes its `lag` overflow policy legal (`frame-queue.ts`: a shed is refillable only because the rows
// can be re-read) and what puts it behind the reconnect barrier (`socket.ts`).

import type { Principal } from "@orb/contracts/identity";
import type { StreamDataFrame } from "@orb/contracts/stream";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { InboxView, NotificationsService } from "#domain/notifications";
import { securityEvent } from "#foundation/observability";
import { subscribeNotifications } from "../../notifications-bus.ts";
import type { RoomSourceDef } from "../room-source.ts";

// Bound the reconnect replay so a client that resumes from a very old cursor can't page its whole inbox in
// one attach; older-than-this is the client's job to refetch via `list`.
const REPLAY_PAGE = 100;
const MAX_REPLAY_PAGES = 10;

export const notificationsRoomSource: RoomSourceDef<"notifications"> = {
  // The durable inbox table IS this room's resume path (and what makes its `lag` overflow legal).
  resumable: true,

  // The PD-106 belt, moved here from `multiHumanProcedure` (see the header). Same verdict, same NOT_FOUND,
  // same security event — a refusal that reads exactly like a room that does not exist.
  authorizeAttach: ({ multiHumanCapable }) => {
    if (multiHumanCapable) {
      return Promise.resolve();
    }
    securityEvent(
      "multi_human_unavailable",
      { path: "stream.attach (notifications room)" },
      "security: multi-human surface refused (deployment not multi-human capable)",
    );
    return Promise.reject(new DomainNotFoundError("stream room", "notifications"));
  },

  async *run({ principal, services, cursor, signal }): AsyncGenerator<StreamDataFrame> {
    const service = services.notifications;
    // Attach the live listener FIRST (`on()` buffers from this point) so the replay→live gap loses nothing.
    const live = subscribeNotifications(principal.userId, signal);
    let maxSeq = cursor ?? 0;

    if (cursor !== null) {
      for (const view of await collectSince(service, principal, cursor)) {
        yield { channel: "notifications", seq: view.seq, event: view };
        maxSeq = view.seq;
      }
    }

    for await (const view of live) {
      // Dedup the replay/live overlap (and any out-of-order delivery) by the monotonic `seq`.
      if (view.seq <= maxSeq) {
        continue;
      }
      yield { channel: "notifications", seq: view.seq, event: view };
      maxSeq = view.seq;
    }
  },
};

/** Page the durable inbox (newest-first) for rows newer than `resumeSeq`, returned ASCENDING for replay. */
async function collectSince(service: NotificationsService, principal: Principal, resumeSeq: number): Promise<InboxView[]> {
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
