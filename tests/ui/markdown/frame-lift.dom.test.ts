// A framed reply's style and script texts are lifted out for the Markdown parse and put back after it: each text goes
// back as it was wherever the parse put it, escaped as text or attribute value, never as markup. A block-level panel
// parses whole: blank lines and indented lines inside one stay the panel's own HTML, and the prose round it stays
// Markdown.
// @subject packages/ui/src/markdown/frame/raw-text-lift.ts
// @subject packages/ui/src/markdown/frame/frame-markdown.tsx
// @subject packages/client/src/lib/message-render.ts

import type { RegexScriptRow } from "@orb/contracts/regex";
import { frameStyleElements, stripStyleElements, tokenizeContent } from "@orb/kit/content";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { NO_SEATS } from "@orb/kit/message-author";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { FrameMarkdown } from "@orb/ui/frame-markdown";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DisplayRowCall, MessageRenderContext } from "#client/lib/message-render.ts";
import { renderMessageForDisplay } from "#client/lib/message-render.ts";
import { FrameDocumentContext } from "../../../packages/ui/src/markdown/frame/frame-document-context.ts";
import { liftRawText } from "../../../packages/ui/src/markdown/frame/raw-text-lift.ts";

const PRIVATE_USE_RE = /\p{Co}/u;
// The mark the lift writes around a reply's first text, read from its own output for a reply naming no private-use
// character.
const MARK = PRIVATE_USE_RE.exec(liftRawText("<div><style>a{}</style></div>").text)?.[0] ?? "";
const HEX = (MARK.codePointAt(0) ?? 0).toString(16).toUpperCase();
const DECIMAL = String(MARK.codePointAt(0) ?? 0);
// The shape the lift writes for the first body, typed by the reply itself.
const FORGED_STAND_IN = `${MARK}0${MARK}`;
// Every private-use character of the Basic Multilingual Plane.
const EVERY_BMP_PRIVATE_USE = Array.from({ length: 0x1_00_00 }, (_, code) => String.fromCodePoint(code))
  .filter((char) => PRIVATE_USE_RE.test(char))
  .join("");

function framed(markdown: string): string {
  // biome-ignore lint/correctness/noChildrenProp: FrameMarkdown's children are a required string prop, which createElement's rest argument cannot satisfy in a JSX-free file.
  return renderToStaticMarkup(createElement(FrameDocumentContext, { value: true }, createElement(FrameMarkdown, { colorQuotes: false, children: markdown })));
}

