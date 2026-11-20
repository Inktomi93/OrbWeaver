// The kit's Markdown reading follows the renderer's own parse on the shapes where they once disagreed: math reads as
// code reads, HTML's whitespace and comment rules hold, an svg ends where HTML ends it, and the frame's hold keeps each
// held element whole. A streamed transcript repairs the text's tail before it parses, so the strips and the macro read
// settle a run that repair can change on the safe side.
// @subject packages/kit/src/content/index.ts

import {
  frameStyleElements,
  heldBlockRanges,
  holdBlocksWhole,
  liftRawTextBodies,
  markdownCodeAfterMacros,
  modelPanels,
  paragraphBreaks,
  stripStyleElements,
  stripUnreadElements,
} from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const NBSP = String.fromCodePoint(0xa0);
const MARK = "\u{E000}";
const CSS = ".q{color:red}";
const STYLE = `<style>${CSS}</style>`;

test.each([
  ["inline math", `$a ${STYLE}$`],
  ["a math fence", `$$\n${STYLE}\n$$`],
])("a stylesheet inside %s is math text, which the frame carries as no stylesheet", (_name, body) => {
  expect(frameStyleElements(body)).toEqual([]);
});

test("a macro inside math is shown as written, as one in code is", () => {
  const body = "$${{user}}$$ and $a{{user}}$";
  expect(markdownCodeAfterMacros(body).map((range) => body.slice(range.start, range.end))).toEqual(["{{user}}$$", "{{user}}$"]);
});

test("math that opens first takes the tick run inside it, so no code span names a later macro", () => {
  expect(markdownCodeAfterMacros("$x `y$ {{user}}`")).toEqual([]);
});

test("a line of non-breaking spaces is text to Markdown, so it ends no paragraph", () => {
  expect(paragraphBreaks(`a\n${NBSP}\nb`)).toEqual([]);
  expect(paragraphBreaks("a\n \nb")).toEqual([{ start: 1, end: 4 }]);
});

test.each([
  ["no tag name, so the opener is no style element", `<style${NBSP}>${CSS}</style>`],
  ["no close tag's name, so the style runs on unclosed", `<style>${CSS}</style${NBSP}>b`],
])("a non-breaking space ends %s", (_name, body) => {
  expect(frameStyleElements(body)).toEqual([]);
});

test.each([
  ["`<!-->`", "<!--> <script>leak()</script> -->"],
  ["`<!--->`", "<!---> <script>leak()</script> -->"],
])("%s is a whole comment, so the script after it is stripped", (_name, body) => {
  expect(stripUnreadElements(body)).not.toContain("leak()");
});

test("a backslash on an HTML block's line is a character, so the stylesheet after it is carried", () => {
  expect(frameStyleElements(`<div>\n\\${STYLE}\n</div>`)).toEqual([{ css: CSS }]);
});

test("a macro in a math fence the streamed block split may cut is no code: that cut reads the rest as Markdown", () => {
  expect(markdownCodeAfterMacros("$$\na $$ b\n\n{{user}}\n$$")).toEqual([]);
  const fenced = "```\na $$ b\n\n{{user}}\n```";
  expect(markdownCodeAfterMacros(fenced).map((range) => fenced.slice(range.start, range.end))).toEqual(["{{user}}\n```"]);
});

// The streamed block split cuts a paragraph where Markdown runs it on: at a line of non-breaking spaces in a list item,
// or at a line opening with a tag or a fence run. So a span or, for the strips, a comment across such a line is in doubt.
test.each([
  ["a line of non-breaking spaces in a list item", `- \`a\n${NBSP}\n{{user}}\``],
  ["a line opening with a fence run whose info holds a tick", `- \`\`{{user}}\`\n\`\`\`js {{x}}<!--${NBSP}word \`\n- <div>`],
])("a macro in a span across %s is no code", (_name, body) => {
  expect(markdownCodeAfterMacros(body)).toEqual([]);
});

test("the strips read a span across a line opening with a tag as in doubt, so the element after it is stripped", () => {
  expect(stripUnreadElements("a ```b\n</b><textarea>```")).toBe("a ```b\n</b>");
  expect(stripUnreadElements("a ```b\nc<textarea>```")).toBe("a ```b\nc<textarea>```");
});

test("positive control: a macro in a span on one line is code", () => {
  const body = "- `a {{user}}`";
  expect(markdownCodeAfterMacros(body).map((range) => body.slice(range.start, range.end))).toEqual(["{{user}}`"]);
});

test("a text element outside an HTML block covers no line: an HTML block after it holds the fence line", () => {
  expect(markdownCodeAfterMacros("{{user}}<textarea>\n<section></textarea></div>\n~~~</details>\n</response>* <!--```js {{x}}")).toEqual([]);
  const fenced = "{{user}}\n~~~\n{{x}}";
  expect(markdownCodeAfterMacros(fenced).map((range) => fenced.slice(range.start, range.end))).toEqual(["{{x}}"]);
});

