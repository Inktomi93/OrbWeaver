// Canonical authored test vocabulary: one suffix definition owns family, compiler world, mirror behavior,
// source compatibility, and the runtime runner derived from family. Native glob syntax stays with runners.

const RAW_TEST_KIND_DEFINITIONS = [
  { suffix: ".test.ts", family: "unit", compilerWorld: "node", mirror: "module", sourceExtensions: [".ts"], resource: null },
  { suffix: ".dom.test.ts", family: "unit", compilerWorld: "browser", mirror: "module", sourceExtensions: [".ts", ".tsx"], resource: null },
  { suffix: ".int.test.ts", family: "integration", compilerWorld: "node", mirror: "module", sourceExtensions: [".ts"], resource: null },
  {
    suffix: ".repo.int.test.ts",
    family: "integration",
    compilerWorld: "node",
    mirror: "module",
    sourceExtensions: [".ts"],
    resource: "repository",
  },
  { suffix: ".suite.int.test.ts", family: "integration", compilerWorld: "node", mirror: "suite", sourceExtensions: [".ts"], resource: null },
  { suffix: ".contract.test.ts", family: "contract", compilerWorld: "node", mirror: "module", sourceExtensions: [".ts"], resource: null },
  { suffix: ".test-d.ts", family: "type", compilerWorld: "node", mirror: "module", sourceExtensions: [".ts"], resource: null },
  { suffix: ".dom.test-d.ts", family: "type", compilerWorld: "browser", mirror: "module", sourceExtensions: [".ts", ".tsx"], resource: null },
  { suffix: ".suite.test.ts", family: "unit", compilerWorld: "node", mirror: "suite", sourceExtensions: [".ts"], resource: null },
  { suffix: ".ct.tsx", family: "component", compilerWorld: "browser", mirror: "module", sourceExtensions: [".tsx", ".ts"], resource: null },
  { suffix: ".suite.ct.tsx", family: "component", compilerWorld: "browser", mirror: "suite", sourceExtensions: [".tsx", ".ts"], resource: null },
  { suffix: ".spec.ts", family: "e2e", compilerWorld: "browser", mirror: "e2e-only", sourceExtensions: [".ts"], resource: null },
] as const;

export type TestKindDefinition = (typeof RAW_TEST_KIND_DEFINITIONS)[number];
export type TestFamily = TestKindDefinition["family"];
export type TestCompilerWorld = TestKindDefinition["compilerWorld"];
export type TestResource = NonNullable<TestKindDefinition["resource"]>;

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

export const VITEST_TYPECHECK_GROUP_PREFIX = "types-";

export function vitestTypecheckGroupName(world: TestCompilerWorld): `types-${TestCompilerWorld}` {
  return `${VITEST_TYPECHECK_GROUP_PREFIX}${world}`;
}

export const VITEST_TYPECHECK_GROUP_NAMES: readonly `types-${TestCompilerWorld}`[] = Object.freeze(
  [...new Set(TEST_KIND_DEFINITIONS.filter(({ family }) => family === "type").map(({ compilerWorld }) => vitestTypecheckGroupName(compilerWorld)))].toSorted(),
);
export const VITEST_RUNTIME_ONLY_GROUP_FILTER = `!${VITEST_TYPECHECK_GROUP_PREFIX}*`;
export const VITEST_RUNTIME_FAMILY_GROUPS: readonly TestFamily[] = Object.freeze(
  [
    ...new Set(
      TEST_KIND_DEFINITIONS.filter(({ family, resource }) => resource === null && runtimeForTestFamily(family) === "vitest").map(({ family }) => family),
    ),
  ].toSorted(),
);
export const TEST_RESOURCE_NAMES: readonly TestResource[] = Object.freeze(
  [...new Set(TEST_KIND_DEFINITIONS.flatMap(({ resource }) => (resource === null ? [] : [resource])))].toSorted(),
);

export interface TestFilenameClassification {
  readonly definition: TestKindDefinition;
  readonly sourceBasename: string;
}

/** Recognize test-shaped filenames even when their extension/kind is unsupported, so they cannot disappear as helpers. */
export function looksLikeTestFilename(filename: string): boolean {
  return /\.(?:test|ct|spec)(?:-d)?\.[^.]+$/u.test(filename);
}

export function classifyTestFilename(filename: string): TestFilenameClassification | undefined {
  const definition = TEST_KIND_DEFINITIONS.find(({ suffix }) => filename.endsWith(suffix));
  return definition === undefined ? undefined : { definition, sourceBasename: filename.slice(0, -definition.suffix.length) };
}
