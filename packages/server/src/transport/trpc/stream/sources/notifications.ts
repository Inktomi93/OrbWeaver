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
// AUTHZ — AUTHED IS THE WHOLE GATE (#1627, 2026-09-05). There is nothing left to refuse here: the channel
// key IS `principal.userId` (never client input — the `notifications` room ref carries no field that could
// widen it), the durable resume read is caller-scoped inside the verb, and `stream.attach`/`connect` are
// `authedProcedure`. So this room takes the `user` room's posture: `authorizeAttach` is a no-op and there is
// no per-yield re-gate (there never was one).
//
// IT CARRIES THE MULTI-HUMAN BELT, relocated here from `multiHumanProcedure` when the stream
// folded into the socket (the socket itself had to stay `authedProcedure` so a single-user deployment kept
// its user/chat/rpg rooms, which made the belt a per-ROOM concern). The RULING survives — its INPUT
// changed: the belt existed because every notification SOURCE was multi-human, and single-human sources
// now exist (`plugin-disabled` from the crash policy, `automation-notice` from an auto-disabling rule,
// plus the plugin consent prompt), so a single-user deployment was accumulating durable rows its only
// human could neither list nor stream. The belt is untouched where it still applies —
// `notifications.presence` and the whole invites router still ride `multiHumanProcedure`. The router-side
// half of this change, and what now holds the per-user partition, is `routers/notifications.ts`.
//
// LIVE-ONLY IN CONTENT, DURABLE IN RECOVERY. The client consumer treats every frame as a pure "refetch the
// inbox" trigger, but the room is genuinely RESUMABLE (a durable `notifications` table + `list` cursor), which
// is what makes its `lag` overflow policy legal (`frame-queue.ts`: a shed is refillable only because the rows
// can be re-read) and what puts it behind the reconnect barrier (`socket.ts`).

import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import type { StreamDataFrame } from "@orb/contracts/stream";
import { subscribeNotifications } from "../../notifications-bus.ts";
import type { RoomSourceDef } from "../room-source.ts";

// The replay's page size. TIED to the read's own ceiling on purpose: `replaySince` clamps to
// `NOTIFICATIONS_LIST_MAX_LIMIT`, and the loop below reads a SHORT page as "the durable log is exhausted" —
// so asking for more than the clamp would make every page look short and end the replay after one.
const REPLAY_PAGE = NOTIFICATIONS_LIST_MAX_LIMIT;

export const notificationsRoomSource: RoomSourceDef<"notifications"> = {
  // The durable inbox table IS this room's resume path (and what makes its `lag` overflow legal).
  resumable: true,

  // Nothing to gate (see the header): the socket's authed gate is the belt, and the channel key is the
  // caller's own userId. The `user` room's posture, for the same reason.
  authorizeAttach: () => Promise.resolve(),

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
