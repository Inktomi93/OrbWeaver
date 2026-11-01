// A registered hidden name followed by a `name=` shape hides to the end of the body however it breaks. Prose does not.
// @subject packages/kit/src/content/index.ts

import {
  contentSpanRaw,
  createHiddenSpanStreamScrubber,
  projectBodyForPreview,
  projectBodyForSummary,
  stripHiddenSpans,
  tokenizeContent,
} from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const SECRET = "ledger";
const LEAD = "Before ";
const AGREEMENT_RUNS = 4000;
const MAX_FRAGMENTS = 9;
const LEHMER_MULTIPLIER = 48_271;
const LEHMER_MODULUS = 2_147_483_647;

const concealed: readonly (readonly [string, string])[] = [
  ["an HTML-style close", `Before <lie truth="${SECRET}"> after`],
  ["an HTML-style close with its own end tag", `Before <lie truth="${SECRET}">a claim</lie> after`],
  ["prose after a well-formed attr", `Before <lie truth="${SECRET}" and then he left.`],
  ["an unquoted value", `Before <lie truth=${SECRET}> after`],
  ["a single-quoted value", `Before <lie truth='${SECRET}'> after`],
  ["a newline between attrs", `Before <lie character="W"\n truth="${SECRET}"/> after`],
  ["a newline before the first attr", `Before <lie\ntruth="${SECRET}"/> after`],
  ["no close before the end of the body", `Before <lie character="W"\n truth="${SECRET}`],
  ["an unquoted value that never closes", `Before <lie truth=${SECRET} and more words`],
  ["a trailing newline after an attr", `Before <lie truth="${SECRET}"\n`],
  ["the second registered name", `Before <ofilter reason="${SECRET}"> after`],
];

const prose: readonly (readonly [string, string])[] = [
  ["a bare name in a sentence", "She will <lie down on the bed"],
  ["a name a later word shapes like an attr", "She will <lie down on the bed and rest a=b"],
  ["an HTML-style name alone", "She said <lie> and left"],
  ["a bare word closed like HTML", "She said <lie truth> and left"],
];

/** One stream of `body`, fed in the given pieces, as a member's bytes. */
function streamed(pieces: readonly string[]): string {
  const scrubber = createHiddenSpanStreamScrubber();
  return pieces.map((piece) => scrubber.push(piece)).join("") + scrubber.flush();
}

/** Every way a provider can cut the body in two, plus one byte at a time. */
function cutsOf(body: string): readonly (readonly string[])[] {
  return [...Array.from({ length: body.length + 1 }, (_, at) => [body.slice(0, at), body.slice(at)]), [...body]];
}

test.each(concealed)("%s is hidden from members to the end of the body", (_name, body) => {
  expect(stripHiddenSpans(body)).toEqual({ content: LEAD, hadHidden: true });
  expect(projectBodyForSummary(body)).toBe(LEAD);
  expect(projectBodyForPreview(body)).toBe(LEAD.trim());
});

test.each(concealed)("%s stays literal on the render and wire grammar", (_name, body) => {
  const spans = tokenizeContent(body, { committed: true });
  expect(spans.filter((span) => span.kind === "hidden")).toEqual([]);
  expect(spans.map(contentSpanRaw).join("")).toBe(body);
});

test.each(prose)("%s stays readable", (_name, body) => {
  expect(stripHiddenSpans(body)).toEqual({ content: body, hadHidden: false });
});

// No production stream flushes, so a tail the stream holds past the verdict never reaches a member.
test.each(prose)("%s reaches the stream without a flush", (_name, body) => {
  expect(createHiddenSpanStreamScrubber().push(body)).toBe(body);
});

test.each([...concealed.map(([, body]) => body), ...prose.map(([, body]) => body)])("the stream and the commit strip agree on every cut of %j", (body) => {
  const committed = stripHiddenSpans(body).content;
  for (const pieces of cutsOf(body)) {
    expect(streamed(pieces)).toBe(committed);
  }
});

test("a prefix cut in front of a held open keeps the prose the commit strip keeps", () => {
  const body = `${LEAD}<lie<lie truth="${SECRET}`;
  expect(stripHiddenSpans(body).content).toBe(`${LEAD}<lie`);
  for (const pieces of cutsOf(body)) {
    expect(streamed(pieces)).toBe(`${LEAD}<lie`);
  }
});

test("the stream and the commit strip agree across seeded random tag fragments", () => {
  const fragments = [
    "<lie",
    "<ofilter",
    "<li",
    "<",
    " ",
    "\n",
    'truth="x"',
    "truth=x",
    "truth=",
    'a="',
    ">",
    "/>",
    "/",
    '"',
    "'",
    "\\",
    "down",
    "=",
    "</lie>",
    "text",
  ];
  let state = LEHMER_MULTIPLIER;
  const next = (bound: number): number => {
    state = (state * LEHMER_MULTIPLIER) % LEHMER_MODULUS;
    return state % bound;
  };
  for (let run = 0; run < AGREEMENT_RUNS; run += 1) {
    const body = Array.from({ length: 1 + next(MAX_FRAGMENTS) }, () => fragments[next(fragments.length)]).join("");
    const at = next(body.length + 1);
    const committed = stripHiddenSpans(body).content;
    expect(streamed([body]), body).toBe(committed);
    expect(streamed([body.slice(0, at), body.slice(at)]), body).toBe(committed);
    expect(streamed([...body]), body).toBe(committed);
  }
});

test("a continue delimiter that lands between attrs decides the verdict on the stream as it does at commit", () => {
  const stored = `${LEAD}<lie character="W"`;
  const addition = ` truth="${SECRET}"/> after`;
  expect(streamed([`${stored}\n`, addition])).toBe(stripHiddenSpans(`${stored}\n${addition}`).content);
});
