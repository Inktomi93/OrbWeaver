// The registry's SCOPED-ARGV builders — how a stage that CAN be narrowed spells its narrowed invocation.
// Extracted from registry.ts (which is the ROWS, and lives against the tooling-size cap) for the same
// reason registry-manual.ts and registry-preconditions.ts were: the rows are a ledger to read top to
// bottom, and a multi-line argv construction inside one row buries the next twenty.
//
// Each builder answers the same question — "given the selection's paths for this tool, what child do we
// spawn?" — and each may answer `skip-empty` (nothing in scope) or `whole-only` (this stage cannot be
// narrowed honestly). That vocabulary is `../contract/stage.ts`'s `ScopedArgv`.
import type { Selection } from "../contract/selection.ts";
import type { ScopedArgv } from "../contract/stage.ts";

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
    return ["pnpm", "test:scoped", "--passWithNoTests", "--changed", selection.gitRef];
  }
  if (selection.kind === "package") {
    const prefix = selection.paths[0];
    const packageName = prefix === "tooling/" ? "tooling" : prefix?.match(/^packages\/([^/]+)\/$/u)?.[1];
    return packageName === undefined || packageName.length === 0 ? "skip-empty" : ["pnpm", "test:scoped", `tests/${packageName}`];
  }
  const subjects = selection.runtimeSubjects;
  if (subjects.length === 0) {
    return "skip-empty";
  }
  if (subjects.every((path) => NODE_TEST_RE.test(path)) === true) {
    return ["pnpm", "test:scoped", ...subjects];
  }
  return ["pnpm", "test:scoped", "--related", ...subjects];
}

/** The unified typecheck door receives the complete affected native-program plan. */
export function tscScopedArgv(tsconfigs: readonly string[]): ScopedArgv {
  if (tsconfigs.length === 0) {
    return "skip-empty";
  }
  return ["pnpm", "typecheck", ...tsconfigs.flatMap((config) => ["--config", config])];
}

/** eslint scoped invocation.
 *
 *  `--no-warn-ignored`: an explicit path that eslint's config IGNORES (e.g. a generated tokens file) must
 *  not become a `--max-warnings 0` FAILURE — at whole scope eslint never sees it; scoped, we hand it the
 *  path directly, so we suppress the "file ignored" warning to match whole-scope verdicts.
 *
 *  `node scripts/eslint.cjs`, never the bare `eslint` bin (#1835): the adapter validates the shared
 *  concurrency profile and propagates native/abnormal exits honestly. Whole lint uses it too, once per
 *  sequential compiler-owner process; invoking the bin directly here would bypass that shared boundary. */
export function eslintScopedArgv(files: readonly string[]): ScopedArgv {
  if (files.length === 0) {
    return "skip-empty";
  }
  return ["node", "scripts/eslint.cjs", "--max-warnings", "0", "--no-warn-ignored", "--cache", "--cache-strategy", "content", ...files];
}