test("the strips take what either reading of a math fence finds: as math, a tilde line in it opens no code", () => {
  expect(stripUnreadElements("$$\n~~~\n$$\n<textarea>a</textarea>")).toBe("$$\n~~~\n$$\n");
});

test("a comment across a line break ends there for the strips", () => {
  expect(stripStyleElements(`- a <!--\n${NBSP}\nb ${STYLE}-->`)).toBe(`- a <!--\n${NBSP}\nb -->`);
  expect(stripStyleElements(`- a <!-- b ${STYLE}-->`)).toBe(`- a <!-- b ${STYLE}-->`);
});

test("a comment opener in a doubtful textarea leaves the rest of its paragraph opening no span", () => {
  expect(stripStyleElements(`a <textarea><!--\n$$-->${STYLE}</textarea>$$`)).toBe("a <textarea><!--\n$$--></textarea>$$");
});

test("a tag name a non-breaking space ends is no tag to Markdown, so its line opens no HTML block", () => {
  expect(heldBlockRanges(`<style${NBSP}>\n  $$\n<div>a</div>`)).toEqual([]);
  expect(heldBlockRanges("<b>\n  $$\n<div>a</div>")).toEqual([{ start: 9, end: 21 }]);
});

test("the lift leaves a body whose sign keeps a fence run before it from opening a fence", () => {
  expect(liftRawTextBodies("$$ <script>$</script>\nb", MARK).bodies).toEqual([]);
  expect(liftRawTextBodies("> $$ <script>$</script>\nb", MARK).bodies).toEqual([]);
  expect(liftRawTextBodies("a <script>$</script>\nb", MARK).bodies).toEqual(["$"]);
  expect(liftRawTextBodies("a $$ <script>$</script>\nb", MARK).bodies).toEqual(["$"]);
  // Inside an HTML block the line opens no fence, so the lift takes the body.
  expect(liftRawTextBodies("<div>\n$$ <script>$</script>\n</div>", MARK).bodies).toEqual(["$"]);
});

test("the frame's HTML block runs on past a held element's close to a blank line, so a line in it is no code", () => {
  // Unheld, the heading line ends the paragraph and the indented line is code; held, the block runs on over it.
  expect(markdownCodeAfterMacros("<div>\na\n\n# h</div>\n    {{user}}")).toEqual([]);
  const apart = "<div>\na\n\n# h</div>\n\n    {{user}}";
  expect(markdownCodeAfterMacros(apart).map((range) => apart.slice(range.start, range.end))).toEqual(["{{user}}"]);
});

test("a macro on a fence's info line is no code: the renderer shows the info as a label", () => {
  expect(markdownCodeAfterMacros("```js {{x}}\ncode\n```")).toEqual([]);
});

test("a macro in indented code a tag on its line skipped is still named code", () => {
  const body = "    <b>{{user}}";
  expect(markdownCodeAfterMacros(body).map((range) => body.slice(range.start, range.end))).toEqual(["{{user}}"]);
});

// HTML ends a tag name only at a space, a tab, a line break, a slash or `>`: past a non-breaking space the name runs on,
// and the quote it takes in opens no value, so the style attribute after it is the element's.
test.each([
  ["a non-breaking space, which the name takes", `<!-- c --><p${NBSP}a=" style=c:d">x</p>`, [{ start: 0, end: 33 }]],
  ["a space, which ends the name", '<!-- c --><p a=" style=c:d">x</p>', []],
])("a quoted style after %s", (_name, body, panels) => {
  expect(modelPanels(body)).toEqual(panels);
});

test.each([
  ["a leading comment", '<!-- c --><div style="c:d">x</div>', [{ start: 0, end: 34 }]],
  ["a comment then words", '<!-- c -->word <div style="c:d">x</div>', []],
])("a styled block opened after %s", (_name, body, panels) => {
  expect(modelPanels(body)).toEqual(panels);
});

test.each([
  ["a breakout tag", "a <svg><p>x</p></svg> b", []],
  ["a paragraph end", "a <svg>\n\nb</svg>", []],
  ["a breakout tag inside an integration point", "a <svg><foreignObject><div>x</div></foreignObject></svg> b", [{ start: 2, end: 56 }]],
])("an inline svg past %s", (_name, body, panels) => {
  expect(modelPanels(body)).toEqual(panels);
});

test.each([
  ["an unclosed comment in an HTML block, to that block's end", `<div><!-- x\n${STYLE}\n\n<style>.b{}</style>`, [{ css: ".b{}" }]],
  ["an unclosed textarea", `a <textarea>b ${STYLE}`, []],
])("the frame carries no stylesheet that %s swallows", (_name, body, sheets) => {
  expect(frameStyleElements(body)).toEqual(sheets);
});

