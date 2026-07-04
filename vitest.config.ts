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

const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.stryker-tmp/**", "reports/**"];
const inCI = process.env.CI !== undefined;

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
    // reporter console or blowing up CI/Agent logs.
    env: { CORPUS_AUTOINDEX: "false", LOG_LEVEL: "silent" },

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
    reporters: inCI
      ? ["default", "github-actions", ["junit", { outputFile: "reports/junit.xml" }]]
      : ["default"],

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
        // integration: `.int.test.ts` — real libSQL :memory:, real I/O. fileParallelism:false runs
        // these files SERIALLY: the gate/dep-cruiser self-tests write fixtures into the shared package
        // tree and run whole-tree tools (report.ts/depcruise), so parallel files would clobber each
        // other; shared-resource integration tests want serial anyway (freshDb-per-test isolates data).
        extends: true,
        test: { name: "integration", include: ["tests/**/*.int.test.ts"], fileParallelism: false },
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
