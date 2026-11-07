import { SEMANTIC_CORPUS_RESOURCE, TEST_RESOURCE_NAMES, VITEST_RUNTIME_FAMILY_GROUPS } from "@orb/tooling/floor/testing/test-kinds";
import base from "./vitest.config.ts";

// Derive mutation execution from the normal config while preserving its rigor defaults. Every project is
// classified here, so a project added to vitest.config.ts throws at config load until someone decides.
// The repository resource stays: it holds real behavior tests, and dropping a project that imports the named
// file reads as a surviving mutant. A source-reading case in it opts out through the tag filter below.
export const RUNTIME_LANES: ReadonlySet<string> = new Set([
  ...VITEST_RUNTIME_FAMILY_GROUPS,
  ...TEST_RESOURCE_NAMES.filter((name) => name !== SEMANTIC_CORPUS_RESOURCE),
]);
export const DROPPED_LANES = new Map([
  [SEMANTIC_CORPUS_RESOURCE, "one worker prices at about 14 GB, so a worker per Stryker process breaks the 16 GB bar for a run."],
  ["tooling", "the tooling suites run real tooling over the source tree, which fails against the instrumented sandbox copy."],
]);

const source = base as unknown as {
  test: { projects: Array<{ test: { name?: string } }> };
};

/** Refuse a newly introduced project until its mutation eligibility has been considered. */
export function assertEveryLaneClassified(projectNames: readonly string[]): void {
  const unclassified = projectNames.filter((name) => !(RUNTIME_LANES.has(name) || DROPPED_LANES.has(name)));
  if (unclassified.length > 0) {
    throw new Error(
      `vitest.stryker.config.ts: vitest.config.ts defines project(s) [${unclassified.join(", ")}] that neither ` +
        "RUNTIME_LANES nor DROPPED_LANES classifies; add the project to one of the two before Stryker can run.",
    );
  }
}
assertEveryLaneClassified(source.test.projects.map((project) => project.test.name ?? ""));

// Each rule stops a false Survived, and each sits on the projects too because a project keeps its own values.
// isolate: one module registry per worker runs Stryker's per-test coverage hooks for the first test file alone.
// maxWorkers: the runner forces one worker on the root only; two workers race its bail and a run can end with no test result.
const MEASURED_RUN = { isolate: true, maxWorkers: 1 } as const;

export default {
  ...base,
  test: {
    ...base.test,
    ...MEASURED_RUN,
    // source-freshness compares committed bytes the sandbox has rewritten; the rest need history or a live model.
    tagsFilter: ["!source-freshness && !requires-git-history && !live && !local-model-cache"],
    projects: source.test.projects
      .filter((project) => RUNTIME_LANES.has(project.test.name ?? ""))
      .map((project) => ({ ...project, test: { ...project.test, ...MEASURED_RUN } })),
  },
};
