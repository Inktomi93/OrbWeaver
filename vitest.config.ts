import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { budget } from "@orb/tooling/_shared/load-budget";
import type { TestCompilerWorld, TestFamily, TestResource } from "@orb/tooling/_shared/test-kinds";
import { runtimeForTestFamily, TEST_KIND_DEFINITIONS, vitestTypecheckGroupName } from "@orb/tooling/_shared/test-kinds";
import { defineConfig } from "vitest/config";

// Native runner globs compose the registered vocabulary. Browser-subject .dom tests still execute in
// Node; Playwright owns browser execution. Each project inherits the cleanup and isolation defaults.
function testGlobs(family: TestFamily, world?: TestCompilerWorld): string[] {
  return TEST_KIND_DEFINITIONS.filter((kind) => kind.family === family && (world === undefined || kind.compilerWorld === world)).map(
    ({ suffix }) => `tests/**/*${suffix}`,
  );
}

// Negative include globs keep overlapping suffixes in one execution group while leaving `test.exclude`
// unset. Vitest 4.1.11 applies CLI --exclude to child groups only while neither root nor child owns it.
function exclusiveTestGlobs(predicate: (kind: (typeof TEST_KIND_DEFINITIONS)[number]) => boolean, prefix = "tests/**/*"): string[] {
  const selected = TEST_KIND_DEFINITIONS.filter(predicate);
  const overlaps = TEST_KIND_DEFINITIONS.filter((kind) => !predicate(kind) && selected.some(({ suffix }) => kind.suffix.endsWith(suffix)));
  return [...selected.map(({ suffix }) => `${prefix}${suffix}`), ...overlaps.map(({ suffix }) => `!${prefix}${suffix}`)];
}

function resourceGlobs(resource: TestResource): string[] {
  return TEST_KIND_DEFINITIONS.filter((kind) => kind.resource === resource).map(({ suffix }) => `tests/**/*${suffix}`);
}

const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.stryker-tmp/**", "reports/**", "**/__g_*"];
const withIgnored = (globs: readonly string[]): string[] => [...globs, ...IGNORE.map((glob) => `!${glob}`)];
const TOOLING = "tests/tooling/**";
const REPOSITORY_RESOURCE = "repository" satisfies TestResource;
const BROWSER_TYPES = testGlobs("type", "browser");
const REPOSITORY_TEST_GLOBS = resourceGlobs(REPOSITORY_RESOURCE);
const CONCURRENCY = readConcurrencyProfile();
const inCI = process.env["CI"] !== undefined;

const NORMAL_GROUP_ORDER = 0;
const REPOSITORY_GROUP_ORDER = 1;

// Vitest forces incremental flags; this wrapper enforces the repository's cold semantic-check policy.
const TYPECHECKER = "scripts/ts7.cjs";

export default defineConfig({
  test: {
    testTimeout: budget(5000),
    hookTimeout: budget(10_000),
    // Keep fixtures independent of the operator's .env and avoid loading live embedding providers.
    env: { CORPUS_AUTOINDEX: "false", LOG_LEVEL: "silent", ORB_ENV_NO_FILE: "1", VLLM_DISABLED: "true" },
    // Native bindings need process isolation; module isolation stays at Vitest's true default.
    pool: "forks",
    maxWorkers: CONCURRENCY.vitestMaxWorkers,
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    allowOnly: false,
    expect: { requireAssertions: true },
    chaiConfig: { truncateThreshold: 0 },
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}", "tooling/src/**/*.ts"],
      exclude: ["**/index.ts", "**/*.d.ts", "**/*.test-d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      reportOnFailure: true,
    },
    reporters: inCI ? ["default", "github-actions", ["junit", { outputFile: "reports/junit.xml" }]] : ["default"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          sequence: { groupOrder: NORMAL_GROUP_ORDER },
          include: withIgnored([...exclusiveTestGlobs(({ family, resource }) => family === "unit" && resource === null), `!${TOOLING}`]),
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          sequence: { groupOrder: NORMAL_GROUP_ORDER },
          include: withIgnored([...exclusiveTestGlobs(({ family, resource }) => family === "integration" && resource === null), `!${TOOLING}`]),
        },
      },
      {
        extends: true,
        test: {
          name: REPOSITORY_RESOURCE,
          sequence: { groupOrder: REPOSITORY_GROUP_ORDER },
          include: withIgnored(REPOSITORY_TEST_GLOBS),
          fileParallelism: false,
          testTimeout: budget(30_000),
        },
      },
      {
        extends: true,
        test: {
          name: "tooling",
          sequence: { groupOrder: NORMAL_GROUP_ORDER },
          include: withIgnored(
            exclusiveTestGlobs(({ family, resource }) => runtimeForTestFamily(family) === "vitest" && resource === null, "tests/tooling/**/*"),
          ),
        },
      },
      {
        extends: true,
        test: {
          name: "contract",
          sequence: { groupOrder: NORMAL_GROUP_ORDER },
          include: withIgnored([...exclusiveTestGlobs(({ family, resource }) => family === "contract" && resource === null), `!${TOOLING}`]),
        },
      },
      {
        extends: true,
        test: {
          name: vitestTypecheckGroupName("node"),
          sequence: { groupOrder: NORMAL_GROUP_ORDER },
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: testGlobs("type"),
            exclude: BROWSER_TYPES,
            tsconfig: "tsconfig.json",
            checker: TYPECHECKER,
          },
        },
      },
      {
        extends: true,
        test: {
          name: vitestTypecheckGroupName("browser"),
          sequence: { groupOrder: NORMAL_GROUP_ORDER },
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: BROWSER_TYPES,
            tsconfig: "tsconfig.tests-dom.json",
            checker: TYPECHECKER,
          },
        },
      },
    ],
  },
});
