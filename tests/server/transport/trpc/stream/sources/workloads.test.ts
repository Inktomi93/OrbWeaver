// The `workloads` ROOM on the multiplexed socket (SSE-1 S5) — one execution row's live lifecycle tail, MOVED
// here with its generator from `routers/workloads.ts::subscribe`. It is the LAST room of the staged fold, and
// the one keyed by something a user opens N of, so these cases carry two burdens: the moved body behaves
// identically, and the shared socket does not become a way to read someone else's run.
//
// The properties pinned here:
//   • REFUSE AT ATTACH, OWNER-SCOPED — `service.get` is the IDOR gate (a non-admin sees only its own
//     `ownerId`; a foreign or absent id is the same leak-free NOT_FOUND). It was the deleted generator's
//     first act and is the room's `authorizeAttach`, so nothing is recorded on the cell for a stranger.
//   • THE FILTER IS THE ROOM'S SCOPE ON THE WIRE — ONE process-local emitter carries EVERY owner's events,
//     so an unfiltered pump would ship another owner's progress to a socket that merely attached its own
//     run. Tested as a leak, not as a routing detail.
//   • THE 60s RING REPLAYS AT PUMP START (what the pre-fold subscribe did per re-subscribe), and the frames
//     carry NO `seq`: this room is live-only, so the socket never advances a cursor for it and a `sinceSeq`
//     attach is accepted-and-ignored. That is the `resumable: false` half of the correspondence pinned in
//     `../room-sources.test.ts` — the durable `progress` COLUMN is a snapshot, not a replayable log
//     (D117 (10)), which is why `collapse` is legal here and `lag` would be a lie.
//   • THE GATE RUNS AT ATTACH ONLY — pinned as a call COUNT, because it is a decision rather than an
//     omission: a workload's `ownerId` is stamped at `start` and cannot move under a running pump (unlike
//     automation's kickable membership, which is re-derived per pump start), and re-reading would turn a
//     reaped row's disappearance into a `roomFailed` on a tail that pre-fold simply went quiet.

import type { StreamFrame } from "@orb/contracts/stream";
import type { WorkloadEvent } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { SocketId, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { WorkloadRowAnyKind, WorkloadService } from "@orb/server/domain/workloads";
import { emitWorkloadEvent } from "@orb/server/domain/workloads";
import type { Context } from "@orb/server/transport/trpc";
import { createSocketRegistry, publishUserEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../../_support.ts";

const OWNER = castId<UserId>("user_workload_owner");
const STRANGER = castId<UserId>("user_workload_stranger");

/** A FRESH run id (and socket) per test. The progress bus — emitter AND 60s ring — is process-local and
 *  keyed by workloadId, so a shared id would let one test's ring replay into the next test's pump. */
let seq = 0;
function nextRun(): WorkloadId {
  seq += 1;
  return castId<WorkloadId>(`workload_room_${String(seq)}`);
}
function nextSocket(): SocketId {
  seq += 1;
  return castId<SocketId>(`socket_workload_${String(seq)}`);
}

/** Event time is the INJECTED clock (`at`) — the replay ring's TTL is measured in it, never an ambient one. */
let eventClock = 1_000_000;
function nextAt(): number {
  eventClock += 1;
  return eventClock;
}

function progressEvent(workloadId: WorkloadId, pct: number, at: number): WorkloadEvent {
  return { type: "progress", workloadId, kind: "index", at, progress: { pct, message: `at ${String(pct)}%` } };
}

/** The owner-scoped read the room gates on. The real verb returns the row or throws the leak-free NOT_FOUND;
 *  the room only cares WHICH of those happens — it never reads a field of the row, so a full row would
 *  assert nothing and would have to be maintained against a shape this test never exercises.
 *  FABRICATION-OK: an id-only `WorkloadRowAnyKind` double; the gate's whole surface is throw-or-not. */
const visible: WorkloadService["get"] = ({ id }) => Promise.resolve({ id } as unknown as WorkloadRowAnyKind);

function ctxWith(get: WorkloadService["get"], userId: UserId = OWNER): Context {
  return makeContext({ auth: principal("user", { userId }), services: { workloads: { get } } });
}

/** The tracked envelope's parts (`[ordinal, frame, symbol]` on the server side of `createCaller`). */
function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}

/** Attach the room, connect, and drain the `attached` ack — leaving an iterator parked exactly where the
 *  deleted `workloads.subscribe` subscription's iterator started. */
async function openWorkloadRoom(ctx: Context, workloadId: WorkloadId, opts: { readonly sinceSeq?: number } = {}): Promise<AsyncIterator<unknown>> {
  const socketId = nextSocket();
  const call = caller(ctx);
  await call.stream.attach({ socketId, ref: { channel: "workloads", workloadId }, ...(opts.sinceSeq === undefined ? {} : { sinceSeq: opts.sinceSeq }) });
  const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
  const iterator = socket[Symbol.asyncIterator]();
  const ack = await iterator.next();
  expect(frameOf(ack.value)).toEqual({ channel: "control", type: "attached", ref: { channel: "workloads", workloadId } });
  return iterator;
}

/** Park the pump in its live loop, emit, and take the next frame. The park matters: the ring replay runs
 *  BEFORE the emitter tail attaches (the pre-fold ordering, preserved), so emitting too early is a race the
 *  real tail has too. */
async function nextFrameAfter(iterator: AsyncIterator<unknown>, emit: () => void): Promise<StreamFrame> {
  const pending = iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 0));
  emit();
  return frameOf((await pending).value);
}