test.each([
  ["a textarea", "<div>\n<textarea>a\n\nb</textarea>\n</div>", "<div>\n<textarea>a&#10;\nb</textarea>\n</div>"],
  ["a textarea with CRLF lines", "<div>\r\n<textarea>a\r\n\r\nb</textarea>\r\n</div>", "<div>\r\n<textarea>a&#10;\r\nb</textarea>\r\n</div>"],
])("a blank line inside %s in a held element becomes a decoded break, so the element stays one block", (_name, body, held) => {
  expect(holdBlocksWhole(body)).toBe(held);
});

test.each([
  ["an unclosed stylesheet, to the end", "<div><style>.a{}\n\n.b{}", [".a{}\n\n.b{}"]],
  ["an xmp, whose text is never decoded", "<div><xmp>a\n\nb</xmp></div>", ["a\n\nb"]],
  ["no unclosed xmp, so a stylesheet after it is still its own", `<xmp>a\n\n${STYLE}`, [CSS]],
])("the frame's lift takes %s", (_name, body, bodies) => {
  expect(liftRawTextBodies(body, MARK).bodies).toEqual(bodies);
});

test.each([
  ["a list item", "- x\n\n  <div>\n  a\n\n  b\n  </div>", []],
  ["a pre block that ends on the line", "<pre><pre>\n<div><p>x</pre>\n\ny", []],
  ["the margin, under a quote's lines", "<div>\n> a\n\n> b</div>", [{ start: 0, end: 20 }]],
])("a block element opened in %s", (_name, body, ranges) => {
  expect(heldBlockRanges(body)).toEqual(ranges);
});

// The streamed transcript's repair (remend) closes math opened on the last line on that line and lengthens a final
// run that has no partner, and its block split keeps a math fence whole only while the block holds an odd count of
// `$$`, so the read there is in doubt.
test.each([
  ["math opened on the last line, which ends the paragraph above it", "``a<style>b\n$$c``", "``a"],
  ["a final dollar run the repair lengthens, so it closes nothing", `x $ ${STYLE} $$ y $`, "x $  $$ y $"],
  ["a math fence the block split cuts after a `$$` in its text", `>\n$$    >\n---\\<pre>1. $$\t- >\n${STYLE}`, ">\n$$    >\n---\\<pre>1. $$\t- >\n"],
])("the strips read %s", (_name, body, stripped) => {
  expect(stripUnreadElements(body)).toBe(stripped);
  expect(stripStyleElements(body)).toBe(stripped);
});

// A text element may hold no text: inside an svg it is an svg element, and outside an HTML block the renderer's raw
// step reads markup again at the next Markdown element. So the strips find the markup in its text, and a comment
// opener there hides nothing.
test.each([
  ["a textarea inside an svg", `<div><svg><textarea>${STYLE}</textarea></svg></div>`, "<div><svg><textarea></textarea></svg></div>"],
  ["a title inside an svg, which reads HTML", `<div><svg><title>${STYLE}</title></svg></div>`, "<div><svg><title></title></svg></div>"],
  ["a comment opener inside a textarea", `a <textarea><!--</textarea>${STYLE}-->`, "a <textarea><!--</textarea>-->"],
  [
    "a textarea in a list item, read on past the item",
    "\n1. #\n1. <textarea>\t</svg>\n\n<response><details></b><svg>\n\nrun()<script>~~~$$> \n#* </textarea>$5",
    "\n1. #\n1. <textarea>\t</svg>\n\n<response><details></b><svg>\n\nrun()",
  ],
])("the stylesheet strip reads markup in %s", (_name, body, stripped) => {
  expect(stripStyleElements(body)).toBe(stripped);
});

test("positive control: the stylesheet strip keeps a textarea's text that holds no element", () => {
  expect(stripStyleElements("<div><textarea>a <b</textarea></div>")).toBe("<div><textarea>a <b</textarea></div>");
});

test("the stylesheet strip reads math opened on the last line as text, as the repaired parse does", () => {
  expect(stripStyleElements(`a\n\n$$b${STYLE}`)).toBe("a\n\n$$b");
});

test.each([
  ["a final tick run the repair lengthens", "a ```` b\nc `{{user}}`", []],
  ["a tick run inside an element's text, which Markdown may still pair", "a <textarea>```x</textarea> ```{{user}}```", []],
  ["the rest of an escaped tick run, which opens a span of its own", "\\````a ```b {{user}} ```", []],
])("the macro read names no code past %s", (_name, body, stretches) => {
  expect(markdownCodeAfterMacros(body)).toEqual(stretches);
});

test("a final tick run every run of its kind pairs with stays a closer", () => {
  const body = "Use `{{user}}`";
  expect(markdownCodeAfterMacros(body).map((range) => body.slice(range.start, range.end))).toEqual(["{{user}}`"]);
});

test("positive controls: a space ends a tag name, and a comment closed past a script hides it", () => {
  expect(frameStyleElements(`<style >${CSS}</style >`)).toEqual([{ css: CSS }]);
  expect(stripUnreadElements("<!-- <script>hidden()</script> -->")).toContain("hidden()");
});
