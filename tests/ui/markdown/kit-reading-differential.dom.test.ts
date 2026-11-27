// The kit reads a reply's Markdown without a Markdown parser, so this suite holds that reading to the renderer's own
// parse on seeded random replies built from the fragments where the two once disagreed. Each axis is a security or
// layout promise the kit makes: the strips leave no element HTML reads raw for the settled render or for any streamed
// prefix, a macro the kit names as code is code to every parse, and the frame's hold keeps each held element one HTML
// block. Each axis also runs against a planted defect, so a green run proves the axis can see the class it guards.
// @subject packages/kit/src/content/index.ts

import type { Span } from "@orb/kit/chunk";
import { heldBlockRanges, holdBlocksWhole, liftRawTextBodies, markdownCodeAfterMacros, stripStyleElements, stripUnreadElements } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remend from "remend";
import { defaultRehypePlugins, parseMarkdownIntoBlocks } from "streamdown";
import { unified } from "unified";
import { MARKDOWN_MATH_PLUGIN } from "../../../packages/ui/src/markdown/math.ts";
import { MARKDOWN_REMARK_PLUGINS } from "../../../packages/ui/src/markdown/policy.ts";
import { holdAmbiguousTail } from "../../../packages/ui/src/markdown/tail-hold.ts";

// The renderer's parse: Streamdown's remark plugins with the math plugin's parse last, then raw HTML read in place.
const REMARK_PLUGINS = [...MARKDOWN_REMARK_PLUGINS, MARKDOWN_MATH_PLUGIN.remarkPlugin];
const markdownParse = unified().use(remarkParse).use(REMARK_PLUGINS);
const RAW_HTML = defaultRehypePlugins["raw"];
// Streamdown's plugin record is keyed by string, so its raw step is read by name; without it there is no renderer parse.
if (RAW_HTML === undefined) {
  throw new Error("Streamdown no longer ships its raw HTML step as defaultRehypePlugins.raw");
}
const htmlParse = unified().use(remarkParse).use(REMARK_PLUGINS).use(remarkRehype, { allowDangerousHtml: true }).use([RAW_HTML]);

interface TreeNode {
  readonly type: string;
  readonly tagName?: string | undefined;
  readonly value?: string | undefined;
  readonly position?: { readonly start: { readonly offset?: number | undefined }; readonly end: { readonly offset?: number | undefined } } | undefined;
  readonly children?: readonly TreeNode[] | undefined;
}

function* walk(node: TreeNode, ancestors: readonly TreeNode[] = []): Generator<readonly [TreeNode, readonly TreeNode[]]> {
  yield [node, ancestors];
  for (const child of node.children ?? []) {
    yield* walk(child, [...ancestors, node]);
  }
}

function markdownTree(text: string): TreeNode {
  return markdownParse.runSync(markdownParse.parse(text), text);
}

function htmlTree(text: string): TreeNode {
  return htmlParse.runSync(htmlParse.parse(text), text);
}

