// One strip pass can leave a tag: removing a span joins the bytes around it. The strip and the stream both reach a
// fixpoint, and a hostile nest costs a bounded number of passes before it conceals.
// @subject packages/kit/src/content/index.ts

import {
  concealsBrokenHiddenTag,
  createHiddenSpanStreamScrubber,
  hiddenSpanRanges,
  projectBodyForPreview,
  projectBodyForSummary,
  projectHiddenSpans,
  scanHiddenSpans,
  stripHiddenSpans,
} from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const SECRET = "the-sealed-truth";
const INNER = '<lie truth="x"/>';
const REJOINED = `a <l${INNER}ie truth="${SECRET}"/> b`;
const BUDGET_MS = 1000;
const DEPTH = 4000;
// Far past any pass cap, so a strip that walked it level by level would pay for every level.
const NEST = `${"<l".repeat(DEPTH)}${INNER}${`ie truth="${SECRET}"/>`.repeat(DEPTH)}`;

function streamed(deltas: readonly string[]): string {
  const scrubber = createHiddenSpanStreamScrubber();
  return [...deltas.map((delta) => scrubber.push(delta)), scrubber.flush()].join("");
}

function nestOf(depth: number): string {
  return `${"<l".repeat(depth)}${INNER}${'ie a="1"/>'.repeat(depth - 1)}ie truth="${SECRET}"/>`;
}

function elapsedMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

test.each([
  ["a name split by a tag", REJOINED, "a  b"],
  ["an attr name split by a tag", `a <lie tr${INNER}uth="${SECRET}"/> b`, "a  b"],
  ["an unclosed open behind a seam conceals the rest", `a <l${INNER}ie truth="${SECRET} b`, "a "],
  ["a broken open behind a seam conceals the rest", `a <l${INNER}ie truth=${SECRET} b`, "a "],
  ["a tag split twice", `a <l${INNER}ie tr${INNER}uth="${SECRET}"/> b`, "a  b"],
  ["a rejoined fence ahead of a rejoined tag", `\`\`${INNER}\`\n<l${INNER}ie truth="${SECRET}"/> b`, "```\n b"],
  ["a tag at the end of the body leaves an open unclosed", `a <lie${INNER}`, "a "],
])("the strip reaches a fixpoint: %s", (_name, body, visible) => {
  const stripped = stripHiddenSpans(body);
  expect(stripped.content).toBe(visible);
  expect(stripped.hadHidden).toBe(true);
  expect(stripHiddenSpans(stripped.content).hadHidden).toBe(false);
  expect(projectBodyForPreview(body)).not.toContain(SECRET);
  expect(projectBodyForSummary(body)).not.toContain(SECRET);
});

test("an unregistered tag stays in a member's text, whether or not a hidden tag sits beside it", () => {
  const unknown = '<gm x="1"/>';
  expect(stripHiddenSpans(`a ${unknown} b`)).toEqual({ content: `a ${unknown} b`, hadHidden: false });
  expect(stripHiddenSpans(`a ${unknown}${INNER} b`).content).toBe(`a ${unknown} b`);
  expect(hiddenSpanRanges(`a ${unknown} b`)).toEqual([]);
});

test("positions collapse through a rejoined tag onto the visible bytes", () => {
  const start = REJOINED.indexOf("<");
  const end = REJOINED.indexOf(" b");
  const { offsets, content } = projectHiddenSpans(REJOINED, [0, start, start + 3, end - 1, end, REJOINED.length]);
  expect(content).toBe("a  b");
  expect(offsets).toEqual([0, start, start, start, start, content.length]);
});

test("the ranges hold every removed byte as one run a writer can stay out of", () => {
  const ranges = hiddenSpanRanges(REJOINED);
  expect(ranges.map(({ start, end }) => REJOINED.slice(start, end))).toEqual([`<l${INNER}ie truth="${SECRET}"/>`]);
});

test("the reveal lists what the strip removed, the rejoined tag included", () => {
  expect(scanHiddenSpans(REJOINED).map((span) => span.attrs["truth"])).toEqual([SECRET, "x"]);
});

test("tags side by side are one run: nothing a writer places can land between them", () => {
  expect(hiddenSpanRanges(`a ${INNER}${INNER} b`)).toEqual([{ start: 2, end: 2 + INNER.length * 2 }]);
});

test("a broken tag behind a seam is reported as broken", () => {
  expect(concealsBrokenHiddenTag(`a <l${INNER}ie truth=${SECRET} b`, false)).toBe(true);
  expect(concealsBrokenHiddenTag(REJOINED, false)).toBe(false);
});

test.each([
  ["one delta", [REJOINED]],
  ["the tag alone in its delta", ["a <l", INNER, `ie truth="${SECRET}"/> b`]],
  ["a fragment ahead of an open still forming", ["a <l<", `lie truth="x"/>ie tr`, `uth="${SECRET}"/> b`]],
  ["a chain of fragments ahead of an open", ["a <l<lie tr<", 'lie truth="x"/>uth="x"/>ie tr', `uth="${SECRET}"/> b`]],
  ["one byte at a time", Array.from(REJOINED)],
])("the stream agrees with the strip: %s", (_name, deltas) => {
  const body = deltas.join("");
  expect(streamed(deltas)).toBe(stripHiddenSpans(body).content);
  expect(streamed(deltas)).not.toContain(SECRET);
});

