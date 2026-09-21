// Unit: `chatSummaryRowView` (features/chat/lib/chat-summary-row) — the chats-list row
// projection. When the title falls back to participant names, the row subtitle switches to the message
// count so the names never print twice.
//
// `deriveChatTitle`'s OWN tests moved to tests/client/lib/chat-title.test.ts on 2026-08-09 with the function
// (it is shared lib now — the regex room roster needs it and features cannot import each other). The
// fallback still runs THROUGH this projection, so the arms below still exercise it end-to-end.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { chatSummaryRowView } from "../../../../../packages/client/src/features/chat/lib/chat-summary-row.ts";
import { expect, test } from "../../../../support/fixtures.ts";

type SummaryItem = Parameters<typeof chatSummaryRowView>[0];

function makeSummary(overrides: Partial<SummaryItem>): SummaryItem {
  return {
    id: castId<ChatId>("chat_summaryrowtest0000000000"),
    title: null,
    starred: false,
    archived: false,
    gamePaused: false,
    lastMessageAt: null,
    messageCount: 0,
    participantNames: [],
    participantPortraits: [],
    lastMessagePreview: null,
    isGame: false,
    viewerRole: "host",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

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

test("chatSummaryRowView: the server-resolved scent line WINS the subtitle over the identity line", () => {
  const view = chatSummaryRowView(
    makeSummary({ title: "The Weave", participantNames: ["You", "JFC"], messageCount: 3, lastMessagePreview: "the door gives way" }),
  );
  expect(view.title).toBe("The Weave");
  expect(view.subtitle).toBe("the door gives way");
});

test("chatSummaryRowView: a names-derived title still shows the scent line, not the message count", () => {
  const view = chatSummaryRowView(makeSummary({ title: "", participantNames: ["You", "JFC"], messageCount: 3, lastMessagePreview: "ash on the wind" }));
  expect(view.title).toBe("You, JFC");
  expect(view.subtitle).toBe("ash on the wind");
});

test("chatSummaryRowView: NO preview (empty chat / clamped viewer) falls back to the identity line", () => {
  // The member-visibility arm as the client sees it: the server withheld the preview, so the row must show
  // the identity line rather than a blank second line.
  const clamped = chatSummaryRowView(makeSummary({ title: "The Weave", participantNames: ["You", "JFC"], messageCount: 9, lastMessagePreview: null }));
  expect(clamped.subtitle).toBe("You, JFC");
});

test("chatSummaryRowView: `when` prefers lastMessageAt, falling back to updatedAt", () => {
  expect(chatSummaryRowView(makeSummary({ lastMessageAt: 99, updatedAt: 2 })).when).toBe(99);
  expect(chatSummaryRowView(makeSummary({ lastMessageAt: null, updatedAt: 2 })).when).toBe(2);
});

// F7 + D3's LEADING-slot arm no longer has a client-side derivation to unit-test: `chatPortraits` (which
// indexed character ids into a whole-library `character.list` map) was retired with that read in
// #192. The seats arrive resolved on the row, and the SEAT-ORDER + portrait-less-seat properties it pinned
// are now the server's (`seatPortraits`, tests/server/domain/chat/verbs/read.int.test.ts) plus the rendered
// stack pin in tests/client/features/chat/surfaces/chat-list-surface.ct.tsx.
