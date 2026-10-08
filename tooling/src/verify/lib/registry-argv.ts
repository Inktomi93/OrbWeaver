// The registry's SCOPED-ARGV builders — how a stage that CAN be narrowed spells its narrowed invocation.
// Extracted from registry.ts (which is the ROWS, and lives against the tooling-size cap) for the same
// reason registry-manual.ts and registry-preconditions.ts were: the rows are a ledger to read top to
// bottom, and a multi-line argv construction inside one row buries the next twenty.
//
// Each builder answers the same question — "given the selection's paths for this tool, what child do we
// spawn?" — and each may answer `skip-empty` (nothing in scope) or `whole-only` (this stage cannot be
// narrowed honestly). That vocabulary is `../contract/stage.ts`'s `ScopedArgv`.
import { applicationTestExclusions } from "@orb/tooling/_shared/test-population";
import type { Selection } from "../contract/selection.ts";
import type { ScopedArgv } from "../contract/stage.ts";

const PRODUCT_RUNTIME_EXCLUDES = applicationTestExclusions(true).map((glob) => `--exclude=${glob}`);
const NODE_TEST_RE = /\.test\.tsx?$/u;

/** Vitest scope composition, using its native selectors instead of a copied project roster.
 *
 * Git-derived changes stay Git-derived, so deletes and renames retain the VCS semantics Vitest owns.
 * Explicit test claims enter `test:scoped`, whose native collection preflight refuses a barren path.
 * Explicit source claims enter the guarded door's `--related` mode; an empty dependency result is legitimately derived and
 * therefore carries `--passWithNoTests`. Folder scopes are expanded to concrete current files before the
 * related graph runs — Vitest compares related subjects by exact module id, not directory prefix. */
export function vitestScopedArgv(selection: Selection): ScopedArgv {
  if (selection.kind === "changed" && selection.gitRef !== undefined) {
    return ["pnpm", "test:scoped", "--passWithNoTests", "--changed", selection.gitRef, ...PRODUCT_RUNTIME_EXCLUDES];
  }
  if (selection.kind === "package") {
    const prefix = selection.paths[0];
    const packageName = prefix === "tooling/" ? "tooling" : prefix?.match(/^packages\/([^/]+)\/$/u)?.[1];
    return packageName === undefined || packageName.length === 0 || packageName === "tooling"
      ? "skip-empty"
      : ["pnpm", "test:scoped", `tests/${packageName}`, ...PRODUCT_RUNTIME_EXCLUDES];
  }
  const subjects = selection.runtimeSubjects.filter((path) => !path.startsWith("tests/tooling/"));
  if (subjects.length === 0) {
    return "skip-empty";
  }
  if (subjects.every((path) => NODE_TEST_RE.test(path)) === true) {
    return ["pnpm", "test:scoped", ...subjects, ...PRODUCT_RUNTIME_EXCLUDES];
  }
  return ["pnpm", "test:scoped", "--related", ...subjects, ...PRODUCT_RUNTIME_EXCLUDES];
}

/** The unified typecheck door receives the complete affected native-program plan. */
export function tscScopedArgv(tsconfigs: readonly string[]): ScopedArgv {
  if (tsconfigs.length === 0) {
    return "skip-empty";
  }
  return ["pnpm", "typecheck", ...tsconfigs.flatMap((config) => ["--config", config])];
}

/** eslint scoped invocation: the verify `eslint-scoped` verb, which partitions the paths by native compiler
 *  owner exactly as the whole-tree run does. One process spanning several typed programs loads all of them
 *  at once. An explicit path the config ignores is dropped at discovery, so it cannot fail `--max-warnings 0`. */
export function eslintScopedArgv(files: readonly string[]): ScopedArgv {
  if (files.length === 0) {
    return "skip-empty";
  }
  return ["node", "tooling/src/verify/cli.ts", "eslint-scoped", ...files];
}
