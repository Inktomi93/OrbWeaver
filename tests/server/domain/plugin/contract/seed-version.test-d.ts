import { expectTypeOf, test } from "vitest";
import type { ShowcaseSeedResult } from "#server/domain/plugin/contract/showcase-seed.ts";

test("only installed showcase bundles carry written provenance", () => {
  expectTypeOf<{ outcome: "installed"; version: null }>().not.toExtend<ShowcaseSeedResult>();
  expectTypeOf<{ outcome: "present"; version: string }>().not.toExtend<ShowcaseSeedResult>();
  expectTypeOf<{ outcome: "unavailable"; version: string }>().not.toExtend<ShowcaseSeedResult>();
  expectTypeOf<{ outcome: "installed"; version: string }>().toExtend<ShowcaseSeedResult>();
  expectTypeOf<{ outcome: "present"; version: null }>().toExtend<ShowcaseSeedResult>();
  expectTypeOf<{ outcome: "unavailable"; version: null }>().toExtend<ShowcaseSeedResult>();
});
