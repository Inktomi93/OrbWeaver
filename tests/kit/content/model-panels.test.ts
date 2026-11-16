// The frame trigger for a panel the model writes itself (`modelPanels`, D354), the block hold the frame parses a panel
// with (`heldBlockRanges`, `holdBlocksWhole`), and the markup units a speaker marker cannot split (`markupUnitRanges`).
// A panel is a stylesheet, a script, an svg, or a block whose opening tag carries a style attribute, in prose outside a
// card; inline markup, a bare tag and a code sample are none.
// @subject packages/kit/src/content/index.ts

import { heldBlockRanges, holdBlocksWhole, markupUnitRanges, modelPanels, paragraphBreaks, stripStyleElements } from "@orb/kit/content";
import { parseSpeakerSpans } from "@orb/kit/speaker-label";
import { expect, test } from "@orb/testkit/node";

const BUDGET_MS = 1000;
// The size the reader's other linear-time rows read at.
const LONG_CHARS = 400_000;

function panelTexts(text: string, lenientHtml = false): readonly string[] {
  return modelPanels(text, { lenientHtml }).map(({ start, end }) => text.slice(start, end));
}

const STYLED_DIV = '<div class="hud" style="padding:4px">\n<b>HP</b> 10\n</div>';

test.each<readonly [string, string, readonly string[]]>([
  ["a style element in prose", "She looks up.\n\n<style>.a{color:red}</style>\n\nThe hall waits.", ["<style>.a{color:red}</style>"]],
  ["a script element in prose", "Before.\n\n<script>run()</script>", ["<script>run()</script>"]],
  ["a block whose opening tag carries a style attribute", `Before.\n\n${STYLED_DIV}\n\nAfter.`, [STYLED_DIV]],
  ["a lone tag line carrying a style attribute", '<think style="color:red">\nA plan.\n</think>', ['<think style="color:red">\nA plan.\n</think>']],
  ["an svg element inside a paragraph", 'A mark <svg width="4"><circle r="2"/></svg> here.', ['<svg width="4"><circle r="2"/></svg>']],
  [
    "a block holding a stylesheet, as one panel",
    '<div class="hud">\n<style>.hud{}</style>\n<b>HP</b>\n</div>',
    ['<div class="hud">\n<style>.hud{}</style>\n<b>HP</b>\n</div>'],
  ],
  [
    "a whole HTML document written raw, as its html block",
    "<!DOCTYPE html>\n<html>\n<head>\n<title>T</title>\n<style>body{margin:0}</style>\n</head>\n<body>\n<p>Hi</p>\n</body>\n</html>",
    ["<html>\n<head>\n<title>T</title>\n<style>body{margin:0}</style>\n</head>\n<body>\n<p>Hi</p>\n</body>\n</html>"],
  ],
])("%s is a panel", (_name, text, expected) => {
  expect(panelTexts(text)).toEqual(expected);
});

test.each([
  ["a coloured span inside a paragraph", 'She says <span style="color:red">hi</span>.'],
  ["a font colour tag", 'She says <font color="red">hi</font>.'],
  ["a bare wrapper block", "<div>\nplain\n</div>"],
  ["a wrapper tag round the reply", '<response>\n*She looks up.*\n\n"You came."\n</response>'],
  ["a stylesheet written as inline code", "Use `<style>.a{}</style>` to style it."],
  ["a stylesheet in a fenced sample", "```html\n<style>.a{}</style>\n```"],
  ["an escaped style opener", "\\<style>.a{}</style>"],
  ["a style attribute inside a comment block", '<!-- <div style="x"> -->'],
  ["a stylesheet inside a lie's hidden truth", 'She smiles. <lie character="Ann" truth="<style>.a{}</style>" reason="cover" /> "It was me."'],
  ["a stylesheet inside a perception filter", '<ofilter event="<style>.a{}</style>" reason="dark" />\n\nThe hall waits.'],
  ["a think block", "<think>\nA plan.\n</think>\n\nShe smiles."],
])("%s is no panel", (_name, text) => {
  expect(modelPanels(text)).toEqual([]);
});

test.each([
  ["a styled card alone", ':::card title="HUD"\n<style>.a{}</style><b>HP</b>\n:::', []],
  ["a panel beside a marked card", `${STYLED_DIV}\n\n:::card title="HUD"\n<style>.c{}</style>\n:::`, [STYLED_DIV]],
  ["a stylesheet in a card and one outside it", ':::card title="HUD"\n<style>.c{}</style>\n:::\n\n<style>.out{}</style>', ["<style>.out{}</style>"]],
])("only prose outside a card counts: %s", (_name, text, expected) => {
  expect(panelTexts(text)).toEqual(expected);
});