// HTML's elements whose text is read raw or as text, which no strip may leave standing outside code.
const UNREAD_ELEMENTS: ReadonlySet<string> = new Set(["style", "script", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
const STYLE_ELEMENTS: ReadonlySet<string> = new Set(["style", "script"]);
const CODE_TAG = "code";

function builtElements(text: string, names: ReadonlySet<string>): readonly string[] {
  return [...walk(htmlTree(text))]
    .filter(([node, ancestors]) => node.tagName !== undefined && names.has(node.tagName) && !ancestors.some((ancestor) => ancestor.tagName === CODE_TAG))
    .map(([node]) => node.tagName ?? "");
}

// ---- seeded replies

const NBSP = String.fromCodePoint(0xa0);
// Each fragment with its weight: how many times it stands in the pool a reply draws from. The weights favour the
// fragments that open what the kit reads in doubt (a text element, a comment, a math or code run, a block line).
const FRAGMENTS: readonly (readonly [fragment: string, weight: number])[] = [
  ["<style>", 2],
  [".hostile{a:b}", 1],
  ["</style>", 1],
  ["<script>", 1],
  ["run()", 1],
  ["</script>", 1],
  ["<textarea>", 3],
  ["</textarea>", 1],
  ["<title>", 1],
  ["</title>", 1],
  ["<div>", 2],
  ["</div>", 2],
  ["</div>\n", 1],
  ['<div style="c:d">', 1],
  ["<section>", 1],
  ["</section>", 1],
  ["<details>", 1],
  ["</details>", 1],
  ["<response>", 1],
  ["</response>", 1],
  ["<svg>", 1],
  ["</svg>", 1],
  ["<!--", 3],
  ["-->", 2],
  ["<!-- c -->", 1],
  ["<!-->", 1],
  ["<!--->", 1],
  ["```", 1],
  ["~~~", 1],
  ["```js {{x}}", 1],
  ["`", 2],
  ["``", 1],
  ["`<b>", 1],
  ["\\", 1],
  ["    ", 1],
  ["\t", 1],
  ["\n", 3],
  ["\n\n", 1],
  ["- ", 1],
  ["* ", 1],
  ["1. ", 1],
  ["> ", 1],
  ["{{user}}", 3],
  ["\n\n{{user}}", 1],
  ["text", 1],
  ["word ", 1],
  ["<b>", 1],
  ["</b>", 1],
  ["<p>", 1],
  ["</p>", 1],
  ["#", 1],
  ["---", 1],
  ["<pre>", 1],
  ["</pre>", 1],
  ["$", 2],
  ["$$", 3],
  ["$$\n", 1],
  ["\n$$", 1],
  ["$5", 1],
  [NBSP, 1],
  [`\n${NBSP}\n`, 1],
  [`<style${NBSP}>`, 1],
  [`<textarea${NBSP}>`, 1],
  ["\n  ", 1],
  [">\n", 1],
  ["\n> <div>", 1],
  ["\n- <div>", 1],
  ["\n  <div>", 1],
  ["\n1. ", 1],
];
const POOL: readonly string[] = FRAGMENTS.flatMap(([fragment, weight]) => Array.from({ length: weight }, () => fragment));
const MAX_FRAGMENTS = 22;
// Park and Miller's minimal standard generator: seeded, so each run reads the same replies.
const MULTIPLIER = 48_271;
const MODULUS = 2_147_483_647;

function replies(count: number, seed: number): readonly string[] {
  let state = seed;
  const next = (bound: number): number => {
    state = (state * MULTIPLIER) % MODULUS;
    return state % bound;
  };
  return Array.from({ length: count }, () => Array.from({ length: 1 + next(MAX_FRAGMENTS) }, () => POOL[next(POOL.length)]).join(""));
}

// ---- axes: each returns the first reply it fails, or undefined

type Strip = (text: string) => string;

function settledLeak(texts: readonly string[], strip: Strip, names: ReadonlySet<string>): string | undefined {
  return texts.find((text) => builtElements(strip(text), names).length > 0);
}

// A streamed reply renders each prefix as it arrives: the strip, then the tail hold and repair, then a parse per block.
// Prefixes are cut at each fragment-sized step, enough to land inside every construct the fragments open.
const STREAM_CUT = 3;

function streamedLeak(texts: readonly string[], strip: Strip, names: ReadonlySet<string>): string | undefined {
  return texts.find((text) => {
    for (let cut = 1; cut <= text.length; cut += STREAM_CUT) {
      const blocks = parseMarkdownIntoBlocks(remend(holdAmbiguousTail(strip(text.slice(0, cut)))));
      if (blocks.some((block) => builtElements(block, names).length > 0)) {
        return true;
      }
    }
    return false;
  });
}

const MACRO_OPEN = "{{";
const CODE_NODES: ReadonlySet<string> = new Set(["inlineCode", "inlineMath"]);
const BLOCK_CODE_NODES: ReadonlySet<string> = new Set(["code", "math"]);
const FENCE_LINE_RE = /^ {0,3}(?:```|~~~|\$\$)/u;

// The stretches a parse shows as written: code and math spans whole, a fenced block from the line after its opener.
function shownAsWritten(text: string): readonly Span[] {
  const ranges: Span[] = [];
  for (const [node] of walk(markdownTree(text))) {
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? 0;
    if (CODE_NODES.has(node.type)) {
      ranges.push({ start, end });
    } else if (BLOCK_CODE_NODES.has(node.type)) {
      const source = text.slice(start, end);
      const firstBreak = source.indexOf("\n");
      if (FENCE_LINE_RE.exec(source) === null) {
        ranges.push({ start, end });
      } else if (firstBreak !== -1) {
        ranges.push({ start: start + firstBreak + 1, end });
      }
    }
  }
  return ranges;
}

// The frame parses the held text, which writes a comment for a blank line and a reference for a line break, so each
// offset of the reply maps to the held text by walking the two together.
// What the hold writes (`holdBlocksWhole`): a comment in place of a blank line, a reference in place of a line break.
const HELD_BLANK_LINE = "<!---->";
const HELD_LINE_BREAK = "&#10;";

function heldOffsets(text: string, held: string): (offset: number) => number {
  const map: number[] = [];
  const walked = { index: 0, at: 0 };
  while (walked.index < text.length) {
    heldStep(text, held, walked, map);
  }
  map[text.length] = walked.at;
  return (offset) => map[offset] ?? walked.at;
}

// One step of `heldOffsets`: a character both texts hold, a line break the hold wrote as a reference, or a blank line.
function heldStep(text: string, held: string, walked: { index: number; at: number }, map: number[]): void {
  if (text[walked.index] === held[walked.at]) {
    map[walked.index++] = walked.at++;
    return;
  }
  const lineBreak = held.startsWith(HELD_LINE_BREAK, walked.at);
  const end = lineBreak ? walked.index + (text.startsWith("\r\n", walked.index) ? 2 : 1) : text.indexOf("\n", walked.index);
  for (const stop = end === -1 ? text.length : end; walked.index < stop; walked.index += 1) {
    map[walked.index] = walked.at;
  }
  walked.at += (lineBreak ? HELD_LINE_BREAK : HELD_BLANK_LINE).length;
}

function macroInCode(texts: readonly string[], named: (text: string) => readonly Span[]): string | undefined {
  return texts.find((text) => {
    if (!text.includes(MACRO_OPEN)) {
      return false;
    }
    const held = holdBlocksWhole(text);
    const toHeld = heldOffsets(text, held);
    const settled = shownAsWritten(held);
    const streamed = streamedShownAsWritten(text);
    const covers = (ranges: readonly Span[], start: number): boolean => ranges.some((range) => range.start <= start && start + MACRO_OPEN.length <= range.end);
    return named(text).some((stretch) => !(covers(settled, toHeld(stretch.start)) && covers(streamed, stretch.start)));
  });
}

// The streamed render repairs the tail, which only appends, and parses each block on its own, so each block's
// stretches shift by the blocks before it.
function streamedShownAsWritten(text: string): readonly Span[] {
  const ranges: Span[] = [];
  let at = 0;
  for (const block of parseMarkdownIntoBlocks(remend(text))) {
    const from = at;
    ranges.push(...shownAsWritten(block).map((range) => ({ start: range.start + from, end: range.end + from })));
    at += block.length;
  }
  return ranges;
}

const CONTAINER_NODES: ReadonlySet<string> = new Set(["root", "list", "listItem", "blockquote", "html", "text"]);
// A private-use mark no fragment holds.
const LIFT_MARK = String.fromCodePoint(0xe0_00);

// The frame's parse of a held reply, its raw text lifted as the frame lifts it: every node over a held element's range
// but its own HTML block and the containers round it is the parse reading Markdown inside that element.
function heldSplit(texts: readonly string[], hold: (text: string) => string): string | undefined {
  return texts.find((text) => {
    const ranges = heldBlockRanges(text);
    if (ranges.length === 0) {
      return false;
    }
    const held = hold(text);
    const lifted = liftRawTextBodies(held, LIFT_MARK);
    const toHeld = heldOffsets(text, held);
    const toLifted = liftedOffsets(lifted.text, lifted.bodies);
    const nodes = [...walk(markdownTree(lifted.text))].map(([node]) => node).filter((node) => !CONTAINER_NODES.has(node.type));
    return ranges.some((range) => {
      const start = toLifted(toHeld(range.start));
      const end = toLifted(toHeld(Math.max(range.start, range.end - 1))) + 1;
      return nodes.some((node) => (node.position?.start.offset ?? 0) < end && (node.position?.end.offset ?? 0) > start);
    });
  });
}

function liftedOffsets(lifted: string, bodies: readonly string[]): (offset: number) => number {
  const standIn = new RegExp(`${LIFT_MARK}(\\d+)${LIFT_MARK}`, "gu");
  const segments: { readonly from: number; readonly to: number; readonly at: number; readonly length: number }[] = [];
  let heldAt = 0;
  let liftedAt = 0;
  for (const match of lifted.matchAll(standIn)) {
    const from = heldAt + (match.index - liftedAt);
    const to = from + (bodies[Number(match[1])] ?? "").length;
    segments.push({ from, to, at: match.index, length: match[0].length });
    heldAt = to;
    liftedAt = match.index + match[0].length;
  }
  return (offset) => {
    let shift = 0;
    for (const segment of segments) {
      if (offset >= segment.to) {
        shift += segment.length - (segment.to - segment.from);
      } else if (offset > segment.from) {
        return segment.at;
      }
    }
    return offset + shift;
  };
}

// ---- the suite

// The seeds were chosen so that reverting a kit fix one at a time turns an axis red: each seed's replies reach a class
// another seed's miss. The streamed axis parses every prefix, so it reads the first replies of two seeds only.
const SEEDS = [MULTIPLIER, 7, 101, 3, 29] as const;
const RUNS_PER_SEED = 2000;
const STREAM_SEEDS = [MULTIPLIER, 7] as const;
const STREAM_RUNS_PER_SEED = 300;
const REPLIES = SEEDS.flatMap((seed) => replies(RUNS_PER_SEED, seed));
const STREAMED = STREAM_SEEDS.flatMap((seed) => replies(STREAM_RUNS_PER_SEED, seed));

// Each reply of every seed renders twice, once per strip, about six seconds under load.
test("the strips leave no element HTML reads raw in the settled render", { tags: ["slow"] }, () => {
  expect(settledLeak(REPLIES, stripUnreadElements, UNREAD_ELEMENTS)).toBeUndefined();
  expect(settledLeak(REPLIES, stripStyleElements, STYLE_ELEMENTS)).toBeUndefined();
  // Planted defect: a strip that removes nothing.
  expect(settledLeak(REPLIES, (text) => text, UNREAD_ELEMENTS)).toBeDefined();
});

// Every sampled prefix of each reply parses on its own, about five seconds under load.
test("the strips leave no element HTML reads raw in any streamed prefix", { tags: ["slow"] }, () => {
  expect(streamedLeak(STREAMED, stripUnreadElements, UNREAD_ELEMENTS)).toBeUndefined();
  expect(streamedLeak(STREAMED, stripStyleElements, STYLE_ELEMENTS)).toBeUndefined();
  // Planted defect: a strip that removes nothing.
  expect(streamedLeak(STREAMED, (text) => text, STYLE_ELEMENTS)).toBeDefined();
});

// Each reply with a macro parses whole and block by block, about three seconds under load.
test("a macro the kit names as code is code to the frame's parse and to the streamed one", { tags: ["slow"] }, () => {
  expect(macroInCode(REPLIES, markdownCodeAfterMacros)).toBeUndefined();
  // Planted defect: every macro named code.
  const everyMacro = (text: string): readonly Span[] =>
    [...text.matchAll(/\{\{/gu)].map((match) => ({ start: match.index, end: match.index + MACRO_OPEN.length }));
  expect(macroInCode(REPLIES, everyMacro)).toBeDefined();
});

test("the frame's hold keeps each held element one HTML block", () => {
  expect(heldSplit(REPLIES, holdBlocksWhole)).toBeUndefined();
  // Planted defect: a hold that writes nothing.
  expect(heldSplit(REPLIES, (text) => text)).toBeDefined();
});
