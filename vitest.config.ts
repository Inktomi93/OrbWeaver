import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { budget } from "@orb/tooling/_shared/load-budget";
import type { TestCompilerWorld, TestFamily } from "@orb/tooling/_shared/test-kinds";
import { runtimeForTestFamily, TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import { defineConfig } from "vitest/config";

// Native runner globs compose the registered vocabulary. Browser-subject .dom tests still execute in
// Node; Playwright owns browser execution. Each project inherits the cleanup and isolation defaults.
function testGlobs(family: TestFamily, world?: TestCompilerWorld): string[] {
  return TEST_KIND_DEFINITIONS.filter((kind) => kind.family === family && (world === undefined || kind.compilerWorld === world)).map(
    ({ suffix }) => `tests/**/*${suffix}`,
  );
}

const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.stryker-tmp/**", "reports/**", "**/__g_*"];
const TOOLING = ["tests/tooling/**"];
const RUNTIME_GLOBS = TEST_KIND_DEFINITIONS.filter(({ family }) => runtimeForTestFamily(family) === "vitest").map(
  ({ suffix }) => `tests/tooling/**/*${suffix}`,
);
const BROWSER_TYPES = testGlobs("type", "browser");
const CONCURRENCY = readConcurrencyProfile();
const inCI = process.env["CI"] !== undefined;

// Transitional scheduling only: #1862 is removing resource collisions and remeasuring the remaining
// CPU-heavy suites. Test kind, mutation eligibility and scheduling are separate decisions.
const SERIAL_INT_TOOLING = [
  "tests/tooling/check-gates.int.test.ts",
  "tests/tooling/gate-ignore-grammar.int.test.ts",
  "tests/tooling/doc-catalog/ops/catalog.int.test.ts",
  "tests/tooling/css-merge-parity.int.test.ts",
  "tests/tooling/gate-conformance.int.test.ts",
  "tests/tooling/verify/gates/caught-failure-ownership.int.test.ts",
  "tests/tooling/ast/cli.int.test.ts",
  "tests/tooling/verify/gates/test-presence.int.test.ts",
  "tests/tooling/verify/ops/structure.int.test.ts",
];

const SERIAL_INT_PRODUCT = [
  "tests/server/entry/lifecycle.int.test.ts",
  "tests/support/fixtures.int.test.ts",
  "tests/server/transport/cross-tenant-sweep.suite.int.test.ts",
  "tests/server/entry/compose/chat.int.test.ts",
  "tests/server/entry/compose/databank.int.test.ts",
  "tests/server/transport/trpc/routers/chat.int.test.ts",
  "tests/server/entry/compose/rpg.int.test.ts",
  "tests/server/entry/compose/roster-preset.int.test.ts",
  "tests/server/entry/compose/persona-multihuman.suite.int.test.ts",
  "tests/server/entry/compose/assets-character.int.test.ts",
  "tests/server/entry/boot/seed-demo-chats.int.test.ts",
  "tests/server/entry/compose/automation-plugin.int.test.ts",
];

// Vitest forces incremental flags; this wrapper enforces the repository's cold semantic-check policy.
const TYPECHECKER = "scripts/ts7.cjs";

export default defineConfig({
  test: {
    exclude: IGNORE,
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
          include: testGlobs("unit"),
          exclude: [...IGNORE, ...testGlobs("integration"), ...testGlobs("contract"), ...TOOLING],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: testGlobs("integration"),
          exclude: [...IGNORE, ...SERIAL_INT_PRODUCT, ...SERIAL_INT_TOOLING, ...TOOLING],
        },
      },
      {
        extends: true,
        test: {
          name: "integration-serial",
          include: SERIAL_INT_PRODUCT,
          exclude: [...IGNORE],
          fileParallelism: false,
          testTimeout: budget(30_000),
        },
      },
      {
        extends: true,
        test: {
          name: "tooling-serial",
          include: SERIAL_INT_TOOLING,
          exclude: [...IGNORE],
          fileParallelism: false,
          testTimeout: budget(30_000),
        },
      },
      {
        extends: true,
        test: { name: "tooling", include: RUNTIME_GLOBS, exclude: [...IGNORE, ...SERIAL_INT_TOOLING] },
      },
      {
        extends: true,
        test: { name: "contract", include: testGlobs("contract"), exclude: [...IGNORE, ...TOOLING] },
      },
      {
        extends: true,
        test: {
          name: "types-node",
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
          name: "types-browser",
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
