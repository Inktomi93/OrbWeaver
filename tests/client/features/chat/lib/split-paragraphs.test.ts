// Tide's bubble train splits a reply at its paragraph breaks only: a stylesheet or a code block holding a blank line
// stays in one bubble, a bubble keeps its first line's indent, and a standalone thematic break or a paragraph that
// draws nothing (a lone wrapper tag, a comment, a stylesheet) is no bubble.
// @subject packages/client/src/features/chat/lib/split-paragraphs.ts

import { expect, test } from "@orb/testkit/node";
import { storedReplyTrains, trainParagraphs } from "#client/features/chat/lib/split-paragraphs.ts";

function paragraphsOf(content: string): readonly string[] | null {
  return trainParagraphs(content)?.map(({ start, end }) => content.slice(start, end)) ?? null;
}

const PANEL = '<div class="hud"><style>.hud{color:red}\n\n.hud b{margin:0}</style><b>HUD</b></div>';

test.each([
  ["three paragraphs", "One.\n\nTwo.\n\nThree.", ["One.", "Two.", "Three."]],
  ["a panel whose stylesheet holds a blank line", `She looks up.\n\n${PANEL}\n\nThe hall waits.`, ["She looks up.", PANEL, "The hall waits."]],
  ["a fenced sample holding a blank line", "Use this:\n\n```css\n.a{}\n\n.b{}\n```", ["Use this:", "```css\n.a{}\n\n.b{}\n```"]],
  ["indented code after a paragraph", "Run:\n\n    make all\n\nDone.", ["Run:", "    make all", "Done."]],
  ["a leading thematic break", "---\n\nOne.\n\nTwo.", ["One.", "Two."]],
  ["a paragraph of comments alone", "<!-- plan\n\nbetray him --> <!-- x -->\n<!-- y -->\n\nOne.\n\nTwo.", ["One.", "Two."]],
  ["a comment with text after it on its line", "<!-- x -->Shown.\n\nTwo.", ["<!-- x -->Shown.", "Two."]],
  ["a comment indented as code", "One.\n\n    <!-- x -->\n\nTwo.", ["One.", "    <!-- x -->", "Two."]],
  ["a comment that never closes, which runs to the end", "One.\n\nTwo.\n\n<!-- x\n\nThree.", ["One.", "Two."]],
  ["a wrapper tag alone at each end", "<continuation>\n\nShe looks up.\n\nShe waits.\n\n</continuation>", ["She looks up.", "She waits."]],
  ["a stray close tag", "</think>\n\nOne.\n\nTwo.", ["One.", "Two."]],
  ["a stylesheet alone", "<style>.a{color:red}</style>\n\nOne.\n\nTwo.", ["One.", "Two."]],
  ["a tag whose quoted attribute holds a >", '<span title="a>b">\n\nOne.\n\nTwo.', ["One.", "Two."]],
  ["an indented line inside the block a tag opens", "<div>\n    </div>\n\nOne.\n\nTwo.", ["One.", "Two."]],
  ["an image alone", '<img src="/a.png">\n\nOne.', ['<img src="/a.png">', "One."]],
  ["a tag indented as code", "One.\n\n    <b>\n\nTwo.", ["One.", "    <b>", "Two."]],
  ["a tag indented as code after a comment block", "<!-- x -->\n    <b>\n\nOne.", ["<!-- x -->\n    <b>", "One."]],
  ["a < that never closes", "<b class=x\n\nOne.", ["<b class=x", "One."]],
])("%s", (_name, content, expected) => {
  expect(paragraphsOf(content)).toEqual(expected);
});

test("a reply that is one paragraph once its units stay whole is not a train", () => {
  expect(trainParagraphs(`${PANEL}\n\n---`)).toBeNull();
});

test("a reply that is one paragraph between wrapper tags is not a train, so its single bubble keeps the tags", () => {
  expect(trainParagraphs("<continuation>\n\nShe looks up.\n\n</continuation>")).toBeNull();
});

// A display script can draw a panel from a tag that alone draws nothing, so the stored reply counts it.
test.each([
  ["a tag a display script may turn into a panel, then prose", "<scene_hud />\n\nShe looks up.", true],
  ["one paragraph", "She looks up.", false],
  ["a leading thematic break and one paragraph", "---\n\nShe looks up.", false],
])("a stored reply with %s may train: %s", (_name, content, trains) => {
  expect(storedReplyTrains(content)).toBe(trains);
});
