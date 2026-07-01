// @orb/server/kit/reasoning — the inline `<think>` reasoning-tag parser (D47 #3 / D53 step 2). Pins: a strict
// start-anchored match, leading-whitespace tolerance, a non-strict match-anywhere, trim-on-match, and the
// null contract (missing prefix OR suffix, empty tags, no match → null, strip nothing). The native-first
// GATING (skip when native reasoning exists / autoParse off) lives at the RECEIVE seam (pipeline.test.ts), not
// here — this is the pure parser.

import { parseReasoningTags } from "@orb/server/kit/reasoning";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const TAGS = { prefix: "<think>", suffix: "</think>" } as const;

describe("parseReasoningTags — strict (default)", () => {
  test("splits a leading <think>…</think> block into reasoning + content", () => {
    expect(parseReasoningTags("<think>weigh the options</think>The answer.", TAGS)).toEqual({
      reasoning: "weigh the options",
      content: "The answer.",
    });
  });

  test("tolerates leading whitespace before the prefix (the `^\\s*?` anchor)", () => {
    expect(parseReasoningTags("  \n  <think>plan</think>hello", TAGS)).toEqual({
      reasoning: "plan",
      content: "hello",
    });
  });

  test("a multi-line reasoning block is captured (the dotall `s` flag)", () => {
    expect(parseReasoningTags("<think>line one\nline two</think>reply", TAGS)).toEqual({
      reasoning: "line one\nline two",
      content: "reply",
    });
  });

  test("trims BOTH halves only on a successful match", () => {
    expect(parseReasoningTags("<think>  spaced  </think>   said   ", TAGS)).toEqual({
      reasoning: "spaced",
      content: "said",
    });
  });

  test("a prefix not at the start → null (strict won't treat a mid-reply tag as reasoning)", () => {
    expect(parseReasoningTags("Hello <think>secret</think> there", TAGS)).toBeNull();
  });
});

describe("parseReasoningTags — non-strict", () => {
  test("matches a tag block anywhere; content is the surrounding text", () => {
    expect(parseReasoningTags("hello <think>x</think> world", { ...TAGS, strict: false })).toEqual({
      reasoning: "x",
      content: "hello  world",
    });
  });
});

describe("parseReasoningTags — the null contract (both tags required)", () => {
  test("missing closing suffix → null (strip nothing)", () => {
    expect(parseReasoningTags("<think>unterminated reasoning", TAGS)).toBeNull();
  });

  test("missing opening prefix → null", () => {
    expect(parseReasoningTags("reasoning</think> tail", TAGS)).toBeNull();
  });

  test("no tags at all → null", () => {
    expect(parseReasoningTags("just a plain reply", TAGS)).toBeNull();
  });

  test("an empty prefix or suffix → null (degenerate config never matches)", () => {
    expect(parseReasoningTags("<think>x</think>y", { prefix: "", suffix: "</think>" })).toBeNull();
    expect(parseReasoningTags("<think>x</think>y", { prefix: "<think>", suffix: "" })).toBeNull();
  });

  test("custom tags are matched literally (escaped — `[think]` is not a char class)", () => {
    expect(
      parseReasoningTags("[think]hmm[/think]done", { prefix: "[think]", suffix: "[/think]" }),
    ).toEqual({ reasoning: "hmm", content: "done" });
  });
});
