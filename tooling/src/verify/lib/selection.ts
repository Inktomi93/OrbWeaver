// The ONE scope-selection resolver (UNIFIED-VERIFICATION-DESIGN.md §3.4) shared by every tier: a
// `verify --changed/--file/--package/--scope` selection derives, once, exactly which files each tool
// should see. The honest floor per tool: biome/eslint/docs = file; tsc = the owning package (file-scoped
// tsc is unsound); depcruise = file. A stage a scope can't honestly run is DEFERRED, never silently skipped.
// The program algebra lives in ./program-routing.ts and the CT view in ./ct-view.ts (five-slot split, P6).
import type { CtView, Selection, SelectionRequest } from "../contract/selection.ts";
import { ctView } from "./ct-view.ts";
import { BROWSER_PACKAGES, distinctTsconfigs, graphMembership, touchesGraph } from "./program-routing.ts";
import { existsRel, gitChangedPaths, packageDir, toRepoRel } from "./repo-paths.ts";

// ── the path-zone predicates (lifted verbatim from check/file.ts — kept in ONE place) ──
// Mirrors the lint:eslint script's path list in package.json — and the mirroring is LOAD-BEARING, not
// cosmetic: a scoped lane linting a changed file only sees the rules if this regex agrees with that
// script's argv. `tooling/src` + `tests/tooling` joined on 2026-08-22 (#459); the WHOLE `tests/` tree
// joined the same day (#473), which is why the tests arm is a bare `tests` rather than a per-dir
// alternation — the alternation is exactly what went stale twice. Both halves are pinned against each
// other in tests/tooling/verify/ops/run.int.test.ts ("a tooling file IS in the eslint surface").
const ESLINT_RE = /^(?:packages\/(?:ui|client|server|kit|db|contracts)|tests|tooling\/src)\/.*\.tsx?$/u;
const DEPCRUISE_RE = /^(?:packages|tooling)\/.*\.(?:ts|tsx|js|jsx|mts|cts)$/u;
const DOCS_MD_RE = /^docs\/architecture\/.*\.md$/u;
const DOCS_PROPOSED_RE = /^docs\/architecture\/proposed\//u;
const SCOPE_GLOB_TAIL_RE = /\/\*\*$/u;
const TRAILING_SLASH_RE = /\/+$/u;

/** The argv that scopes the structure gates' WALK to a selection — the tool's own `scoped` verb through
 *  the ONE cli front door (docs/architecture/core/Core-Tooling-Law.md §2.5). */
const SCOPED_CLI: readonly [string, ...string[]] = ["node", "tooling/src/verify/cli.ts", "scoped"];

/** Filter helpers over a repo-relative path set. */
function filterPaths(paths: readonly string[], pred: (p: string) => boolean): readonly string[] {
  return paths.filter(pred);
}

/** Build the derived views (eslint/depcruise/docs/tsconfigs/graph flag) from a repo-relative path set. */
function deriveViews(paths: readonly string[]): {
  readonly eslintPaths: readonly string[];
  readonly depcruisePaths: readonly string[];
  readonly docsPaths: readonly string[];
  readonly tsconfigs: readonly string[];
  readonly touchesGraphOnlyTrees: boolean;
  readonly ct: CtView;
} {
  const graphSrc = graphMembership();
  return {
    // The three file-list views drop deletions (existsRel) — their child tools take concrete file args and
    // error on a path that's gone. tsconfigs/graph/paths below KEEP deletions (see existsRel's note).
    eslintPaths: filterPaths(paths, (p) => ESLINT_RE.test(p) && existsRel(p)),
    depcruisePaths: filterPaths(paths, (p) => DEPCRUISE_RE.test(p) && existsRel(p)),
    docsPaths: filterPaths(paths, (p) => DOCS_MD_RE.test(p) && !DOCS_PROPOSED_RE.test(p) && existsRel(p)),
    tsconfigs: distinctTsconfigs(paths, graphSrc),
    // `touchesGraphOnlyTrees` KEEPS its field name (downstream registry contract) but now means "puts any
    // file in the GRAPH program" — graph roots (tests/scripts/reset.d.ts) OR the import-pull overlay.
    touchesGraphOnlyTrees: touchesGraph(paths, graphSrc),
    ct: ctView(paths),
  };
}

