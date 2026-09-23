// The ONE scope-selection resolver (UNIFIED-VERIFICATION-DESIGN.md §3.4) shared by every tier: a
// `verify --changed/--file/--package/--scope` selection derives, once, exactly which files each tool
// should see. The honest floor per tool: biome/eslint/docs = file; tsc = every affected native program (file-scoped
// tsc is unsound); depcruise = file. A stage a scope can't honestly run is DEFERRED, never silently skipped.
// The program algebra lives in ./program-routing.ts and the CT view in ./ct-view.ts (five-slot split, P6).

import { execNicedSync } from "@orb/tooling/_shared/proc";
import { BROWSER_PACKAGES, isNodeToolSource, isWorldHelperPath } from "@orb/tooling/_shared/project-worlds";
import type { PolicySemanticPath } from "../contract/policy-scope.ts";
import type { ChangedPathClassification, CtView, Selection, SelectionRequest } from "../contract/selection.ts";
import { ctView } from "./ct-view.ts";
import { planTypecheckPrograms } from "./program-routing.ts";
import { classifyExplicitPaths, GIT_READ_PREFIX, gitChangedPathClassification, packageDir, ROOT } from "./repo-paths.ts";

// ── the path-zone predicates (lifted verbatim from check/file.ts — kept in ONE place) ──
// Mirrors the native ESLint config's scoped population — and the mirroring is LOAD-BEARING, not
// cosmetic: a scoped lane linting a changed file only sees rules if this predicate agrees with the
// config. `tooling/src` + `tests/tooling` joined on 2026-08-22 (#459); the WHOLE `tests/` tree
// joined the same day (#473), which is why the tests arm is a bare `tests` rather than a per-dir
// alternation — the alternation is exactly what went stale twice. Both halves are pinned against each
// other in tests/tooling/verify/ops/run.int.test.ts ("a tooling file IS in the eslint surface").
const ESLINT_RE = /^(?:packages\/(?:ui|client|server|kit|db|contracts)|tests|tooling\/src)\/.*\.tsx?$/u;
const DEPCRUISE_SOURCE_RE = /\.(?:ts|tsx|js|jsx|mts|cts)$/u;

function isDepcruisePath(path: string): boolean {
  return DEPCRUISE_SOURCE_RE.test(path) && (path.startsWith("packages/") || path.startsWith("tooling/") || isWorldHelperPath(path));
}
// The formatter's living trees under docs/ (`doc-catalog/ops/format.ts` LIVING_TREES, minus the parked
// set): the architecture corpus plus the four trees the `doc` tool governs (`doc-catalog/lib/vocab.ts`
// DOC_TOOL_TREES). Spelled here because a `#doc-catalog` import would chain-load the formatter into every
// selection.
const DOCS_MD_RE = /^docs\/(?:adr|plans|work|law)\/.*\.md$/u;
const SCOPE_GLOB_TAIL_RE = /\/\*\*$/u;
const TRAILING_SLASH_RE = /\/+$/u;

/** The argv that scopes the structure gates' WALK to a selection — the tool's own `scoped` verb through
 *  the ONE cli front door (docs/law/Core-Tooling-Law.md §2.5). */
const SCOPED_CLI: readonly [string, ...string[]] = ["node", "tooling/src/verify/cli.ts", "scoped"];

/** Filter helpers over a repo-relative path set. */
function filterPaths(paths: readonly string[], pred: (p: string) => boolean): readonly string[] {
  return paths.filter(pred);
}

/** Build the derived views (eslint/depcruise/docs/native compiler programs) from a repo-relative path set. */
function deriveViews(
  semanticPaths: readonly PolicySemanticPath[],
  existingPaths: readonly string[],
  root: string,
): {
  readonly eslintPaths: readonly string[];
  readonly depcruisePaths: readonly string[];
  readonly docsPaths: readonly string[];
  readonly tsconfigs: readonly string[];
  readonly ct: CtView;
} {
  const paths = semanticPaths.map((path) => path.path);
  const typecheck = planTypecheckPrograms(root, semanticPaths, "affected");
  return {
    // Every direct-file view derives from the classification's ONE current-filesystem subset. The all-path
    // view below still drives tsconfig/graph/structure/deletion semantics.
    eslintPaths: filterPaths(existingPaths, (p) => ESLINT_RE.test(p) || isNodeToolSource(p)),
    depcruisePaths: filterPaths(existingPaths, isDepcruisePath),
    docsPaths: filterPaths(existingPaths, (p) => DOCS_MD_RE.test(p)),
    tsconfigs: typecheck.programs,
    ct: ctView(paths, root),
  };
}

/** Git's diff omits untracked files by definition. A bare `--changed` means the whole working change,
 * so union the diff's rename-aware identities with Git's authoritative untracked view. */
export function workingChangeClassification(root: string): ChangedPathClassification {
  const changed = gitChangedPathClassification(root);
  const untracked = execNicedSync("git", [...GIT_READ_PREFIX, "ls-files", "--others", "--exclude-standard", "-z"], { cwd: root })
    .split("\0")
    .filter((path) => path.length > 0);
  const entries = [...changed.entries, ...untracked.map((path) => ({ path, status: "added" as const, previousPath: null }))];
  const paths = [...new Set(entries.map((entry) => entry.path))];
  return {
    entries,
    paths,
    existingPaths: paths.filter((path) => !changed.deletedPaths.includes(path)),
    deletedPaths: changed.deletedPaths,
  };
}

