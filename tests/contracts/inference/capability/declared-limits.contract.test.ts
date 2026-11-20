// @subject packages/contracts/src/inference/capability/override.ts
// A connection's declared context window and max output are counts of tokens: the write schema refuses zero, a
// negative and a fraction, which would otherwise reach the history fit and the reply cap, and keeps a whole count.
import { declaredCapabilitySchema, GENERATION_FLOOR } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";

const REFUSED = [0, -5, 1.5] as const;
const KEPT = 128_000;
const MIN = GENERATION_FLOOR.output.maxTokens.min;

function withWindow(window: number): unknown {
  return { kind: "generation", generation: { context: { window } } };
}

function withMaxOutput(max: number): unknown {
  return { kind: "generation", generation: { output: { maxTokens: { min: MIN, max } } } };
}

test("a declared context window or max output that is not a whole count above zero is refused", () => {
  for (const value of REFUSED) {
    expect(declaredCapabilitySchema.safeParse(withWindow(value)).success, `window ${String(value)}`).toBe(false);
    expect(declaredCapabilitySchema.safeParse(withMaxOutput(value)).success, `max output ${String(value)}`).toBe(false);
  }
});

test("a whole count is kept as declared", () => {
  expect(declaredCapabilitySchema.parse(withWindow(KEPT))).toEqual(withWindow(KEPT));
  expect(declaredCapabilitySchema.parse(withMaxOutput(KEPT))).toEqual(withMaxOutput(KEPT));
});