/** Resolve a `changed`/`file` selection from explicit paths (or git when none given). */
function resolveChanged(kind: "changed" | "file", explicit: readonly string[]): Selection {
  const raw = explicit.length > 0 ? explicit : gitChangedPaths();
  const paths = [...new Set(raw.map(toRepoRel).filter((p): p is string => p !== undefined))];
  const gitRef = explicit.length > 0 ? undefined : "HEAD";
  const label = `${kind} (${paths.length} file${paths.length === 1 ? "" : "s"})`;
  return {
    kind,
    label,
    paths,
    ...deriveViews(paths),
    checkScopeArgv: [...SCOPED_CLI, "--changed", ...paths],
    gitRef,
  };
}

/** Resolve a `--package <name>` selection. The check:scope side uses --package natively; the tool views
 *  use the package src prefix (a package run is whole-package, so no explicit file list is threaded to
 *  biome/eslint here — they run over the package via check:scope's fileset only for structure; biome/
 *  eslint/tsc take the package prefix as a folder arg). */
function resolvePackage(name: string): Selection {
  const dir = packageDir(name);
  // @orb/tooling is a ROOT-tree workspace package (docs/architecture/core/Core-Tooling-Law.md §2.1), not packages/*.
  const prefix = dir === "tooling" ? "tooling/" : `packages/${dir}/`;
  // A package selection's "paths" is the prefix itself — biome/eslint accept a directory arg, tsc uses the
  // owning tsconfig, depcruise takes the prefix. The concrete file enumeration is left to each tool.
  const paths: readonly string[] = [prefix];
  return {
    kind: "package",
    label: `package ${dir}`,
    paths,
    eslintPaths: ESLINT_RE.test(`${prefix}x.ts`) ? [prefix] : [],
    depcruisePaths: [prefix],
    docsPaths: [],
    tsconfigs: [dir === "tooling" ? "tooling/tsconfig.json" : `packages/${dir}/tsconfig.json`],
    // A NODE package's src ARE graph roots → --package runs types:graph (the DOM-less lens catches what the
    // package's own dom-tsconfig can't — the TS2584 class). Browser packages (ui/client) are graph-EXCLUDED,
    // so graph honestly defers. This keeps --package consistent with --changed on the same package's files.
    touchesGraphOnlyTrees: !BROWSER_PACKAGES.has(dir),
    // A whole-package scope over a BROWSER package sweeps that package's whole mirror tree (the honest floor
    // for "everything in ui/client changed"); a node package contributes no CT. Prefix-based, so it doesn't
    // route through the per-file mirror map (paths here is a bare prefix, not a concrete .tsx file).
    ct: BROWSER_PACKAGES.has(dir) ? { mode: "sweep", targets: [`tests/${dir}`] } : { mode: "skip", targets: [] },
    checkScopeArgv: [...SCOPED_CLI, "--package", dir],
    gitRef: undefined,
  };
}

/** Resolve a `--scope <folder-glob>` selection. */
function resolveScope(glob: string): Selection {
  const prefix = glob.replace(SCOPE_GLOB_TAIL_RE, "").replace(TRAILING_SLASH_RE, "");
  const paths: readonly string[] = [prefix];
  return {
    kind: "scope",
    label: `scope ${glob}`,
    paths,
    eslintPaths: ESLINT_RE.test(`${prefix}/x.ts`) ? [prefix] : [],
    depcruisePaths: prefix.startsWith("packages/") || prefix.startsWith("tooling") ? [prefix] : [],
    docsPaths: prefix.startsWith("docs/architecture") ? [prefix] : [],
    // A folder scope: use the conservative fallback (undefined overlay) — a packages/*/src scope then also
    // runs the graph, the honest floor for a whole-folder run.
    tsconfigs: distinctTsconfigs([`${prefix}/x.ts`], undefined),
    touchesGraphOnlyTrees: touchesGraph([`${prefix}/x.ts`], undefined),
    // The sweep triggers are prefix-tests, so a folder scope under a declared blast-radius (e.g.
    // `--scope packages/ui/src/tokens`) escalates to the matching sweep; a scope with no trigger is skip
    // (the per-file mirror map needs a concrete .tsx path, which a folder glob is not).
    ct: ctView([prefix]),
    checkScopeArgv: [...SCOPED_CLI, "--scope", glob],
    gitRef: undefined,
  };
}

/** Resolve a scope request into the shared Selection every stage's scopedArgv reads. */
export function resolveSelection(req: SelectionRequest): Selection {
  switch (req.kind) {
    case "changed":
      return resolveChanged("changed", req.paths);
    case "file":
      return resolveChanged("file", req.paths);
    case "package":
      return resolvePackage(req.name);
    case "scope":
      return resolveScope(req.glob);
  }
}
