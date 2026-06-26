// The composed test (spine/testing.md §4) — `test.extend` over beforeEach. Today it provides the two
// determinism fixtures (frozen clock + seeded ids); `db` (migrated libSQL :memory:) + the seeded
// services join as @orb/db and the domains land (Phase 3+). Import `test`/`expect` from here, not vitest.

import { test as base } from "vitest";
import type { Clock } from "./clock.ts";
import { createFrozenClock } from "./clock.ts";
import type { SeededIds } from "./ids.ts";
import { createSeededIds } from "./ids.ts";

export interface Fixtures {
  clock: Clock;
  ids: SeededIds;
}

// `({}, use)` is the vitest fixture idiom — the 1st arg MUST be an object-destructuring pattern (else
// FixtureParseError); `{}` = depends on no other fixture. noEmptyPattern is off for tests/** (biome.json
// override) precisely so this idiom needs no per-fixture suppression.
export const test = base.extend<Fixtures>({
  clock: async ({}, use): Promise<void> => {
    await use(createFrozenClock());
  },
  ids: async ({}, use): Promise<void> => {
    await use(createSeededIds());
  },
});

export { expect } from "vitest";
