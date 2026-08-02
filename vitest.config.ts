import { defineConfig } from "vitest/config";

// ONE config, lanes by SUFFIX via test.projects (the modern "workspace" — vitest.workspace.ts was
// deprecated in 3.2). NODE lanes only; BROWSER is Playwright (vitest browser-mode hangs — Spine-Testing.md §7).
// `test` (the fast lane) = unit + integration + contract; types + parity are opt-in (own scripts).
//
// CRITICAL: shared defaults live in the root `test` block, and EVERY project sets `extends: true` to
// inherit them. Per-runner options (cleanup/determinism/expect) do NOT reach a project without it —
// that's the latent trap neo-tavern fell into (its root isolate/restoreMocks/etc. are dead config
// because its projects omit `extends: true`). `coverage` + `reporters` are root-only (process-global)
// and apply regardless. Authority: core/Spine-Testing.md + DECISIONS-LEDGER §6.
//
// Kept at vitest/node DEFAULTS deliberately: `isolate: true` (fresh module graph per test file → the
// single-tenant globalMacroRegistry resets for free; do NOT copy neo's `isolate: false`) and
// `pool: 'forks'` (process isolation is safe for the libSQL native binding in the integration lane).

// `**/__g_*` — the check-gates self-test's reserved throwaway-fixture sentinel (tsconfig.base.json's
// exclude note). Some fixtures are `.test.ts`, so a CONCURRENT `vitest` lane could try to collect one
// mid-lifecycle (it's written then rm'd inside check-gates.int); ignore keeps every lane hermetic.
const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.stryker-tmp/**", "reports/**", "**/__g_*"];
const inCI = process.env.CI !== undefined;

// SERIAL_INT — the `.int.test.ts` files that CANNOT run in the parallel `integration` lane, routed by
// EXPLICIT PATH (not a filename suffix — a `*.serial.int.test.ts` rename trips the test-layout /
// test-presence structure gates, which only recognize `.int.test.ts`). The `integration` project globs
// all `.int.test.ts` and EXCLUDES this set; `integration-serial` globs EXACTLY this set — so a file
// runs in one lane or the other, never both, never neither. Two reasons a file is here:
//   1. TREE-WRITERS — tooling self-tests that write fixtures into / shell whole-tree tools against the
//      REAL package tree at fixed paths (they clobber each other in parallel), PLUS lifecycle (binds a
//      fixed port 18788 + a fixed db file — assumes serial).
//   2. WHOLE-TREE SCANNERS / heavy full-`createServices` composition files that flaked (5s-timeout, NOT
//      wrong value; pass in isolation) under fork contention. Serial + the lane's 30s testTimeout fixes
//      them. This does NOT weaken chat.int's D53 ReDoS tripwire — the guard fires in ~50ms and an
//      UNWIRED watchdog hangs for MINUTES, so 30s still trips red on a regression (~400× margin).
// TO ADD a new serial test: append its path here (keep the name `.int.test.ts`). Put a file here if it
// writes into the real tree at a fixed path, binds a fixed port/file, scans the whole tree, or is a
// heavy full-composition file that times out under parallel contention. Everything else is assumed
// `:memory:`-isolated + light enough for the parallel lane (proven 0-fail at 14 workers, report §3).
const SERIAL_INT = [
  // 1. tree-writers + fixed-port boot
  "tests/tooling/check-gates.int.test.ts",
  "tests/tooling/dependency-cruiser.int.test.ts",
  "tests/server/entry/lifecycle.int.test.ts",
  // 2. whole-tree scanners + heavy full-composition files (flaked on 5s timeout under fork contention)
  "tests/tooling/gate-conformance.int.test.ts",
  "tests/support/fixtures.int.test.ts",
  "tests/server/transport/cross-tenant-sweep.suite.int.test.ts",
  "tests/server/entry/compose/chat.int.test.ts",
  // The DB6 databank settings wire (Phase B ④): a full-`createServices` composed-real file — the first
  // test pays the cold whole-server-graph import + createServices cost, which flakes a parallel 5s timeout.
  "tests/server/entry/compose/databank.int.test.ts",
  // The P6 agent-seat wire round-trips (D60): full-`createServices` app-fixture files — cold import of the
  // whole server graph on the first test flakes a parallel 5s timeout.
  "tests/server/transport/trpc/routers/chat.int.test.ts",
  // rpg compose wire: repeatedly flaked with 5s/20s timeouts under fork contention (heavy full-composition
  // file, same class as chat.int/databank.int above).
  "tests/server/entry/compose/rpg.int.test.ts",
  // The multi-human persona-resolution suite: full-`createServices` app-fixture file whose first test pays
  // the cold whole-server-graph import (measured 3.4s isolated → 5s-timeout flake under fork contention).
  "tests/server/entry/compose/persona-multihuman.suite.int.test.ts",
];

