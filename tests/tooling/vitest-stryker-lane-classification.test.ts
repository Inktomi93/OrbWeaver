// The mutation run derives from the normal config; a project may never vanish from it unclassified.
import { expect, test } from "@orb/testkit/tooling";
import base from "../../vitest.config.ts";
import mutation, { assertEveryLaneClassified, DROPPED_LANES, RUNTIME_LANES } from "../../vitest.stryker.config.ts";

function baseLaneNames(): readonly string[] {
  return (base.test?.projects ?? []).flatMap((project) =>
    typeof project === "object" && "test" in project && typeof project.test.name === "string" ? [project.test.name] : [],
  );
}

test("every base project is kept or dropped, exactly once, and neither list names a dead project", () => {
  const lanes = baseLaneNames();
  expect(lanes.length).toBeGreaterThan(0);
  expect([...RUNTIME_LANES, ...DROPPED_LANES.keys()].toSorted()).toEqual(lanes.toSorted());
});

test("a project in neither list refuses at config load", () => {
  expect(() => assertEveryLaneClassified(["unit", "a-lane-nobody-classified"])).toThrow(/a-lane-nobody-classified/u);
});

test("every project that can hold a behavior test of a named file stays in the run", () => {
  expect(mutation.test.projects.map((project) => project.test.name)).toEqual(baseLaneNames().filter((name) => RUNTIME_LANES.has(name)));
  expect(mutation.test.projects.map((project) => project.test.name)).toEqual(expect.arrayContaining(["unit", "integration", "contract", "repository"]));
});

test("the overlay keeps the base rigor and leaves the base config alone", () => {
  expect(mutation.test).not.toBe(base.test);
  expect(base.test?.projects).toHaveLength(RUNTIME_LANES.size + DROPPED_LANES.size);
  expect(mutation.test).toMatchObject({ restoreMocks: true, allowOnly: false, passWithNoTests: false, expect: { requireAssertions: true } });
});
