// Mirror unit test for domain/character/seeder/authored-content — the half-seeded-card test (#1444): a card is still
// the pack's only while every authored field matches, an added greeting included; `groupOnly` absent equals false.

import type { SeededCardContent } from "@orb/server/domain/character";
import { matchesAuthoredContent } from "@orb/server/domain/character";
import { expect, test } from "../../../../support/fixtures.ts";

const AUTHORED = {
  name: "Charlotte",
  nickname: null,
  description: "A spider who keeps the threads.",
  personality: null,
  scenario: null,
  greetings: [{ text: "Hello, {{user}}." }],
  exampleMessages: null,
  creatorNotes: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  depthPrompt: null,
  creator: "orbweaver",
  cardVersion: null,
  source: null,
  creationDate: null,
  modificationDate: null,
  extensions: { talkativeness: 0.5 },
  residualData: null,
} satisfies SeededCardContent;

test("an untouched card matches, and an absent groupOnly equals false", () => {
  expect(matchesAuthoredContent({ ...AUTHORED, greetings: [{ text: "Hello, {{user}}.", groupOnly: false }] }, AUTHORED)).toBe(true);
});

test("one edited field, an appended greeting or a changed JSON field makes the card the user's", () => {
  expect(matchesAuthoredContent({ ...AUTHORED, description: "Mine now." }, AUTHORED)).toBe(false);
  expect(matchesAuthoredContent({ ...AUTHORED, greetings: [...AUTHORED.greetings, { text: "Again." }] }, AUTHORED)).toBe(false);
  expect(matchesAuthoredContent({ ...AUTHORED, extensions: { talkativeness: 0.9 } }, AUTHORED)).toBe(false);
});
