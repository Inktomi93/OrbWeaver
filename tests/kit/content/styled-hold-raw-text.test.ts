// A `<style>` or `<script>` element is read as one unit from its opening tag to its close, wherever it opens on a line
// and through its blank lines, by every reader that splits a reply into blocks: the styled hold, the inert strip and the
// lenient card run. None of its text ever reaches prose.
// @subject packages/kit/src/content/index.ts

import type { StyledHoldSegment } from "@orb/kit/content";
import { frameStyleElements, liftRawTextBodies, rawTextElements, scanStyledHold, stripStyleElements, stripTags, tokenizeContent } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const HELD: StyledHoldSegment = { kind: "forming-markup" };
const prose = (text: string): StyledHoldSegment => ({ kind: "text", text });
const BUDGET_MS = 1000;

// The shape of a display script's panel: the stylesheet opens after the panel's own tag on the same line, holds two
// blank lines and a comment, and the panel markup follows its close on the close's line.
const PANEL = [
  '<div class="hud"><style>:host{color:red} .hud *{margin:0}',
  "",
  ".hud .row *{gap:1px} .hud b{font-weight:600}",
  "",
  "/* Order check: keep the rows in place. */ details.hud > summary{list-style:none} .hud i *{padding:0}",
  '</style><details class="hud"><summary>Tracker</summary><div>Row one</div></details></div>',
].join("\n");

// What stylesheet or script source looks like in prose.
const SOURCE_MARKERS = ["{", "}", "/*", ":host", "innerHTML", "alert("] as const;

function proseOf(segments: readonly StyledHoldSegment[]): string {
  return segments.map((segment) => (segment.kind === "text" ? segment.text : "")).join("");
}

test.each<readonly [string, string, readonly StyledHoldSegment[]]>([
  ["a style at line start", "<style>\n.a{b:c}\n\n.d{e:f}\n</style>\nAfter.", [HELD, prose("After.")]],
  ["a style after the panel's tag on the same line", `${PANEL}\n\nAfter.`, [HELD, prose("\nAfter.")]],
  ["a style after text on the same line", "He waits. <style>\n.a{b:c}\n\n<div>x</div>\n\n.d{e:f}\n</style>\nAfter.", [prose("He waits. \nAfter.")]],
  ["a style two elements deep", "<section>\n<div><style>\n.a{b:c}\n\n.d{e:f}\n</style></div>\n</section>\nAfter.", [HELD, prose("After.")]],
  ["a style in a block a close tag opens", "</div><style>\n.a{b:c}\n\n.d{e:f}\n</style>\nAfter.", [HELD, prose("After.")]],
  ["a style after an inline void tag", '<img src="x.png"><style>\n.a{b:c}\n\n.d{e:f}\n</style>\nAfter.', [prose('<img src="x.png">\nAfter.')]],
  ["a style in a block a lone void tag opens", "<hr>\n<style>\n.a{b:c}\n\n.d{e:f}\n</style>\nAfter.", [HELD, prose("After.")]],
  ["a script at line start", "<script>\nconst a = 1;\n\nalert(a);\n</script>\nAfter.", [HELD, prose("After.")]],
  [
    "a script after the panel's tag, whose text spells the panel's close",
    "<div><script>\nconst a = 1;\n\nel.innerHTML = '</div>';\n</script><b>x</b></div>\nAfter.",
    [HELD, prose("After.")],
  ],
  ["a script after text on the same line", "He waits. <script>\nconst a = {b: 1};\n\n<div>\n\nalert(a);\n</script>\nAfter.", [prose("He waits. \nAfter.")]],
  ["a script in a block a close tag opens", "</div><script>\nconst a = 1;\n\nalert(a);\n</script>\nAfter.", [HELD, prose("After.")]],
  ["an uppercase style after text", "He waits. <STYLE>\n.a{b:c}\n\n<p>x</p>\n\n.d{e:f}\n</STYLE>\nAfter.", [prose("He waits. \nAfter.")]],
  ["an uppercase panel and style", "<DIV><STYLE>\n.a{b:c}\n\n.d{e:f}\n</STYLE></DIV>\nAfter.", [HELD, prose("After.")]],
  ["a style whose close has not arrived, after text", "He waits. <style>\n.a{b:c}\n\n<p>x</p>\n\n.d{e:", [prose("He waits. ")]],
  ["a style whose close has not arrived, in a panel", "Before.\n\n<div><style>\n.a{b:c}\n\n.d{e:", [prose("Before.\n\n"), HELD]],
  ["two style elements in one block", "</div><style>\n.a{b:c}\n\n.d{e:f}\n</style>\n<style>\n.g{h:i}\n\n.j{k:l}\n</style>\nAfter.", [HELD, prose("After.")]],
  [
    "a style inside a details panel that continues after the style closes",
    "<details><summary>S</summary><style>\n.a{b:c}\n\n.d{e:f}\n</style>\nHidden body\n\nMore hidden\n</details>\nAfter.",
    [HELD, prose("After.")],
  ],
])("the hold reads %s as one unit", (_name, content, expected) => {
  const segments = scanStyledHold(content);
  expect(segments).toEqual(expected);
  expect(SOURCE_MARKERS.filter((marker) => proseOf(segments).includes(marker))).toEqual([]);
});

