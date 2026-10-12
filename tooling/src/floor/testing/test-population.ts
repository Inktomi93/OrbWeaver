// Native application test selection and the independent authored-test census share one subject boundary.
import { matchesGlob } from "node:path";
import { looksLikeTestFilename } from "./test-kinds.ts";

export const TOOLING_TEST_ROOT = "tests/tooling";
const TOOLING_TESTS = `**/${TOOLING_TEST_ROOT}/**`;

/** Tests not yet rebuilt (`docs/plans/test-foundation/design.md`, the legacy folder). They run in CI's legacy jobs
 *  and stay out of the inner loop: lane floors, commit hooks and the strict gates. */
export const LEGACY_TEST_ROOT = "tests/legacy";
const LEGACY_TESTS = `**/${LEGACY_TEST_ROOT}/**`;
/** `pnpm test:scoped` and `pnpm test:ct` refuse a legacy path unless the caller passes this flag on purpose. */
export const LEGACY_SCOPED_FLAG = "--legacy";

/** Which half of the application test tree a CI job runs: the strict tree, or the legacy folder. */
export const APPLICATION_TEST_POPULATIONS = ["strict", "legacy"] as const;
export type ApplicationTestPopulation = (typeof APPLICATION_TEST_POPULATIONS)[number];

export function applicationTestExclusions(applicationOnly: boolean): string[] {
  return applicationOnly ? [TOOLING_TESTS] : [];
}

/** Runner exclusions that keep the legacy folder out of an inner-loop or strict-population run. */
export function legacyTestExclusions(): string[] {
  return [LEGACY_TESTS];
}

export function isLegacyTestPath(path: string): boolean {
  return path === LEGACY_TEST_ROOT || path.startsWith(`${LEGACY_TEST_ROOT}/`);
}

export function isApplicationTest(path: string): boolean {
  return path.startsWith("tests/") && looksLikeTestFilename(path) && !applicationTestExclusions(true).some((pattern) => matchesGlob(path, pattern));
}
