// The ONE scope-selection resolver (UNIFIED-VERIFICATION-DESIGN.md §3.4) shared by every tier. Promotes
// check/file.ts's proven path→tool mechanics (the ESLint surface regex, the tsconfigFor algebra, the
// depcruise guard) into one place so a `verify --changed/--file/--package/--scope` selection derives, ONCE,
// exactly which files each tool should see. Whole-scope stages ignore it; scoped tiers thread it into each
// stage's `scopedArgv`.
//
// The honest floor per tool (§3.4): biome/eslint/docs = file; tsc = the OWNING package (file-scoped tsc is
// unsound); depcruise = file (dependents via --affected when git-derived); structure = check:scope's own
// per-gate scope. A stage a scope can't honestly run is DEFERRED, never silently skipped.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";

// ── the path-zone predicates + algebra (lifted verbatim from check/file.ts — kept in ONE place) ──
const TS_RE = /\.(?:ts|tsx|mts|cts)$/u;
// Mirrors the lint:eslint script's path list in package.json.
const ESLINT_RE =
  /^(?:packages\/(?:ui|client|server|kit|db|contracts)|tests\/ui|tests\/client)\/.*\.tsx?$/u;
const DEPCRUISE_RE = /^packages\/.*\.(?:ts|tsx|js|jsx|mts|cts)$/u;
const UI_REACH_BACK_RE = /^(?:tests\/ui\/.*\.(?:ct|fixtures)\.tsx|tests\/support\/ct\/.*\.tsx)$/u;
const PKG_SRC_RE = /^packages\/([^/]+)\/src\//u;
const DOCS_MD_RE = /^docs\/architecture\/.*\.md$/u;
const DOCS_PROPOSED_RE = /^docs\/architecture\/proposed\//u;
const SCOPE_GLOB_TAIL_RE = /\/\*\*$/u;
const TRAILING_SLASH_RE = /\/+$/u;

/** The tsconfig whose program OWNS this file — the smallest HONEST tsc scope (file-scoped tsc never sees
 *  consumers). undefined = the file is in no TS program. */
function tsconfigFor(rel: string): string | undefined {
  if (!TS_RE.test(rel)) {
    return;
  }
  const pkg = PKG_SRC_RE.exec(rel)?.[1];
  if (pkg !== undefined) {
    return `packages/${pkg}/tsconfig.json`;
  }
  if (UI_REACH_BACK_RE.test(rel) || rel.startsWith("playwright/")) {
    return "packages/ui/tsconfig.json";
  }
  const nodeCtx = rel.startsWith("tests/") || rel.startsWith("scripts/") || rel === "reset.d.ts";
  return nodeCtx ? "tsconfig.json" : undefined;
}

/** Trees ONLY the root graph program sees (the whole-graph net the per-package lane + vitest miss). */
function isGraphOnlyTree(rel: string): boolean {
  return rel.startsWith("tests/") || rel.startsWith("scripts/") || rel === "reset.d.ts";
}

/** The resolved selection — the superset every stage's `scopedArgv` reads from (§3.4). */
export type Selection = {
  /** The kind of scope this run covers, for the summary header + the artifact. */
  readonly kind: "changed" | "file" | "package" | "scope" | "whole";
  readonly label: string;
  /** Every selected repo-relative posix path (deletions KEPT — mirror-expansion needs them, §3.4). */
  readonly paths: readonly string[];
  /** paths ∩ the eslint surface. */
  readonly eslintPaths: readonly string[];
  /** paths ∩ packages/ TS/JS (depcruise's guard). */
  readonly depcruisePaths: readonly string[];
  /** paths ∩ docs/architecture/**.md (excluding proposed/). */
  readonly docsPaths: readonly string[];
  /** The distinct OWNING tsconfigs the selection touches (the honest per-package tsc floor). */
  readonly tsconfigs: readonly string[];
  /** Does the selection touch tests/ · scripts/ · reset.d.ts (the graph-only trees)? */
  readonly touchesGraphOnlyTrees: boolean;
  /** The `tsx scripts/check/scoped.ts …` argv that scopes the structure gates' WALK to this selection. */
  readonly checkScopeArgv: readonly [string, ...string[]];
  /** For a git-derived selection: the ref vitest `--changed` / depcruise `--affected` compare against.
   *  undefined for an explicit-path selection (vitest --changed with no ref = staged+unstaged vs HEAD). */
  readonly gitRef: string | undefined;
};

