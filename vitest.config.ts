import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { budget } from "@orb/tooling/_shared/load-budget";
import type { TestCompilerWorld, TestFamily, TestResource } from "@orb/tooling/_shared/test-kinds";
import { runtimeForTestFamily, TEST_KIND_DEFINITIONS, vitestTypecheckGroupName } from "@orb/tooling/_shared/test-kinds";
import { TEST_TAGS } from "@orb/tooling/_shared/test-tags";
import type { TestProjectConfiguration, ViteUserConfig } from "vitest/config";
import { defineConfig } from "vitest/config";
import type { TestUserConfig } from "vitest/node";

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

// `**/__g_*` left this list at #2176 Phase F (2026-09-14) with the legacy gate self-test's planters: the
// namespace had no producer left, so the entry was a runner exclusion for files that are never written.
const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.stryker-tmp/**", "reports/**"];
const withIgnored = (globs: readonly string[]): string[] => [...globs, ...IGNORE.map((glob) => `!${glob}`)];
const TOOLING = "tests/tooling/**";
const REPOSITORY_RESOURCE = "repository" satisfies TestResource;
const BROWSER_TYPES = testGlobs("type", "browser");
const REPOSITORY_TEST_GLOBS = resourceGlobs(REPOSITORY_RESOURCE);
const CONCURRENCY = readConcurrencyProfile();
const inCI = process.env["CI"] !== undefined;

/** Existing opt-in environment contracts expressed through Vitest's native tag filter. */
export function testTagFilters(env: NodeJS.ProcessEnv): string[] {
  return [...(env["E2E_LIVE"] === "1" ? [] : ["!live"]), ...(env["ORB_LOCAL_LIGHT_E2E"] === "1" ? [] : ["!local-model-cache"])];
}
// Vitest's resolved/CLI-native config owns tagsFilter although vite's augmented InlineConfig omits it.
// The spread keeps defineConfig's other fields checked while this one field stays pinned to the native type.
const TAG_FILTER_CONFIG = { tagsFilter: testTagFilters(process.env) } satisfies Pick<TestUserConfig, "tagsFilter">;

const NORMAL_GROUP_ORDER = 0;
const REPOSITORY_GROUP_ORDER = 1;

// Vitest forces incremental flags; this wrapper enforces the repository's cold semantic-check policy.
const TYPECHECKER = "scripts/ts7.ts";

/** THE TYPECHECK PROJECTS ASSERT; THEY DO NOT OWN SOURCE ERRORS (#2232, ruled 2026-09-13).
 *
 *  Vitest's default is `ignoreSourceErrors: false`, so a typecheck project reports EVERY diagnostic in its
 *  tsconfig program as a run failure — including one in a file no `.test-d.ts` imports and no caller named.
 *  These two projects exist for one job: run the `.test-d.ts` ASSERTIONS (`expectTypeOf`, `assertType`).
 *  Source typechecking is a different tier with its own stage — `types:native`, the one discovered-program
 *  executor (`pnpm typecheck`) — so a source error reported here is the SAME defect counted twice, and the
 *  second count arrives wearing the exit code of whatever scoped run happened to select a type test.
 *
 *  THE MEASURED SYMPTOM this closes (#2229, re-derived by cb-v-verify-lib-4): `pnpm test:scoped
 *  tests/tooling/doc` — a directory operand holding `contract/types.test-d.ts` beside nine runtime
 *  files — exited 1 with all 70 of its tests GREEN, on a parse error planted in an unrelated file of
 *  `tsconfig.json`'s program. It is NOT a project-selection defect and no `--project` arrangement reaches
 *  it: a typecheck project with zero matched files is instantiated and never runs tsc, so the project that
 *  reds is always one the caller genuinely CLAIMED, and dropping it would drop a type test they named
 *  (`ops/scoped-test.ts#nodeConfigModeArgs` carries that measurement).
 *
 *  NOTHING IS LOST ACROSS THE TIERS, and that is the condition this flag ships under: the same planted
 *  error still reds `pnpm typecheck --config tsconfig.json`. What stops here is the DOUBLE report, never
 *  the report. The assertions themselves are untouched — a failing `expectTypeOf` in a `.test-d.ts` is a
 *  TEST failure, not a source error, and still reds. */
const IGNORE_SOURCE_ERRORS = true;

const TYPECHECK_PROJECTS = [
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
        ignoreSourceErrors: IGNORE_SOURCE_ERRORS,
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
        ignoreSourceErrors: IGNORE_SOURCE_ERRORS,
      },
    },
  },
] satisfies readonly TestProjectConfiguration[];

// docs/work/0062 — every project inherits this through `extends: true`, so each one captures the working
// tree before its own first test and re-checks it at close: a suite that writes the real tree (repo law
// forbids it) reds naming the file instead of passing unseen.
const WORKING_TREE_GUARD = "@orb/tooling/_shared/working-tree-guard";

export function vitestConfig(runtimeOnly = false): ViteUserConfig {
  return defineConfig({
    test: {
      globalSetup: [WORKING_TREE_GUARD],
      testTimeout: budget(5000),
      hookTimeout: budget(10_000),
      // Keep fixtures independent of the operator's .env and avoid loading live embedding providers.
      // No AUTH_FALLBACK: #2406 resolves it per AUTH_MODE, so the suite's default (unset ⇒ single-user)
      // boots at `owner` on its own. Between #1864 and #2406 this line carried the pin the flat `deny`
      // default made mandatory.
      env: { CORPUS_AUTOINDEX: "false", LOG_LEVEL: "silent", ORB_ENV_NO_FILE: "1" },
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
      tags: [...TEST_TAGS],
      ...TAG_FILTER_CONFIG,
      strictTags: true,
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
        ...(runtimeOnly ? [] : TYPECHECK_PROJECTS),
      ],
    },
  });
}

export default vitestConfig();
