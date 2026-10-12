// The §3.6 member projection's pure half: a non-host viewer's MessageView carries zero hidden-span truth bytes
// and, on a deception-active game, no reasoning. The server-side wrappers are pinned in
// tests/legacy/server/domain/chat/substrate/member-visibility.test.ts.

import type { MessageView } from "@orb/contracts/chat";
import { memberToolCalls, projectViewForMember, stripHiddenForMember, stripReasoningFromView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const LIE = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';
const REASONING_SPILL = "I'll tell them nothing, but the truth is he's in the crypt.";
const chatId = castId<ChatId>("chat_1");
const messageId = castId<MessageId>("msg_1");
const TOOL_BASE = { toolCallId: "native", callOrdinal: 4, name: "draw", arguments: "{}", result: "Moon", isError: false, durationMs: 1 };

function viewOf(content: string, reasoning: string | null = null): MessageView {
  // The projection reads content, reasoning and tool positions only; the byte checks below are the assertion.
  // @orb-waive no-test-fabrication(unknown): content/reasoning-only strip probe (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { id: messageId, chatId, content, reasoning, toolCalls: [] } as unknown as MessageView;
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

test("memberToolCalls rebases both tool boundaries onto the delivered body, including positions inside removed tags", () => {
  const content = `Before.${LIE}After.${LIE}Done.`;
  const records = [
    { ...TOOL_BASE, textOffset: 7 + LIE.length, exchangeTextEnd: 13 + LIE.length * 2 },
    { ...TOOL_BASE, callOrdinal: 5, textOffset: 9, exchangeTextEnd: 16 + LIE.length },
    { ...TOOL_BASE, callOrdinal: 6 },
  ];
  expect(memberToolCalls(records, content)).toEqual([
    { ...TOOL_BASE, textOffset: 7, exchangeTextEnd: 13 },
    { ...TOOL_BASE, callOrdinal: 5, textOffset: 7, exchangeTextEnd: 13 },
    { ...TOOL_BASE, callOrdinal: 6 },
  ]);
  // The body strip carries the rebase: a hidden body moves its tool positions with it.
  const projected = stripHiddenForMember({ ...viewOf(content), toolCalls: records.slice(0, 1) });
  expect(projected.content).toBe("Before.After.Done.");
  expect(projected.toolCalls).toEqual([{ ...TOOL_BASE, textOffset: 7, exchangeTextEnd: 13 }]);
});

test("stripReasoningFromView nulls the reasoning channel; identity when it is already null", () => {
  const withReasoning = viewOf("prose", REASONING_SPILL);
  const stripped = stripReasoningFromView(withReasoning);
  expect(stripped.reasoning).toBeNull();
  expect(JSON.stringify(stripped)).not.toContain("crypt");
  const noReasoning = viewOf("prose", null);
  expect(stripReasoningFromView(noReasoning)).toBe(noReasoning);
});

test("projectViewForMember: reasoningHostOnly=false keeps reasoning (non-deception game); =true withholds it", () => {
  const view = viewOf(`He nods. ${LIE}`, REASONING_SPILL);
  const kept = projectViewForMember(view, false);
  expect(kept.content).toBe("He nods. ");
  expect(kept.reasoning).toBe(REASONING_SPILL);
  // Deception-active: body stripped AND reasoning withheld — zero truth bytes in EITHER channel.
  const stripped = projectViewForMember(view, true);
  expect(stripped.content).toBe("He nods. ");
  expect(stripped.reasoning).toBeNull();
  expect(JSON.stringify(stripped)).not.toContain("crypt");
});
