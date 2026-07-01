import type { RegexScript } from "@orb/contracts/regex";
import type { RegexScriptInput } from "@orb/kit/regex";
import { expectTypeOf, test } from "vitest";

// Type-level pin for the regex contract (core/Spine-Testing.md §1). The runtime `satisfies`-seam check lives in
// `index.contract.test.ts`; this is its `tsc`-time twin.

// ── The kit↔contracts satisfies-seam (Legacy-Migration-and-Gaps.md §6) ───────────────────────────────────────
// The pure executor in `@orb/kit/regex` reads a structural `RegexScriptInput`; kit may not import
// contracts, so the persisted `RegexScript` must structurally MATCH it. A field drift (rename/retype/
// widen) makes this assertion tsc-red — that is the whole point of the seam.
test("RegexScript structurally satisfies the kit executor's RegexScriptInput", () => {
  expectTypeOf<RegexScript>().toMatchTypeOf<RegexScriptInput>();
});