test("the panel's prose before and after it still streams, and the panel is one held block", () => {
  const segments = scanStyledHold(`She sets down her goblet.\n\n${PANEL}\n\nShe waits.`);
  expect(segments).toEqual([prose("She sets down her goblet.\n\n"), HELD, prose("\nShe waits.")]);
  expect(JSON.stringify(segments)).not.toMatch(/hud|Tracker|margin/u);
});

test.each<readonly [string, string, string]>([
  [
    "a style whose text holds blank lines",
    `Before. ${PANEL} After.`,
    'Before. <div class="hud"><details class="hud"><summary>Tracker</summary><div>Row one</div></details></div> After.',
  ],
  ["an uppercase style", "a<STYLE>\n.x{}\n\n.y{}</STYLE>b", "ab"],
  ["a close with space before its bracket", "a<style>.x{}</style >b", "ab"],
  ["a style opener quoted inside another tag's attribute is no element", '<b title="<style>">kept</b> and kept', '<b title="<style>">kept</b> and kept'],
  ["a style inside a comment is no element", "<!-- <style> -->kept</style>", "<!-- <style> -->kept</style>"],
  ["a style after a comment opener that never closes", "a <!-- b <style>x{}</style>c", "a <!-- b c"],
  ["an unclosed script is removed to the end", "a<script>\nlet x = 1;\n\nlet y", "a"],
])("stripping removes %s exactly", (_name, text, expected) => {
  expect(stripStyleElements(text)).toBe(expected);
});

test("a lenient card keeps its whole stylesheet: a blank line inside the style does not cut the card", () => {
  const card = ['<div class="hud">', "<style>", ".a{b:c}", "", ".d{e:f}", "</style>", "<details><summary>S</summary></details>", "</div>"].join("\n");
  const spans = tokenizeContent(`${card}\n\nAfter.`, { lenientHtml: true, committed: true });
  expect(spans.map((span) => span.kind)).toEqual(["card", "text"]);
  expect(spans[0]?.kind === "card" ? spans[0].body : "").toBe(card);
  expect(spans.filter((span) => span.kind === "text").map((span) => span.text)).toEqual(["\n\nAfter."]);
});

test("the elements are read from their opener to just past their close", () => {
  const text = `x${PANEL}y<script>z`;
  const [style, script] = rawTextElements(text);
  expect(style === undefined ? "" : text.slice(style.start, style.end)).toMatch(/^<style>:host[\s\S]*<\/style>$/u);
  expect(style === undefined ? "" : text.slice(style.bodyStart, style.bodyEnd)).not.toContain("<");
  expect(script).toEqual({ name: "script", start: text.length - 9, bodyStart: text.length - 1, bodyEnd: text.length, end: text.length, closed: false });
});

test("the frame's lift takes out each closed element's text, keeps its tags, and leaves a fenced sample and an unclosed element alone", () => {
  const mark = "\u{E000}";
  const fenced = "```html\n<style>\n.x{}\n\n.y{}\n</style>\n```";
  const { text, bodies } = liftRawTextBodies(`${PANEL}\n\n${fenced}\n\n<script>let a;</script><style>.open{`, mark);
  expect(bodies).toEqual([PANEL.slice(PANEL.indexOf(">", PANEL.indexOf("<style")) + 1, PANEL.indexOf("</style>")), "let a;"]);
  expect(text).toBe(
    `<div class="hud"><style>${mark}0${mark}</style><details class="hud"><summary>Tracker</summary><div>Row one</div></details></div>\n\n${fenced}\n\n<script>${mark}1${mark}</script><style>.open{`,
  );
});

const PANEL_STYLE = "<style>.c{}\n\n.d{color:blue}</style>";
const PANEL_BODY = ".c{}\n\n.d{color:blue}";

