// Type-level pin for the A/B harness's probe contract. The property no runtime test can see: a probe's
// `verify` returns `string | null` — a DEFECT DESCRIPTION or nothing — never a boolean. That is what makes
// every ERR cell in the summary carry its own reason; a boolean would collapse "refused", "empty content"
// and "think tags leaked" into one indistinguishable red.
import { expectTypeOf, test } from "vitest";
import type { ChatResponse, Probe, ProbeResult } from "../../../../tooling/src/model-ab/index.ts";

test("a probe verifier reports WHY, not just whether", () => {
  expectTypeOf<NonNullable<Probe["verify"]>>().toEqualTypeOf<(r: ChatResponse) => string | null>();
  expectTypeOf<Probe["body"]>().toEqualTypeOf<() => Record<string, unknown>>();
});

test("a probe result always carries its own verdict + timing, so an ERR row is never blank", () => {
  expectTypeOf<ProbeResult["ok"]>().toEqualTypeOf<boolean>();
  expectTypeOf<ProbeResult["status"]>().toEqualTypeOf<number>();
  expectTypeOf<ProbeResult["ms"]>().toEqualTypeOf<number>();
  // @orb-waive no-test-fabrication(ProbeResult): a type-level probe — a `.test-d` file is typechecked, never executed, so the value is never read; the cast exists only so the next line can prove the property. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const result = {} as ProbeResult;
  // @ts-expect-error — a recorded probe result is evidence, not a mutable row.
  result.ok = true;
});
