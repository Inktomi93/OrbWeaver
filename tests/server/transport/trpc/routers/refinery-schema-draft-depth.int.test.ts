// A schema draft is the one JSON value the refinery walks recursively, so its router bounds the draft's depth with a
// coded refusal before any walk can overflow the stack.
// @subject packages/server/src/transport/trpc/routers/refinery.ts
// @subject packages/kit/src/json/index.ts
import { REFINERY_SCHEMA_STAGES } from "@orb/contracts/refinery";
import type { JsonValue } from "@orb/kit/json";
import { JSON_BOUND_REFUSALS, JSON_MAX_DEPTH } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { SCORE_MAX, SCORE_MIN } from "#contracts/refinery/core.ts";

const [MAX_DEPTH_REFUSAL] = JSON_BOUND_REFUSALS;
const [STAGE] = REFINERY_SCHEMA_STAGES;
// The smallest score draft the belt accepts: the stage core and nothing else.
const SCORE_DRAFT = {
  type: "object",
  properties: { overallScore: { type: "integer", minimum: SCORE_MIN, maximum: SCORE_MAX } },
  required: ["overallScore"],
};
// Deep enough that a recursive check overflows the stack before it can refuse.
const OVERFLOW_DEPTH = 3000;

function draftWithDefault(depth: number): { readonly [key: string]: JsonValue } {
  let value: JsonValue = 1;
  for (let level = 0; level < depth; level += 1) {
    value = [value];
  }
  return { type: "object", properties: { note: { type: "string" } }, default: value };
}

test("refinery.schemaPlan refuses a draft nested past the bound with its code, and lets one inside it reach the belt", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);

  for (const depth of [JSON_MAX_DEPTH + 1, OVERFLOW_DEPTH]) {
    await expect(caller.refinery.schemaPlan({ schema: draftWithDefault(depth), stage: STAGE }), String(depth)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(MAX_DEPTH_REFUSAL),
    });
  }
  // Positive controls. A draft the belt accepts gets a plan (the owner has bound no model). A draft at the bound passes
  // the router and reaches the belt, which answers its own quiet refusal, as it does for any draft it cannot lift.
  expect(await caller.refinery.schemaPlan({ schema: SCORE_DRAFT, stage: STAGE })).toEqual({ outcome: "unbound" });
  expect(await caller.refinery.schemaPlan({ schema: draftWithDefault(JSON_MAX_DEPTH - 1), stage: STAGE })).toBeNull();
});
