// The §3.6 SERVER MEMBER-STRIP's pure half — hidden-class spans are removed from a non-host viewer's
// MessageView / bus-event payload BEFORE it leaves the server. Payload-level pins: the instrument is
// `stripHiddenSpans` (kit), the CONSEQUENCE asserted is "zero truth bytes in the serialized payload".

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import { createHiddenSpanStreamScrubber } from "@orb/kit/content";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatStreamReplayEvent } from "../../../../../packages/server/src/domain/chat/contract/views";
import {
  projectViewForMember,
  scrubDeltaEventForMember,
  scrubStreamReplayForMember,
  stripChatEventForMember,
  stripHiddenForMember,
  stripMessagesForViewer,
  stripReasoningFromView,
} from "../../../../../packages/server/src/domain/chat/substrate/member-visibility";
import { expect, test } from "../../../../support/fixtures";

const LIE = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';
const chatId = castId<ChatId>("chat_1");
const messageId = castId<MessageId>("msg_1");

function viewOf(content: string, reasoning: string | null = null): MessageView {
  // A deliberate minimal view — the stripper reads ONLY `content` + `reasoning`, so the other ~30 MessageView
  // fields are irrelevant to what these tests assert; a full factory would obscure that the strip is
  // content/reasoning-only, and the `not.toContain` byte checks below are the real assertion.
  // FABRICATION-OK: content/reasoning-only strip probe (see above).
  return { id: messageId, chatId, content, reasoning } as unknown as MessageView;
}

test("stripHiddenForMember removes hidden-class spans; the serialized payload carries ZERO truth bytes", () => {
  const stripped = stripHiddenForMember(viewOf(`He nods. ${LIE} "Nothing," he says.`));
  expect(stripped.content).toBe('He nods.  "Nothing," he says.');
  expect(JSON.stringify(stripped)).not.toContain("crypt");
  expect(JSON.stringify(stripped)).not.toContain("<lie");
});

test("identity fast-path: a view with no hidden spans is returned UNCHANGED (same object — no per-row churn)", () => {
  const view = viewOf("plain prose with a :::card\n<p>x</p>\n::: and an ![img](asset:a)");
  expect(stripHiddenForMember(view)).toBe(view);
});

test("non-hidden structured spans are byte-preserved (cards/choices/unknown-directives are not secrets)", () => {
  const body = `open ${LIE} then :::choices\n1. one\n::: and <gmnote note="n"/> end`;
  const stripped = stripHiddenForMember(viewOf(body));
  expect(stripped.content).toBe('open  then :::choices\n1. one\n::: and <gmnote note="n"/> end');
});

test("stripChatEventForMember strips the `view` payload of every view-carrying member; view-less events pass through", () => {
  const view = viewOf(`prose ${LIE}`);
  for (const type of ["messageCommitted", "messageEdited", "messageHidden", "variantSelected", "reasoningEdited", "reasoningCleared"] as const) {
    // A deliberate per-type view-carrying event probe — the strip keys off `type` + `view`, and this loop
    // asserts the SAME strip across every view-carrying union member; the payload beyond these fields is not
    // what's under test (the byte checks below are the assertion).
    // FABRICATION-OK: per-type view-carrying event strip probe (see above).
    const event = { type, chatId, messageId, view } as ChatBusEvent;
    const stripped = stripChatEventForMember(event);
    // A view-carrying event is never withheld by the body strip (only `reasoningStreamDone` on a deception game
    // returns null) — narrow the nullable return so the type assertion below type-checks.
    expect(stripped).not.toBeNull();
    expect(JSON.stringify(stripped)).not.toContain("crypt");
    expect(stripped?.type).toBe(type);
  }
  // A view-less lifecycle event is untouched (same object).
  const lifecycle: ChatBusEvent = { type: "chatUpdated", chatId };
  expect(stripChatEventForMember(lifecycle)).toBe(lifecycle);
  // A `delta` is NOT this function's job — it rides the stateful `scrubDeltaEventForMember` (below), so
  // `stripChatEventForMember` passes it through (the transport routes deltas to the scrubber, never here).
  const delta: ChatBusEvent = { type: "delta", chatId, slotSeq: 3, delta: { chatId, kind: "text", text: "<lie " } };
  expect(stripChatEventForMember(delta)).toBe(delta);
});

// ── §3.6 the MID-STREAM channel (deltas) — the leak the at-commit strip can't reach ──

function textDelta(text: string, slotSeq = 1): Extract<ChatBusEvent, { type: "delta" }> {
  return { type: "delta", chatId, slotSeq, delta: { chatId, kind: "text", text } };
}

