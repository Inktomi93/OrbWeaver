// T14/T15 for snap specifically (#1283): the pure
// load-scaling contract is pinned once, fleet-wide, at tests/tooling/_shared/load-budget.test.ts — this
// file proves snap's OWN drive/stage/throttle ceilings are wired to it, using the SAME base numbers
// tooling/src/snap/lib/budgets.ts actually declares (imported, never re-typed, so a base that changes
// there cannot silently drift out of what this pin exercises).
//
// Every export in lib/budgets.ts is `budget(<X>_BASE_MS)`, evaluated ONCE at module import against the
// LIVE box — there is no per-call injection seam at that call site (each snap invocation is a fresh
// process, so the live reading is correct for the shipped code). To prove the FORMULA those exports rest
// on stretches/holds them correctly, this file re-applies `budget()` to the real, imported bases with an
// INJECTED reader — the same technique T14/T15 use everywhere else — rather than re-deriving the numbers.
import { budget } from "../../../../tooling/src/_shared/load-budget.ts";
import {
  MOUNT_SETTLE_MS,
  NAV_BASE_MS,
  NAV_TIMEOUT_MS,
  NETWORKIDLE_BASE_MS,
  STAGE_NAV_BASE_MS,
  STAGE_READY_BASE_MS,
  STEP_BASE_MS,
  STEP_SETTLE_MS,
  THROTTLED_NAV_BASE_MS,
  THROTTLED_READY_BASE_MS,
  WAIT_SELECTOR_BASE_MS,
} from "../../../../tooling/src/snap/lib/budgets.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Per-core 4.0 on a 24-core box — the FORCED-LOAD reading T14 uses (mirrors tests/tooling/_shared/load-budget.test.ts). */
const LOADED = { loadavg1: 96, cpuCount: 24 } as const;
/** Per-core 0.3 — quiet, and quiet is EXACTLY factor 1. */
const QUIET = { loadavg1: 7.2, cpuCount: 24 } as const;
const readLoaded = (): typeof LOADED => LOADED;
const readQuiet = (): typeof QUIET => QUIET;

const SNAP_BASES = [
  NAV_BASE_MS,
  WAIT_SELECTOR_BASE_MS,
  STAGE_NAV_BASE_MS,
  STAGE_READY_BASE_MS,
  THROTTLED_NAV_BASE_MS,
  THROTTLED_READY_BASE_MS,
  STEP_BASE_MS,
  NETWORKIDLE_BASE_MS,
];

test("T15 — every snap drive/stage/throttle base is byte-identical to itself under a quiet reading", () => {
  for (const base of SNAP_BASES) {
    expect(budget(base, readQuiet)).toBe(base);
  }
  // The module-loaded ceilings ARE these bases on this (quiet, solo-test) box — the live-reader half of
  // the contract, exercised without injection so a broken os.loadavg() read cannot hide behind fakes.
  expect(NAV_TIMEOUT_MS).toBeGreaterThanOrEqual(NAV_BASE_MS);
});

test("T14 — every snap drive/stage/throttle base STRETCHES under a forced-load reading (4x per-core)", () => {
  for (const base of SNAP_BASES) {
    expect(budget(base, readLoaded)).toBe(base * 4);
  }
});

test("the settle sleeps are NEVER budgets (§7.1: a settle is not a budget) — no BASE const backs them", () => {
  // STEP_SETTLE_MS / MOUNT_SETTLE_MS are declared as plain literals, not `budget(<X>_BASE_MS)` — the
  // sweep in this file's own header ("every export IS budget(...)") stops at exactly the bases list
  // above. Pinned here as literal values so a future edit that routes one through `budget()` (silently
  // starting to stretch a sleep every run pays in full) shows up as a changed number in this file's diff.
  expect(STEP_SETTLE_MS).toBe(400);
  expect(MOUNT_SETTLE_MS).toBe(500);
});
