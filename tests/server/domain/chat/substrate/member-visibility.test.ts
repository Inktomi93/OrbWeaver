// The §3.6 SERVER MEMBER-STRIP's pure half — hidden-class spans are removed from a non-host viewer's
// MessageView / bus-event payload BEFORE it leaves the server. Payload-level pins: the instrument is
// `stripHiddenSpans` (kit), the CONSEQUENCE asserted is "zero truth bytes in the serialized payload".

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatBusReplayEvent, ChatStreamReplayEvent } from "../../../../../packages/server/src/domain/chat/contract/views.ts";
import {
  createMemberDeltaStamper,
  projectViewForMember,
  scrubChatEventReplayForMember,
  scrubDeltaEventForMember,
  scrubStreamReplayForMember,
  stripChatEventForMember,
  stripHiddenForMember,
  stripMessagesForViewer,
  stripReasoningFromView,
} from "../../../../../packages/server/src/domain/chat/substrate/member-visibility.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const LIE = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';
const chatId = castId<ChatId>("chat_1");
const messageId = castId<MessageId>("msg_1");

function viewOf(content: string, reasoning: string | null = null): MessageView {
  // A deliberate minimal view — the stripper reads ONLY `content` + `reasoning`, so the other ~30 MessageView
  // fields are irrelevant to what these tests assert; a full factory would obscure that the strip is
  // content/reasoning-only, and the `not.toContain` byte checks below are the real assertion.
  // @orb-waive no-test-fabrication(unknown): content/reasoning-only strip probe (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
    // @orb-waive no-test-fabrication(ChatBusEvent): per-type view-carrying event strip probe (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
  // A `delta` is NOT this function's job — it rides `scrubDeltaEventForMember` (below), so
  // `stripChatEventForMember` passes it through (the transport routes deltas to that seam, never here).
  const delta: ChatBusEvent = { type: "delta", chatId, slotSeq: 3, delta: { chatId, kind: "text", text: "<lie " } };
  expect(stripChatEventForMember(delta)).toBe(delta);
});

// ── §3.6 the MID-STREAM channel (deltas) — the leak the at-commit strip can't reach ──
//
// The scrub state is the PRODUCER's: `createMemberDeltaStamper` runs once per emit, inside the bus, and every
// reader is a stateless `memberText` read. So these tests emit through a stamper exactly like `domain/chat/bus`
// does — a fixture that hand-rolls an unstamped delta is testing the fail-closed arm, not the strip.

function rawTextDelta(text: string, slotSeq = 1): Extract<ChatBusEvent, { type: "delta" }> {
  return { type: "delta", chatId, slotSeq, delta: { chatId, kind: "text", text } };
}

/** Emit `text` through `stamper` as the bus would, and return the delta event AS LOGGED. */
function stamped(stamper: ReturnType<typeof createMemberDeltaStamper>, text: string, slotSeq = 1): Extract<ChatBusEvent, { type: "delta" }> {
  const event = stamper.stamp(rawTextDelta(text, slotSeq));
  if (event.type !== "delta") {
    throw new Error("the stamper must return the same union member it was given");
  }
  return event;
}

