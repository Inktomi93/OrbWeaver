import base from "./vitest.config.ts";

// Derive mutation execution from the normal config while preserving its rigor defaults.
// Every native project must be explicitly kept or excluded with a reason before filtering.
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
    "tooling-serial",
    "the instrument battery's CONTENTION half (vitest.config.ts's SERIAL_INT_TOOLING, #1842) — both reasons " +
      "at once: tree-writers on fixed real-tree paths that Stryker's `concurrency: 6` worker PROCESSES " +
      "would collide on, AND tests/tooling/** meta-tests that fail by construction against a " +
      "mutant-instrumented sandbox copy.",
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

const source = base as unknown as {
  test: {
    projects: Array<{ test: { name?: string; exclude?: readonly string[] } }>;
    fileParallelism?: boolean;
    maxWorkers?: number;
  };
};

/** Refuse a newly introduced project until its mutation eligibility has been considered. */
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
assertEveryLaneClassified(source.test.projects.map((project) => project.test.name ?? ""));

// Each Stryker process owns one Vitest worker; deriving this overlay must not alter other base consumers.
const cfg = {
  ...base,
  test: {
    ...base.test,
    fileParallelism: false,
    maxWorkers: 1,
    projects: source.test.projects
      .filter((project) => RUNTIME_LANES.has(project.test.name ?? ""))
      .map((project) => ({
        ...project,
        test: {
          ...project.test,
          exclude: [...(project.test.exclude ?? []), TOOLING_GLOB, ...FRESHNESS_GLOBS, ...WORKER_INCOMPATIBLE_GLOBS],
        },
      })),
  },
};

export default cfg;
