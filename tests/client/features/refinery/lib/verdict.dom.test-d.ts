// The verdict's tone and word are total over the wire tuple, and neither reader takes a bare string.
import type { RefineryVerdict, RenderHintTone } from "@orb/contracts/refinery";
import { expectTypeOf, test } from "vitest";
import type { VERDICT_TONE, verdictToneOf, verdictWordOf } from "#client/features/refinery/lib/verdict.ts";

test("the maps are keyed by the verdict and the readers take one", () => {
  expectTypeOf<keyof typeof VERDICT_TONE>().toEqualTypeOf<RefineryVerdict>();
  expectTypeOf<Parameters<typeof verdictToneOf>[0]>().toEqualTypeOf<RefineryVerdict>();
  expectTypeOf<Parameters<typeof verdictWordOf>[0]>().toEqualTypeOf<RefineryVerdict>();
  expectTypeOf<ReturnType<typeof verdictToneOf>>().toEqualTypeOf<RenderHintTone>();
});
