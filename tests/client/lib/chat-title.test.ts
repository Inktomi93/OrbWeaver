// Unit: `deriveChatTitle` (lib/chat-title) — the ONE chat display-title fallback chain, now in the SHARED
// lib. These moved here with the function on 2026-08-09 (they were in
// tests/client/features/chat/lib/chat-summary-row.test.ts, which keeps the summary-row projection tests):
// the regex library's room roster names chat rooms and features cannot import each other, so the chain had
// to leave `features/chat` for anything outside chat to run it. Its own two-rung copy of this chain is what
// put "Untitled chat" on rooms the chats list calls by their cast.
//
// Pins the side-eye P1-2 fix: stored titles are EMPTY STRINGS until renamed (not just null), so the fallback
// must TRIM — `?? "Untitled chat"` was defeated by "" and rendered blank rows/options everywhere.

import { deriveChatTitle, UNTITLED_CHAT_TITLE } from "@orb/client/lib";
import { expect, test } from "../../support/fixtures.ts";

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
  expect(deriveChatTitle(null, ["Azarael", "Niko"])).toBe("Azarael, Niko");
  expect(deriveChatTitle(null, ["Niko", "Azarael"])).toBe("Niko, Azarael");
});
