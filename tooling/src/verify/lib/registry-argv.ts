// The registry's SCOPED-ARGV builders — how a stage that CAN be narrowed spells its narrowed invocation.
// Extracted from registry.ts (which is the ROWS, and lives against the tooling-size cap) for the same
// reason registry-manual.ts and registry-preconditions.ts were: the rows are a ledger to read top to
// bottom, and a multi-line argv construction inside one row buries the next twenty.
//
// Each builder answers the same question — "given the selection's paths for this tool, what child do we
// spawn?" — and each may answer `skip-empty` (nothing in scope) or `whole-only` (this stage cannot be
// narrowed honestly). That vocabulary is `../contract/stage.ts`'s `ScopedArgv`.
import type { ScopedArgv } from "../contract/stage.ts";

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
