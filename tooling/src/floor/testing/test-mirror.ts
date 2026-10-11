// The central test mirror, read forwards. `test-layout` enforces that every test prefix-swaps to a real
// source file; this derives the same relation in the other direction so a probe never needs its spec
// hardcoded. Deriving beats a path argument: a source file whose suite was renamed would otherwise be
// probed against a stale spec and report every mutant as a survivor.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TestFamily, TestKindDefinition } from "./test-kinds.ts";
import { runtimeForTestFamily, TEST_KIND_DEFINITIONS } from "./test-kinds.ts";

const MUTATION_FAMILY_ORDER = {
  unit: 0,
  integration: 1,
  contract: 2,
  type: 3,
  component: 4,
  e2e: 5,
} as const satisfies Readonly<Record<TestFamily, number>>;

/** Module mirrors a planted mutant can execute in headless Vitest. Compiler world is deliberately not a
 * filter: `.dom.test.ts` is browser-typed but still runs in Vitest; typecheck, CT, E2E, and suite mirrors
 * cannot execute the mutant through this probe. Family order preserves unit → integration → contract. */
const VITEST_MODULE_KINDS: readonly TestKindDefinition[] = TEST_KIND_DEFINITIONS.filter(
  (definition) => definition.mirror === "module" && runtimeForTestFamily(definition.family) === "vitest",
).toSorted((left, right) => MUTATION_FAMILY_ORDER[left.family] - MUTATION_FAMILY_ORDER[right.family] || left.suffix.localeCompare(right.suffix));

const PACKAGE_SRC_RE = /^packages\/([^/]+)\/src\/(.+)(\.tsx?)$/u;
const TOOLING_SRC_RE = /^tooling\/src\/(.+)\.ts$/u;

/** Repo-relative test paths this source COULD mirror to — existence is not checked. */
export function mirrorCandidates(sourceRel: string): readonly string[] {
  const pkg = PACKAGE_SRC_RE.exec(sourceRel);
  if (pkg !== null) {
    return VITEST_MODULE_KINDS.filter(({ sourceExtensions }) => sourceExtensions.includes(pkg[3] as ".ts" | ".tsx")).map(
      ({ suffix }) => `tests/${pkg[1]}/${pkg[2]}${suffix}`,
    );
  }
  const tooling = TOOLING_SRC_RE.exec(sourceRel);
  if (tooling !== null) {
    return VITEST_MODULE_KINDS.filter(({ sourceExtensions }) => sourceExtensions.includes(".ts")).map(({ suffix }) => `tests/tooling/${tooling[1]}${suffix}`);
  }
  return [];
}

/** The candidates that exist on disk. An empty result is the caller's blindness signal, never a pass. */
export function resolveMirrors(root: string, sourceRel: string): readonly string[] {
  return mirrorCandidates(sourceRel).filter((rel) => existsSync(join(root, rel)));
}
