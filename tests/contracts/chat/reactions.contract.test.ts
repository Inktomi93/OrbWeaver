// contracts/chat/reactions (B6/MR0) — the emoji VOCABULARY is the write boundary, so this pins the two
// properties everything else leans on: the wire refuses anything outside the tuple (the column is plain
// TEXT and the DB carries NO tuple-derived CHECK, deliberately — see the module header — so this schema
// plus the verb's re-parse ARE the guard), and the picker's grid is this tuple, in this order.

import { REACTION_EMOJIS, reactionEmojiSchema } from "@orb/contracts/chat";
import { expect, test } from "../../support/fixtures.ts";

test("reactionEmojiSchema admits every vocabulary member and REFUSES anything else", () => {
  for (const emoji of REACTION_EMOJIS) {
    expect(reactionEmojiSchema.parse(emoji)).toBe(emoji);
  }
  // The three shapes an open TEXT column would otherwise have accepted from a member: an arbitrary
  // codepoint, free prose, and the custom `:name:` token whose ARM has not shipped yet (Open-Q D — the
  // schema column is born, the wire is not open until its picker lands).
  expect(reactionEmojiSchema.safeParse("🦑").success).toBe(false);
  expect(reactionEmojiSchema.safeParse("not an emoji at all").success).toBe(false);
  expect(reactionEmojiSchema.safeParse(":partyparrot:").success).toBe(false);
});

test("the vocabulary is a closed, duplicate-free tuple — the picker renders it in THIS order", () => {
  // The picker iterates the tuple directly (`reaction-picker.tsx`), so tuple ORDER is rendered order and a
  // duplicate would render two identical cells whose pressed states could disagree.
  expect(new Set(REACTION_EMOJIS).size).toBe(REACTION_EMOJIS.length);
  expect(REACTION_EMOJIS[0]).toBe("👍");
});
