// Snap's ceilings are `budget` over their bases (tooling/src/snap/lib/budgets.ts). The fleet-wide formula is pinned in
// tests/tooling/floor/host/load-budget.test.ts; this file proves every snap ceiling is that formula over its own base.

import { expect, test } from "@orb/testkit/tooling";
import { MOUNT_SETTLE_MS, SNAP_BASES_MS, SNAP_CEILINGS_MS, STEP_SETTLE_MS, snapCeilings } from "../../../../tooling/src/snap/lib/budgets.ts";

/** Per-core 4.0 on a 24-core box, the forced-load reading tests/tooling/floor/host/load-budget.test.ts uses. */
const LOADED = { loadavg1: 96, cpuCount: 24 } as const;
const LOADED_FACTOR = 4;
/** Per-core 0.3: quiet, which is exactly factor 1. */
const QUIET = { loadavg1: 7.2, cpuCount: 24 } as const;

test("a quiet reading leaves every snap ceiling at its base", () => {
  expect(snapCeilings(() => QUIET)).toEqual(SNAP_BASES_MS);
});

test("a forced-load reading stretches every snap ceiling from its own base", () => {
  const loaded = snapCeilings(() => LOADED);
  for (const name of Object.keys(SNAP_BASES_MS) as (keyof typeof SNAP_BASES_MS)[]) {
    expect(loaded[name], name).toBe(SNAP_BASES_MS[name] * LOADED_FACTOR);
    // The module-loaded ceilings come from the live reader, which can only stretch a base.
    expect(SNAP_CEILINGS_MS[name], name).toBeGreaterThanOrEqual(SNAP_BASES_MS[name]);
  }
});

test("the settle sleeps are never budgets", () => {
  // Routing a sleep through `budget` would stretch a wait every run pays in full; this pins the literal.
  expect(STEP_SETTLE_MS).toBe(400);
  expect(MOUNT_SETTLE_MS).toBe(500);
});
