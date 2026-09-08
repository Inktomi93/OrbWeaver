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

/** tsc scoped invocation: sole owner → `ts7 -p <config>`; none → skip; multiple owners → the whole
 *  per-package lane (the honest floor, one child not N). Uses ts7 (the scripts/ts7.cjs wrapper, TS7
 *  native) — the CLI type lanes moved off tsc6 (ts-morph/typescript-eslint keep the TS6 API). */
export function tscScopedArgv(tsconfigs: readonly string[]): ScopedArgv {
  const sole = tsconfigs[0];
  if (sole === undefined) {
    return "skip-empty";
  }
  if (tsconfigs.length > 1) {
    return ["pnpm", "typecheck"];
  }
  return ["node", "scripts/ts7.cjs", "--noEmit", "--pretty", "false", "-p", sole];
}

/** eslint scoped invocation.
 *
 *  `--no-warn-ignored`: an explicit path that eslint's config IGNORES (e.g. a generated tokens file) must
 *  not become a `--max-warnings 0` FAILURE — at whole scope eslint never sees it; scoped, we hand it the
 *  path directly, so we suppress the "file ignored" warning to match whole-scope verdicts.
 *
 *  `node scripts/eslint.cjs`, never the bare `eslint` bin (#1835): that shim is the ONE place ESLint's
 *  `--concurrency` comes from (ESLint's own default is `off`, i.e. single-threaded). The whole-scope row
 *  reaches the same shim through `pnpm lint:eslint`; invoking the bin directly here would leave the scoped
 *  lane single-threaded while the whole lane was not — exactly the drift the shim exists to prevent. */
export function eslintScopedArgv(files: readonly string[]): ScopedArgv {
  if (files.length === 0) {
    return "skip-empty";
  }
  return ["node", "scripts/eslint.cjs", "--max-warnings", "0", "--no-warn-ignored", "--cache", "--cache-strategy", "content", ...files];
}
