// Room source: `workloads` — one execution row's live lifecycle tail (SSE-1 S5), MOVED from
// `routers/workloads.ts::subscribe` (`workloadEvents`, body intact). It is the LAST stage of the staged fold:
// with it, `stream.connect` is the only `.subscription(` in the tree bar the permanently-exempt
// `chat.impersonateStream`, and the `single-stream-transport` ratchet closes.
//
// WHY IT HAD TO FOLD (spec §14 decision 3): this was the one room keyed by something a user opens N of. The
// Workloads pane mounts a tail PER ACTIVE ROW and the import section mounts another, so a user watching three
// runs paid three browser connections on top of the standing chat/rpg/user ones — the same starvation class
// the multiplex exists to make unmakeable, at the one surface that could hit it while doing nothing wrong.
// N rooms now cost N attach round-trips and ZERO connections.
//
// CLASSIFICATION — LIVE-ONLY (`resumable: false`, overflow `collapse`), and D117 (10) is why that is the
// honest answer even though progress is now DURABLE. `workloads.progress` is a latest-snapshot COLUMN, not a
// log: there is no per-event seq, so there is no cursor to resume from and the reconnect barrier would be
// waiting on an announcement that can carry no information. What the durable column actually bought is the
// thing that makes `collapse` safe here rather than merely cheap — the ROW is the reconnect truth
// (`workloads.list` renders real progress with no tail attached at all), so a shed or collapsed frame costs a
// redraw, never a fact. The 60s in-process ring (`getRecentWorkloadEvents`) stays exactly what it was: a
// live-tail smoother for the gap between `start()` returning and the client attaching — replayed at every
// pump start, TTL-bounded, addressable by nothing. A `lag` policy would be a lie (a shed row can never be
// re-read from it), and `resumable: true` would strand the room behind a barrier for a resume it cannot do.
//
// AUTHZ — REFUSE AT ATTACH, the same posture as `automation` and for the same reason: a workload row you do
// not own does not exist for you. `service.get` is the OWNER-scoped read (`isVisibleToCaller`: a non-admin
// sees only its own `ownerId`; a foreign or absent id is the SAME leak-free `DomainNotFoundError` → NOT_FOUND,
// never a FORBIDDEN existence oracle), and it was the deleted generator's first act before any replay or bus
// tail — so it is this room's `authorizeAttach`, at the same moment relative to the live attach.
//
// The gate does NOT re-run in the pump, and that is deliberate rather than an omission: unlike automation's
// membership (which a kick can revoke mid-stream, so its tier is re-derived per pump start), a workload's
// `ownerId` is stamped at `start` and never moves — no verdict can change under a running pump. The pump also
// must not turn a row's DISAPPEARANCE into a room fault: re-reading here would make a reaped/retention-swept
// row an error toast on a tail that pre-fold simply went quiet.
//
// ORDERING IS THE PRE-FOLD ORDERING, verbatim: ring replay FIRST, then the live listener. The live half is the
// process-local emitter filtered to this one `workloadId` — the filter is the room's scope on the wire, since
// the emitter carries EVERY owner's events on one channel.

import { on } from "node:events";
import type { StreamDataFrame } from "@orb/contracts/stream";
import type { WorkloadEvent } from "@orb/contracts/workloads";
import { getRecentWorkloadEvents, workloadStreamEmitter } from "#domain/workloads";
import type { RoomSourceDef } from "../room-source";

/** The (unexported) bus channel `emitWorkloadEvent` publishes on — mirrored here so the live tail listens on
 *  the same channel. The progress bus is single-process (single-replica) by design. */
const WORKLOAD_EVENT_CHANNEL = "workload";

export const workloadsRoomSource: RoomSourceDef<"workloads"> = {
  // LIVE-ONLY: the durable `progress` column is a snapshot, not a replayable log (see the header).
  resumable: false,

  // The owner gate, verbatim — the deleted subscription's first act, now given before the room is recorded
  // on the socket cell. A stranger never learns the run exists.
  authorizeAttach: async ({ ref, principal, services }) => {
    await services.workloads.get({ id: ref.workloadId, caller: principal });
  },

  async *run({ ref, signal }): AsyncGenerator<StreamDataFrame> {
    // The 60s ring: what was emitted between `start()` returning and this attach. Replayed at EVERY pump
    // start (a reconnect, a re-attach), which is what it did pre-fold on every re-subscribe — overlap is
    // idempotent client-side (a progress snapshot is absolute, a terminal is terminal).
    for (const event of getRecentWorkloadEvents(ref.workloadId)) {
      yield { channel: "workloads", workloadId: ref.workloadId, event };
    }

    for await (const args of on(workloadStreamEmitter, WORKLOAD_EVENT_CHANNEL, { signal })) {
      const event = args[0] as WorkloadEvent;
      // ONE emitter carries every owner's runs — this filter IS the room's scope on the wire.
      if (event.workloadId !== ref.workloadId) {
        continue;
      }
      yield { channel: "workloads", workloadId: ref.workloadId, event };
    }
  },
};
