// Canonical authored test vocabulary: one suffix definition owns family, compiler world, mirror behavior,
// source compatibility, and the runtime runner derived from family. Native glob syntax stays with runners.

const RAW_TEST_KIND_DEFINITIONS = [
  { suffix: ".test.ts", family: "unit", compilerWorld: "node", mirror: "module", sourceExtensions: [".ts"] },
  { suffix: ".test.tsx", family: "unit", compilerWorld: "browser", mirror: "module", sourceExtensions: [".tsx", ".ts"] },
  { suffix: ".dom.test.ts", family: "unit", compilerWorld: "browser", mirror: "module", sourceExtensions: [".ts", ".tsx"] },
  { suffix: ".int.test.ts", family: "integration", compilerWorld: "node", mirror: "module", sourceExtensions: [".ts"] },
  { suffix: ".suite.int.test.ts", family: "integration", compilerWorld: "node", mirror: "suite", sourceExtensions: [".ts"] },
  { suffix: ".contract.test.ts", family: "contract", compilerWorld: "node", mirror: "module", sourceExtensions: [".ts"] },
  { suffix: ".test-d.ts", family: "type", compilerWorld: "node", mirror: "module", sourceExtensions: [".ts"] },
  { suffix: ".dom.test-d.ts", family: "type", compilerWorld: "browser", mirror: "module", sourceExtensions: [".ts", ".tsx"] },
  { suffix: ".suite.test.ts", family: "unit", compilerWorld: "node", mirror: "suite", sourceExtensions: [".ts"] },
  { suffix: ".ct.tsx", family: "component", compilerWorld: "browser", mirror: "module", sourceExtensions: [".tsx", ".ts"] },
  { suffix: ".suite.ct.tsx", family: "component", compilerWorld: "browser", mirror: "suite", sourceExtensions: [".tsx", ".ts"] },
  { suffix: ".spec.ts", family: "e2e", compilerWorld: "browser", mirror: "e2e-only", sourceExtensions: [".ts"] },
] as const;

export type TestKindDefinition = (typeof RAW_TEST_KIND_DEFINITIONS)[number];
export type TestFamily = TestKindDefinition["family"];
export type TestCompilerWorld = TestKindDefinition["compilerWorld"];

const suffixes = RAW_TEST_KIND_DEFINITIONS.map(({ suffix }) => suffix);
if (new Set(suffixes).size !== suffixes.length) {
  throw new Error("duplicate authored test-kind suffix");
}

/** Longest match wins, so overlapping suffixes never depend on hand-maintained registry order. */
export const TEST_KIND_DEFINITIONS: readonly TestKindDefinition[] = Object.freeze(
  [...RAW_TEST_KIND_DEFINITIONS].toSorted((left, right) => right.suffix.length - left.suffix.length || left.suffix.localeCompare(right.suffix)),
);

export const TEST_KIND_SUFFIXES: readonly TestKindDefinition["suffix"][] = Object.freeze(TEST_KIND_DEFINITIONS.map(({ suffix }) => suffix));
export const RUNTIME_TEST_SUFFIXES: readonly TestKindDefinition["suffix"][] = Object.freeze(
  TEST_KIND_DEFINITIONS.filter(({ family }) => family !== "type").map(({ suffix }) => suffix),
);
export const TYPE_TEST_SUFFIXES: readonly TestKindDefinition["suffix"][] = Object.freeze(
  TEST_KIND_DEFINITIONS.filter(({ family }) => family === "type").map(({ suffix }) => suffix),
);
export const BROWSER_TEST_SUFFIXES: readonly TestKindDefinition["suffix"][] = Object.freeze(
  TEST_KIND_DEFINITIONS.filter(({ compilerWorld }) => compilerWorld === "browser").map(({ suffix }) => suffix),
);
const RUNTIME_BY_FAMILY = {
  unit: "vitest",
  integration: "vitest",
  contract: "vitest",
  type: "vitest-typecheck",
  component: "playwright-ct",
  e2e: "playwright-e2e",
} as const satisfies Readonly<Record<TestFamily, string>>;

export type TestRuntime = (typeof RUNTIME_BY_FAMILY)[TestFamily];

export function runtimeForTestFamily(family: TestFamily): TestRuntime {
  return RUNTIME_BY_FAMILY[family];
}

export interface TestFilenameClassification {
  readonly definition: TestKindDefinition;
  readonly sourceBasename: string;
}

export function classifyTestFilename(filename: string): TestFilenameClassification | undefined {
  const definition = TEST_KIND_DEFINITIONS.find(({ suffix }) => filename.endsWith(suffix));
  return definition === undefined ? undefined : { definition, sourceBasename: filename.slice(0, -definition.suffix.length) };
}
