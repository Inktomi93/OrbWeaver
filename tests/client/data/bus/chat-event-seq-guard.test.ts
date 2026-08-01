// The monotonic per-chat seq guard (`createChatEventSeqGuard`) — the exactly-once gate the chat SSE adapter
// runs every tracked envelope through. This pins the DRAFT-PROMOTION P1 mechanism at the unit level: a
// from-zero re-replay (on a StrictMode remount / re-attach) must NOT re-admit the turn's already-seen
// durable events, so a re-replayed `turnStarted` can never re-open an already-terminal turn slot (the
// stuck-"Stop generating" bug). A genuinely NEW turn always carries a higher `seq` and is still admitted.
//
// It ALSO pins the exemption that keeps reopen catch-up working: `chatOpened`/`historyTruncated` are
// attach-SYNTHESIZED (non-durable-log) signals stamped with a NON-advancing numeric cursor id, and their
// per-attach re-fire is the sole reopen invalidate (staleTime is Infinity). They must be admitted BY TYPE
// even when their id does not advance the mark — dropping them regresses to a stale-transcript-on-reopen.

import { createChatEventSeqGuard } from "@orb/client/data/bus";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

const CHAT_A = castId<ChatId>("chat_seqguard_aaaaaaaa");
const CHAT_B = castId<ChatId>("chat_seqguard_bbbbbbbb");

/** A durable-log event (deduped by seq). `delta` is a plain stream-transient — any non-synthesized type works. */
function durable(chatId: ChatId): Pick<ChatBusEvent, "type" | "chatId"> {
  return { type: "delta", chatId };
}
/** An attach-synthesized event (exempt from the seq mark by TYPE). */
function opened(chatId: ChatId): Pick<ChatBusEvent, "type" | "chatId"> {
  return { type: "chatOpened", chatId };
}
function truncated(chatId: ChatId): Pick<ChatBusEvent, "type" | "chatId"> {
  return { type: "historyTruncated", chatId };
}

describe("createChatEventSeqGuard", () => {
  test("admits a strictly increasing durable-seq stream once each (a normal turn: started → deltas → completed)", () => {
    const guard = createChatEventSeqGuard();
    for (const seq of ["0", "1", "2", "3", "4"]) {
      expect(guard.admit(durable(CHAT_A), seq)).toBe(true);
    }
  });

  test("DROPS a from-zero re-replay of already-seen DURABLE events (the re-attach that would re-open a completed slot)", () => {
    const guard = createChatEventSeqGuard();
    // First delivery: turnStarted(1) → delta(2) → turnCompleted(3) all admitted.
    expect(guard.admit(durable(CHAT_A), "1")).toBe(true);
    expect(guard.admit(durable(CHAT_A), "2")).toBe(true);
    expect(guard.admit(durable(CHAT_A), "3")).toBe(true);

    // A subscription re-attach replays the durable log FROM ZERO — the whole turn (1..3) is stale now and
    // must be dropped, so the reducer never re-runs beginTurn on a re-replayed turnStarted.
    expect(guard.admit(durable(CHAT_A), "1")).toBe(false); // the re-replayed turnStarted — the stranding trigger
    expect(guard.admit(durable(CHAT_A), "2")).toBe(false);
    expect(guard.admit(durable(CHAT_A), "3")).toBe(false);
  });

  test("ALWAYS admits chatOpened/historyTruncated at a non-advancing numeric id (reopen catch-up — the anti-regression pin)", () => {
    const guard = createChatEventSeqGuard();
    // A prior session drove this chat's durable mark up to 7.
    for (const seq of ["1", "2", "3", "4", "5", "6", "7"]) {
      guard.admit(durable(CHAT_A), seq);
    }
    // On REOPEN the transport re-yields the attach synthetics stamped with the resume cursor id "0" (numeric,
    // non-advancing). If the guard ran them through the mark they'd be DROPPED — the exact regression: the
    // reopen `getChat` refetch invalidate would be swallowed and the surface would show a stale transcript.
    // They must be admitted BY TYPE regardless of id.
    expect(guard.admit(opened(CHAT_A), "0")).toBe(true);
    expect(guard.admit(truncated(CHAT_A), "0")).toBe(true);
    // …and admitting a synthetic must NOT disturb the durable mark: a stale durable replay is still dropped.
    expect(guard.admit(durable(CHAT_A), "7")).toBe(false);
    // …while a genuinely new durable event still advances and passes.
    expect(guard.admit(durable(CHAT_A), "8")).toBe(true);
  });

  test("still admits a GENUINELY NEW turn after a re-replay (a real regenerate's higher seq re-opens)", () => {
    const guard = createChatEventSeqGuard();
    for (const seq of ["1", "2", "3"]) {
      guard.admit(durable(CHAT_A), seq);
    }
    // Stale re-replay dropped…
    expect(guard.admit(durable(CHAT_A), "3")).toBe(false);
    // …but the next real turn appends at a higher seq and must pass (turnStarted → completed).
    expect(guard.admit(durable(CHAT_A), "4")).toBe(true);
    expect(guard.admit(durable(CHAT_A), "5")).toBe(true);
  });

  test("per-chat isolation — one chat's high-water never suppresses another chat's events", () => {
    const guard = createChatEventSeqGuard();
    expect(guard.admit(durable(CHAT_A), "10")).toBe(true);
    // CHAT_B starts fresh: its low seqs are admitted despite CHAT_A's mark being higher.
    expect(guard.admit(durable(CHAT_B), "1")).toBe(true);
    expect(guard.admit(durable(CHAT_B), "2")).toBe(true);
    // CHAT_A still guards its own stream.
    expect(guard.admit(durable(CHAT_A), "10")).toBe(false);
  });

  test("highWater reports what this client APPLIED — the resume point a reconnect re-attaches at", () => {
    // The client's own mark, not the server's delivered cursor: a frame the server yielded into a dying
    // socket counts for the server and never for us, so the re-attach has to carry THIS number or the
    // durable replay resumes past rows we never saw (the SSE-1 F1 class).
    const guard = createChatEventSeqGuard();
    expect(guard.highWater(CHAT_A)).toBeNull(); // nothing applied yet ⇒ no request to make

    guard.admit(durable(CHAT_A), "4");
    guard.admit(durable(CHAT_A), "9");
    expect(guard.highWater(CHAT_A)).toBe(9);

    // A DROPPED stale re-delivery must not move it (it is "what we applied", not "what we were offered")…
    expect(guard.admit(durable(CHAT_A), "5")).toBe(false);
    expect(guard.highWater(CHAT_A)).toBe(9);
    // …and neither does an attach synthetic, which is admitted by TYPE at a non-advancing cursor.
    guard.admit(opened(CHAT_A), "0");
    expect(guard.highWater(CHAT_A)).toBe(9);
    // Per chat, like the mark itself.
    expect(guard.highWater(CHAT_B)).toBeNull();
  });

  test("a non-numeric id on a durable event is always admitted (a malformed frame is never silently swallowed)", () => {
    const guard = createChatEventSeqGuard();
    expect(guard.admit(durable(CHAT_A), "5")).toBe(true);
    expect(guard.admit(durable(CHAT_A), "not-a-seq")).toBe(true);
    expect(guard.admit(durable(CHAT_A), "NaN")).toBe(true);
    // The numeric mark is untouched by the malformed frames.
    expect(guard.admit(durable(CHAT_A), "5")).toBe(false);
  });
});
