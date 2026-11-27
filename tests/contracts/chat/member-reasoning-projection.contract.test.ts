// A member of a deception-active game never learns that the reply's reasoning exists: the projection clears the
// redacted mark with the text, and a game without deception leaves both as the host reads them.
import { hasRedactedReasoning, projectViewForMember } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { makeChatId, makeMessageView } from "@orb/testkit/node/helpers";

const ROW = { chatId: makeChatId(), seq: 1 } as const;
const REDACTED_AND_VISIBLE = makeMessageView({ ...ROW, reasoning: "The keeper weighs the lamp.", reasoningRedacted: true });
const REDACTED_ONLY = makeMessageView({ ...ROW, reasoning: null, reasoningRedacted: true });

test("a deception-active game withholds the reasoning text and the redacted mark from a member", () => {
  for (const view of [REDACTED_AND_VISIBLE, REDACTED_ONLY]) {
    expect(projectViewForMember(view, true)).toMatchObject({ reasoning: null, reasoningRedacted: false });
  }
});

test("a game without deception keeps the reasoning and the redacted mark as read", () => {
  expect(projectViewForMember(REDACTED_AND_VISIBLE, false)).toMatchObject({ reasoning: "The keeper weighs the lamp.", reasoningRedacted: true });
  expect(projectViewForMember(REDACTED_ONLY, false)).toMatchObject({ reasoning: null, reasoningRedacted: true });
});

test("only an anthropic part carrying redacted data marks the reasoning redacted", () => {
  expect(hasRedactedReasoning([{ type: "reasoning", text: "", meta: { anthropic: { redactedData: "PAYLOAD" } } }])).toBe(true);
  expect(hasRedactedReasoning([{ type: "reasoning", text: "thought", meta: { anthropic: { signature: "sig" } } }])).toBe(false);
  expect(hasRedactedReasoning(null)).toBe(false);
});