test("a naked block the lenient reading takes as a card is no panel there, and is one in a room that does not", () => {
  const block = '<div style="a:b">\n<b>One</b>\n<i>Two</i>\n<u>Three</u>\n</div>';
  expect(panelTexts(block, true)).toEqual([]);
  expect(panelTexts(block, false)).toEqual([block]);
});

const INDENTED_PANEL = '<div class="hud">\n<b>HP</b> 10\n\n    <span>indented</span>\n\n*kept as written* [[1d20: 7]]\n</div>';

test("the hold keeps a multi-paragraph indented panel one block: its blank lines become comments and nothing else moves", () => {
  const text = `Before *prose*.\n\n${INDENTED_PANEL}\n\nAfter *prose*.`;
  expect(heldBlockRanges(text).map(({ start, end }) => text.slice(start, end))).toEqual([INDENTED_PANEL]);
  expect(holdBlocksWhole(text)).toBe(`Before *prose*.\n\n${INDENTED_PANEL.replaceAll("\n\n", "\n<!---->\n")}\n\nAfter *prose*.`);
});

test.each([
  [
    "a nested panel, held to its outer close",
    '<div class="a">\n<div class="b">\n\ninner\n\n</div>\n</div>\n\nTail.',
    ['<div class="a">\n<div class="b">\n\ninner\n\n</div>\n</div>'],
  ],
  ["an unclosed panel, held to the end", '<section style="x:y">\nopen\n\nstill inside', ['<section style="x:y">\nopen\n\nstill inside']],
  ["a wrapper tag and a folding element, held by neither", "<response>\none\n\ntwo\n</response>\n\n<details><summary>S</summary>\n\n**md**\n\n</details>", []],
  ["an opener that asks for Markdown", '<div markdown="1">\n\n**md**\n\n</div>', []],
  ["a panel indented as code", "Run:\n\n    <div>\n\n    </div>", []],
  // Held, the sample would draw as a live stylesheet the lift and the strip read as code.
  ["a panel holding a stylesheet sample indented as code", "<div>\n\n    <style>.x{}</style>\n</div>", []],
  ["an unclosed panel before a script sample indented as code", "- item\n<div>\n\n    <script>run()</script>", []],
  ["a panel holding a stylesheet sample in a code span", "<div>\n\n`<style>.x{}</style>`\n</div>", []],
  // The comment the hold writes would close a comment opener left open in or above the panel.
  ["a panel holding a comment opener left open", "<div>\n<!-- plan\n\ntext\n</div>", []],
  ["a panel below a comment opener left open", "<!-- plan\n\n<div>\n\ntext\n</div>", []],
  ["a panel holding a closed comment", "<div>\n<!-- plan -->\n\ntext\n</div>", ["<div>\n<!-- plan -->\n\ntext\n</div>"]],
])("the hold reads %s", (_name, text, expected) => {
  expect(heldBlockRanges(text).map(({ start, end }) => text.slice(start, end))).toEqual(expected);
});

test("the hold leaves a stylesheet's own blank lines alone and changes nothing outside held blocks", () => {
  const text = '<div class="hud">\n<style>.a{}\n\n.b{}</style>\n</div>\n\nOne.\n\nTwo.';
  expect(holdBlocksWhole(text)).toBe(text);
  expect(holdBlocksWhole("One.\n\n<response>\n\nTwo.\n</response>")).toBe("One.\n\n<response>\n\nTwo.\n</response>");
});

// A seeded Lehmer generator, so the fragment mix is the same on every run.
const LEHMER_MULTIPLIER = 48_271;
const LEHMER_MODULUS = 2_147_483_647;
const HOLD_RUNS = 3000;
const MAX_FRAGMENTS = 24;
const HOLD_FRAGMENTS = [
  '<div style="a:b">',
  "<div>",
  "</div>",
  "<section>",
  "</section>",
  "<response>",
  "</response>",
  "<details>",
  "</details>",
  "<style>",
  "</style>",
  "<script>",
  // Never empty, so no run spells the hold's own empty comment.
  "<!-- note",
  "-->",
  "```",
  "`",
  "    ",
  "\t",
  "\n",
  "\n\n",
  "*em*",
  "[[1d20: 7]]",
  "text",
  "<b>",
  "</b>",
  "<html>",
  "<body>",
] as const;

