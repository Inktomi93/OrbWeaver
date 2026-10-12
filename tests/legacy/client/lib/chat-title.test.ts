// Unit: `deriveChatTitle` (lib/chat-title) — the ONE chat display-title fallback chain, now in the SHARED
// lib. These moved here with the function on 2026-08-09 (they were in
// tests/legacy/client/features/chat/lib/chat-summary-row.test.ts, which keeps the summary-row projection tests):
// the regex library's room roster names chat rooms and features cannot import each other, so the chain had
// to leave `features/chat` for anything outside chat to run it. Its own two-rung copy of this chain is what
// put "Untitled chat" on rooms the chats list calls by their cast.
//
// Pins the side-eye P1-2 fix: stored titles are EMPTY STRINGS until renamed (not just null), so the fallback
// must TRIM — `?? "Untitled chat"` was defeated by "" and rendered blank rows/options everywhere.

import { authoredChatName, chatRoomTitle, deriveChatTitle, UNTITLED_CHAT_TITLE } from "@orb/client/lib";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

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
  expect(deriveChatTitle(null, [])).toBe(UNTITLED_CHAT_TITLE);
  expect(deriveChatTitle("", [])).toBe(UNTITLED_CHAT_TITLE);
  // The literal is pinned too — it is the string every surface prints, and the regex roster's CT asserts
  // its ABSENCE by that exact spelling.
  expect(UNTITLED_CHAT_TITLE).toBe("Untitled chat");
});

test("deriveChatTitle: names join in the order given (roster order is the caller's to decide)", () => {
  expect(deriveChatTitle(null, ["Aveline", "Niko"])).toBe("Aveline, Niko");
  expect(deriveChatTitle(null, ["Niko", "Aveline"])).toBe("Niko, Aveline");
});

// Imported rooms were stored as "<cast> — Mon D, YYYY" (a date stamp, not a name). Existing rows are never
// rewritten, so the display chain must read them as "no user name".
test("deriveChatTitle: a stored '<cast> — Mon D, YYYY' date stamp presents as no user name", () => {
  expect(deriveChatTitle("Hikari — Oct 3, 2026", ["Hikari"])).toBe("Hikari");
  expect(deriveChatTitle("Mar 6, 2024", ["Aveline", "Niko"])).toBe("Aveline, Niko");
  expect(deriveChatTitle("Hikari — Oct 3, 2026 (2)", ["Hikari"])).toBe("Hikari");
});

test("authoredChatName: only a name the user chose survives; look-alikes that are not the stamp stay names", () => {
  expect(authoredChatName(null)).toBeNull();
  expect(authoredChatName("   ")).toBeNull();
  expect(authoredChatName("Hikari — Oct 3, 2026")).toBeNull();
  expect(authoredChatName("  The Weave  ")).toBe("The Weave");
  // A date followed by more words, or a hyphen instead of the em dash, is a deliberate title.
  expect(authoredChatName("Hikari — Oct 3, 2026 trip notes")).toBe("Hikari — Oct 3, 2026 trip notes");
  expect(authoredChatName("Hikari - Oct 3, 2026")).toBe("Hikari - Oct 3, 2026");
});

// The phone's room title: the user's own room name leads when there is one, the participants follow, and a
// room without a name is told apart by its participants alone.
test("chatRoomTitle: the user's room name leads, the participants follow, a stamp or blank is no name", () => {
  expect(chatRoomTitle("Rooftop night", ["Hikari", "Pamela"])).toBe("Rooftop night \u00b7 Hikari, Pamela");
  expect(chatRoomTitle("Hikari \u2014 Oct 3, 2026 (5)", ["Hikari"])).toBe("Hikari");
  expect(chatRoomTitle(null, ["Hikari"])).toBe("Hikari");
  expect(chatRoomTitle("", [])).toBe(UNTITLED_CHAT_TITLE);
  // A name that only repeats the people is not printed twice.
  expect(chatRoomTitle("Hikari", ["Hikari"])).toBe("Hikari");
  // A room with no characters leads with its name alone.
  expect(chatRoomTitle("Rooftop night", [])).toBe("Rooftop night");
});
