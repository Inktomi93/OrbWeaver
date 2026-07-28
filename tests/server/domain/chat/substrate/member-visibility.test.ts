// The §3.6 SERVER MEMBER-STRIP's pure half — hidden-class spans are removed from a non-host viewer's
// MessageView / bus-event payload BEFORE it leaves the server. Payload-level pins: the instrument is
// `stripHiddenSpans` (kit), the CONSEQUENCE asserted is "zero truth bytes in the serialized payload".

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import { createHiddenSpanStreamScrubber } from "@orb/kit/content";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatStreamReplayEvent } from "../../../../../packages/server/src/domain/chat/contract/views";
import {
  scrubDeltaEventForMember,
  scrubStreamReplayForMember,
  stripChatEventForMember,
  stripHiddenForMember,
  stripMessagesForViewer,
} from "../../../../../packages/server/src/domain/chat/substrate/member-visibility";
import { expect, test } from "../../../../support/fixtures";

const LIE = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';
const chatId = castId<ChatId>("chat_1");
const messageId = castId<MessageId>("msg_1");

function viewOf(content: string): MessageView {
  // A deliberate minimal view — the stripper reads ONLY `content` (byte-level span removal), so the other
  // ~30 MessageView fields are irrelevant to what these tests assert; a full factory would obscure that the
  // strip is content-only, and the `not.toContain` byte checks below are the real assertion.
  // FABRICATION-OK: content-only strip probe (see above).
  return { id: messageId, chatId, content } as unknown as MessageView;
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
    expect(JSON.stringify(stripped)).not.toContain("crypt");
    expect(stripped.type).toBe(type);
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
