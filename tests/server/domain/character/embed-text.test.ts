// The card-text projection strips markup from card fields and survives an unclosed opener run.
// @subject packages/server/src/domain/character/substrate/embed-text.ts

import { buildCardEmbedText } from "@orb/server/domain/character";
import { expect, test } from "@orb/testkit/node";

const card = (description: string): Parameters<typeof buildCardEmbedText>[0] => ({
  name: "Aria",
  description,
  personality: null,
  scenario: null,
  greetings: [],
});

test("tags drop and their words stay", () => {
  expect(buildCardEmbedText(card("<b>Brave</b> knight <i></i>of the <p>keep"))).toBe("Name: Aria\nDescription: Brave knight of the keep");
});

test("an opener with no close is prose", () => {
  expect(buildCardEmbedText(card("a < b and <<<"))).toBe("Name: Aria\nDescription: a < b and <<<");
});

test("a long unclosed opener run is read in linear time", () => {
  const started = performance.now();
  buildCardEmbedText(card("<".repeat(200_000)));
  expect(performance.now() - started).toBeLessThan(1000);
});
