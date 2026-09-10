import { matchesGlob } from "node:path";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import ctConfig from "../../playwright-ct.config.ts";
import { readPolicyRepositoryInventory } from "../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { MODE_PROJECTS } from "../e2e/support/modes.ts";
import { expect, test } from "../support/tool-fixtures.ts";

test("Playwright CT selects every registered component filename and rejects other kinds", () => {
  expect(Array.isArray(ctConfig.testMatch)).toBe(true);
  const patterns = Array.isArray(ctConfig.testMatch) ? ctConfig.testMatch.filter((pattern): pattern is string => typeof pattern === "string") : [];
  for (const { suffix } of TEST_KIND_DEFINITIONS.filter(({ family }) => family === "component")) {
    expect(patterns.some((pattern) => matchesGlob(`tests/ui/representative${suffix}`, pattern))).toBe(true);
  }
  expect(patterns.some((pattern) => matchesGlob("tests/ui/representative.test.ts", pattern))).toBe(false);
  expect(patterns.some((pattern) => matchesGlob("tests/e2e/representative.spec.ts", pattern))).toBe(false);
});

test("every registered and authored e2e spec belongs to exactly one auth-mode project", ({ repoRoot }) => {
  const suffixes = TEST_KIND_DEFINITIONS.filter(({ family }) => family === "e2e").map(({ suffix: value }) => value);
  for (const suffix of suffixes) {
    expect(MODE_PROJECTS.filter(({ testMatch }) => testMatch.test(`representative${suffix}`)).map(({ name }) => name)).toEqual(["single-user"]);
    expect(MODE_PROJECTS.filter(({ testMatch }) => testMatch.test(`representative.local${suffix}`)).map(({ name }) => name)).toEqual(["local"]);
    expect(MODE_PROJECTS.filter(({ testMatch }) => testMatch.test(`representative.forward${suffix}`)).map(({ name }) => name)).toEqual(["forward-header"]);
  }
  expect(MODE_PROJECTS.some(({ testMatch }) => testMatch.test("representative.ct.tsx"))).toBe(false);
  const specs = readPolicyRepositoryInventory(repoRoot).trackedPaths.filter(
    (path) => path.startsWith("tests/e2e/") && suffixes.some((suffix) => path.endsWith(suffix)),
  );
  expect(specs.length).toBeGreaterThan(0);
  for (const spec of specs) {
    expect(MODE_PROJECTS.filter(({ testMatch }) => testMatch.test(spec)).map(({ name }) => name)).toHaveLength(1);
  }
});
