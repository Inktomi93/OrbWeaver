// Tide's bubble train splits a reply at its paragraph breaks only: a stylesheet or a code block holding a blank line
// stays in one bubble, a bubble keeps its first line's indent, and a standalone thematic break is no bubble.
// @subject packages/client/src/features/chat/lib/split-paragraphs.ts

import { expect, test } from "@orb/testkit/node";
import { splitIntoTrainParagraphs } from "#client/features/chat/lib/split-paragraphs.ts";

const PANEL = '<div class="hud"><style>.hud{color:red}\n\n.hud b{margin:0}</style><b>HUD</b></div>';

test.each([
  ["three paragraphs", "One.\n\nTwo.\n\nThree.", ["One.", "Two.", "Three."]],
  ["a panel whose stylesheet holds a blank line", `She looks up.\n\n${PANEL}\n\nThe hall waits.`, ["She looks up.", PANEL, "The hall waits."]],
  ["a fenced sample holding a blank line", "Use this:\n\n```css\n.a{}\n\n.b{}\n```", ["Use this:", "```css\n.a{}\n\n.b{}\n```"]],
  ["indented code after a paragraph", "Run:\n\n    make all\n\nDone.", ["Run:", "    make all", "Done."]],
  ["a leading thematic break", "---\n\nOne.\n\nTwo.", ["One.", "Two."]],
])("%s", (_name, content, expected) => {
  expect(splitIntoTrainParagraphs(content)).toEqual(expected);
});

test("a reply that is one paragraph once its units stay whole is not a train", () => {
  expect(splitIntoTrainParagraphs(`${PANEL}\n\n---`)).toBeNull();
});