test("scrubDeltaEventForMember: a member's mid-stream text NEVER carries hidden bytes at any tick; the assembled stream matches the at-commit strip", () => {
  const scrubber = createHiddenSpanStreamScrubber();
  const body = `He nods. ${LIE} "Nothing," he says.`;
  let assembled = "";
  let sawLeak = false;
  for (const ch of body) {
    const out = scrubDeltaEventForMember(textDelta(ch), scrubber);
    if (out === null || out.type !== "delta" || out.delta.kind !== "text") {
      continue;
    }
    assembled += out.delta.text;
    if (out.delta.text.includes("crypt") || out.delta.text.includes("<lie")) {
      sawLeak = true;
    }
  }
  expect(sawLeak).toBe(false);
  expect(assembled).toBe('He nods.  "Nothing," he says.');
});

test("scrubDeltaEventForMember: a reasoning-channel delta passes through unchanged (out of the body-projection scope)", () => {
  const scrubber = createHiddenSpanStreamScrubber();
  const reasoning: Extract<ChatBusEvent, { type: "delta" }> = {
    type: "delta",
    chatId,
    slotSeq: 1,
    delta: { chatId, kind: "reasoning", text: "thinking <lie" },
  };
  expect(scrubDeltaEventForMember(reasoning, scrubber)).toBe(reasoning);
});

test("scrubStreamReplayForMember: the DURABLE token-log replay drops hidden bytes per slot for a member; the host reads verbatim", () => {
  // Two slots interleaved; slot msg_a streams a lie, slot msg_b is clean.
  const msgA = castId<MessageId>("msg_a");
  const msgB = castId<MessageId>("msg_b");
  const rows: ChatStreamReplayEvent[] = [
    { seq: 1, messageId: msgA, kind: "text", delta: "He said " },
    { seq: 2, messageId: msgB, kind: "text", delta: "meanwhile " },
    { seq: 3, messageId: msgA, kind: "text", delta: LIE },
    { seq: 4, messageId: msgA, kind: "text", delta: " nothing." },
    { seq: 5, messageId: msgA, kind: "reasoning", delta: "raw <lie thought" },
  ];
  const memberRows = scrubStreamReplayForMember(rows, { role: "member" });
  const memberText = memberRows
    .filter((r) => r.messageId === msgA && r.kind === "text")
    .map((r) => r.delta)
    .join("");
  expect(memberText).toBe("He said  nothing.");
  expect(JSON.stringify(memberRows.filter((r) => r.kind === "text"))).not.toContain("crypt");
  // The reasoning row passes through (out of scope), and the host reads every row verbatim.
  expect(memberRows.some((r) => r.kind === "reasoning")).toBe(true);
  expect(scrubStreamReplayForMember(rows, { role: "host" })).toEqual(rows);
});

// ── §3.6 the MUTATION-RETURN channel — a member who ran the turn must not get the reply's truth in the return ──

test("stripMessagesForViewer: a non-host caller's TurnOutcome messages are hidden-stripped; the host reads them verbatim", () => {
  const outcome = { messages: [viewOf(`He nods. ${LIE}`)], aborted: false } as const;
  const member = stripMessagesForViewer(outcome, { role: "member" });
  expect(JSON.stringify(member)).not.toContain("crypt");
  expect(member.messages[0].content).toBe("He nods. ");
  // Host: identity (same object — the reveal-eye plane reads the full body).
  expect(stripMessagesForViewer(outcome, { role: "host" })).toBe(outcome);
  // An empty outcome is the identity fast-path.
  const empty = { messages: [], aborted: true } as const;
  expect(stripMessagesForViewer(empty, { role: "member" })).toBe(empty);
});

// ── P3 §3.6: the REASONING channel goes host-only on a DECEPTION-ACTIVE game (whole-channel, not per-tag) ──

const REASONING_SPILL = "I'll tell them nothing, but the truth is he's in the crypt.";

test("stripReasoningFromView nulls the reasoning channel; identity when it is already null", () => {
  const withReasoning = viewOf("prose", REASONING_SPILL);
  const stripped = stripReasoningFromView(withReasoning);
  expect(stripped.reasoning).toBeNull();
  expect(JSON.stringify(stripped)).not.toContain("crypt");
  // Already-null reasoning → same object (no churn).
  const noReasoning = viewOf("prose", null);
  expect(stripReasoningFromView(noReasoning)).toBe(noReasoning);
});

