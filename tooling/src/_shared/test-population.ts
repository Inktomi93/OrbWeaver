// Application verification excludes instrument proofs, not static analysis of instrument source.
const TOOLING_TESTS = "**/tests/tooling/**";

export function applicationTestExclusions(applicationOnly: boolean): string[] {
  return applicationOnly ? [TOOLING_TESTS] : [];
}
