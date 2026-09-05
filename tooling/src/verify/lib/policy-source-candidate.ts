// Final policy source dispatch accepts only ordinary TypeScript source identities.
const POLICY_SOURCE_SUFFIX = /\.tsx?$/u;

export function isPolicySourceCandidate(path: string): boolean {
  return POLICY_SOURCE_SUFFIX.test(path);
}

export function policySourceCandidates(paths: readonly string[]): readonly string[] {
  return [...new Set(paths.filter(isPolicySourceCandidate))].toSorted((left, right) => left.localeCompare(right));
}
