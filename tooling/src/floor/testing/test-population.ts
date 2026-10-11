// Native application test selection and the independent authored-test census share one subject boundary.
import { matchesGlob } from "node:path";
import { looksLikeTestFilename } from "./test-kinds.ts";

export const TOOLING_TEST_ROOT = "tests/tooling";
const TOOLING_TESTS = `**/${TOOLING_TEST_ROOT}/**`;

export function applicationTestExclusions(applicationOnly: boolean): string[] {
  return applicationOnly ? [TOOLING_TESTS] : [];
}

export function isApplicationTest(path: string): boolean {
  return path.startsWith("tests/") && looksLikeTestFilename(path) && !applicationTestExclusions(true).some((pattern) => matchesGlob(path, pattern));
}
