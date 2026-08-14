import base from "./vitest.config.ts";

// Vitest config for the Stryker MUTATION lane (stryker.config.json / stryker.gate.config.json point here
// via `vitest.configFile`). It DERIVES from the real vitest.config.ts so the rigor defaults
// (restoreMocks/clearMocks/requireAssertions/CORPUS_AUTOINDEX=false/es2025) can never drift out of sync,
// then narrows the lanes for what mutation testing can actually run:
//
//  • Keeps the three RUNTIME lanes — unit + integration + contract. Integration is REQUIRED: the highest-
//    stakes mutate targets (credentials/*, observability/audit) are covered ONLY by `.int.test.ts` against
//    real libSQL. Verified safe under Stryker's forced `pool:'threads'` (the libSQL native binding passes).
//  • Drops the `types` lane (typecheck-only — nothing to mutate at runtime, and it's redundant with
//    Stryker's own TypeScript checker) and `parity` (the cross-repo differential oracle — slow, not a
//    unit of mutation coverage).
//  • Excludes `tests/tooling/**` from every kept lane. Those are whole-tree META-tests (the structure
//    gates, dependency-cruiser, grit plugins, schema-baseline parity) that run the real tooling over the
//    source tree — against Stryker's mutant-INSTRUMENTED sandbox copy they fail by construction (the
//    instrumented code isn't gate-clean), which would abort the dry run.
//
// perTest coverage (set in the Stryker config) still ensures each mutant only runs the tests that cover
// it — so a kit/macro mutant runs kit unit tests, a credentials mutant runs credentials int tests.

const RUNTIME_LANES = new Set(["unit", "integration", "contract"]);
const TOOLING_GLOB = "tests/tooling/**";
// GENERATED-FILE FRESHNESS meta-tests: they regenerate a committed generated file and byte-compare it to
// disk. Stryker's `disableTypeChecks` preprocessor INJECTS a `// @ts-nocheck` header into every .ts in the
// sandbox — so the sandbox copy of packages/ui/src/tokens/index.ts gains a header the freshness test's
// regeneration does NOT produce, failing the initial dry run by construction (same class as the tooling
// meta-tests, just for a generated artifact rather than the source tree). Excluded from the mutation lanes
// — they prove nothing about assemble.ts / resolve.ts mutation coverage. (2026-07-12, V4 calibration.)
const FRESHNESS_GLOBS = ["tests/ui/tokens/**"];
// WORKER-THREAD-INCOMPATIBLE TESTS. Context: the Stryker vitest-runner HARDCODES `pool: 'threads'` in its
// `createVitest` overrides (@stryker-mutator/vitest-runner/dist/src/vitest-test-runner.js:36-49 — a CLI
// override, so no config file can win it back), while vitest.config.ts:15 pins `pool: 'forks'` precisely
// because forks give the process isolation some of our code needs. A measured sweep of the mutation lanes
// under that pool (2026-08-14, `--pool=threads --bail=0`: 1,253 files / 10,091 tests) found 87 casualties in
// TWO classes, and Stryker's `bail:1` reports only ONE per run — which is why this was never diagnosed:
//   • 85 files — `Module did not self-register: onnxruntime_binding.node`. ROOT-CAUSED AND FIXED at source,
//     not excluded: local-light/model-cache.ts now imports @huggingface/transformers DYNAMICALLY, so the
//     non-context-aware NAPI addon no longer loads just because something reached the provider graph. All 85
//     pass under threads now. Do NOT re-add exclusions for these; fix a static import instead.
//   • 2 files — `TypeError: process.chdir() is not supported in workers`. This one is NOT fixable from our
//     side: `process.chdir` simply does not exist in a worker thread, and both tests exist to exercise
//     cwd-dependent resolution, so the capability IS the subject under test. They are excluded here.
// The exclusion is honest for the gate: neither file covers any of the four mutate targets, and dropping a
// covering test could only let mutants SURVIVE (a lower score), never inflate one.
const WORKER_INCOMPATIBLE_GLOBS = ["tests/server/foundation/env/index.test.ts", "tests/server/foundation/observability/debug/wire-capture.suite.test.ts"];

const cfg = base as unknown as {
  test: {
    projects: Array<{ test: { name?: string; exclude?: readonly string[] } }>;
    fileParallelism?: boolean;
    maxWorkers?: number;
  };
};

cfg.test.projects = cfg.test.projects
  .filter((p) => RUNTIME_LANES.has(p.test.name ?? ""))
  .map((p) => ({
    ...p,
    test: {
      ...p.test,
      exclude: [...(p.test.exclude ?? []), TOOLING_GLOB, ...FRESHNESS_GLOBS, ...WORKER_INCOMPATIBLE_GLOBS],
    },
  }));

// CRITICAL FIX: Stryker spins up 16 concurrent worker processes. If Vitest is allowed
// to parallelize internally (via fileParallelism / maxWorkers), you get NxM core explosion.
// Force Vitest to run serially within each Stryker worker. BOTH knobs are the live v4 surface:
// fileParallelism:false forces one file at a time, maxWorkers:1 caps the fork pool. (The former
// `poolOptions = { forks: …, threads: … }` spelling here was DEAD config — Vitest 4 removed
// `poolOptions` from InlineConfig entirely; caught by the 2026-08-03 installed-surface audit.)
cfg.test.fileParallelism = false;
cfg.test.maxWorkers = 1;

// Export the (mutated-in-place) local binding, not the raw import — `cfg` aliases the same object, so the
// lane edits above are applied. (Re-exporting the import directly trips biome's noExportedImports.)
export default cfg;
