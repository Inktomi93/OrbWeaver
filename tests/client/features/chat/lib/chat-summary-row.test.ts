// Unit: `deriveChatTitle` + `chatSummaryRowView` (features/chat/lib/chat-summary-row) — the ONE chat
// display-title fallback chain. Pins the side-eye P1-2 fix: stored titles are EMPTY STRINGS until
// renamed (not just null), so the fallback must trim — `?? "Untitled chat"` was defeated by "" and
// rendered blank rows/options everywhere. When the title falls back to participant names, the row
// subtitle switches to the message count so the names never print twice.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { chatPortraitHash, chatSummaryRowView, deriveChatTitle } from "../../../../../packages/client/src/features/chat/lib/chat-summary-row";
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
    lastMessagePreview: null,
    isGame: false,
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

// F7 — the portrait arm: the avatar slot resolves a REAL face from the seat ids instead of a hue blob.
const AVATARS = new Map<string, string | null>([
  ["char_faceless", null],
  ["char_azarael", "hash_azarael"],
  ["char_niko", "hash_niko"],
]);

test("chatPortraitHash: the FIRST seat that owns an avatar wins", () => {
  expect(chatPortraitHash(["char_azarael", "char_niko"], AVATARS)).toBe("hash_azarael");
});

test("chatPortraitHash: a portrait-less seat is skipped, not treated as the answer", () => {
  expect(chatPortraitHash(["char_faceless", "char_niko"], AVATARS)).toBe("hash_niko");
});

test("chatPortraitHash: null when nothing resolves (no seats · unknown seat · every seat portrait-less)", () => {
  expect(chatPortraitHash([], AVATARS)).toBeNull();
  // An unknown id is the un-landed / departed-seat case — the row keeps its initials blob.
  expect(chatPortraitHash(["char_departed"], AVATARS)).toBeNull();
  expect(chatPortraitHash(["char_faceless"], AVATARS)).toBeNull();
});