test("projectViewForMember: reasoningHostOnly=false keeps reasoning (non-deception game — no regression); =true withholds it", () => {
  const view = viewOf(`He nods. ${LIE}`, REASONING_SPILL);
  // Non-deception: body stripped, reasoning KEPT (the pre-P3 behavior).
  const kept = projectViewForMember(view, false);
  expect(kept.content).toBe("He nods. ");
  expect(kept.reasoning).toBe(REASONING_SPILL);
  // Deception-active: body stripped AND reasoning withheld — zero truth bytes in EITHER channel.
  const stripped = projectViewForMember(view, true);
  expect(stripped.content).toBe("He nods. ");
  expect(stripped.reasoning).toBeNull();
  expect(JSON.stringify(stripped)).not.toContain("crypt");
});

test("stripMessagesForViewer: reasoningHostOnly withholds the reasoning channel from a member's TurnOutcome; the host reads verbatim", () => {
  const outcome = { messages: [viewOf(`He nods. ${LIE}`, REASONING_SPILL)], aborted: false } as const;
  const member = stripMessagesForViewer(outcome, { role: "member" }, true);
  expect(member.messages[0].reasoning).toBeNull();
  expect(JSON.stringify(member)).not.toContain("crypt");
  // Host reads verbatim regardless of the flag.
  expect(stripMessagesForViewer(outcome, { role: "host" }, true)).toBe(outcome);
});

test("stripChatEventForMember: on a deception game a view-carrying event withholds reasoning; reasoningStreamDone is DROPPED (null)", () => {
  const view = viewOf(`prose ${LIE}`, REASONING_SPILL);
  // FABRICATION-OK: a minimal view-carrying event probe — the strip keys off `type` + `view` only.
  const committed = { type: "messageCommitted", chatId, messageId, view } as ChatBusEvent;
  const stripped = stripChatEventForMember(committed, true);
  // The strip nulls the view's reasoning AND removes the body lie; the whole serialized event carries no truth.
  const strippedReasoning = stripped !== null && "view" in stripped && stripped.view !== undefined ? stripped.view.reasoning : "UNEXPECTED";
  expect(strippedReasoning).toBeNull();
  expect(JSON.stringify(stripped)).not.toContain("crypt");
  // reasoningStreamDone is a member-visible "the reasoning finished" signal — WITHHELD on a deception game.
  // FABRICATION-OK: the `reasoningStreamDone` event is a closed literal (type + chatId) — no fields elided.
  const done = { type: "reasoningStreamDone", chatId } as ChatBusEvent;
  expect(stripChatEventForMember(done, true)).toBeNull();
  // Non-deception: it passes through unchanged.
  expect(stripChatEventForMember(done, false)).toBe(done);
});

test("scrubDeltaEventForMember: a reasoning delta is DROPPED on a deception game; text deltas still scrub; non-deception passes reasoning through", () => {
  const scrubber = createHiddenSpanStreamScrubber();
  const reasoning: Extract<ChatBusEvent, { type: "delta" }> = {
    type: "delta",
    chatId,
    slotSeq: 1,
    delta: { chatId, kind: "reasoning", text: REASONING_SPILL },
  };
  // Deception: reasoning delta withheld entirely (host-only channel).
  expect(scrubDeltaEventForMember(reasoning, scrubber, true)).toBeNull();
  // Non-deception: reasoning delta passes (the pre-P3 behavior).
  expect(scrubDeltaEventForMember(reasoning, scrubber, false)).toBe(reasoning);
  // A text delta still rides the hidden-span scrubber regardless (the body channel is unconditional).
  const text = scrubDeltaEventForMember(textDelta("plain"), createHiddenSpanStreamScrubber(), true);
  expect(text !== null && text.type === "delta" && text.delta.kind === "text" ? text.delta.text : "").toBe("plain");
});

test("scrubStreamReplayForMember: reasoning replay rows are DROPPED on a deception game; kept otherwise", () => {
  const msgA = castId<MessageId>("msg_a");
  const rows: ChatStreamReplayEvent[] = [
    { seq: 1, messageId: msgA, kind: "text", delta: "He said nothing." },
    { seq: 2, messageId: msgA, kind: "reasoning", delta: REASONING_SPILL },
  ];
  const deception = scrubStreamReplayForMember(rows, { role: "member" }, true);
  expect(deception.some((r) => r.kind === "reasoning")).toBe(false);
  expect(JSON.stringify(deception)).not.toContain("crypt");
  // Non-deception member keeps the reasoning row; the host reads verbatim either way.
  expect(scrubStreamReplayForMember(rows, { role: "member" }, false).some((r) => r.kind === "reasoning")).toBe(true);
  expect(scrubStreamReplayForMember(rows, { role: "host" }, true)).toEqual(rows);
});
