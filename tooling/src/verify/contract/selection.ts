// The scope-SELECTION vocabulary (UNIFIED-VERIFICATION-DESIGN.md §3.4): the request a `verify
// --changed/--file/--package/--scope` invocation makes, and the resolved superset every stage's
// `scopedArgv` reads from. The resolver is ../lib/selection.ts.

/** The CT (Playwright component-test) view on a selection (§3.4). Scoped CT is deliberately UNDER-selecting:
 *  it runs the changed files' test-layout mirrors + a small table of DECLARED blast-radius sweeps — never
 *  the whole suite. This is honest because a scoped green is NEVER the coverage verdict; the push bar
 *  (`tests:node` composing the whole `pnpm test:ct --retries=2`) is. `mode`:
 *   - `"skip"` ⇒ no CT-relevant change → the stage is a no-op this run;
 *   - `"files"` ⇒ run exactly the mirror `.ct.tsx` files in `targets`;
 *   - `"sweep"` ⇒ a blast-radius trigger fired → run the sweep DIRS in `targets` (a dir arg = every
 *     `.ct.tsx` under it, incl. the `.suite.ct.tsx` cross-cutting suites). */
export interface CtView {
  readonly mode: "skip" | "files" | "sweep";
  /** Concrete `.ct.tsx` mirror files (mode "files") OR sweep directories (mode "sweep"), repo-relative posix. */
  readonly targets: readonly string[];
}

const CHANGED_PATH_STATUSES = ["added", "modified", "renamed-existing", "deleted"] as const;
export type ChangedPathStatus = (typeof CHANGED_PATH_STATUSES)[number];

/** One git-derived change. A rename contributes TWO rows: the old deleted path and the new
 * `renamed-existing` path carrying `previousPath`, so graph/structure retain deletion semantics while
 * direct file tools receive only the target that exists. */
export interface ChangedPath {
  readonly path: string;
  readonly status: ChangedPathStatus;
  readonly previousPath: string | null;
}

export interface ChangedPathClassification {
  readonly entries: readonly ChangedPath[];
  /** Every semantic change path, including deletions and the old side of a rename. */
  readonly paths: readonly string[];
  /** The current-filesystem view for tools that open every concrete argv path. */
  readonly existingPaths: readonly string[];
  readonly deletedPaths: readonly string[];
}

/** The resolved selection — the superset every stage's `scopedArgv` reads from (§3.4). */
export interface Selection {
  /** The kind of scope this run covers, for the summary header + the artifact. `staged` is the commit gate (D268). */
  readonly kind: "changed" | "staged" | "file" | "package" | "scope" | "whole";
  readonly label: string;
  /** Every selected repo-relative posix path (deletions KEPT — mirror-expansion needs them, §3.4). */
  readonly paths: readonly string[];
  /** Current-filesystem subset of `paths`. Every stage that opens concrete argv paths derives from this
   * one view; deletion-aware graph/ledger/type/structure consumers continue to use `paths`. */
  readonly existingPaths: readonly string[];
  /** Concrete current authored subjects for the runtime test selector. A file selection contributes its
   * existing files; a folder scope expands through Git's tracked + exclude-standard untracked inventory,
   * never an unconstrained filesystem walk. */
  readonly runtimeSubjects: readonly string[];
  /** paths ∩ the eslint surface ∩ EXISTING. A deleted path is dropped here: eslint takes concrete file
   *  args and hard-ERRORS ("No files matching the pattern") on a path that's gone — it stays in `paths`
   *  (the structure walk reasons about deletions) and still drives its owning tsconfig via `tsconfigs`. */
  readonly eslintPaths: readonly string[];
  /** paths ∩ packages/ TS/JS ∩ EXISTING (depcruise's guard; a deleted path is dropped — depcruise can't
   *  open it, same reasoning as eslintPaths). */
  readonly depcruisePaths: readonly string[];
  /** paths ∩ the doc tool's trees' `.md` ∩ EXISTING (a deleted .md can't be format-checked). */
  readonly docsPaths: readonly string[];
  /** Every distinct native program affected through roots, config inputs, or imported closures. */
  readonly tsconfigs: readonly string[];
  /** The Playwright CT view: which `.ct.tsx` mirrors / sweep dirs this selection runs (§3.4). */
  readonly ct: CtView;
  /** The `node tooling/src/verify/cli.ts scoped …` argv that scopes the structure gates' WALK to this selection. */
  readonly checkScopeArgv: readonly [string, ...string[]];
  /** For a git-derived selection: the ref vitest `--changed` / depcruise `--affected` compare against.
   *  undefined for an explicit-path selection (vitest --changed with no ref = staged+unstaged vs HEAD). */
  readonly gitRef: string | undefined;
}

export type SelectionRequest =
  | { readonly kind: "changed"; readonly paths: readonly string[] } // explicit paths, else git diff
  | { readonly kind: "staged" } // the index vs HEAD: exactly what the next commit records
  | { readonly kind: "file"; readonly paths: readonly string[] } // sugar for changed + explicit paths
  | { readonly kind: "package"; readonly name: string }
  | { readonly kind: "scope"; readonly glob: string };