/** Current authored files beneath a folder scope: tracked plus Git's exclude-standard untracked view.
 * This is the same population a working change can contain and deliberately excludes ignored caches,
 * generated scratch trees, and node_modules without teaching this resolver their names. */
function authoredPathsUnder(prefix: string, root: string): readonly string[] {
  const tracked = execNicedSync("git", [...GIT_READ_PREFIX, "ls-files", "-z", "--", prefix], { cwd: root });
  const untracked = execNicedSync("git", [...GIT_READ_PREFIX, "ls-files", "--others", "--exclude-standard", "-z", "--", prefix], { cwd: root });
  const paths = `${tracked}${untracked}`.split("\0").filter((path) => path.length > 0);
  return classifyExplicitPaths(paths, root).existingPaths.toSorted();
}

/** Resolve a `changed`/`file` selection from explicit paths (or git when none given). */
function resolveChanged(kind: "changed" | "file", explicit: readonly string[], root: string): Selection {
  const classification = explicit.length > 0 ? classifyExplicitPaths(explicit, root) : workingChangeClassification(root);
  const { paths, existingPaths } = classification;
  const gitRef = explicit.length > 0 ? undefined : "HEAD";
  const label = `${kind} (${paths.length} file${paths.length === 1 ? "" : "s"})`;
  return {
    kind,
    label,
    paths,
    existingPaths,
    runtimeSubjects: existingPaths,
    ...deriveViews(classification.entries, existingPaths, root),
    checkScopeArgv: [...SCOPED_CLI, "--changed", ...paths],
    gitRef,
  };
}

/** Resolve a `--package <name>` selection. Structure uses --package natively and direct-file tools
 *  receive the package prefix. Runtime and native compiler selection expand that prefix to authored
 *  files; typechecking then includes every program affected through their native import closures. */
function resolvePackage(name: string, root: string): Selection {
  const dir = packageDir(name);
  // @orb/tooling is a ROOT-tree workspace package (docs/law/Core-Tooling-Law.md §2.1), not packages/*.
  const prefix = dir === "tooling" ? "tooling/" : `packages/${dir}/`;
  // Direct-file views retain the prefix; runtime subjects and affected compiler programs use the
  // concrete authored-file enumeration below.
  const runtimeSubjects = authoredPathsUnder(prefix.replace(/\/$/u, ""), root);
  if (runtimeSubjects.length === 0) {
    throw new Error(`package scope selected zero authored paths: ${name}`);
  }
  const paths: readonly string[] = [prefix];
  const typecheck = planTypecheckPrograms(
    root,
    runtimeSubjects.map((path) => ({ path, status: "present", previousPath: null })),
    "affected",
  );
  return {
    kind: "package",
    label: `package ${dir}`,
    paths,
    existingPaths: paths,
    runtimeSubjects,
    eslintPaths: ESLINT_RE.test(`${prefix}x.ts`) ? [prefix] : [],
    depcruisePaths: [prefix],
    docsPaths: [],
    tsconfigs: typecheck.programs,
    // A whole-package scope over a BROWSER package sweeps that package's whole mirror tree (the honest floor
    // for "everything in ui/client changed"); a node package contributes no CT. Prefix-based, so it doesn't
    // route through the per-file mirror map (paths here is a bare prefix, not a concrete .tsx file).
    ct: BROWSER_PACKAGES.has(dir) ? { mode: "sweep", targets: [`tests/${dir}`] } : { mode: "skip", targets: [] },
    checkScopeArgv: [...SCOPED_CLI, "--package", dir],
    gitRef: undefined,
  };
}

/** Resolve a `--scope <folder-glob>` selection. */
function resolveScope(glob: string, root: string): Selection {
  const prefix = glob.replace(SCOPE_GLOB_TAIL_RE, "").replace(TRAILING_SLASH_RE, "");
  const paths: readonly string[] = [prefix];
  const runtimeSubjects = authoredPathsUnder(prefix, root);
  if (runtimeSubjects.length === 0) {
    throw new Error(`scope selected zero authored paths: ${glob}`);
  }
  const typecheck = planTypecheckPrograms(
    root,
    runtimeSubjects.map((path) => ({ path, status: "present", previousPath: null })),
    "affected",
  );
  return {
    kind: "scope",
    label: `scope ${glob}`,
    paths,
    existingPaths: paths,
    runtimeSubjects,
    eslintPaths: ESLINT_RE.test(`${prefix}/x.ts`) ? [prefix] : [],
    depcruisePaths: isDepcruisePath(`${prefix}/x.ts`) ? [prefix] : [],
    docsPaths: DOCS_MD_RE.test(`${prefix}/x.md`) ? [prefix] : [],
    tsconfigs: typecheck.programs,
    // The sweep triggers are prefix-tests, so a folder scope under a declared blast-radius (e.g.
    // `--scope packages/ui/src/tokens`) escalates to the matching sweep; a scope with no trigger is skip
    // (the per-file mirror map needs a concrete .tsx path, which a folder glob is not).
    ct: ctView([prefix]),
    checkScopeArgv: [...SCOPED_CLI, "--scope", glob],
    gitRef: undefined,
  };
}

/** Resolve a scope request into the shared Selection every stage's scopedArgv reads. */
export function resolveSelection(req: SelectionRequest, root: string = ROOT): Selection {
  switch (req.kind) {
    case "changed":
      return resolveChanged("changed", req.paths, root);
    case "file":
      return resolveChanged("file", req.paths, root);
    case "package":
      return resolvePackage(req.name, root);
    case "scope":
      return resolveScope(req.glob, root);
  }
}
