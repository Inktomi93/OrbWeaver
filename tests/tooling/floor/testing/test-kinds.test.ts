import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  BROWSER_TEST_SUFFIXES,
  classifyTestFilename,
  looksLikeTestFilename,
  RUNTIME_TEST_SUFFIXES,
  runtimeForTestFamily,
  TEST_KIND_DEFINITIONS,
  TEST_KIND_SUFFIXES,
  TEST_RESOURCE_NAMES,
  TYPE_TEST_SUFFIXES,
  timingCapabilityForTestFamily,
  VITEST_RUNTIME_FAMILY_GROUPS,
} from "@orb/tooling/floor/testing/test-kinds";
import { vitestConfig } from "../../../../vitest.config.ts";

interface ProjectShape {
  readonly test?: { readonly include?: readonly string[]; readonly typecheck?: { readonly include?: readonly string[] } };
}

const NATIVE_CONFIG = vitestConfig();

/** Every positive include glob that selects a suffix Vitest cannot execute. A negated glob only excludes. */
function playwrightSuffixIncludes(projects: readonly ProjectShape[], suffixes: readonly string[]): string[] {
  return projects
    .flatMap(({ test: config }) => [...(config?.include ?? []), ...(config?.typecheck?.include ?? [])])
    .filter((glob) => !glob.startsWith("!") && suffixes.some((suffix) => glob.includes(suffix)));
}

const PLAYWRIGHT_SUFFIXES = TEST_KIND_DEFINITIONS.filter(({ family }) => runtimeForTestFamily(family).startsWith("playwright")).map(({ suffix }) => suffix);

test("no native Vitest project include selects a Playwright component or e2e suffix", () => {
  // The two founding suffixes stay a floor so the derived set cannot narrow unnoticed.
  expect(PLAYWRIGHT_SUFFIXES).toEqual(expect.arrayContaining([".ct.tsx", ".suite.ct.tsx", ".spec.ts"]));
  const projects = NATIVE_CONFIG.test?.projects ?? [];
  expect(projects.length).toBeGreaterThan(0);
  // A string path or a factory carries includes this check cannot read; refuse it instead of passing it unseen.
  expect(projects.filter((project) => typeof project !== "object")).toEqual([]);
  // Every runtime project sets `extends: true`, and Vitest concatenates the root's include arrays into each child,
  // so a root-level glob reaches every project. The root is judged as one more project.
  expect(playwrightSuffixIncludes([NATIVE_CONFIG, ...(projects as readonly ProjectShape[])], PLAYWRIGHT_SUFFIXES)).toEqual([]);
});

test("the Playwright-suffix include check rejects a browser glob and keeps node-runner and DOM-subject globs", () => {
  const withInclude = (...include: string[]): ProjectShape[] => [{ test: { include } }];
  expect(playwrightSuffixIncludes(withInclude("tests/**/*.ct.tsx"), PLAYWRIGHT_SUFFIXES)).toEqual(["tests/**/*.ct.tsx"]);
  expect(playwrightSuffixIncludes(withInclude("tests/e2e/**/*.spec.ts"), PLAYWRIGHT_SUFFIXES)).toEqual(["tests/e2e/**/*.spec.ts"]);
  expect(playwrightSuffixIncludes([{ test: { typecheck: { include: ["tests/**/*.suite.ct.tsx"] } } }], PLAYWRIGHT_SUFFIXES)).toEqual([
    "tests/**/*.suite.ct.tsx",
  ]);
  expect(playwrightSuffixIncludes(withInclude("tests/**/*.test.ts", "tests/**/*.int.test.ts"), PLAYWRIGHT_SUFFIXES)).toEqual([]);
  expect(playwrightSuffixIncludes(withInclude("tests/**/*.dom.test.ts", "tests/**/*.test-d.ts", "!tests/**/*.ct.tsx"), PLAYWRIGHT_SUFFIXES)).toEqual([]);
});

test("native timing capability follows registered runtime kinds, not compiler world", () => {
  for (const kind of TEST_KIND_DEFINITIONS) {
    expect(kind.timingCapability).toBe(kind.family === "type" ? null : "stable-timing");
    expect(timingCapabilityForTestFamily(kind.family)).toBe(kind.timingCapability);
  }
});

