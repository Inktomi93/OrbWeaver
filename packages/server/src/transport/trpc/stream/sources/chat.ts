// Room source: `chat` — the per-chat room-public event stream (SSE-1 §4.2), MOVED from
// `routers/chat.ts::streamMessages` (`chatEventStream` + `resolveLiveYield` + `attachSynthesesAndReplay` +
// `memberBounds`, bodies intact). Every authorization verdict, its ORDERING, and the per-yield scrub state's
// SCOPE are unchanged; only the transport underneath moved and the wire cursor moved from the tracked
// envelope's id onto the frame's own `seq` (§3.3 — the socket's tracked id is an ordinal, so a durable
// cursor has to travel INSIDE the frame).
//
// Attach the live listener FIRST (the transport `chat-events-bus` buffers from that instant), replay the
// durable `chat_events` log from the room's cursor (the member-gated `chat.replayChatEvents`), then drain
// live — every frame carries the durable `seq`, which IS the resume cursor the socket cell stores, so a
// reconnect never re-plays a delivered event.
//
// THE DRAFT-TOLERANT MEMBERSHIP GATE WITHHOLDS-NOT-THROWS. `authorizeAttach` accepts ALWAYS (a client may
// attach before `chat.start` commits); a NOT_FOUND from the member-gated probe (`chatEventBounds`) means "no
// such chat yet / not (any longer) a member" — the pump yields nothing and stays attached, and the gate runs
// on EVERY live yield so a kicked member's room stops within the kick tx (the membership chokepoint covers
// the SSE path). Any non-NotFound error propagates and becomes THIS room's `roomFailed` control frame — the
// socket and every other room survive it (the property the per-proc subscription did not have).
//
// THE D16 JOIN-HISTORY CLAMP APPLIES TO BOTH HALVES. The durable replay is clamped inside the domain
// (`chat.replayChatEvents` → `substrate/auth::isBelowHistoryFloor`); the LIVE half is clamped HERE, because
// the per-chat fan-out is transport state keyed by chatId ONLY — every subscriber of a room sees every event
// published to it. One emit is BOTH logged and fanned out under ONE `seq`, so the two halves must return the
// SAME verdict for the same row: otherwise a post-join emit carrying a PRE-join `MessageView` (a host editing
// / re-voicing an old slot) leaks live to a clamped member while the identical durable row is withheld on
// their reconnect. The transport does not own the policy — it applies the domain's ONE verdict to the floor
// `chatEventBounds` handed back for THIS subscriber (their own participant row, never client input). A
// withheld row does NOT advance the resume cursor (the socket advances it from a DELIVERED frame's `seq`
// only): it leaves a `seq` gap, so a reconnect neither stalls nor re-offers it, and the replay re-derives the
// verdict from CURRENT membership. An unclamped caller (`full` / the host / any born-here seat) has floor 0
// and the verdict short-circuits — zero per-yield cost. `delta` is clamped PER-ROW like everything else (on
// the `slotSeq` its emit site stamps), NOT blanket-withheld: a clamped member streams a post-join turn's
// tokens live and is denied a pre-join slot's.
//
// PUMP-SCOPED SCRUB STATE (§5.5 — the leak-prone path). `deltaScrubbers` is allocated INSIDE `run`, so it
// belongs to exactly one (socket, room, principal): two chats on ONE socket have two independent maps, and
// one room's `reasoningHostOnly` verdict can never be applied to the other's bytes. Under
// one-subscription-per-chat that isolation was structural; here it is this allocation site, which is why it
// has a dedicated two-room test. Do NOT hoist it to the socket, the cell, or the module.
//
// SUBSCRIPTION-SIDE SYNTHESES (PD-134/PD-135). Two `ChatBusEvent` members are synthesized HERE, per
// subscription, not published on the bus (no other subscriber sees them) and never logged to `chat_events`:
//   • `chatOpened` — yielded once at attach after the membership probe admits the subscriber (the ST
//     CHAT_CHANGED "on open, run setup" hook; the client reducer invalidates). PD-134.
//   • `historyTruncated` — yielded on resume when the cursor predates the retained window (events after it
//     were dropped, a gap replay can't fill), BEFORE the replay so the client refetches first. PD-135.
// THE SYNTHETIC-ENVELOPE RULE, carried onto the frame: a synthetic's `seq` is the CURRENT resume cursor
// (`cursor ?? 0`), never a fresh/durable one, so it cannot advance the room's cursor past a row that was
// never delivered — a reconnect replays from the exact same durable point. (`cursor ?? 0` on a cursor-less
// attach reproduces the per-proc wire exactly: the synthetic's tracked id was `String(resumeSeq ?? 0)`, which
// tRPC's client stored as `Last-Event-ID`, so a reconnect replayed from 0 there too — the from-zero re-replay
// the client's `chat-event-seq-guard` exists to dedup.) The truncation predicate reads the retained window's
// floor off the SAME member-gated `chatEventBounds` probe the membership gate already runs (`minSeq` =
// earliest retained row) — no extra persistence read: an EMPTY replay is NOT the signal (a caught-up cursor
// also replays empty); truncation is `resumeSeq < minSeq - 1`.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { StreamDataFrame } from "@orb/contracts/stream";
import type { HiddenSpanStreamScrubber } from "@orb/kit/content";
import { createHiddenSpanStreamScrubber } from "@orb/kit/content";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import type { ChatService } from "#domain/chat";
import { isBelowHistoryFloor, scrubDeltaEventForMember, stripChatEventForMember } from "#domain/chat";
import { notifyChatOpened } from "../../automation-chat-open-tap";
import { subscribeChatEvents } from "../../chat-events-bus";
import type { RoomSourceDef } from "../room-source";

