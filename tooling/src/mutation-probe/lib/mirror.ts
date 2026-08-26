// The central test mirror, read forwards. `test-layout` enforces that every test prefix-swaps to a real
// source file; this derives the same relation in the other direction so a probe never needs its spec
// hardcoded. Deriving beats a path argument: a source file whose suite was renamed would otherwise be
// probed against a stale spec and report every mutant as a survivor.
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The three node kinds a `.ts` source may mirror to (Spine-Testing). CT/`.tsx` kinds are out of scope:
 *  a planted mutant needs a suite this probe can run headlessly. */
const KINDS = ["test", "int.test", "contract.test"] as const;

const PACKAGE_SRC_RE = /^packages\/([^/]+)\/src\/(.+)\.tsx?$/u;
const TOOLING_SRC_RE = /^tooling\/src\/(.+)\.ts$/u;

/** Repo-relative test paths this source COULD mirror to — existence is not checked. */
export function mirrorCandidates(sourceRel: string): readonly string[] {
  const pkg = PACKAGE_SRC_RE.exec(sourceRel);
  if (pkg !== null) {
    return KINDS.map((kind) => `tests/${pkg[1]}/${pkg[2]}.${kind}.ts`);
  }
  const tooling = TOOLING_SRC_RE.exec(sourceRel);
  if (tooling !== null) {
    return KINDS.map((kind) => `tests/tooling/${tooling[1]}.${kind}.ts`);
  }
  return [];
}

/** The candidates that exist on disk. An empty result is the caller's blindness signal, never a pass. */
export function resolveMirrors(root: string, sourceRel: string): readonly string[] {
  return mirrorCandidates(sourceRel).filter((rel) => existsSync(join(root, rel)));
}
