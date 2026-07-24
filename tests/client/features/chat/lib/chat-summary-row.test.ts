// Unit: `deriveChatTitle` + `chatSummaryRowView` (features/chat/lib/chat-summary-row) — the ONE chat
// display-title fallback chain. Pins the side-eye P1-2 fix: stored titles are EMPTY STRINGS until
// renamed (not just null), so the fallback must trim — `?? "Untitled chat"` was defeated by "" and
// rendered blank rows/options everywhere. When the title falls back to participant names, the row
// subtitle switches to the message count so the names never print twice.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { chatSummaryRowView, deriveChatTitle } from "../../../../../packages/client/src/features/chat/lib/chat-summary-row";
import { expect, test } from "../../../../support/fixtures";

type SummaryItem = Parameters<typeof chatSummaryRowView>[0];

function makeSummary(overrides: Partial<SummaryItem>): SummaryItem {
  return {
    id: castId<ChatId>("chat_summaryrowtest0000000000"),
    title: null,
    star: false,
    archived: false,
    parentChatId: null,
    lastMessageAt: null,
    messageCount: 0,
    participantNames: [],
    participantCharacterIds: [],
    viewerRole: "host",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

test("deriveChatTitle: an authored title wins, trimmed", () => {
  expect(deriveChatTitle("  The Weave  ", ["You", "JFC"])).toBe("The Weave");
});

test("deriveChatTitle: an EMPTY-STRING title falls back to participant names (the blank-title bug)", () => {
  expect(deriveChatTitle("", ["You", "JFC"])).toBe("You, JFC");
  expect(deriveChatTitle("   ", ["You", "JFC"])).toBe("You, JFC");
});

test("deriveChatTitle: a null title falls back to participant names", () => {
  expect(deriveChatTitle(null, ["You", "JFC"])).toBe("You, JFC");
});

test("deriveChatTitle: no title AND no participants → 'Untitled chat'", () => {
  expect(deriveChatTitle(null, [])).toBe("Untitled chat");
  expect(deriveChatTitle("", [])).toBe("Untitled chat");
});

test("chatSummaryRowView: authored title → names subtitle", () => {
  const view = chatSummaryRowView(makeSummary({ title: "The Weave", participantNames: ["You", "JFC"], messageCount: 3 }));
  expect(view.title).toBe("The Weave");
  expect(view.subtitle).toBe("You, JFC");
});

test("chatSummaryRowView: names-derived title → message-count subtitle (never the names twice)", () => {
  const one = chatSummaryRowView(makeSummary({ title: "", participantNames: ["You", "JFC"], messageCount: 1 }));
  expect(one.title).toBe("You, JFC");
  expect(one.subtitle).toBe("1 message");
  const many = chatSummaryRowView(makeSummary({ title: null, participantNames: ["You", "JFC"], messageCount: 4 }));
  expect(many.subtitle).toBe("4 messages");
});

test("chatSummaryRowView: untitled AND participant-less → 'Untitled chat' / 'No characters'", () => {
  const view = chatSummaryRowView(makeSummary({ title: null, participantNames: [] }));
  expect(view.title).toBe("Untitled chat");
  expect(view.subtitle).toBe("No characters");
});

test("chatSummaryRowView: `when` prefers lastMessageAt, falling back to updatedAt", () => {
  expect(chatSummaryRowView(makeSummary({ lastMessageAt: 99, updatedAt: 2 })).when).toBe(99);
  expect(chatSummaryRowView(makeSummary({ lastMessageAt: null, updatedAt: 2 })).when).toBe(2);
});
