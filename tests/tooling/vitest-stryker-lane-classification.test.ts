// Native config imports must retain the base population and mutation-specific rigor.
import base from "../../vitest.config.ts";
import mutation, { assertEveryLaneClassified, DROPPED_LANES, RUNTIME_LANES } from "../../vitest.stryker.config.ts";
import { expect, test } from "../support/tool-fixtures.ts";

function baseLaneNames(): readonly string[] {
  return (base.test?.projects ?? []).flatMap((project) =>
    typeof project === "object" && "test" in project && project.test.name !== undefined ? [String(project.test.name)] : [],
  );
}

test("every base-config lane is classified as EXACTLY one of kept or dropped — no overlap, no gap", () => {
  const lanes = baseLaneNames();
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

test("assertEveryLaneClassified: every real base-config lane passes silently (no false-positive throw)", () => {
  expect(() => assertEveryLaneClassified(baseLaneNames())).not.toThrow();
});

test("Stryker import preserves the base population and creates independent override objects", () => {
  expect(mutation).not.toBe(base);
  expect(mutation.test).not.toBe(base.test);
  expect(base.test?.projects?.length).toBe(RUNTIME_LANES.size + DROPPED_LANES.size);
  expect(base.test?.fileParallelism).toBeUndefined();
  expect(mutation.test.projects.map((project) => project.test.name)).toEqual(baseLaneNames().filter((name) => RUNTIME_LANES.has(name)));
  expect(mutation.test.fileParallelism).toBe(false);
  expect(mutation.test.maxWorkers).toBe(1);
  expect(mutation.test.tagsFilter).toEqual(["!requires-process-chdir && !source-freshness && !requires-git-history"]);
  for (const project of mutation.test.projects) {
    const original = base.test?.projects?.find(
      (candidate) => typeof candidate === "object" && "test" in candidate && candidate.test.name === project.test.name,
    );
    const originalExclude = typeof original === "object" && "test" in original ? (original.test.exclude ?? []) : [];
    expect(project).not.toBe(original);
    expect(project.test.exclude).toEqual([...originalExclude, "tests/tooling/**"]);
  }
  expect(mutation.test).toMatchObject({
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    allowOnly: false,
    passWithNoTests: false,
    expect: { requireAssertions: true },
  });
});