test("classifies overlapping suffixes by longest match and keeps the source basename", () => {
  expect(classifyTestFilename("drift.suite.int.test.ts")).toMatchObject({
    definition: { suffix: ".suite.int.test.ts", family: "integration", mirror: "suite" },
    sourceBasename: "drift",
  });
  expect(classifyTestFilename("shape.contract.test.ts")).toMatchObject({
    definition: { suffix: ".contract.test.ts", family: "contract", mirror: "module" },
    sourceBasename: "shape",
  });
  expect(classifyTestFilename("plain.int.test.ts")?.definition.suffix).toBe(".int.test.ts");
  expect(classifyTestFilename("corpus.repo.int.test.ts")).toMatchObject({
    definition: { suffix: ".repo.int.test.ts", family: "integration", compilerWorld: "node", mirror: "module", resource: "repository" },
    sourceBasename: "corpus",
  });
});

test("distinguishes DOM runtime and type kinds from their node-world twins", () => {
  expect(classifyTestFilename("view.dom.test.ts")?.definition).toMatchObject({ family: "unit", compilerWorld: "browser" });
  expect(classifyTestFilename("view.dom.test-d.ts")?.definition).toMatchObject({ family: "type", compilerWorld: "browser" });
  expect(classifyTestFilename("view.test.ts")?.definition).toMatchObject({ family: "unit", compilerWorld: "node" });
  expect(classifyTestFilename("view.test-d.ts")?.definition).toMatchObject({ family: "type", compilerWorld: "node" });
});

test("isolated semantic corpus suites have a separately priced native resource", () => {
  expect(classifyTestFilename("liveness.suite.corpus.int.test.ts")).toMatchObject({
    definition: { family: "integration", compilerWorld: "node", mirror: "suite", resource: "semantic-corpus" },
    sourceBasename: "liveness",
  });
});

test("component mirrors accept TSX or TS sources and unknown suffixes stay unclassified", () => {
  expect(classifyTestFilename("button.ct.tsx")?.definition.sourceExtensions).toEqual([".tsx", ".ts"]);
  expect(classifyTestFilename("matrix.suite.ct.tsx")?.definition).toMatchObject({ mirror: "suite", compilerWorld: "browser" });
  expect(classifyTestFilename("button.browser.ts")).toBeUndefined();
  expect(classifyTestFilename("button.test.tsx")).toBeUndefined();
  expect(looksLikeTestFilename("button.test.tsx")).toBe(true);
  expect(looksLikeTestFilename("button.ct-d.ts")).toBe(true);
  expect(looksLikeTestFilename("button.fixtures.tsx")).toBe(false);
});

test("derived selectors and runtime dispatch cover the registry without duplicate suffixes", () => {
  expect(new Set(TEST_KIND_SUFFIXES).size).toBe(TEST_KIND_DEFINITIONS.length);
  expect(TEST_KIND_DEFINITIONS.map(({ suffix }) => suffix.length)).toEqual(
    TEST_KIND_DEFINITIONS.map(({ suffix }) => suffix.length).toSorted((left, right) => right - left),
  );
  expect(TYPE_TEST_SUFFIXES).toContain(".test-d.ts");
  expect(TYPE_TEST_SUFFIXES).toContain(".dom.test-d.ts");
  expect(TYPE_TEST_SUFFIXES.every((suffix) => !RUNTIME_TEST_SUFFIXES.includes(suffix))).toBe(true);
  expect(BROWSER_TEST_SUFFIXES).toEqual(expect.arrayContaining([".dom.test.ts", ".dom.test-d.ts", ".ct.tsx", ".spec.ts"]));
  expect(runtimeForTestFamily("integration")).toBe("vitest");
  expect(TEST_KIND_DEFINITIONS.filter(({ resource }) => resource === "repository").map(({ suffix }) => suffix)).toEqual([
    ".suite.repo.int.test.ts",
    ".repo.int.test.ts",
  ]);
  expect(TEST_RESOURCE_NAMES).toEqual(["repository", "semantic-corpus"]);
  expect(VITEST_RUNTIME_FAMILY_GROUPS).toEqual(["contract", "integration", "unit"]);
  expect(runtimeForTestFamily("type")).toBe("vitest-typecheck");
  expect(runtimeForTestFamily("component")).toBe("playwright-ct");
  expect(runtimeForTestFamily("e2e")).toBe("playwright-e2e");
});
