import type { ApplyStatsDelta, StatsDelta } from "@orb/contracts/stats";
import { expectTypeOf, test } from "vitest";

// `ApplyStatsDelta` is the injected-op signature of the chat↔stats wire. `@orb/contracts` may not import the db,
// so `Batch` and `Db` are generic and bound to the concrete db types at the domain sites that fulfil it.
test("ApplyStatsDelta takes a batch, a db handle and the StatsDelta this contract owns, and returns nothing", () => {
  expectTypeOf<ApplyStatsDelta<string[], number>>().toEqualTypeOf<(batch: string[], db: number, delta: StatsDelta) => void>();
});
