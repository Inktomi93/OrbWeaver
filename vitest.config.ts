import process from "node:process";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import { budget } from "@orb/tooling/floor/host/load-budget";
import type { TestResource } from "@orb/tooling/floor/testing/test-kinds";
import { runtimeForTestFamily, SEMANTIC_CORPUS_RESOURCE, TEST_KIND_DEFINITIONS } from "@orb/tooling/floor/testing/test-kinds";
import { LONG_TEST_TIMEOUT_BASE_MS, TEST_TAGS } from "@orb/tooling/floor/testing/test-tags";
import type { ViteUserConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";
import type { TestUserConfig } from "vitest/node";

// Native runner globs compose the registered vocabulary. Browser-subject .dom tests still execute in
// Node; Playwright owns browser execution. Each project inherits the cleanup and isolation defaults.
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

const withIgnored = (globs: readonly string[]): string[] => [...globs, ...configDefaults.exclude.map((glob) => `!${glob}`)];
const TOOLING = "tests/tooling/**";
const REPOSITORY_RESOURCE = "repository" satisfies TestResource;
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
const SEMANTIC_CORPUS_GROUP_ORDER = 2;

// docs/work/0062 — every project inherits this through `extends: true`, so each one captures the working
// tree before its own first test and re-checks it at close: a suite that writes the real tree (repo law
// forbids it) reds naming the file instead of passing unseen.
const WORKING_TREE_GUARD = "@orb/tooling/floor/testing/working-tree-guard";

export function vitestConfig(): ViteUserConfig {
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
            include: withIgnored([...exclusiveTestGlobs(({ family }) => family === "unit"), `!${TOOLING}`]),
          },
        },
        {
          extends: true,
          test: {
            name: "integration",
            sequence: { groupOrder: NORMAL_GROUP_ORDER },
            // One module registry per worker: every file reuses the server graph import, and no module may
            // read the environment at import time (the harness supplies the seams instead).
            isolate: false,
            setupFiles: ["tests/support/node/composed-real.ts"],
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
            testTimeout: budget(LONG_TEST_TIMEOUT_BASE_MS),
          },
        },
        {
          extends: true,
          test: {
            name: SEMANTIC_CORPUS_RESOURCE,
            // Synchronous corpus passes cannot flush Vitest's microtask-buffered console between batches.
            disableConsoleIntercept: true,
            sequence: { groupOrder: SEMANTIC_CORPUS_GROUP_ORDER },
            include: withIgnored(resourceGlobs(SEMANTIC_CORPUS_RESOURCE)),
            fileParallelism: true,
            maxWorkers: Math.min(CONCURRENCY.vitestMaxWorkers, CONCURRENCY.semanticCorpusMaxWorkers),
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
            include: withIgnored([...exclusiveTestGlobs(({ family }) => family === "contract"), `!${TOOLING}`]),
          },
        },
      ],
    },
  });
}

export default vitestConfig();
