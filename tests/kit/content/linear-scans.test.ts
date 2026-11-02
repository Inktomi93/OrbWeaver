// A message body is model output: a long run of brackets or backticks must cost its length, not its square, and the
// scanners must keep reading links, code spans and dice stamps the way the patterns they replaced did.
// @subject packages/kit/src/content/index.ts

import { contentSpanRaw, createHiddenSpanStreamScrubber, hiddenSpanRanges, projectBodyForPreview, stripHiddenSpans, tokenizeContent } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const BUDGET_MS = 1000;
const TICK = "`";
const SECRET = "the-sealed-truth";
// A line that opens with three ticks is a code fence, which the stamp scan never reads, so these bodies open with prose.
const PROSE_OPENER = "a ";

function elapsedMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

test.each([
  ["a link keeps its label", "see [the docs](http://x.y) now", "see the docs now"],
  ["an image ref drops with its empty label", "![pic](http://x/y.png) after", "after"],
  ["a titled image ref collapses with its mark", "![a b](x y) after", "a b after"],
  ["a mark away from the bracket stays", "wow! [a](b)", "wow! a"],
  ["links side by side both collapse", "[a](b)[c](d)", "ac"],
  ["a mark right after a link joins the next ref", "[a](b)![c d](e f)", "ac d"],
  ["a close paren in the label does not end the target", "[a)b](c) tail", "a)b tail"],
  ["a nested bracket is left as written", "[[nested]](u) and [a](b", "[[nested]](u) and [a](b"],
  ["a bracket pair with no target is prose", "[no link] (not)", "[no link] (not)"],
  ["an earlier open bracket joins the label up to the first close", "[ open and [real](u) end", "open and [real end"],
])("preview: %s", (_name, body, preview) => {
  expect(projectBodyForPreview(body)).toBe(preview);
});

test.each([
  ["open brackets", "[".repeat(120_000)],
  ["open brackets sharing one close", `${"[".repeat(400_000)}]`],
  ["refs with no close paren", "[](".repeat(40_000)],
])("preview: a long run of %s is read in linear time", (_name, body) => {
  expect(elapsedMs(() => projectBodyForPreview(body))).toBeLessThan(BUDGET_MS);
});

const DICE = (label: string, total: number): { kind: "dice"; label: string; total: number; raw: string } => ({
  kind: "dice",
  label,
  total,
  raw: `[dice: ${label} → ${String(total)}]`,
});

test.each([
  ["a stamp between words", "roll [dice: 1d6 → 4] done", ["roll ", DICE("1d6", 4), " done"]],
  ["a stamp inside an inline code span stays text", "code `[dice: 1d6 → 4]` and [dice: 2d8+1 → 9]", ["code `[dice: 1d6 → 4]` and ", DICE("2d8+1", 9)]],
  ["a double-tick span hides its stamp", "``[dice: 1d6 → 4]`` then [dice: 1d6 → 2]", ["``[dice: 1d6 → 4]`` then ", DICE("1d6", 2)]],
])("dice stamps: %s", (_name, body, expected) => {
  const spans = tokenizeContent(body, { committed: true }).map((span) => (span.kind === "text" ? span.text : span));
  expect(spans).toEqual(expected);
});

const ONE = DICE("1d6", 1).raw;
const TWO = DICE("1d6", 2).raw;
const ticks = (count: number): string => TICK.repeat(count);

test.each([
  ["a lone tick closes nothing", `a ${ticks(1)} ${ONE}`, [1]],
  ["a double tick closes on itself before a later single", `a ${ticks(2)} ${ONE} ${ticks(1)} b`, [1]],
  ["a triple tick closes on a later double", `a ${ticks(3)} ${ONE} ${ticks(2)} b`, []],
  ["the longest later run sets the closer, not the next run", `a ${ticks(3)} ${ONE} ${ticks(1)} ${TWO} ${ticks(2)} c`, []],
  ["a closer takes only the ticks it needs", `a ${ticks(1)} ${ONE} ${ticks(2)} ${TWO} ${ticks(1)} c`, []],
  ["the ticks a closer leaves can open nothing further", `a ${ticks(1)} ${ONE} ${ticks(2)} ${TWO}`, [2]],
  ["the tick a self-close leaves is read alone", `a ${ticks(3)} ${ONE} ${ticks(1)}`, []],
  ["a span passes the stamp it covered", `a ${ticks(1)} ${ONE} ${ticks(1)} ${TWO}`, [2]],
  ["a stamp ahead of a code span stays live", `${ONE} ${ticks(1)}x${ticks(1)} ${TWO}`, [1, 2]],
  ["a tick in a stamp's label opens nothing", `[dice: a${TICK}b 1d6 → 3] ${TWO} ${ticks(1)}`, [3, 2]],
  ["an escaped stamp is text", `\\${ONE} ${TWO}`, [2]],
  ["an unsafe total is text", `[dice: 1d6 → 99999999999999999999] ${TWO}`, [2]],
])("code spans: %s", (_name, body, totals) => {
  const live = tokenizeContent(body, { committed: true }).flatMap((span) => (span.kind === "dice" ? [span.total] : []));
  expect(live).toEqual(totals);
});

test.each([
  ["a long run of ticks", `${PROSE_OPENER}${TICK.repeat(120_000)}`],
  ["decreasing runs of ticks", `${PROSE_OPENER}${Array.from({ length: 700 }, (_, index) => `${TICK.repeat(700 - index)}a`).join("")}`],
])("dice stamps: %s is read in linear time", (_name, body) => {
  expect(elapsedMs(() => tokenizeContent(body, { committed: true }))).toBeLessThan(BUDGET_MS);
});

