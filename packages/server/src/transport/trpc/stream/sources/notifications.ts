// Room source: `notifications` — the per-user durable inbox stream (SSE-1 §4.2/S3), MOVED from
// `routers/notifications.ts::notifications` (`notificationStream`; the newest-first `collectSince` became the ascending `replaySince` pump in #1459). The
// durable-first ordering is unchanged; only the transport underneath moved and the resume cursor moved from
// the tracked envelope's id onto the frame's own `seq` (§3.3 — the socket's tracked id is a per-socket
// ordinal, so a durable cursor has to travel INSIDE the frame).
//
// Attach the live listener FIRST (`on()` buffers from that instant), replay the durable rows newer than the
// room's cursor through the inbox's own ASCENDING resume read (`replaySince`), then drain live — the
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

import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import type { StreamDataFrame } from "@orb/contracts/stream";
import { DomainNotFoundError } from "@orb/kit/errors";
import { securityEvent } from "#foundation/observability";
import { subscribeNotifications } from "../../notifications-bus.ts";
import type { RoomSourceDef } from "../room-source.ts";

// The replay's page size. TIED to the read's own ceiling on purpose: `replaySince` clamps to
// `NOTIFICATIONS_LIST_MAX_LIMIT`, and the loop below reads a SHORT page as "the durable log is exhausted" —
// so asking for more than the clamp would make every page look short and end the replay after one.
const REPLAY_PAGE = NOTIFICATIONS_LIST_MAX_LIMIT;

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

    // THE WATERMARK NEVER PASSES A ROW THAT WAS NOT YIELDED, by construction (#1459). Every page is read
    // ASCENDING from `maxSeq` — which is the last row this pump actually YIELDED — so the delivered set is a
    // contiguous prefix of the log at every instant, and the next page begins exactly one row above it. A
    // pump that stops anywhere (an abort, a `lag` shed, a socket death) therefore resumes without a gap;
    // there is no bound to stop short of, because BACKPRESSURE IS THE QUEUE'S JOB — the room's `lag` overflow
    // policy is legal precisely because this room is durable and its rows can be re-read (see the header's
    // "LIVE-ONLY IN CONTENT, DURABLE IN RECOVERY" and `frame-queue.ts`). A second bound here would be a
    // second answer to a question that already has one.
    if (cursor !== null) {
      for (;;) {
        const page = await service.replaySince({ principal, afterSeq: maxSeq, limit: REPLAY_PAGE });
        for (const view of page) {
          yield { channel: "notifications", seq: view.seq, event: view };
          maxSeq = view.seq;
        }
        if (page.length < REPLAY_PAGE) {
          break; // a short page is the durable tail — go live
        }
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