test("scrubDeltaEventForMember: a member's mid-stream text NEVER carries hidden bytes at any tick; the assembled stream matches the at-commit strip", () => {
  const stamper = createMemberDeltaStamper();
  const body = `He nods. ${LIE} "Nothing," he says.`;
  let assembled = "";
  let sawLeak = false;
  for (const ch of body) {
    const out = scrubDeltaEventForMember(stamped(stamper, ch));
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

test("scrubDeltaEventForMember: an UNSTAMPED text delta is WITHHELD, never forwarded raw (the fail-closed arm)", () => {
  // A producer that bypasses `domain/chat/bus` leaves `memberText` undefined. The member must get nothing —
  // the failure mode of a missing stamp is a frozen ghost, never the model's raw bytes.
  expect(scrubDeltaEventForMember(rawTextDelta(`He nods. ${LIE}`))).toBeNull();
});

test("scrubDeltaEventForMember: a member's forwarded delta carries the member bytes ONCE — `memberText` never rides their wire", () => {
  const stamper = createMemberDeltaStamper();
  const out = scrubDeltaEventForMember(stamped(stamper, `He nods. ${LIE} done.`));
  expect(out).not.toBeNull();
  expect(JSON.stringify(out)).not.toContain("memberText");
  expect(out?.type === "delta" && out.delta.kind === "text" ? out.delta.text : "").toBe("He nods.  done.");
});

test("scrubDeltaEventForMember: a reasoning-channel delta passes through unchanged (out of the body-projection scope)", () => {
  const reasoning: Extract<ChatBusEvent, { type: "delta" }> = {
    type: "delta",
    chatId,
    slotSeq: 1,
    delta: { chatId, kind: "reasoning", text: "thinking <lie" },
  };
  expect(scrubDeltaEventForMember(reasoning)).toBe(reasoning);
});

// ── The MID-SLOT COLD START — the leak that motivated moving the scrub state to the producer ──────────
// A `<lie …/>` open spans many ticks. Any reader that begins mid-tag sees a continuation with no `<` in it
// (`1234"/> …`), calls it all safe, and forwards the secret's tail. These pin that NO reader can be in that
// position: the bytes are decided ONCE at emit, so a member who attaches (or resumes) mid-span reads exactly
// what a member who watched the whole slot read.

test("a subscriber that joins MID-SPAN gets the same bytes as one that watched the whole slot (no cold start)", () => {
  const stamper = createMemberDeltaStamper();
  // The slot streams: prose, then a `<lie …/>` open that stays unclosed for two ticks, then its closer.
  const ticks = ["The vault is ", '<lie character="Vex" truth="the vault ', "code is ", '1234"/> empty.'].map((t) => stamped(stamper, t));

  // The "watched it all" reader.
  const continuous = ticks.map((e) => scrubDeltaEventForMember(e));
  // The "attached at tick 3" reader — a DIFFERENT reader with no history whatsoever.
  const lateJoiner = ticks.slice(2).map((e) => scrubDeltaEventForMember(e));

  const textOf = (out: ChatBusEvent | null): string => (out?.type === "delta" && out.delta.kind === "text" ? out.delta.text : "");
  expect(continuous.map(textOf).join("")).toBe("The vault is  empty.");
  // Identical verdicts row-for-row on the rows they share — no state to be missing.
  expect(lateJoiner.map(textOf)).toEqual(continuous.slice(2).map(textOf));
  expect(JSON.stringify(lateJoiner)).not.toContain("1234");
  expect(JSON.stringify(lateJoiner)).not.toContain("vault code");
});

test("two concurrently streaming slots keep independent span state (the stamper keys on chat + slotSeq)", () => {
  const stamper = createMemberDeltaStamper();
  // Slot 1 opens a lie; slot 2 interleaves clean prose that must NOT be swallowed by slot 1's open span.
  const a1 = scrubDeltaEventForMember(stamped(stamper, '<lie character="Vex" truth="the code is ', 1));
  const b1 = scrubDeltaEventForMember(stamped(stamper, "Meanwhile, ", 2));
  const a2 = scrubDeltaEventForMember(stamped(stamper, '1234"/> nothing.', 1));
  const b2 = scrubDeltaEventForMember(stamped(stamper, "the door opens.", 2));

  expect(a1).toBeNull(); // the open is withheld whole
  const textOf = (out: ChatBusEvent | null): string => (out?.type === "delta" && out.delta.kind === "text" ? out.delta.text : "");
  expect(textOf(a2)).toBe(" nothing.");
  expect(`${textOf(b1)}${textOf(b2)}`).toBe("Meanwhile, the door opens.");
  expect(JSON.stringify([a1, a2, b1, b2])).not.toContain("1234");
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
  // @orb-waive no-test-fabrication(ChatBusEvent): a minimal view-carrying event probe — the strip keys off `type` + `view` only. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const committed = { type: "messageCommitted", chatId, messageId, view } as ChatBusEvent;
  const stripped = stripChatEventForMember(committed, true);
  // The strip nulls the view's reasoning AND removes the body lie; the whole serialized event carries no truth.
  const strippedReasoning = stripped !== null && "view" in stripped && stripped.view !== undefined ? stripped.view.reasoning : "UNEXPECTED";
  expect(strippedReasoning).toBeNull();
  expect(JSON.stringify(stripped)).not.toContain("crypt");
  // reasoningStreamDone is a member-visible "the reasoning finished" signal — WITHHELD on a deception game.
  // @orb-waive no-test-fabrication(ChatBusEvent): the `reasoningStreamDone` event is a closed literal (type + chatId) — no fields elided. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const done = { type: "reasoningStreamDone", chatId } as ChatBusEvent;
  expect(stripChatEventForMember(done, true)).toBeNull();
  // Non-deception: it passes through unchanged.
  expect(stripChatEventForMember(done, false)).toBe(done);
});

test("scrubDeltaEventForMember: a reasoning delta is DROPPED on a deception game; text deltas still scrub; non-deception passes reasoning through", () => {
  const reasoning: Extract<ChatBusEvent, { type: "delta" }> = {
    type: "delta",
    chatId,
    slotSeq: 1,
    delta: { chatId, kind: "reasoning", text: REASONING_SPILL },
  };
  // Deception: reasoning delta withheld entirely (host-only channel).
  expect(scrubDeltaEventForMember(reasoning, true)).toBeNull();
  // Non-deception: reasoning delta passes (the pre-P3 behavior).
  expect(scrubDeltaEventForMember(reasoning, false)).toBe(reasoning);
  // A text delta still carries only its stamped member bytes regardless (the body channel is unconditional).
  const text = scrubDeltaEventForMember(stamped(createMemberDeltaStamper(), "plain"), true);
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

// ── §3.6 the DURABLE CHAT-BUS replay (`replayChatEvents`) — the leak the delta-blind `stripChatEventForMember`
// could not reach: a resume from lastEventId:"0" re-drains the raw mid-turn `delta` rows, so the durable replay
// MUST scrub them per-slot exactly like the live transport (`scrubChatEventReplayForMember`). ──

/** The delta payload of a row whose event is a `delta` (else undefined) — a typed narrowing accessor so the
 *  assertions read `.delta.kind`/`.text` off the `ChatBusEvent` union without per-arm access errors. */
function deltaOf(row: ChatBusReplayEvent): { readonly kind: string; readonly text: string } | undefined {
  return row.event.type === "delta" ? row.event.delta : undefined;
}

/** The committed view of a row whose event carries one (else undefined) — the typed narrowing accessor twin. */
function viewOfRow(row: ChatBusReplayEvent): { readonly content?: string; readonly reasoning?: string | null } | undefined {
  return row.event.type === "messageCommitted" ? row.event.view : undefined;
}

/** The at-commit view + its mid-stream delta rows for ONE deception turn, in append order — a raw `<lie>` +
 *  reasoning delta stream, then the at-commit committed view. This is the exact durable log a member's
 *  reconnect re-drains, so every row goes through the producer stamper the bus applies before the append. */
function deceptionTurnRows(): ChatBusReplayEvent[] {
  const stamper = createMemberDeltaStamper();
  const rows: readonly { readonly seq: number; readonly event: ChatBusEvent }[] = [
    {
      seq: 1,
      event: {
        type: "turnStarted",
        chatId,
        intent: "send",
        api: "chat-completions",
        provider: castId<ProviderId>("custom-openai"),
        model: "m",
        speakerCharacterId: null,
        targetMessageId: null,
      },
    },
    { seq: 2, event: { type: "delta", chatId, slotSeq: 3, delta: { chatId, kind: "reasoning", text: REASONING_SPILL } } },
    { seq: 3, event: { type: "delta", chatId, slotSeq: 3, delta: { chatId, kind: "text", text: `He nods. ${LIE}` } } },
    { seq: 4, event: { type: "delta", chatId, slotSeq: 3, delta: { chatId, kind: "text", text: ' "Nothing."' } } },
    { seq: 5, event: { type: "reasoningStreamDone", chatId } },
    // @orb-waive no-test-fabrication(ChatBusEvent): the at-commit view probe reads content/reasoning only (viewOf above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    { seq: 6, event: { type: "messageCommitted", chatId, messageId, view: viewOf(`He nods. ${LIE} "Nothing."`, REASONING_SPILL) } as ChatBusEvent },
  ];
  return rows.map(({ seq, event }) => ({ seq, event: stamper.stamp(event) }));
}

test("scrubChatEventReplayForMember: a deception game's DURABLE replay withholds the reasoning channel AND scrubs hidden TEXT deltas for a member", () => {
  const memberRows = scrubChatEventReplayForMember(deceptionTurnRows(), { role: "member" }, true);
  const bytes = JSON.stringify(memberRows);
  // The truth leaks NOWHERE — not in a reasoning delta, not in a raw text delta, not in the committed view.
  expect(bytes).not.toContain("crypt");
  expect(bytes).not.toContain("<lie");
  // No reasoning-channel delta survives, and `reasoningStreamDone` is dropped (its member-visible signal).
  expect(memberRows.some((r) => deltaOf(r)?.kind === "reasoning")).toBe(false);
  expect(memberRows.some((r) => r.event.type === "reasoningStreamDone")).toBe(false);
  // The member STILL gets the text-body deltas (scrubbed of the lie) + the committed view (reasoning nulled).
  const memberText = memberRows
    .map((r) => deltaOf(r))
    .filter((d) => d?.kind === "text")
    .map((d) => d?.text ?? "")
    .join("");
  expect(memberText).toBe('He nods.  "Nothing."');
  const commit = memberRows.find((r) => r.event.type === "messageCommitted");
  expect(commit).toBeDefined();
  // The committed view's reasoning is nulled (not merely absent) — the durable at-commit member truth.
  expect(viewOfRow(commit as ChatBusReplayEvent)?.reasoning).toBeNull();
});

test("scrubChatEventReplayForMember: a NON-deception member keeps reasoning but still text-scrubs the lie; the HOST reads verbatim", () => {
  const rows = deceptionTurnRows();
  // Non-deception (reasoningHostOnly=false): the reasoning channel is member-visible (its own prose may mention
  // the same place), but the BODY strip is UNCONDITIONAL — the raw `<lie>` text delta is STILL scrubbed and the
  // committed view's body stripped. So the `<lie>` tag + the lie's `truth=` bytes are gone from every BODY
  // surface, while the reasoning channel survives.
  const member = scrubChatEventReplayForMember(rows, { role: "member" }, false);
  expect(member.some((r) => deltaOf(r)?.kind === "reasoning")).toBe(true);
  expect(JSON.stringify(member)).not.toContain("<lie");
  // The body-carrying surfaces (text deltas + the committed view content) carry no lie truth.
  const bodyBytes = JSON.stringify(
    member.map((r) => viewOfRow(r)?.content ?? (deltaOf(r)?.kind === "text" ? deltaOf(r)?.text : undefined)).filter((s) => s !== undefined),
  );
  expect(bodyBytes).not.toContain("He is in the crypt");
  // The host reads every row verbatim (identity — no per-row churn).
  expect(scrubChatEventReplayForMember(rows, { role: "host" }, true)).toEqual(rows);
});