test("across seeded random markup the hold only turns blank lines inside held blocks into comments, and nothing else moves", () => {
  let state = LEHMER_MULTIPLIER;
  const next = (bound: number): number => {
    state = (state * LEHMER_MULTIPLIER) % LEHMER_MODULUS;
    return state % bound;
  };
  for (let run = 0; run < HOLD_RUNS; run += 1) {
    const text = Array.from({ length: 1 + next(MAX_FRAGMENTS) }, () => HOLD_FRAGMENTS[next(HOLD_FRAGMENTS.length)]).join("");
    const held = heldBlockRanges(text);
    const out = holdBlocksWhole(text);
    // A blank line may hold spaces or tabs; the comment takes the whole line.
    const blanked = (value: string): string => value.replaceAll(/^[ \t]+$/gmu, "");
    expect(blanked(out.replaceAll("<!---->", "")), text).toBe(blanked(text));
    const first = held[0]?.start ?? text.length;
    const last = held.at(-1)?.end ?? text.length;
    expect(out.slice(0, first), text).toBe(text.slice(0, first));
    expect(out.slice(out.length - (text.length - last)), text).toBe(text.slice(last));
    for (const [index, range] of held.entries()) {
      expect(range.start < range.end && (held[index + 1]?.start ?? Number.POSITIVE_INFINITY) >= range.end, text).toBe(true);
    }
  }
});

test("the reader, the strip, the split and the hold agree on a panel: one unit, its stylesheet stripped whole", () => {
  const panel = '<div class="hud">\n<style>.hud b{color:red}\n\n.hud i{margin:0}</style>\n<b>HP</b>\n</div>';
  const text = `She looks up.\n\n${panel}\n\nThe hall waits.`;
  const [held] = heldBlockRanges(text);
  const [found] = modelPanels(text);
  expect(found).toEqual(held);
  // No paragraph break falls inside the panel's stylesheet, and the strip takes all of it.
  const stylesheet = { start: text.indexOf("<style>"), end: text.indexOf("</style>") + "</style>".length };
  expect(paragraphBreaks(text).filter((cut) => cut.start > stylesheet.start && cut.start < stylesheet.end)).toEqual([]);
  expect(stripStyleElements(text)).not.toContain("margin");
});

test.each([
  ["a marker inside a panel", 'Narration.\n\n<div class="hud">\n<speaker>Bob</speaker>HP 10\n</div>\n\n<speaker>Ann</speaker>Hello.', [null, "Ann"]],
  [
    "a marker that opens before a panel and the next after it",
    '<speaker>Bob</speaker>Before.\n\n<div class="hud">\n<b>HP</b>\n</div>\n\n<speaker>Ann</speaker>After.',
    ["Bob", "Ann"],
  ],
  ["a marker wrapping a block", '<speaker>Bob</speaker>\n<div class="hud">\n<b>HP</b>\n</div>', ["Bob"]],
])("a speaker split skips %s", (_name, text, speakers) => {
  const spans = parseSpeakerSpans(text, [], markupUnitRanges(text));
  expect(spans.map((span) => span.speaker)).toEqual(speakers);
  // The panel sits whole in one span.
  const panelStart = text.indexOf('<div class="hud">');
  expect(spans.some((span) => span.start <= panelStart && span.start + span.text.length >= text.indexOf("</div>"))).toBe(true);
});

test("a speaker label line inside a panel splits nothing", () => {
  const text = 'Narration.\n\n<div class="hud">\nBob: HP 10\n</div>\n\nBob: Hello.';
  expect(parseSpeakerSpans(text, ["Bob"], markupUnitRanges(text)).map((span) => span.speaker)).toEqual([null, "Bob"]);
  // Positive control: without the units the label inside the panel splits it.
  expect(parseSpeakerSpans(text, ["Bob"]).map((span) => span.speaker)).toEqual([null, "Bob", "Bob"]);
});

test.each([
  ["many panels", `${STYLED_DIV}\n\n`.repeat(Math.floor(LONG_CHARS / (STYLED_DIV.length + 2)))],
  ["one panel holding many blank lines", `<div style="a:b">\n${"x\n\n".repeat(LONG_CHARS / 16)}</div>`],
  ["many unclosed nested openers", '<div style="a">\n'.repeat(LONG_CHARS / 16)],
  ["many svg elements in one paragraph", "<svg></svg>".repeat(Math.floor(LONG_CHARS / 11))],
])("%s is read in linear time", (_name, text) => {
  const started = performance.now();
  modelPanels(text);
  holdBlocksWhole(text);
  markupUnitRanges(text);
  expect(performance.now() - started).toBeLessThan(BUDGET_MS);
});