const imagesOf = (body: string): { alt: string; url: string }[] =>
  tokenizeContent(body, { committed: true }).flatMap((span) =>
    span.kind === "image" && span.ref.kind === "external" ? [{ alt: span.alt, url: span.ref.url }] : [],
  );

test.each([
  [
    "two refs",
    "![a](b) ![c](d)",
    [
      { alt: "a", url: "b" },
      { alt: "c", url: "d" },
    ],
  ],
  [
    "refs side by side",
    "![a](b)![c](d)",
    [
      { alt: "a", url: "b" },
      { alt: "c", url: "d" },
    ],
  ],
  ["a title form is text", '![a](u "t")', []],
  ["an empty target is text", "![a]() ![c](d)", [{ alt: "c", url: "d" }]],
  ["a spaced target gives way to a later ref", "![a](b c) ![d](e)", [{ alt: "d", url: "e" }]],
  ["an open inside a failed target still opens", "![a](b![c d](e)", [{ alt: "c d", url: "e" }]],
  ["an open inside a whole target does not", "![a](b![c](d)", [{ alt: "a", url: "b![c](d" }]],
  ["an earlier open joins the alt up to the first close", "![![a](b)", [{ alt: "![a", url: "b" }]],
  ["a close with no target passes every open before it", "![![a] ![b](c)", [{ alt: "b", url: "c" }]],
  ["a close in the target is target", "![a](b]c)", [{ alt: "a", url: "b]c" }]],
  ["an unclosed target is text", "![a](b", []],
  ["a target ended by any whitespace is text", "![a](b\u00A0c)", []],
  ["a mark away from the bracket is text", "! [a](b)", []],
])("image refs: %s", (_name, body, images) => {
  expect(imagesOf(body)).toEqual(images);
  expect(tokenizeContent(body, { committed: true }).map(contentSpanRaw).join("")).toBe(body);
});

test.each([
  ["image opens", "![".repeat(60_000)],
  ["image opens with a shared close", `${"![".repeat(60_000)}]`],
  ["empty refs with no close paren", "![](".repeat(30_000)],
  ["spaced refs", "![a]( x".repeat(20_000)],
  ["empty refs that share one far stop", `${"![](".repeat(30_000)} x`],
])("image refs: a long run of %s is read in linear time", (_name, body) => {
  expect(elapsedMs(() => tokenizeContent(body, { committed: true }))).toBeLessThan(BUDGET_MS);
  expect(elapsedMs(() => stripHiddenSpans(body))).toBeLessThan(BUDGET_MS);
  expect(elapsedMs(() => projectBodyForPreview(body))).toBeLessThan(BUDGET_MS);
});

test.each([
  ["ticks that open a delta", ["Hi", `\`\`\`<lie truth="${SECRET}"/> seen`]],
  ["a closing fence line in the same delta", ["```\ncode\n", `\`\`\`\n<lie truth="${SECRET}"/> seen`]],
  ["a fence line ahead of the tag in one delta", [`a\n\`\`\`\n<lie truth="${SECRET}"/> seen`]],
  ["a fence line ahead of the tag, with the turn concealing behind it", [`seen\n\`\`\`\n<lie truth="${SECRET}"/> <lie a=b`]],
])("the stream conceals a tag behind %s", (_name, deltas) => {
  const scrubber = createHiddenSpanStreamScrubber();
  const emitted = [...deltas.map((delta) => scrubber.push(delta)), scrubber.flush()].join("");
  expect(emitted).toContain("seen");
  expect(emitted).not.toContain(SECRET);
});

test("hidden ranges are the bytes the strip removes", () => {
  const tag = `<lie truth="${SECRET}"/>`;
  const body = `Hi ${tag} and <ofilter event="e"/> tail`;
  const ranges = hiddenSpanRanges(body);
  expect(ranges.map(({ start, end }) => body.slice(start, end))).toEqual([tag, '<ofilter event="e"/>']);
  let kept = "";
  let cursor = 0;
  for (const { start, end } of ranges) {
    kept += body.slice(cursor, start);
    cursor = end;
  }
  expect(kept + body.slice(cursor)).toBe(stripHiddenSpans(body).content);
});

test.each([
  ["an unclosed open reaches the end", `a <lie truth="${SECRET}`, [[2, 2 + `<lie truth="${SECRET}`.length]]],
  ["prose holds no range", "<lie down on the bed", []],
  ["a tag in a code block holds a range", '```\n<lie truth="x"/>\n```', [[4, 20]]],
])("hidden ranges: %s", (_name, body, ranges) => {
  expect(hiddenSpanRanges(body).map(({ start, end }) => [start, end])).toEqual(ranges);
});

test.each([
  ["inside a stamp label", `[dice: <lie truth="${SECRET}"/> 1d6 → 4] seen`],
  ["inside an inline code span", `${TICK}<lie truth="${SECRET}"/>${TICK} seen`],
  ["inside a link label", `[<lie truth="${SECRET}"/>](u) seen`],
  ["inside a link target", `[label](<lie truth="${SECRET}"/>) seen`],
])("a hidden tag %s leaves before the span is read", (_name, body) => {
  const stripped = stripHiddenSpans(body);
  expect(stripped.hadHidden).toBe(true);
  expect(stripped.content).not.toContain(SECRET);
  expect(stripped.content).toContain("seen");
  expect(projectBodyForPreview(body)).not.toContain(SECRET);
});