/** What the member-gated `chatEventBounds` attach probe returns (derived off the service type — no new
 *  front-door export; the shape is `{ minSeq, maxSeq, historyFloorSeq, viewerIsHost, reasoningHostOnly }`). */
type ChatEventAttach = Awaited<ReturnType<ChatService["chatEventBounds"]>>;

export const chatRoomSource: RoomSourceDef<"chat"> = {
  // ACCEPT ALWAYS — draft-tolerant (a client may attach before `chat.start` commits, and refusing here would
  // be an existence oracle). The whole verdict is per-yield, below.
  authorizeAttach: () => Promise.resolve(),

  async *run({ ref, principal, services, cursor, signal }): AsyncGenerator<StreamDataFrame> {
    const chatId = ref.chatId;
    const service = services.chat;
    // Attach the live listener FIRST (`on()` buffers from this point) so the replay→live gap loses nothing.
    const live = subscribeChatEvents(chatId, signal);
    // The §3.6 MID-STREAM scrubbers — ONE per streaming slot, for a NON-HOST subscriber only. A `text`-channel
    // delta is fed through its slot's scrubber so hidden bytes never reach a member mid-stream (they'd vanish
    // at commit — a devtools-only leak). Keyed by `slotSeq`; a slot's scrubber is retired when its turn commits
    // (`messageCommitted`) so the map can't grow without bound. A host subscriber never allocates one. PUMP-
    // SCOPED (§5.5): this map belongs to this (socket, room, principal) and to nothing else.
    const deltaScrubbers = new Map<number, HiddenSpanStreamScrubber>();

    // The attach probe: membership + the retained-window bounds in ONE member-gated read. `null` = the
    // withhold-not-throw NOT_FOUND (no chat yet / not a member) — synthesize nothing, replay nothing.
    const bounds = await memberBounds(service, principal, chatId);
    let maxSeq = cursor ?? 0;
    if (bounds !== null) {
      for await (const frame of attachSynthesesAndReplay({ service, principal, chatId, resumeSeq: cursor, bounds })) {
        yield frame;
        // Track the highest durable seq for the live-loop dedup; synthetics carry the cursor, so they never
        // raise it (only real replay rows do).
        maxSeq = Math.max(maxSeq, frame.seq);
      }
    }

    for await (const entry of live) {
      // Dedup the replay/live overlap (and any out-of-order delivery) by the monotonic `seq`.
      if (entry.seq <= maxSeq) {
        continue;
      }
      // The per-yield membership gate → D16 clamp → §3.6 member projection, resolved as ONE verdict. `null` =
      // withhold WITHOUT advancing the cursor (kicked / pre-start / clamped-below-floor / held-delta): a `seq`
      // gap is correct — a reconnect resumes from the last delivered frame and the durable replay re-applies
      // the identical verdict to the gap, so the room never stalls and never re-offers a withheld row.
      const projected = await resolveLiveYield({ service, principal, chatId, event: entry.event, deltaScrubbers });
      if (projected === null) {
        continue;
      }
      yield { channel: "chat", chatId, seq: entry.seq, event: projected };
      maxSeq = entry.seq;
    }
  },
};

/** One live event → the bytes THIS subscriber may see, or `null` to withhold. Runs the per-yield membership
 *  gate (a kicked member stops within the kick tx), the D16 join-history clamp, and the §3.6 member projection
 *  (host: verbatim; member: at-commit `view` strip + the mid-stream `delta` scrubber) — the durable replay's
 *  identical verdict, applied live. The transport OWNS no policy; it applies the domain's ONE verdict. */