test.each([
  ["a style", '<div class="hud"><style>.a{color:red}\n\n.b{color:blue}</style><p>x</p></div>', "<style>.a{color:red}\n\n.b{color:blue}</style>"],
  ["a script", "<div><script>let a = 1;\n\nlet b = 2;</script></div>", "<script>let a = 1;\n\nlet b = 2;</script>"],
])("%s holding a blank line goes back whole into its element", (_name, markdown, element) => {
  const html = framed(markdown);
  expect(html).toContain(element);
  expect(html).not.toMatch(/<p[^>]*>(?:\.b\{|let b)/u);
});

test.each([
  ["after a backslash escape", "\\<style>secret</style> visible", "&lt;style&gt;secret visible"],
  ["inside a textarea", "<textarea><style><b>x</b></style></textarea>", "<textarea>&lt;style&gt;&lt;b&gt;x&lt;/b&gt;&lt;/style&gt;</textarea>"],
  ["in a link title", '[x](http://a "<style><b>t</b></style>")', 'title="&lt;style&gt;&lt;b&gt;t&lt;/b&gt;&lt;/style&gt;"'],
  ["in an image alt", "![<style>a</style>](http://bad.invalid/x.png)", 'alt="&lt;style&gt;a&lt;/style&gt;"'],
])("a text the parse kept as text goes back as escaped text %s", (_name, markdown, shown) => {
  const html = framed(markdown);
  expect(html).toContain(shown);
  expect(html).not.toContain("<b>");
  expect(html).not.toContain(MARK);
});

test("a text holding a quote and a close goes back inside its attribute value", () => {
  const html = framed('[x](http://a (<style>q" onmouseover="alert(1)" x></style>))');
  expect(html).toContain('title="&lt;style&gt;q&quot; onmouseover=&quot;alert(1)&quot; x&gt;&lt;/style&gt;"');
  expect(html).not.toMatch(/\sonmouseover="/u);
});

test("a text holding a comment's end goes back inside the comment, which ends nowhere early", () => {
  const html = framed("Before.\n\n<!--\n<style>a{}--!><b>x</b></style>");
  expect(html).toContain("Before.");
  expect(html).not.toContain("<b>");
});

test("inline code naming both tags stays two code spans", () => {
  const html = framed("Use `<style>` and then ` </style>` tags.");
  expect(html.match(/<code[\s>]/gu)).toHaveLength(2);
  expect(html).toMatch(/<\/code> and then <code/u);
});

test("a style in a tilde code block goes back whole into the code", () => {
  const html = framed("~~~\n<style>.x{}\n\n.y{}</style>\n~~~");
  expect(html).toContain("&lt;style&gt;.x{}");
  expect(html).toContain(".y{}&lt;/style&gt;");
  expect(html).not.toContain(MARK);
});

test("a reply's own stand-in shape prints as it was typed", () => {
  const html = framed(`lit ${FORGED_STAND_IN} <div><style>.a{}\n\n.b{}</style></div>`);
  expect(html).toContain(`lit ${FORGED_STAND_IN}`);
  expect(html).toContain("<style>.a{}\n\n.b{}</style>");
});

test("the mark is a private-use character", () => {
  expect(MARK).toMatch(PRIVATE_USE_RE);
});

test("a reply holding every private-use character still has its stylesheet go back whole, under a mark of two", () => {
  const html = framed(`${EVERY_BMP_PRIVATE_USE}\n\nlit ${FORGED_STAND_IN} <div><style>.a{}\n\n.b{}</style></div>`);
  expect(html).toContain(`lit ${FORGED_STAND_IN}`);
  expect(html).toContain("<style>.a{}\n\n.b{}</style>");
  expect(html).not.toMatch(/<p[^>]*>\.b\{/u);
});

// Every private-use character named by reference, so no single character is free, in a 4 MB-class reply.
const EVERY_PRIVATE_USE_NAMED = (EVERY_BMP_PRIVATE_USE.match(/\p{Co}/gu) ?? []).map((char) => `&#x${(char.codePointAt(0) ?? 0).toString(16)};`).join(" ");

// The pair the lift marks `text` with when no single private-use character is free.
function pairMark(text: string): string {
  return /(\p{Co}{2})0\1/u.exec(liftRawText(text).text)?.[1] ?? "";
}

test("a reply naming every private-use character by reference is lifted under a pair it never spells", () => {
  const reply = `${EVERY_PRIVATE_USE_NAMED}\n\n${PANEL}`;
  expect(pairMark(reply)).toHaveLength(2);
  expect(framed(reply)).toContain(`<style>${PANEL_BODY}</style>`);
});

test("a reply spelling that pair's stand-in by reference prints it as written and captures no text", () => {
  const reply = `${EVERY_PRIVATE_USE_NAMED}\n\n${PANEL}`;
  const named = (pairMark(reply).match(/\p{Co}/gu) ?? []).map((char) => `&#x${(char.codePointAt(0) ?? 0).toString(16)};`).join("");
  const html = framed(`${reply}\n\n<code>${named}0${named}</code>`);
  expect(html.split(".real{").length).toBe(2);
  expect(html).toContain(`<style>${PANEL_BODY}</style>`);
});

const PANEL = "<div><style>.real{color:red}\n\n.tail{}</style></div>";
const PANEL_BODY = ".real{color:red}\n\n.tail{}";

test.each([
  ["a hex reference", `&#x${HEX};0&#x${HEX};`, `${MARK}0${MARK}`],
  ["a decimal reference with no semicolon", `&#${DECIMAL} 0&#${DECIMAL} `, `&amp;#${DECIMAL} 0&amp;#${DECIMAL} `],
  ["an escaped reference", `&amp;#x${HEX};0&amp;#x${HEX};`, `&amp;#x${HEX};0&amp;#x${HEX};`],
  ["a twice-escaped reference", `&amp;amp;#x${HEX.toLowerCase()};0&amp;amp;#x0${HEX};`, `&amp;amp;#x${HEX.toLowerCase()};0&amp;amp;#x0${HEX};`],
])("a stand-in spelled as %s is printed as written and captures no text", (_name, forged, shown) => {
  const html = framed(`${PANEL}\n\n<code>${forged}</code>`);
  expect(html).toMatch(new RegExp(`<code[^>]*>${RegExp.escape(shown)}</code>`, "u"));
  expect(html).toContain(`<style>${PANEL_BODY}</style>`);
  expect(html.split(".real{").length).toBe(2);
});

test("a reference HTML decodes without its semicolon is printed as decoded and captures no text", () => {
  const html = framed(`${PANEL}\n\n<div>&#${DECIMAL} 0&#${DECIMAL} x</div>`);
  expect(html).toContain(`<div>${MARK} 0${MARK} x</div>`);
  expect(html.split(".real{").length).toBe(2);
});

test.each([`&amp;#x${HEX};`, `#${DECIMAL}`, `#x0${HEX.toLowerCase()}`])("the mark is never a character the reply names as %s", (named) => {
  expect(liftRawText(`${named} <div><style>a{}</style></div>`).text).not.toContain(MARK);
});

// A real stylesheet's size, so a body copied once per forged stand-in would dwarf the reply.
const LARGE_BODY = ".row{color:red}\n\n".repeat(120);

test.each([
  ["60 KB", 60_000],
  ["200 KB", 200_000],
])("a reply of %s of forged stand-ins renders no larger than one copy of its bodies over its parse", (_name, size) => {
  const forged = `<code>&#x${HEX};0&#x${HEX};</code>`;
  const reply = `<div><style>${LARGE_BODY}</style></div>\n\n${forged.repeat(Math.ceil(size / forged.length))}`;
  const control = framed(reply.replaceAll(`&#x${HEX};`, "x"));
  expect(framed(reply).length).toBeLessThanOrEqual(control.length + LARGE_BODY.length);
});

test("a stand-in the parse copies goes back once and its copies drop", () => {
  const html = framed('[x]: http://a "<style>only-once</style>"\n\n[a][x] then [b][x]');
  expect(html.split("only-once").length).toBe(2);
  expect(html).not.toContain(MARK);
});

// KaTeX can make any character and joins this into one text node. Streamdown runs math after the caller's rehype
// steps, so the restore never sees it; if that order changed, the math's characters would be read as a stand-in.
test("math renders after the restore, so a stand-in it makes prints as made", () => {
  const html = framed(`${PANEL}\n\n$\\text{\\char"${HEX}\\relax0\\char"${HEX}}$`);
  expect(html).toContain(`<style>${PANEL_BODY}</style>`);
  expect(html).toMatch(new RegExp(`>${MARK}0${MARK}<`, "u"));
});

// A panel indented inside a list item or a block quote sits in its container's text, not in indented code: indented
// code starts four columns past the container's content. The renderer builds it, so the lift keeps its stylesheet
// whole, the runs carry it, and the inert strip removes it.
test.each([
  ["a bulleted item", `- item\n\n    ${PANEL}`],
  ["a numbered item", `1. Step one\n\n    ${PANEL}`],
  ["a nested item", `- a\n\n  - b\n\n      ${PANEL}`],
  ["a tab-indented item", `-\titem\n\n\t${PANEL}`],
  ["a block quote", `> Intro\n>\n>   ${PANEL}`],
  ["a list in a block quote", `> - item\n>\n>     ${PANEL}`],
  ["a block quote in an item", `- item\n\n    > ${PANEL}`],
  ["the line after an item that held a fence", `- \`\`\`\n  sample\n\n${PANEL}`],
  ["a block-level HTML block's indented line", `<div>\n>     ${PANEL}`],
  ["a pre block, past a blank line", `<pre>\n\n    ${PANEL}\n</pre>`],
  ["an item a lazy line continues", `- item\ncontinued\n\n    ${PANEL}`],
])("a panel indented in %s is a panel, not code", (_name, markdown) => {
  expect(framed(markdown)).toContain(`<style>${PANEL_BODY}</style>`);
  expect(frameStyleElements(markdown).map(({ css }) => css)).toEqual([PANEL_BODY]);
  expect(stripStyleElements(markdown)).not.toContain(".real{");
});

// Code in a container: four columns past its content, or a fence it holds. The renderer prints the sample as written.
test.each([
  ["at the top level", "Sample:\n\n    <style>.x{}</style>"],
  ["eight spaces into an item", "- item\n\n        <style>.x{}</style>"],
  ["five spaces after a marker", "-     <style>.x{}</style>"],
  ["four spaces past a block quote", "> Sample:\n>\n>     <style>.x{}</style>"],
  ["a fence in an item", "- item\n\n  ```\n  <style>.x{}</style>\n  ```"],
  ["a fence in a block quote", "> ```\n> <style>.x{}</style>\n> ```"],
  ["after an HTML block that closed an item", "- item\n<div>\n\n    <style>.x{}</style>"],
  ["after a pre block that closes past a comment", "<pre><!--\n\nnote\n--></pre>\n\n    <style>.x{}</style>"],
  ["on the line after a pre block's close", "<pre>\n- </pre>\n    <style>.x{}</style>"],
  ["after a pre block another raw-text close ends", "<pre>\n</style>\n\n    <style>.x{}</style>"],
])("a style sample indented as code %s stays code", (_name, markdown) => {
  expect(framed(markdown)).toContain("&lt;style&gt;.x{}&lt;/style&gt;");
  expect(frameStyleElements(markdown)).toEqual([]);
  expect(stripStyleElements(markdown)).toBe(markdown);
});

test("each reply gets its own texts back, however many replies of one shape render", () => {
  const reply = (name: string): string => `<div><style>.${name}{}\n\n.tail{}</style></div>`;
  for (const name of ["one", "two", "one"]) {
    const html = framed(reply(name));
    expect(html).toContain(`<style>.${name}{}\n\n.tail{}</style>`);
    expect(html).not.toContain(name === "one" ? ".two{}" : ".one{}");
  }
});

const INDENTED_PANEL = '<div class="hud">\n<b>HP</b> 10\n\n    <span class="row">indented</span>\n\n*as written* [[1d20: 7]]\n</div>';

test("an indented multi-paragraph panel draws as its own HTML, and the prose round it stays Markdown", () => {
  const html = framed(`Before *prose*.\n\n${INDENTED_PANEL}\n\nAfter *prose*.`);
  expect(html).toContain('<span class="row">indented</span>');
  expect(html).toContain("*as written* [[1d20: 7]]");
  expect(html).not.toContain("<pre");
  expect(html).not.toContain("&lt;span");
  expect(html.match(/<em>prose<\/em>/g)).toHaveLength(2);
});

test.each([
  ["a nested panel", '<div class="a">\n<div class="b">\n\n    inner\n\n</div>\n</div>\n\nTail *x*.', "<em>x</em>"],
  ["an unclosed panel, to the end of the reply", '<section class="s">\nopen\n\n    still inside *y*', "still inside *y*"],
])("%s holds whole", (_name, text, expected) => {
  const html = framed(text);
  expect(html).not.toContain("<pre");
  expect(html).toContain(expected);
});

test("a whole document draws its head stylesheet and its body; its html, head and body wrappers print nothing", () => {
  const html = framed(
    'Intro.\n\n<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>Status</title>\n<style>body{margin:0} .x{color:red}</style>\n</head>\n\n<body>\n<div class="x">\n\n    HP 10\n\n</div>\n</body>\n</html>\n\nOutro.',
  );
  expect(html).toContain("<style>body{margin:0} .x{color:red}</style>");
  expect(html).toContain('<div class="x">');
  expect(html).not.toContain("<pre");
  expect(html).not.toMatch(/<\/?(?:html|head|body)\b/);
  expect(html).not.toContain("&lt;");
  expect(html).toContain('<p dir="ltr">Outro.</p>');
});

test("a wrapper tag and a folding element keep their Markdown", () => {
  const html = framed("<response>\n\n*one*\n\n</response>\n\n<details><summary>S</summary>\n\n**two**\n\n</details>");
  expect(html).toContain("<em>one</em>");
  expect(html).toMatch(/<strong[^>]*>two<\/strong>/);
});

// A NAME IS DATA, NEVER MARKUP: the display pass resolves a persona's name and description as HTML data outside code,
// and keeps the macro literal inside a style or script element and an `on*` handler, so a member who owns the anchor
// persona writes no markup and no script into any viewer's frame document.
const ids = createSeededIds();
const HOSTILE_NAME = "<img src=x onerror=alert(1)>";
const HOSTILE_DESCRIPTION = '"><img src=y onerror=alert(2)>';
const REPLY: DisplayRowCall = {
  target: "AI_OUTPUT",
  row: { role: "assistant", kind: "standard", authorUserId: null, characterId: null, personaId: null },
  depth: 0,
};

function displayContext(personaName: string, displayScripts: readonly RegexScriptRow[] = []): MessageRenderContext {
  return {
    characterNamesById: new Map<CharacterId, RowCharacterName>(),
    personaNamesById: new Map<PersonaId, RowPersonaName>(),
    fallbackPersonaName: personaName,
    fallbackPersonaDescription: HOSTILE_DESCRIPTION,
    displayScripts,
    room: NO_SEATS,
  };
}

function displayScript(findRegex: string, replaceString: string): RegexScriptRow {
  return {
    id: mintTypeId(ID_PREFIX.regexScript, ids.next),
    name: findRegex,
    enabled: true,
    updatedAt: 0,
    targets: ["AI_OUTPUT"],
    passes: ["display"],
    findRegex,
    replaceString,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: 0,
  };
}

const ESCAPED_NAME = "&lt;img src=x onerror=alert(1)&gt;";

test.each([
  ["a model panel", '<div style="color:red">Hi {{user}}. <span title="{{persona}}">x</span></div>', []],
  [
    "a display script's reply",
    "[hud]",
    [displayScript(String.raw`/\[hud\]/g`, '<div style="color:red">Hi {{user}}. <span title="{{persona}}">x</span></div>')],
  ],
])("%s draws a hostile persona name and description as text in the frame document", (_name, body, scripts) => {
  const html = framed(renderMessageForDisplay(body, displayContext(HOSTILE_NAME, scripts), REPLY));
  expect(html).not.toMatch(/<img/iu);
  expect(html).toContain(`Hi ${ESCAPED_NAME}.`);
  // The description stays inside its attribute: it closes nothing.
  expect(html).toContain('title="&quot;&gt;&lt;img src=y onerror=alert(2)&gt;"');
});

test("a card fence's body takes the hostile name as text, never markup", () => {
  const text = renderMessageForDisplay(':::card title="Status"\n<p>{{user}} waits.</p>\n:::', displayContext(HOSTILE_NAME), REPLY);
  const card = tokenizeContent(text, { committed: true }).find((span) => span.kind === "card");
  expect(card?.kind === "card" ? card.body : "").toContain(`<p>${ESCAPED_NAME} waits.</p>`);
});

// The frame's Markdown drops every handler of a panel, and a card fence's body keeps its own: the display text keeps
// the macro literal in either, so no handler is ever handed the name.
test.each([
  ["the model's own handler", '<div style="color:red"><button onclick="greet(\'{{user}}\')">Go</button></div>', []],
  ["a card fence's handler", ':::card title="Go"\n<button onclick="greet(\'{{user}}\')">Go</button>\n:::', []],
  [
    "a display script's handler",
    "[go]",
    [displayScript(String.raw`/\[go\]/g`, '<div style="color:red"><button onclick="greet(\'{{user}}\')">Go</button></div>')],
  ],
])("%s keeps the macro literal", (_name, body, scripts) => {
  const text = renderMessageForDisplay(`Hi {{user}}. ${body}`, displayContext(HOSTILE_NAME, scripts), REPLY);
  expect(text).toContain("onclick=\"greet('{{user}}')\"");
  // Positive control: the same pass resolves the name outside the handler.
  expect(text).toContain(`Hi ${ESCAPED_NAME}.`);
});

test.each([
  ["a plain name", "Ann", "Hello Ann, you came."],
  ["a name with an apostrophe and an ampersand", "O'Brien & Co", "Hello O'Brien & Co, you came."],
])("ordinary prose naming %s reads as before", (_name, personaName, shown) => {
  const html = framed(renderMessageForDisplay("Hello {{user}}, you came.", displayContext(personaName), REPLY));
  expect(textOf(html)).toBe(shown);
});

// Markdown code shows its text as written, so a name there resolves plainly; anywhere code may not be what the renderer
// draws, it stays escaped.
const CODE_NAME = "O'Brien & Co";
const FENCED = "```\nName: {{user}}\n```";
const SPAN = "Say `{{user}}`.";

test.each([
  ["a fenced block", FENCED, "Name: O'Brien & Co"],
  ["a code span", SPAN, "O'Brien & Co"],
])("a name in %s reads as written on a framed row and on a plain row", (_name, body, shown) => {
  const plain = renderMessageForDisplay(body, displayContext(CODE_NAME), REPLY);
  expect(plain).toContain(shown);
  const html = framed(renderMessageForDisplay(`<div style="color:red">HUD</div>\n\n${body}`, displayContext(CODE_NAME), REPLY));
  expect(textOf(html)).toContain(shown);
  expect(html).not.toContain("&amp;#39;");
});

test.each([
  ["a fenced block", FENCED, HOSTILE_NAME],
  ["a code span", SPAN, HOSTILE_NAME],
  ["a code span, by a name that closes it", SPAN, "x` <img src=x onerror=alert(3)> `"],
  ["a fenced block, by a name that breaks its line", FENCED, "x\n```\n<img src=x onerror=alert(4)>"],
  ["a fence inside a held panel, which the frame reads as HTML", `<div style="color:red">\n\n${FENCED}\n\n</div>`, HOSTILE_NAME],
])("a hostile name in %s draws no element in the frame document", (_name, body, personaName) => {
  const html = framed(renderMessageForDisplay(`<div style="color:red">HUD</div>\n\n${body}`, displayContext(personaName), REPLY));
  // Positive control: the panel drew as markup.
  expect(html).toContain('<div style="color:red">HUD</div>');
  expect(html).not.toMatch(/<img/iu);
});

test("a hostile name in backticks in a card block's body stays escaped, since that body is HTML", () => {
  const text = renderMessageForDisplay(':::card title="Status"\nSay `{{user}}`.\n\n```\n{{user}}\n```\n:::', displayContext(HOSTILE_NAME), REPLY);
  const card = tokenizeContent(text, { committed: true }).find((span) => span.kind === "card");
  const body = card?.kind === "card" ? card.body : "";
  expect(body).toContain(`Say \`${ESCAPED_NAME}\`.`);
  expect(body).toContain(`\`\`\`\n${ESCAPED_NAME}\n\`\`\``);
});

// The text a reader sees in rendered markup: every tag dropped and every character reference read back.
function textOf(html: string): string {
  return html
    .replace(/<[^<>]*>/gu, "")
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&")
    .trim();
}
