export const TOOLING_TEST_ROOT = "tests/tooling";
const TOOLING_TESTS = `**/${TOOLING_TEST_ROOT}/**`;

export function applicationTestExclusions(applicationOnly: boolean): string[] {
  return applicationOnly ? [TOOLING_TESTS] : [];
}