test.each([
  ["a quoted open inside a finished tag", `<LI<lie truth="${SECRET} <li <lie a="/><LI b`],
  ["a quoted open behind a fragment", `a <lie truth="${SECRET} <l <lie a="/><l b`],
  ["a finished tag ahead of a fragment and an open", `<l<lie truth="${SECRET} <x <lie a="/><l<`],
])("a hold never reaches back inside %s", (_name, body) => {
  expect(streamed(Array.from(body))).toBe(stripHiddenSpans(body).content);
  expect(streamed(Array.from(body))).not.toContain(SECRET);
  const at = body.indexOf('"/>') + 3;
  expect(streamed([body.slice(0, at), body.slice(at)])).not.toContain(SECRET);
});

test("an open a removal exposed waits for the bytes behind the next removed tag", () => {
  const tail = 'uth="y"/> seen';
  const body = `<LI<l${INNER}ie a="y"/>e a="y"${INNER}${tail}`;
  expect(stripHiddenSpans(body).content).toBe(" seen");
  expect(streamed(Array.from(body))).toBe(" seen");
  expect(streamed([`<LI<l${INNER}ie a="y"/>e a="y"<`, `lie truth="x"/>${tail}`])).toBe(" seen");
});

test("the fragments ahead of an exposed open hold with it", () => {
  const body = `<LI<lie tr<l<l${INNER}ie a="1"/>ie truth="${SECRET}"/><li<ofilter event="x"/>e truth="${SECRET}"<la\n`;
  expect(streamed([body])).toBe(stripHiddenSpans(body).content);
  expect(streamed(Array.from(body))).toBe(stripHiddenSpans(body).content);
});

test.each([
  ["a finished tag behind prose that stops the walk", `<lie truth="${SECRET}<x <<li<lie a="/><lie tr`],
  ["fragments ahead of an open a removal exposed", `<li x<ofilter event="x"/>uth="y"/>\n\n<lie<li<l${INNER}ie truth="y"/>e truth="y"<li<l`],
])("the stream reaches the commit's bytes: %s", (_name, body) => {
  const committed = stripHiddenSpans(body).content;
  expect(committed).not.toContain(SECRET);
  expect(streamed([body])).toBe(committed);
  expect(streamed(Array.from(body))).toBe(committed);
});

test("prose that only looks like a fragment reaches a member whole", () => {
  const body = "x <l y <lie down and a <b>";
  expect(streamed(Array.from(body))).toBe(body);
  expect(stripHiddenSpans(body).content).toBe(body);
});

test("a nest past the pass bound conceals rather than releases", () => {
  const body = `a ${nestOf(40)} b`;
  const stripped = stripHiddenSpans(body);
  expect(stripped.hadHidden).toBe(true);
  expect(stripped.content).toContain("a ");
  expect(stripped.content).not.toContain(SECRET);
  expect(streamed([body])).toBe(stripped.content);
  expect(streamed(Array.from(body))).not.toContain(SECRET);
});

test("the stream and the strip reach the same end at the pass bound, from either side", () => {
  const atBound = `a ${nestOf(7)} b`;
  expect(stripHiddenSpans(atBound).content).toBe("a  b");
  expect(streamed([atBound])).toBe("a  b");
  expect(streamed([`a ${nestOf(7)}`, " b"])).toBe("a  b");
  const pastBound = `a ${nestOf(8)} b`;
  expect(streamed([pastBound])).toBe(stripHiddenSpans(pastBound).content);
});

test("a fragment chain past its bound conceals the rest of the turn", () => {
  const chain = "<l".repeat(300);
  const emitted = streamed([chain, "<", ` ${SECRET}`]);
  expect(emitted).not.toContain(SECRET);
  expect(streamed(["<l".repeat(4), "<", " seen"])).toContain("seen");
});

test.each([
  ["the strip", (): void => void stripHiddenSpans(NEST)],
  ["the reveal", (): void => void scanHiddenSpans(NEST)],
  ["a position projection", (): void => void projectHiddenSpans(NEST, [1, NEST.length])],
  ["the preview", (): void => void projectBodyForPreview(NEST)],
  ["one stream delta", (): void => void streamed([NEST])],
  ["small stream deltas", (): void => void streamed(NEST.match(/[\s\S]{1,16}/gu) ?? [])],
  ["small stream deltas behind a held fragment", (): void => void streamed(`<l${INNER.repeat(20_000)}`.match(/[\s\S]{1,16}/gu) ?? [])],
])("%s of a deep nest costs its length", (_name, run) => {
  expect(elapsedMs(run)).toBeLessThan(BUDGET_MS);
});
