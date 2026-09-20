// backends/openai-compat/think-tags — the F-table "Adopt" row's two FENCES, which are the whole decision.
// The middleware itself is the SDK's and is not re-pinned here; what is ours is WHEN it applies, and both
// arms of that are ways to silently break a working turn:
//   • applying it over a row with a native reasoning field double-counts (or blanks) the trace;
//   • claiming to handle a non-XML tag pair leaves the user's `[thinking]` block in the prose while the
//     post-hoc split believes the wire already handled it.

import { thinkTagMiddleware } from "../../../../packages/inference/src/backends/openai-compat/think-tags.ts";
import { expect, test } from "../../../support/fixtures.ts";

const THINK = { prefix: "<think>", suffix: "</think>" } as const;

test("an XML-shaped pair on a row with NO native reasoning field gets the stream-time splitter", () => {
  expect(thinkTagMiddleware({ reasoningKeys: undefined, tags: THINK })).toHaveLength(1);
});

test("FENCE 1: a row that NAMES its reasoning delta field is never wrapped — it has a native channel", () => {
  // vLLM ships `["reasoning", "reasoning_content"]`; splitting tags out of its prose would find none, and on
  // a server that emits both would count the trace twice.
  expect(thinkTagMiddleware({ reasoningKeys: ["reasoning", "reasoning_content"], tags: THINK })).toHaveLength(0);
});

test("FENCE 2: a non-XML tag pair is left to the engine's post-hoc split — the middleware cannot express it", () => {
  // `extractReasoningMiddleware` takes a tagName and BUILDS `<name>`/`</name>` itself, so there is no
  // spelling of `[thinking]` for it. Declining is the honest answer; mapping it would strip nothing.
  expect(thinkTagMiddleware({ reasoningKeys: undefined, tags: { prefix: "[thinking]", suffix: "[/thinking]" } })).toHaveLength(0);
  // A MISMATCHED pair is the same class: `<think>` opened, `</thought>` closed.
  expect(thinkTagMiddleware({ reasoningKeys: undefined, tags: { prefix: "<think>", suffix: "</thought>" } })).toHaveLength(0);
});

test("no tags at all (auto-parse off) ⇒ no wrap, so a preset with the feature off changes nothing", () => {
  expect(thinkTagMiddleware({ reasoningKeys: undefined, tags: undefined })).toHaveLength(0);
});
