// A styled reply shown outside its frame (D354) holds every HTML block as forming markup with no bytes, streams its prose,
// and never prints a `<style>` or `<script>` element's content, whether the text has settled or is still arriving.
// @subject packages/kit/src/content/index.ts

import type { StyledHoldSegment } from "@orb/kit/content";
import { scanStyledHold, stripStyleElements, stripTags } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const HELD: StyledHoldSegment = { kind: "forming-markup" };
const prose = (text: string): StyledHoldSegment => ({ kind: "text", text });
const PANEL = '<div class="panel" style="color:#F4A261"><style>\n.panel{border:1px solid}\n</style><strong>Camelot</strong></div>';
const BUDGET_MS = 1000;

test.each<readonly [string, string, readonly StyledHoldSegment[]]>([
  ["prose alone streams whole", "She sets down her goblet.\n\nHe shrugs.", [prose("She sets down her goblet.\n\nHe shrugs.")]],
  ["a panel before prose is held, the prose streams", `${PANEL}\n\nShe sets down her goblet.`, [HELD, prose("\nShe sets down her goblet.")]],
  ["prose, a panel, prose", `Before.\n\n${PANEL}\n\nAfter.`, [prose("Before.\n\n"), HELD, prose("\nAfter.")]],
  ["a raw style block is held to its close", "<style>\n.x{color:red}\n\n.y{color:blue}\n</style>\nAfter.", [HELD, prose("After.")]],
  ["a raw style block whose close has not arrived holds to the end", "Before.\n\n<style>\n.x{color:red}", [prose("Before.\n\n"), HELD]],
  ["a comment is held to its end", "<!-- a\n\nb -->\nAfter.", [HELD, prose("After.")]],
  ["a lone tag line opens a block held to its element's close", '<sola-panel data-x="1">\nTracker text\n</sola-panel>\nAfter.', [HELD, prose("After.")]],
  [
    "an element is held through its blank lines, so a region a script hides never shows",
    "<sola_easel>\n[I. Staging] The ledger\n\n[IV. Branching Storyboard] The twist\n</sola_easel>\n\nAfter.",
    [HELD, prose("\nAfter.")],
  ],
  [
    "an element whose close has not arrived holds the rest of the text",
    'Before.\n\n<sola_hud digest="d">\n\n<bond>\nPair: A\n</bond>\n\nLedger',
    [prose("Before.\n\n"), HELD],
  ],
  ["elements of the same name nest", "<div>\n<div>\ninner\n</div>\n\nstill outer\n</div>\nAfter.", [HELD, prose("After.")]],
  ["a prefixed name closes by its part before the colon", '<copper:bite>\n"Line"\n\nMore\n</copper>\nAfter.', [HELD, prose("After.")]],
  ["a self-closing lone tag ends at the blank line", '<scene_header sky="noir" />\n\nShe sets down her goblet.', [HELD, prose("\nShe sets down her goblet.")]],
  ["a void tag opens no element", '<img src="x.png">\n\nAfter.', [HELD, prose("\nAfter.")]],
  ["a close quoted inside an attribute closes nothing", '<sola_easel>\n<x title="</sola_easel>">\nThe vault\n</sola_easel>\nAfter.', [HELD, prose("After.")]],
  ["a lone tag line indented as code is held", '    <sola_hud digest="d">\nThe ledger\n    </sola_hud>\nAfter.', [HELD, prose("After.")]],
  [
    "a details panel with a style block is held whole, its hidden body included",
    "<details>\n<summary>Spoilers</summary>\n<style>\n.x{color:red}\n</style>\n\nThe hidden body\n</details>\nAfter.",
    [HELD, prose("After.")],
  ],
  ["a lone tag line inside a paragraph stays in the paragraph", "Line one\n<b>\nLine two", [prose("Line one\n<b>\nLine two")]],
  ["a block tag line interrupts a paragraph", "Line one\n<div>panel</div>\n\nAfter.", [prose("Line one\n"), HELD, prose("\nAfter.")]],
  [
    "dialogue that opens on inline markup streams",
    '<font color="#F4A261">"You are late."</font> The fire crackles.',
    [prose('<font color="#F4A261">"You are late."</font> The fire crackles.')],
  ],
  ["an inline style element is removed with its content", "He shrugs. <style>:root{--k:1;}</style>He waits.", [prose("He shrugs. He waits.")]],
  ["an inline script element is removed with its content", "He shrugs. <script>alert(1)</script>He waits.", [prose("He shrugs. He waits.")]],
  ["an inline style whose close has not arrived is removed to the end", "He shrugs. <style>:root{--k:", [prose("He shrugs. ")]],
  ["a tag still arriving on the last line is held", 'Before.\n\n<div class="pan', [prose("Before.\n\n"), HELD]],
  ["a quoted > inside a tag still arriving is not its end", 'Before.\n\n<x-panel title="a > b', [prose("Before.\n\n"), HELD]],
  ["a fenced code sample stays text", "```html\n<div>shown</div>\n```\nAfter.", [prose("```html\n<div>shown</div>\n```\nAfter.")]],
  ["two blocks with only blank lines between them read as one", `${PANEL}\n\n${PANEL}\n\nAfter.`, [HELD, prose("\nAfter.")]],
  ["text that is only whitespace after a block is dropped", `${PANEL}\n\n`, [HELD]],
])("%s", (_name, content, expected) => {
  expect(scanStyledHold(content)).toEqual(expected);
});

