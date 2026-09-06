// THE TOTALITY PIN for #1340. `vitest.stryker.config.ts` used to narrow the mutation lane by ALLOWLIST
// (`RUNTIME_LANES`) alone — which drops any project not named, silently, with zero signal. That let
// `integration-serial` (22 files) and `live-drive` (4 files) vanish from mutation coverage while the
// file's own comment named a THIRD, already-DEAD lane (`parity`, purged 2026-08-22 with #428) instead of
// either real one. The fix pairs the allowlist with a `DROPPED_LANES` map (name → reason) and an
// `assertEveryLaneClassified` guard that throws at Stryker's own config load if any `vitest.config.ts`
// project is in neither — so a lane ADDED to the base config and never classified here reds immediately
// instead of quietly losing mutation coverage. This pins BOTH the mechanism (it really throws) and the
// CURRENT state (every real lane is, in fact, classified).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertEveryLaneClassified, DROPPED_LANES, RUNTIME_LANES } from "../../vitest.stryker.config.ts";
import { expect, test } from "../support/tool-fixtures.ts";

/** The base config's OWN project-name list, read from `vitest.config.ts`'s SOURCE TEXT (never by
 *  importing the module): `vitest.stryker.config.ts` MUTATES the base config's `test.projects` array
 *  IN PLACE (same object identity — `const cfg = base as unknown as {…}`), so a second `import` of
 *  `vitest.config.ts` in the SAME process resolves to the already-filtered singleton, not the original
 *  8-lane list — measured live: the assertion below failed with only the 3 kept lanes visible until this
 *  was switched to a text read. A regex over the source is also what the row's own Definition-of-Done
 *  script does (`/name:\s*"([a-z-]+)"/g`), so this pin agrees with the row's own oracle by construction. */
function baseLaneNames(root: string): readonly string[] {
  const source = readFileSync(join(root, "vitest.config.ts"), "utf8");
  return [...source.matchAll(/name:\s*"([a-z-]+)"/g)].map((m) => m[1]).filter((name): name is string => name !== undefined);
}

test("every base-config lane is classified as EXACTLY one of kept or dropped — no overlap, no gap", ({ repoRoot }) => {
  const lanes = baseLaneNames(repoRoot);
  expect(lanes.length).toBeGreaterThan(0);

  for (const name of lanes) {
    const kept = RUNTIME_LANES.has(name);
    const dropped = DROPPED_LANES.has(name);
    expect(kept || dropped, `"${name}" (a real vitest.config.ts project) is classified by neither RUNTIME_LANES nor DROPPED_LANES`).toBe(true);
    expect(kept && dropped, `"${name}" is classified as BOTH kept and dropped — pick one`).toBe(false);
  }

  // The inverse direction: nothing in either map names a lane that doesn't exist (the exact #1340 defect
  // — the old comment named the dead `parity` lane instead of a live one).
  const laneSet = new Set(lanes);
  for (const name of RUNTIME_LANES) {
    expect(laneSet.has(name), `RUNTIME_LANES names "${name}", which vitest.config.ts no longer defines`).toBe(true);
  }
  for (const name of DROPPED_LANES.keys()) {
    expect(laneSet.has(name), `DROPPED_LANES names "${name}", which vitest.config.ts no longer defines`).toBe(true);
  }
});

test("every DROPPED_LANES entry carries a real, non-empty reason", () => {
  for (const [name, reason] of DROPPED_LANES) {
    expect(reason.trim().length, `DROPPED_LANES["${name}"] has an empty reason`).toBeGreaterThan(0);
  }
});

test("assertEveryLaneClassified: a lane absent from both maps throws (the guard is not a no-op)", () => {
  expect(() => assertEveryLaneClassified(["unit", "a-lane-nobody-classified"])).toThrow(/a-lane-nobody-classified/);
});

test("assertEveryLaneClassified: every real base-config lane passes silently (no false-positive throw)", ({ repoRoot }) => {
  expect(() => assertEveryLaneClassified(baseLaneNames(repoRoot))).not.toThrow();
});