export default defineConfig({
  // Transform target = es2025, matching tsc (Node 24 runs es2025 natively → no downlevel, just type
  // strip). Needs esbuild ≥0.28 (0.25.x rejects es2025); pnpm-workspace.yaml overrides vite's bundled
  // esbuild up to 0.28.1 so this is clean — no "Unrecognized target environment" warning.
  esbuild: { target: "es2025" },
  test: {
    exclude: IGNORE,

    // Tests default the search-corpus auto-index OFF (the production env floor is ON). With the no-GPU
    // derive-role fallback live, an ON indexer would turn every `character.create` in a test into a real
    // local-light jina embed (multi-GB model load) on the fire-and-forget bus. OFF keeps unit/integration
    // boots clean + deterministic; the compose-gate test flips it ON via a per-test AppSettings override.
    // We also silence the application logger (Pino) to prevent raw JSON logs from destroying the TTY
    // reporter console or blowing up CI/Agent logs. VLLM_DISABLED is pinned "true" so the suite is
    // ambient-env-proof: the env floor is a strict z.enum(["true","false"]) and a stray host/container
    // value (the dev-container once shipped "1") otherwise kills every server suite at module load.
    env: { CORPUS_AUTOINDEX: "false", LOG_LEVEL: "silent", VLLM_DISABLED: "true" },

    // Fork budget for the parallel lanes (inherited by every `extends:true` forked project — unit,
    // integration, contract). Pinned to ~14 workers on this 24-core shared dev box: the integration lane
    // is IMPORT-bound, not CPU-bound (reports/tooling/VITEST-INTEGRATION-SPEEDUP.md §2), so workers past
    // ~14 buy no speed while starving the dev's editor/browser. 14-of-24 is the report's measured 6.7×
    // sweet spot and leaves headroom. minWorkers matches so they actually spin up.
    // NOTE: Vitest 4 REMOVED `poolOptions.forks.maxForks` — the cap is now the TOP-LEVEL `maxWorkers`
    // (number of forks, since pool:"forks"). `integration-serial` sets fileParallelism:false, which
    // vitest forces to maxWorkers=1 — so this cap is a no-op there (one file at a time regardless).
    pool: "forks",
    minWorkers: 14,
    maxWorkers: 14,

    // --- rigor defaults (inherited via `extends: true`) ---
    restoreMocks: true, // spies → original impl between tests (fake-at-edges, never-mock-internals doctrine)
    clearMocks: true, // clear mock call history each test
    unstubGlobals: true, // auto-undo vi.stubGlobal — no leaked globals across tests
    unstubEnvs: true, // auto-undo vi.stubEnv — no leaked env across tests
    allowOnly: false, // a stray `.only` FAILS the run (not just in CI)
    expect: { requireAssertions: true }, // every test must assert ≥1 — kills silent no-op tests
    chaiConfig: { truncateThreshold: 0 }, // full, untruncated diffs (branded ids / large frozen objects)
    // false (PD-115): every lane (unit/integration/contract/types/parity) has matching files now, so a
    // lane whose include glob matches NOTHING (a typo'd pattern, a moved tree) FAILS instead of passing.
    passWithNoTests: false,

    // --- coverage: REPORT-ONLY (no `thresholds` → never gates; runs only via `pnpm test:coverage`) ---
    coverage: {
      provider: "v8", // AST-aware remap (Istanbul-accurate, v8-fast) — the v4 default
      include: ["packages/*/src/**/*.ts"], // v4 removed coverage.all/extensions — include is explicit
      exclude: ["**/index.ts", "**/*.d.ts", "**/*.test-d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      reportOnFailure: true,
    },

    // --- reporters: CI-aware (junit for CI ingestion; default locally) ---
    reporters: inCI ? ["default", "github-actions", ["junit", { outputFile: "reports/junit.xml" }]] : ["default"],

    projects: [
      {
        // unit: `.test.ts` — pure logic, no db. EXCLUDE the other suffixes (they also end in .test.ts).
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: [...IGNORE, "tests/**/*.{int,contract,parity}.test.ts"],
        },
      },
      {
        // integration: `.int.test.ts` — real libSQL :memory:, real I/O. Runs PARALLEL (default
        // fileParallelism, capped at maxWorkers:14). Every file here is `:memory:`-isolated
        // (freshDb-per-test, tests/support/db.ts) so there is ZERO cross-file state; `pool:'forks'`
        // (inherited) keeps process isolation for the native binding. Measured 6.7× vs serial, 0 failures
        // across 346 domain files (reports/tooling/VITEST-INTEGRATION-SPEEDUP.md). EXCLUDES `SERIAL_INT`
        // (see the const above) — those run in `integration-serial`. Do NOT switch `pool` to threads and
        // do NOT set `isolate:false`.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.int.test.ts"],
          exclude: [...IGNORE, ...SERIAL_INT],
        },
      },
      {
        // integration-serial: exactly the `SERIAL_INT` files (see the const above for the WHY + how to add
        // one). fileParallelism:false runs them ONE AT A TIME; testTimeout:30s covers their scan/import
        // weight on a contended box (chat.int's D53 ReDoS tripwire keeps a ~400× regression margin).
        extends: true,
        test: {
          name: "integration-serial",
          include: SERIAL_INT,
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
      {
        // contract: `.contract.test.ts` — zod round-trips / golden surface.
        extends: true,
        test: { name: "contract", include: ["tests/**/*.contract.test.ts"] },
      },
      {
        // types: `.test-d.ts` — typecheck-ONLY (no runtime pass) over the root tsconfig.
        extends: true,
        test: {
          name: "types",
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: ["tests/**/*.test-d.ts"],
            tsconfig: "tsconfig.json",
            // Source-file errors here are wrong-lib double-reports (a DOM-touching import checked under
            // the DOM-less root program — the authoritative per-package/graph stages check the same files
            // under the CORRECT libs). Test-file type errors still fail the lane.
            ignoreSourceErrors: true,
            // TS7 native checker (byte-identical diagnostics to tsc6, ~5x faster) — the CLI type lanes moved
            // off tsc6. ts-morph/typescript-eslint keep the TS6 API; this lane is CLI-only, so it's safe.
            checker: "node_modules/ts7/bin/tsc",
          },
        },
      },
      {
        // parity: `.parity.test.ts` — the differential oracle vs the steady clone. OPT-IN (own script),
        // excluded from the fast lane (slow; runs the cross-repo driver).
        extends: true,
        test: { name: "parity", include: ["tests/**/*.parity.test.ts"] },
      },
    ],
  },
});