describe("the room refuses at attach — a run you do not own does not exist for you", () => {
  test("a STRANGER's attach is a leak-free NOT_FOUND, and no room is recorded on the socket", async () => {
    const run = nextRun();
    const socketId = nextSocket();
    const sockets = createSocketRegistry(() => 0);
    // The verb's IDOR collapse: a foreign row and an absent one throw the SAME DomainNotFoundError.
    const get = vi.fn<WorkloadService["get"]>(() => Promise.reject(new DomainNotFoundError("workload", run)));
    const call = caller(makeContext({ auth: principal("user", { userId: STRANGER }), services: { workloads: { get } }, sockets }));

    await expect(call.stream.attach({ socketId, ref: { channel: "workloads", workloadId: run } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(get).toHaveBeenCalledWith({ id: run, caller: expect.objectContaining({ userId: STRANGER }) });

    // The refusal is REAL, not an error thrown beside a recorded room: the cell holds nothing, so a later
    // connect (or a reconnect inside the reap window) can never re-hydrate a pump for it.
    expect(sockets.adopt(STRANGER, socketId).rooms.size).toBe(0);
  });

  test("the caller Principal is threaded to the verb VERBATIM — the gate is the verb's, not the transport's", async () => {
    const run = nextRun();
    const get = vi.fn<WorkloadService["get"]>(visible);

    await caller(ctxWith(get)).stream.attach({ socketId: nextSocket(), ref: { channel: "workloads", workloadId: run } });

    // Transport never re-derives ownership (it holds no ownerId at all): it hands over the Principal resolved
    // once at the edge and the verb decides. A room that dropped `caller` would be a cross-tenant hole.
    expect(get).toHaveBeenCalledWith({ id: run, caller: expect.objectContaining({ userId: OWNER }) });
  });
});

describe("the per-workload filter is the room's scope on the wire", () => {
  test("ANOTHER run's events never reach this room — one emitter carries every owner's runs", async () => {
    const run = nextRun();
    const foreign = nextRun();
    const iterator = await openWorkloadRoom(ctxWith(visible), run);
    const at = nextAt();
    const frame = await nextFrameAfter(iterator, () => {
      // A different owner's run, publishing on the SAME process-local emitter at the same instant. Without
      // the pump's filter this is a stranger's progress arriving on a socket that attached its own run.
      emitWorkloadEvent(progressEvent(foreign, 99, at));
      emitWorkloadEvent(progressEvent(run, 10, at + 1));
    });
    await iterator.return?.(undefined);

    // The FIRST frame after the ack is this room's own — the foreign run's was elided inside the pump.
    expect(frame).toEqual({ channel: "workloads", workloadId: run, event: progressEvent(run, 10, at + 1) });
  });

  test("a live event rides VERBATIM under `event` and carries NO seq (live-only: no cursor to advance)", async () => {
    const run = nextRun();
    const iterator = await openWorkloadRoom(ctxWith(visible), run);
    const event = progressEvent(run, 40, nextAt());
    const frame = await nextFrameAfter(iterator, () => emitWorkloadEvent(event));
    await iterator.return?.(undefined);

    expect(frame).toEqual({ channel: "workloads", workloadId: run, event });
    expect(frame).not.toHaveProperty("seq");
  });
});

describe("the 60s ring is the smoother, not a cursor", () => {
  test("events emitted BEFORE the attach replay at pump start — the start()→attach gap loses nothing", async () => {
    const run = nextRun();
    const at = nextAt();
    // What the engine emitted while the client was still deciding to watch this row: the run began, and
    // reported once. Two DIFFERENT types on purpose — a burst of same-type snapshots would legitimately
    // collapse to the newest before the consumer ever drains (the channel's `collapse` overflow policy,
    // `frame-queue.ts`), which is correct for a snapshot and would make this a test of the queue instead.
    const started: WorkloadEvent = { type: "started", workloadId: run, kind: "index", at };
    const reported = progressEvent(run, 15, at + 1);
    emitWorkloadEvent(started);
    emitWorkloadEvent(reported);

    const iterator = await openWorkloadRoom(ctxWith(visible), run);
    const first = frameOf((await iterator.next()).value);
    const second = frameOf((await iterator.next()).value);
    await iterator.return?.(undefined);

    expect(first).toEqual({ channel: "workloads", workloadId: run, event: started });
    expect(second).toEqual({ channel: "workloads", workloadId: run, event: reported });
  });

  test("the ring is PER RUN — a sibling run's buffered events are not replayed into this room", async () => {
    const run = nextRun();
    const foreign = nextRun();
    const at = nextAt();
    emitWorkloadEvent(progressEvent(foreign, 88, at));
    emitWorkloadEvent(progressEvent(run, 20, at + 1));

    const iterator = await openWorkloadRoom(ctxWith(visible), run);
    const first = frameOf((await iterator.next()).value);
    await iterator.return?.(undefined);

    expect(first).toEqual({ channel: "workloads", workloadId: run, event: progressEvent(run, 20, at + 1) });
  });

  test("a `sinceSeq: 0` attach replays the RING and nothing more — there is no durable log to rewind", async () => {
    const run = nextRun();
    const at = nextAt();
    emitWorkloadEvent(progressEvent(run, 30, at));

    // `sinceSeq: 0` is the strongest replay request a client can make; a durable room re-sends its whole log
    // for it. This room has no log — the durable `progress` COLUMN is a snapshot the client reads off
    // `workloads.list`, so the cursor is accepted and ignored.
    const iterator = await openWorkloadRoom(ctxWith(visible), run, { sinceSeq: 0 });
    const first = frameOf((await iterator.next()).value);
    await iterator.return?.(undefined);

    expect(first).toEqual({ channel: "workloads", workloadId: run, event: progressEvent(run, 30, at) });
    expect(first).not.toHaveProperty("seq");
  });
});

describe("the gate runs at attach ONLY — deliberately, not by omission", () => {
  test("the pump does not re-read the row, and the room multiplexes beside another on one socket", async () => {
    const run = nextRun();
    const socketId = nextSocket();
    const get = vi.fn<WorkloadService["get"]>(visible);
    const call = caller(ctxWith(get));
    await call.stream.attach({ socketId, ref: { channel: "workloads", workloadId: run } });
    await call.stream.attach({ socketId, ref: { channel: "user" } });

    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const iterator = socket[Symbol.asyncIterator]();
    const frames: StreamFrame[] = [];
    const first = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const event = progressEvent(run, 60, nextAt());
    emitWorkloadEvent(event);
    publishUserEvent(OWNER, { type: "tagsChanged" });
    frames.push(frameOf((await first).value));
    for (let i = 1; i < 4; i++) {
      // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
      const result = await iterator.next();
      frames.push(frameOf(result.value));
    }
    await iterator.return?.(undefined);

    // TWO rooms, ONE connection — the whole point of the last fold.
    expect(frames).toContainEqual({ channel: "workloads", workloadId: run, event });
    expect(frames).toContainEqual({ channel: "user", event: { type: "tagsChanged" } });
    // ONE gate call, at the attach (see the header for why the pump deliberately does not re-run it).
    expect(get).toHaveBeenCalledTimes(1);
  });
});
