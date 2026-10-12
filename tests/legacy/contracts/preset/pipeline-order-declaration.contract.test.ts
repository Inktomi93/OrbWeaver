// @orb/contracts/preset — the post-process pipeline lane declaration.

import {
  ASSEMBLE_POST_PROCESS_ORDER,
  PROMPT_LANE_STEPS,
  pipelineStepKey,
  promptConfigSchema,
  RECEIVE_POST_PROCESS_ORDER,
  REPLY_LANE_STEPS,
} from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// ── THE PIPELINE ORDER DECLARATION ────────────────────────────────────────────────────────────────
// The order is declared ONCE (here in contracts) and consumed twice: the server's post-process executors
// iterate the flag tuples, and the preset editor's Transforms readout renders the lanes. These pin the two
// ways the declaration can go wrong on its OWN terms; that it matches the ENGINE's interleaving is pinned
// where the engine runs (`tests/legacy/server/domain/chat/engine/pipeline-receive.test.ts` — the RECEIVE ORDER test).

test("the two lane tuples PARTITION postProcess: every switch is declared on exactly one lane", () => {
  const declared = [...RECEIVE_POST_PROCESS_ORDER, ...ASSEMBLE_POST_PROCESS_ORDER];
  // The schema's own key set, read off the shape — a switch added to `postProcess` and to neither tuple
  // would run NOWHERE while its readout row went missing, and nothing else in the tree would notice.
  const flags = Object.keys(promptConfigSchema.shape.postProcess.unwrap().shape);
  expect(declared.toSorted()).toEqual(flags.toSorted());
});

test("no step appears twice in a lane, and the two lanes share no step", () => {
  const prompt = PROMPT_LANE_STEPS.map(pipelineStepKey);
  const reply = REPLY_LANE_STEPS.map(pipelineStepKey);
  expect(new Set(prompt).size).toBe(prompt.length);
  expect(new Set(reply).size).toBe(reply.length);
  expect(prompt.filter((key) => reply.includes(key))).toEqual([]);
});

test("collapseNewlines is on the ASSEMBLE lane and NOT on the reply lane (it never runs on a reply)", () => {
  // The exact untruth the hand-numbered readout printed: an assemble transform listed as reply step 5.
  expect(PROMPT_LANE_STEPS.map(pipelineStepKey)).toContain("post-process:collapseNewlines");
  expect(REPLY_LANE_STEPS.map(pipelineStepKey)).not.toContain("post-process:collapseNewlines");
});

test("the REASONING leg is declared AFTER the whole post-process block, and DISPLAY last", () => {
  const reply = REPLY_LANE_STEPS.map(pipelineStepKey);
  const reasoningAt = reply.indexOf("regex:REASONING");
  for (const flag of RECEIVE_POST_PROCESS_ORDER) {
    expect(reply.indexOf(`post-process:${flag}`)).toBeLessThan(reasoningAt);
  }
  // …and the AI_OUTPUT pass before it — the pair the readout had inverted before this one.
  expect(reply.indexOf("regex:AI_OUTPUT")).toBeLessThan(reasoningAt);
  // DISPLAY is LAST: it changes what you read and never touches the wire.
  expect(reply.at(-1)).toBe("regex:DISPLAY");
});
