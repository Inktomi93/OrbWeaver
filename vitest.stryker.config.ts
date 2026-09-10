import { TEST_RESOURCE_NAMES, VITEST_RUNTIME_FAMILY_GROUPS, VITEST_TYPECHECK_GROUP_NAMES } from "./tooling/src/_shared/test-kinds.ts";
import base from "./vitest.config.ts";

// Derive mutation execution from the normal config while preserving its rigor defaults.
// Every native project must be explicitly kept or excluded with a reason before filtering.
export const RUNTIME_LANES: ReadonlySet<string> = new Set(VITEST_RUNTIME_FAMILY_GROUPS);
// Every OTHER lane `vitest.config.ts` currently defines, with the reason it does not run under mutation.
// COUPLED SITE (say so at both ends, per #1340's own hazard note): `vitest.config.ts`'s `test.projects`
// list is the other half — a lane added there and not added HERE throws at config load (see
// `assertEveryLaneClassified` below), it does not silently vanish.
export const DROPPED_LANES = new Map([
  ...TEST_RESOURCE_NAMES.map(
    (resource) =>
      [
        resource,
        "repository-fixture writers and coupled corpus readers require exclusive execution until the gate " +
          "fixture migration. These instrument meta-tests also inspect source that Stryker rewrites in its sandbox.",
      ] as const,
  ),
  [
    "tooling",
    "the instrument battery (tests/tooling/**, #1523) — same reason `TOOLING_GLOB` excludes it from every " +
      "KEPT lane below: it runs the real tooling over the SOURCE tree, which fails by construction against " +
      "Stryker's mutant-instrumented sandbox copy and would abort the dry run.",
  ],
  ...VITEST_TYPECHECK_GROUP_NAMES.map(
    (name) =>
      [name, `typecheck-only (vitest.config.ts's \`${name}\`) — nothing to mutate at runtime, and redundant with Stryker's own TypeScript checker.`] as const,
  ),
]);
const TOOLING_GLOB = "tests/tooling/**";

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
    tagsFilter: ["!requires-process-chdir && !source-freshness && !requires-git-history && !live && !local-model-cache"],
    projects: source.test.projects
      .filter((project) => RUNTIME_LANES.has(project.test.name ?? ""))
      .map((project) => ({
        ...project,
        test: {
          ...project.test,
          exclude: [...(project.test.exclude ?? []), TOOLING_GLOB],
        },
      })),
  },
};

export default cfg;
