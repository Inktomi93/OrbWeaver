// Type-level pin for the demo seeder's reusable core. The property no runtime test can see: `runFullSeed`
// takes its whole world by INJECTION — db, clock, secret, dirs, and the vLLM-availability override — so
// the tooling int test can drive the REAL seed path against an in-memory db with a frozen clock. A
// refactor that reached for `env`/`Date.now()` inside instead would make this shape shrink, and the
// determinism the demo corpus depends on would go with it.
import { expectTypeOf, test } from "vitest";
import type { RunFullSeedDeps, RunFullSeedResult } from "../../../../tooling/src/seed/index.ts";

test("every non-deterministic input is injected, never ambient", () => {
  expectTypeOf<RunFullSeedDeps["now"]>().toEqualTypeOf<() => number>();
  expectTypeOf<RunFullSeedDeps["sessionSecret"]>().toEqualTypeOf<string>();
  expectTypeOf<RunFullSeedDeps["log"]>().toEqualTypeOf<(msg: string) => void>();
  // The GPU fact is an OPTIONAL override: absent ⇒ derive it the way boot does; present ⇒ the test pins it.
});

test("the result reports whether it AUGMENTED, so a sentinel skip is not silent", () => {
  expectTypeOf<RunFullSeedResult["augmented"]>().toEqualTypeOf<boolean>();
  // @orb-waive no-test-fabrication(RunFullSeedResult): a type-level probe — a `.test-d` file is typechecked, never executed, so the value is never read; the cast exists only so the next line can prove the property. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const result = {} as RunFullSeedResult;
  // @ts-expect-error — the seed outcome is evidence, not a mutable record.
  result.augmented = true;
});
