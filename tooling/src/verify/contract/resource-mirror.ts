// The source/test MIRROR index — one derived identity over authored trees a policy already cannot walk.
//
// WHAT IT OWNS AND WHAT IT REFUSES TO OWN. The `mirror-index` family (`test-layout`, `test-reach`,
// `test-presence-client`) asks membership questions — "does this source file exist", "does this source directory
// exist", "which tests sit in this directory" — thousands of times per run. This door answers them from one index
// with a receipt and a refusal, where a per-gate `existsSync` could not tell an absent tree from an empty one. It
// does NOT own any mirror RULE: the directory swap, the kind suffixes, the exemption classes and the tooling §4.7
// arm stay in the gates.
//
// IT IS DERIVED, NOT A SECOND WALK. Every member comes from `authoredTree` facts the invocation reader has
// already cached, so declaring a mirror family costs one index build rather than a second traversal.
//
// MEMBERSHIP IS PUBLISHED AS SETS, ITERABLE IN SORTED ORDER. A policy asking "is this exact path live" gets
// an O(1) answer instead of a syscall; a policy enumerating the test corpus iterates the same set. The
// directory map exists because `test-presence-client` needs the LISTING of one mirror directory, and
// deriving that by prefix-scanning the whole corpus per question is how a shared index becomes slower than
// the syscalls it replaced. The one honest limit of that choice: `Object.freeze` is real protection for the
// arrays every other resource fact publishes and is ADVISORY for a Set/Map, so these members are immutable
// by TYPE rather than at runtime — stated here because a reader who assumes otherwise would be wrong.

/** Closed mirror families. Each names the authored TREES it is derived from and the exact repo-relative
 *  ROOTS that bound each space; a gate may not supply either. The tree is the acquisition identity (an
 *  `AuthoredTreeId`), the root is the membership fence — they differ wherever a family's space is a subtree
 *  of the tree that carries it, which is why `tooling-test` can take its tests out of the one `tests` tree
 *  without claiming the other packages' mirrors as its own. */
export const MIRROR_FAMILY_DEFINITIONS = {
  /** `tests/<pkg>/<path>` ↔ `packages/<pkg>/src/<path>` (AGENTS.md "Test layout" / `Spine-Testing.md`). */
  "package-test": { sourceTree: "packages", sourceRoot: "packages", testTree: "tests", testRoot: "tests" },
  /** `tests/tooling/<dir>/<path>` ↔ `tooling/src/<dir>/<path>` (`Core-Tooling-Law.md` §4.7). */
  "tooling-test": { sourceTree: "tooling-slot", sourceRoot: "tooling/src", testTree: "tests", testRoot: "tests/tooling" },
  /** The inference package's own bounded source/test corpus (`Spine-Testing.md` §5). */
  "inference-test": {
    sourceTree: "packages",
    sourceRoot: "packages/inference/src",
    testTree: "tests",
    testRoot: "tests/inference",
  },
} as const;

export type MirrorFamilyId = keyof typeof MIRROR_FAMILY_DEFINITIONS;

export interface MirrorIndex {
  readonly family: MirrorFamilyId;
  /** Exact repo-relative roots the two spaces were built from, for a finding that must name its corpus. */
  readonly sourceRoot: string;
  readonly testRoot: string;
  /** Every file in the source space, sorted. Membership replaces a per-question `existsSync`. */
  readonly sourceFiles: ReadonlySet<string>;
  /** Every directory in the source space, sorted — `test-layout`'s §4.7 arm asks about a DIRECTORY. */
  readonly sourceDirectories: ReadonlySet<string>;
  /** Every file in the test space, sorted. */
  readonly testFiles: ReadonlySet<string>;
  /** Test files grouped by their immediate directory, sorted within each group. */
  readonly testsByDirectory: ReadonlyMap<string, readonly string[]>;
}