test.each([
  ["an unclosed sample in a code block", "```css\n<style>\n.sample{}\n```"],
  ["a sample that names a close only in prose after it", "```html\n<style>.s{}\n```\nthe close is </style>"],
  ["a style whose text holds a code block marker line", "<div><style>.a{}\n```\n\n.b{}</style></div>"],
  ["an inline code span naming only the opener", "Use `<style>` to style it."],
])("the frame's lift still takes a later panel's stylesheet after %s", (_name, before) => {
  const mark = "\u{E000}";
  const { text, bodies } = liftRawTextBodies(`${before}\n\n<div>${PANEL_STYLE}</div>`, mark);
  const panel = bodies.indexOf(PANEL_BODY);
  expect(panel).not.toBe(-1);
  expect(text.endsWith(`<div><style>${mark}${String(panel)}${mark}</style></div>`)).toBe(true);
});

test.each([
  ["inline code naming both tags", "Use `<style>` and then ` </style>` tags.", []],
  ["a double-tick span holding the whole element", "``<style>a`b</style>`` after", []],
  ["a tick run with no closer of its length", "a `` b <style>x`y</style>", ["x`y"]],
  ["a span the blank line ends before its closer", "a `b\n\n<style>c`d</style>", ["c`d"]],
  ["a script holding a template literal", "<script>const a = `x`;\n\nrun(a);</script>", ["const a = `x`;\n\nrun(a);"]],
])("the frame's lift reads code spans as Markdown does: %s", (_name, body, expected) => {
  expect(liftRawTextBodies(body, "\u{E000}").bodies).toEqual(expected);
});

test.each([
  ["behind a backslash escape", "\\<script>VISIBLE</script>"],
  ["inside a textarea", "<textarea><style>CSS</style></textarea>"],
  ["after an escaped opener, inside the textarea it does not swallow", "\\<style><textarea></style><script>s</script>"],
  ["inside a title", "<title><script>s</script></title>"],
  ["after plaintext", "<plaintext><style>x</style>"],
  ["in a tilde code block", "~~~\n<style>.x{}</style>\n~~~"],
  ["in a longer tick fence a shorter one does not close", "````\n```\n<style>.x{}</style>\n````"],
  ["in an indented code block", "Sample:\n\n    <style>.x{}</style>"],
])("the frame reads no element %s", (_name, body) => {
  expect(liftRawTextBodies(body, "\u{E000}").bodies).toEqual([]);
  expect(frameStyleElements(body)).toEqual([]);
});

test.each([
  ["a comment opener in a code span", "`<!--` <style>CSSMARK{}</style> `-->` after", "`<!--`  `-->` after"],
  ["a sample in a code span", "Use `<style>x{}</style>` here <style>y{}</style>.", "Use `<style>x{}</style>` here ."],
  ["an escaped opener", "\\<style>shown</style> <style>z{}</style>", "\\<style>shown</style> "],
])("stripping keeps code and escapes as written: %s", (_name, text, expected) => {
  expect(stripStyleElements(text)).toBe(expected);
});

test("tag stripping leaves a code block and a code span as written", () => {
  const sample = "```html\n<style>h1{}\n\n</style>\n<h1>Hi</h1>\n```";
  expect(stripTags(`<b>Bold</b>\n\n${sample}\n\nUse \`<i>\` <i>here</i>.`)).toBe(`Bold\n\n${sample}\n\nUse \`<i>\` here.`);
});

test.each([
  ["many unclosed style opens", "<style ".repeat(60_000)],
  ["many closed styles", "<style>a{}</style>".repeat(40_000)],
  ["many style opens inside one script", `<script>${"<style>".repeat(60_000)}`],
  ["many comment opens", "<!--".repeat(100_000)],
  ["a long opener line with an unbalanced quote", `<style a="${"b".repeat(400_000)}`],
  ["many blank lines inside one style after text", `He waits. <style>${"\n\n<div>".repeat(60_000)}`],
  ["many code block marker lines between styles", "```\n<style>a{}</style>\n".repeat(20_000)],
  ["many tick runs before one style", `${"`a``b".repeat(50_000)}<style>x{}</style>`],
])("%s is read in linear time", (_name, body) => {
  const started = performance.now();
  scanStyledHold(body);
  stripStyleElements(body);
  tokenizeContent(body, { lenientHtml: true, committed: true });
  liftRawTextBodies(body, "\u{E000}");
  expect(performance.now() - started).toBeLessThan(BUDGET_MS);
});
