// Runner collection proves execution membership; the independent authored suffix census catches omissions.

import { classifyTestFilename } from "@orb/tooling/_shared/test-kinds";
import { isApplicationTest } from "@orb/tooling/_shared/test-population";
import { APPLICATION_TEST_CONFIGS } from "../contract/application.ts";
import {
  buildRuntimeMembership,
  findMultiMembershipFiles,
  playwrightFiles,
  unclassifiedVitestProjects,
  vitestFiles,
} from "../ops/tests-execution-membership.ts";

export function applicationTestRoots(root: string, paths: readonly string[]): readonly string[] {
  const expected = paths.filter(isApplicationTest);
  const unregistered = expected.filter((path) => classifyTestFilename(path) === undefined);
  if (unregistered.length > 0) {
    throw new Error(`application test kind is unregistered: ${unregistered.join(", ")}`);
  }
  if (expected.length === 0) {
    throw new Error("application qualification found no authored product tests; no complete application test denominator is available");
  }
  const node = vitestFiles(root, APPLICATION_TEST_CONFIGS.node);
  const ct = playwrightFiles(root, APPLICATION_TEST_CONFIGS.ct);
  const e2e = playwrightFiles(root, APPLICATION_TEST_CONFIGS.e2e, Object.fromEntries([["E2E_LIVE", "1"]]));
  if ("error" in node) {
    throw new Error(node.error);
  }
  if ("error" in ct) {
    throw new Error(ct.error);
  }
  if ("error" in e2e) {
    throw new Error(e2e.error);
  }
  const unknownProjects = unclassifiedVitestProjects(node.projects);
  if (unknownProjects.length > 0) {
    throw new Error(`application collection has unclassified projects: ${unknownProjects.join(", ")}`);
  }
  const ambiguous = findMultiMembershipFiles(buildRuntimeMembership(node.runtimeByProject, e2e.files, ct.files));
  if (ambiguous.length > 0) {
    throw new Error(`application tests have multiple runtime owners: ${ambiguous.map(([path, views]) => `${path}: ${views.join(", ")}`).join("; ")}`);
  }
  const collected = new Set([...node.files, ...ct.files, ...e2e.files]);
  const missing = expected.filter((path) => !collected.has(path));
  const unexpected = [...collected].filter((path) => !expected.includes(path));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`application test population disagrees: missing {${missing.join(", ")}}, unexpected {${unexpected.join(", ")}}`);
  }
  return [...collected, ...Object.values(APPLICATION_TEST_CONFIGS)].toSorted();
}