async function resolveLiveYield(args: {
  readonly service: ChatService;
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly event: ChatBusEvent;
  readonly deltaScrubbers: Map<number, HiddenSpanStreamScrubber>;
}): Promise<ChatBusEvent | null> {
  const { service, principal, chatId, event, deltaScrubbers } = args;
  const gate = await memberBounds(service, principal, chatId);
  if (gate === null || isBelowHistoryFloor(event, gate.historyFloorSeq)) {
    return null;
  }
  if (gate.viewerIsHost) {
    return event;
  }
  // Member: a mid-stream `delta` rides its slot's stateful scrubber; any other event at-commit-strips its
  // `view` and retires the finished slot's scrubber (the streaming phase is over — the held tail is dropped,
  // the authoritative final content is the stripped `view`). P3 (§3.6): `gate.reasoningHostOnly` (the
  // deception-active verdict resolved at the same per-yield probe, for THIS room) withholds the reasoning
  // channel for a member — reasoning deltas + `reasoningStreamDone` drop to `null`, `view.reasoning` is nulled.
  if (event.type === "delta") {
    return scrubDeltaEventForMember(event, scrubberFor(deltaScrubbers, event.slotSeq), gate.reasoningHostOnly);
  }
  retireScrubberOnCommit(deltaScrubbers, event);
  return stripChatEventForMember(event, gate.reasoningHostOnly);
}

/** Get-or-create the per-slot mid-stream scrubber (a member's text-delta stream is stateful per turn). */
function scrubberFor(scrubbers: Map<number, HiddenSpanStreamScrubber>, slotSeq: number): HiddenSpanStreamScrubber {
  const existing = scrubbers.get(slotSeq);
  if (existing !== undefined) {
    return existing;
  }
  const created = createHiddenSpanStreamScrubber();
  scrubbers.set(slotSeq, created);
  return created;
}

/** Retire a slot's scrubber once its turn commits/edits (the streaming phase is over) — bounds the map to
 *  at-most the concurrently-streaming slots. The retired held tail is dropped: the member's authoritative
 *  final content is the at-commit-stripped `view` on this same event, not the ephemeral delta stream. */
function retireScrubberOnCommit(scrubbers: Map<number, HiddenSpanStreamScrubber>, event: ChatBusEvent): void {
  if ("view" in event) {
    scrubbers.delete(event.view.seq);
  }
}

/** The attach-time syntheses + reconnect replay (member already admitted). `chatOpened` fires once at
 *  attach; `historyTruncated` fires (before the replay) only when the resume cursor predates the retained
 *  window; the durable replay drains the rows after the cursor. Synthetics carry the CURRENT cursor as their
 *  frame `seq` so they never advance it past an undelivered row (the file-header synthetic rule). */
async function* attachSynthesesAndReplay(args: {
  readonly service: ChatService;
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly resumeSeq: number | null;
  readonly bounds: ChatEventAttach;
}): AsyncGenerator<Extract<StreamDataFrame, { readonly channel: "chat" }>> {
  const { service, principal, chatId, resumeSeq, bounds } = args;
  const cursorSeq = resumeSeq ?? 0;
  // `chatOpened` (PD-134) — the per-subscription attach synthesis (the client reducer invalidates). The
  // per-viewer automation tap (D81) fires off the SAME synthesis — it never rides the durable bus.
  yield { channel: "chat", chatId, seq: cursorSeq, event: { type: "chatOpened", chatId } };
  notifyChatOpened(chatId, principal.userId);

  // A cursor-less attach (live-only) drains live only — no replay, no truncation check.
  if (resumeSeq === null) {
    return;
  }
  // `historyTruncated` (PD-135) — the cursor predates the retained window (`minSeq` = earliest retained
  // row): events after it were dropped. Empty log (minSeq null) ⇒ no window ⇒ no gap; a caught-up cursor
  // replays empty but is NOT truncated. Yielded BEFORE the replay (same non-advancing seq) so the client
  // refetches first.
  if (bounds.minSeq !== null && resumeSeq < bounds.minSeq - 1) {
    yield { channel: "chat", chatId, seq: cursorSeq, event: { type: "historyTruncated", chatId } };
  }
  for (const entry of await service.replayChatEvents({ principal, chatId, afterSeq: resumeSeq })) {
    yield { channel: "chat", chatId, seq: entry.seq, event: entry.event };
  }
}

// The withhold-not-throw membership probe, carrying the retained-window bounds + the caller's D16 floor:
// NOT_FOUND (no chat / not a member — the leak-free collapse) → `null`; anything else is a real fault and
// propagates (→ this room's `roomFailed`). The returned `{minSeq, maxSeq}` backs the `historyTruncated`
// predicate (no second read for the truncation check); `historyFloorSeq` backs the per-yield join-history
// clamp; `viewerIsHost`/`reasoningHostOnly` back the §3.6 member projection.
async function memberBounds(service: ChatService, principal: Principal, chatId: ChatId): Promise<ChatEventAttach | null> {
  try {
    return await service.chatEventBounds({ principal, chatId });
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return null;
    }
    throw err;
  }
}
