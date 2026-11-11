// A schema draft is the one JSON value the refinery walks recursively, so its router bounds the draft's depth with a
// coded refusal before any walk can overflow the stack.
// @subject packages/server/src/transport/trpc/routers/refinery.ts
// @subject packages/kit/src/json/index.ts
import { REFINERY_SCHEMA_STAGES } from "@orb/contracts/refinery";
import type { JsonValue } from "@orb/kit/json";
import { JSON_BOUND_REFUSALS, JSON_MAX_DEPTH } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";

const [MAX_DEPTH_REFUSAL] = JSON_BOUND_REFUSALS;
const [STAGE] = REFINERY_SCHEMA_STAGES;
// Deep enough that a recursive check overflows the stack before it can refuse.
const OVERFLOW_DEPTH = 3000;

function draftWithDefault(depth: number): { readonly [key: string]: JsonValue } {
  let value: JsonValue = 1;
  for (let level = 0; level < depth; level += 1) {
    value = [value];
  }
  return { type: "object", properties: { note: { type: "string" } }, default: value };
}

test("refinery.schemaPlan refuses a draft nested past the bound with its code, and still plans one inside it", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);

  for (const depth of [JSON_MAX_DEPTH + 1, OVERFLOW_DEPTH]) {
    await expect(caller.refinery.schemaPlan({ schema: draftWithDefault(depth), stage: STAGE }), String(depth)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(MAX_DEPTH_REFUSAL),
    });
  }
  // Positive control: the same door answers a draft inside the bound (a rejection fails the test).
  await caller.refinery.schemaPlan({ schema: draftWithDefault(JSON_MAX_DEPTH - 1), stage: STAGE });
});
