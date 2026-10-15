// Policy dispatch and authority share the compiler's native executable-helper boundary.
import { isNodeTestJavaScriptSource } from "../../floor/compiler/project-worlds.ts";

const POLICY_SOURCE_SUFFIX = /\.tsx?$/u;

export function isPolicySourceCandidate(path: string): boolean {
  return POLICY_SOURCE_SUFFIX.test(path) || isNodeTestJavaScriptSource(path);
}

export function policySourceCandidates(paths: readonly string[]): readonly string[] {
  return [...new Set(paths.filter(isPolicySourceCandidate))].toSorted((left, right) => left.localeCompare(right));
}
