import base from "./vitest.config.ts";

// Vitest config for the Stryker MUTATION lane (stryker.config.json / stryker.gate.config.json point here
// via `vitest.configFile`). It DERIVES from the real vitest.config.ts so the rigor defaults
// (restoreMocks/clearMocks/requireAssertions/CORPUS_AUTOINDEX=false/es2025) can never drift out of sync,
// then narrows the lanes for what mutation testing can actually run:
//
//  • Keeps the three RUNTIME lanes — unit + integration + contract. Integration is REQUIRED: the highest-
//    stakes mutate targets (credentials/*, observability/audit) are covered ONLY by `.int.test.ts` against
//    real libSQL. Verified safe under Stryker's forced `pool:'threads'` (the libSQL native binding passes).
//  • Drops every other lane in `vitest.config.ts`, each with a STATED reason in `DROPPED_LANES` below — see
//    #1340: the OLD shape here was an allowlist whose own comment named a lane that no longer existed
//    (`parity`, purged 2026-08-22 with #428) while omitting BOTH lanes it silently dropped
//    (`integration-serial` — 22 files; `live-drive` — 4 files), because an allowlist drops anything not
//    named with zero signal. `assertEveryLaneClassified` below makes that structurally impossible now: a
//    lane added to `vitest.config.ts` and never classified HERE throws at Stryker's own config load,
//    across every worker, rather than silently vanishing from mutation coverage.
//  • Excludes `tests/tooling/**` from every kept lane. Those are whole-tree META-tests (the structure
//    gates, dependency-cruiser, grit plugins, schema-baseline parity) that run the real tooling over the
//    source tree — against Stryker's mutant-INSTRUMENTED sandbox copy they fail by construction (the
//    instrumented code isn't gate-clean), which would abort the dry run.
//
// perTest coverage (set in the Stryker config) still ensures each mutant only runs the tests that cover
// it — so a kit/macro mutant runs kit unit tests, a credentials mutant runs credentials int tests.

// Exported (alongside `DROPPED_LANES` + `assertEveryLaneClassified` below) so the totality pin
// (tests/tooling/vitest-stryker-lane-classification.test.ts) can assert directly against the REAL
// classification rather than re-deriving a second copy of it.
export const RUNTIME_LANES = new Set(["unit", "integration", "contract"]);
// Every OTHER lane `vitest.config.ts` currently defines, with the reason it does not run under mutation.
// COUPLED SITE (say so at both ends, per #1340's own hazard note): `vitest.config.ts`'s `test.projects`
// list is the other half — a lane added there and not added HERE throws at config load (see
// `assertEveryLaneClassified` below), it does not silently vanish.
export const DROPPED_LANES = new Map([
  [
    "integration-serial",
    "tree-writers + fixed-port/fixed-db-file suites (vitest.config.ts's SERIAL_INT) — Stryker's own " +
      "`concurrency: 6` worker PROCESSES would collide on those fixed resources — this file's " +
      "`fileParallelism:false`+`maxWorkers:1` only serializes WITHIN one Stryker worker, never ACROSS them.",
  ],
  [
    "live-drive",
    "real-browser measurement suites (vitest.config.ts's LIVE_DRIVE) — their verdict is a measured rate/" +
      "duration a mutant-instrumented sandbox running under N concurrent Stryker workers would perturb, " +
      "not a structural mutation-coverage signal.",
  ],
  [
    "tooling",
    "the instrument battery (tests/tooling/**, #1523) — same reason `TOOLING_GLOB` excludes it from every " +
      "KEPT lane below: it runs the real tooling over the SOURCE tree, which fails by construction against " +
      "Stryker's mutant-instrumented sandbox copy and would abort the dry run.",
  ],
  ["types-node", "typecheck-only (vitest.config.ts's `types-node`) — nothing to mutate at runtime, and redundant with Stryker's own TypeScript checker."],
  ["types-browser", "typecheck-only (vitest.config.ts's `types-browser`, the DOM-having half of the #1313 split) — same reason as `types-node`."],
]);
const TOOLING_GLOB = "tests/tooling/**";
// GENERATED-FILE FRESHNESS meta-tests: they regenerate a committed generated file and byte-compare it to
// disk. Stryker's `disableTypeChecks` preprocessor INJECTS a `// @ts-nocheck` header into every .ts in the
// sandbox — so the sandbox copy of packages/ui/src/tokens/index.ts gains a header the freshness test's
// regeneration does NOT produce, failing the initial dry run by construction (same class as the tooling
// meta-tests, just for a generated artifact rather than the source tree). Excluded from the mutation lanes
// — they prove nothing about assemble.ts / resolve.ts mutation coverage. (2026-07-12, V4 calibration.)
const FRESHNESS_GLOBS = ["tests/ui/tokens/**"];
// WORKER-THREAD-INCOMPATIBLE TESTS. Context: the Stryker vitest-runner HARDCODES `pool: 'threads'` in its
// `createVitest` overrides (@stryker-mutator/vitest-runner `#getVitestPoolConfig` — a CLI override, so no
// config file can win it back). RE-VERIFIED on the 10.0.0 bump (2026-08-21): still forced, only the
// SPELLING moved — for vitest >= 4.1 it is now `{ pool: 'threads', maxWorkers: 1 }` where 9.x emitted
// `poolOptions.threads.maxThreads/minThreads`. Serial-inside-the-worker is unchanged, so everything below
// still holds. Meanwhile vitest.config.ts:15 pins `pool: 'forks'` precisely
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

/** The #1340 fix: `RUNTIME_LANES` is an ALLOWLIST, so on its own it drops any lane not named — silently,
 *  with zero signal, exactly what let `integration-serial` (22 files) and `live-drive` (4 files) vanish
 *  from mutation coverage while this file's own comment named a THIRD, already-dead lane (`parity`,
 *  purged 2026-08-22 with #428) instead. Every project `vitest.config.ts` defines must land in EXACTLY
 *  one of `RUNTIME_LANES` (kept) or `DROPPED_LANES` (dropped, with a reason) — an unclassified lane
 *  throws HERE, at Stryker's own config load (every worker imports this file), rather than disappearing.
 *  Exported for a proof test — never re-run at load with a mocked base; the REAL base config is the
 *  subject a config-load throw must prove itself against. */
export function assertEveryLaneClassified(projectNames: readonly string[]): void {
  const unclassified = projectNames.filter((name) => !(RUNTIME_LANES.has(name) || DROPPED_LANES.has(name)));
  if (unclassified.length > 0) {
    throw new Error(
      `vitest.stryker.config.ts: vitest.config.ts defines project(s) [${unclassified.join(", ")}] that neither ` +
        "RUNTIME_LANES nor DROPPED_LANES classifies — add the lane to one of the two (with a reason for a drop) " +
        "before Stryker can run; a lane must never silently vanish from mutation coverage.",
    );
  }
}
assertEveryLaneClassified(cfg.test.projects.map((p) => p.test.name ?? ""));

cfg.test.projects = cfg.test.projects
  .filter((p) => RUNTIME_LANES.has(p.test.name ?? ""))
  .map((p) => ({
    ...p,
    test: {
      ...p.test,
      exclude: [...(p.test.exclude ?? []), TOOLING_GLOB, ...FRESHNESS_GLOBS, ...WORKER_INCOMPATIBLE_GLOBS],
    },
  }));

// CRITICAL FIX: Stryker spins up N concurrent worker processes (`concurrency` in stryker.config.json /
// stryker.gate.config.json — 6 since 2026-08-27, the value every calibration was measured at). If Vitest is allowed
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