export type SelectionRequest =
  | { readonly kind: "changed"; readonly paths: readonly string[] } // explicit paths, else git diff
  | { readonly kind: "file"; readonly paths: readonly string[] } // sugar for changed + explicit paths
  | { readonly kind: "package"; readonly name: string }
  | { readonly kind: "scope"; readonly glob: string };

const ROOT = process.cwd();

/** The git-changed set: `git diff --name-only HEAD` (staged + unstaged vs HEAD), repo-relative posix. */
function gitChangedPaths(): readonly string[] {
  const res = spawnSync("git", ["diff", "--name-only", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`git diff failed: ${res.stderr?.trim() ?? "unknown error"}`);
  }
  return res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Normalize a caller-supplied path (abs or cwd-relative) to a repo-relative posix path. A path outside
 *  the repo is dropped. Deletions are KEPT (a path that no longer exists on disk stays in the set). */
function toRepoRel(arg: string): string | undefined {
  const abs = isAbsolute(arg) ? arg : resolve(ROOT, arg);
  const rel = relative(ROOT, abs);
  return rel.startsWith("..") ? undefined : rel;
}

function packageDir(name: string): string {
  return name.startsWith("@orb/") ? name.slice("@orb/".length) : name;
}

/** Filter helpers over a repo-relative path set. */
function filterPaths(paths: readonly string[], pred: (p: string) => boolean): readonly string[] {
  return paths.filter(pred);
}

function distinctTsconfigs(paths: readonly string[]): readonly string[] {
  return [...new Set(paths.map(tsconfigFor).filter((c): c is string => c !== undefined))];
}

/** Build the derived views (eslint/depcruise/docs/tsconfigs/graph flag) from a repo-relative path set. */
function deriveViews(paths: readonly string[]): {
  readonly eslintPaths: readonly string[];
  readonly depcruisePaths: readonly string[];
  readonly docsPaths: readonly string[];
  readonly tsconfigs: readonly string[];
  readonly touchesGraphOnlyTrees: boolean;
} {
  return {
    eslintPaths: filterPaths(paths, (p) => ESLINT_RE.test(p)),
    depcruisePaths: filterPaths(paths, (p) => DEPCRUISE_RE.test(p)),
    docsPaths: filterPaths(paths, (p) => DOCS_MD_RE.test(p) && !DOCS_PROPOSED_RE.test(p)),
    tsconfigs: distinctTsconfigs(paths),
    touchesGraphOnlyTrees: paths.some(isGraphOnlyTree),
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
    checkScopeArgv:
      paths.length > 0
        ? ["tsx", "scripts/check/scoped.ts", "--changed", ...paths]
        : ["tsx", "scripts/check/scoped.ts", "--changed"],
    gitRef,
  };
}

/** Resolve a `--package <name>` selection. The check:scope side uses --package natively; the tool views
 *  use the package src prefix (a package run is whole-package, so no explicit file list is threaded to
 *  biome/eslint here — they run over the package via check:scope's fileset only for structure; biome/
 *  eslint/tsc take the package prefix as a folder arg). */
function resolvePackage(name: string): Selection {
  const dir = packageDir(name);
  const prefix = `packages/${dir}/`;
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
    tsconfigs: [`packages/${dir}/tsconfig.json`],
    touchesGraphOnlyTrees: false,
    checkScopeArgv: ["tsx", "scripts/check/scoped.ts", "--package", dir],
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
    depcruisePaths: prefix.startsWith("packages/") ? [prefix] : [],
    docsPaths: prefix.startsWith("docs/architecture") ? [prefix] : [],
    tsconfigs: distinctTsconfigs([`${prefix}/x.ts`]),
    touchesGraphOnlyTrees: isGraphOnlyTree(`${prefix}/x.ts`),
    checkScopeArgv: ["tsx", "scripts/check/scoped.ts", "--scope", glob],
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

/** A caller-facing existence check for `--file` paths (the check:file muscle memory refused bad paths). */
export function badPaths(paths: readonly string[]): readonly string[] {
  return paths.filter((p) => {
    const abs = isAbsolute(p) ? p : resolve(ROOT, p);
    const rel = relative(ROOT, abs);
    return rel.startsWith("..") || !existsSync(abs);
  });
}
