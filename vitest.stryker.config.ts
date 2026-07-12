import base from "./vitest.config";

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

const cfg = base as unknown as {
  test: { projects: Array<{ test: { name?: string; exclude?: readonly string[] } }> };
};

cfg.test.projects = cfg.test.projects
  .filter((p) => RUNTIME_LANES.has(p.test.name ?? ""))
  .map((p) => ({
    ...p,
    test: { ...p.test, exclude: [...(p.test.exclude ?? []), TOOLING_GLOB, ...FRESHNESS_GLOBS] },
  }));

// Export the (mutated-in-place) local binding, not the raw import — `cfg` aliases the same object, so the
// lane edits above are applied. (Re-exporting the import directly trips biome's noExportedImports.)
export default cfg;