// A reply the Sola preset's prompt produced, cut down: prose with inline voice tags, then the HUD element, whose
// trackers and director checklist the preset's display scripts turn into panels and hide behind a spoiler drawer.
const SOLA_REPLY = [
  '<scene_header sky="noir" location="CAMELOT · GREAT HALL" />',
  "",
  "The carving knife strikes the platter with a flat <heavy>CLACK.</heavy> Guinevere does not look up.",
  "",
  '<copper:bite>"The Orkney envoys left at second bell."</copper> The knife keeps moving.',
  "",
  '<subtext thought="Four trips to the gate.">She lays the best slice on the empty trencher.</subtext>',
  "",
  '<sola_hud digest="Day 1 · Evening · Gear 2">',
  "",
  "<bond>",
  "Pair: Traveler & Guinevere",
  "</bond>",
  "",
  "<sola_easel>",
  "[0. Overall Core Check] (Core Invariants Checklist)",
  "- [x] Length & Shape: PASS",
  "",
  "[IV. Branching Storyboard] (Forward Trajectory)",
  "The Direct Line: Traveler answers",
  "",
  "[V. Sola's Vault]",
  "</sola_easel>",
  "",
  "</sola_hud>",
  "",
  '<chatterbox mind="Riot">',
  '<sola_text mind="Riot">Your cue, bandmate.</sola_text>',
  "</chatterbox>",
].join("\n");
const SOLA_PROTOCOL = ["Pair:", "PASS", "Storyboard", "Vault", "digest", "Four trips", "bandmate"] as const;

function shownText(content: string): string {
  return stripTags(
    scanStyledHold(content)
      .map((part) => (part.kind === "text" ? part.text : ""))
      .join(""),
  );
}

test("a real preset reply shows its prose and none of its protocol, at every length while it streams", () => {
  for (let length = 1; length <= SOLA_REPLY.length; length += 1) {
    const shown = shownText(SOLA_REPLY.slice(0, length));
    expect(
      SOLA_PROTOCOL.filter((marker) => shown.includes(marker)),
      `at ${length}`,
    ).toEqual([]);
    expect(shown, `at ${length}`).not.toMatch(/[<>]/u);
  }
  // Positive control: the prose itself is shown, its inline tags dropped and their words kept.
  expect(shownText(SOLA_REPLY)).toContain('"The Orkney envoys left at second bell." The knife keeps moving.');
  expect(shownText(SOLA_REPLY)).toContain("She lays the best slice on the empty trencher.");
});

test("a held block carries no bytes of its markup or its CSS", () => {
  const segments = scanStyledHold(`${PANEL}\n\nShe sets down her goblet.`);
  expect(JSON.stringify(segments)).not.toMatch(/panel|F4A261|border/u);
});

test("stripping leaves text with no style or script element untouched", () => {
  const body = 'He said <b>"no"</b> and <a href="https://x.test">left</a>.';
  expect(stripStyleElements(body)).toBe(body);
});

test.each([
  ["inline tags drop and keep their words", '<marigold>"You are late."</marigold> The fire <b class="x">crackles</b>.', '"You are late." The fire crackles.'],
  ["a quoted > inside a tag does not end it", '<x title="a > b">kept</x>', "kept"],
  ["a tag still arriving at the end is held", 'The fire crackles. <glitch mood="hi', "The fire crackles. "],
  ["a < that never closes on an earlier line is prose", "a <b\nc <i>d</i>", "a <b\nc d"],
  ["a < before a space is prose", "3 < 4 and <b>bold</b>", "3 < 4 and bold"],
])("stripping tags: %s", (_name, text, expected) => {
  expect(stripTags(text)).toBe(expected);
});

test.each([
  ["a long line of open tag text", `<div ${"a".repeat(400_000)}`],
  ["many unclosed style opens", "<style ".repeat(60_000)],
  ["a long run of quotes inside a tag", `<x ${'"'.repeat(400_000)}`],
  ["many unclosed tags on one line", `${"<a ".repeat(100_000)}\nend`],
  ["many lone open tag lines that never close", "<b>\n\n".repeat(100_000)],
  ["many elements each closed far below", `${"<b>\n".repeat(50_000)}${"</b>\n".repeat(50_000)}after`],
])("%s is read in linear time", (_name, body) => {
  const started = performance.now();
  shownText(body);
  stripTags(body);
  expect(performance.now() - started).toBeLessThan(BUDGET_MS);
});
