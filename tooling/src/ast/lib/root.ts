// Shared root constants of the ast lens fleet (split from the pre-move scripts/codemods/ast.ts,
// P4 of #393). REPO_ROOT re-derived at the move: tooling/src/ast/lib is FOUR levels deep.
import { PACKAGE_NAMES } from "../../_shared/project-worlds.ts";
export const REPO_ROOT = new URL("../../../..", import.meta.url).pathname.replace(/\/$/u, "");

export const SNIPPET_CAP = 120;

export const DEFAULT_MAX = 60;

// Past this many hits, raw lines stop helping — collapse to per-file counts (what a reader
// actually wants at that scale: WHERE, not 200 snippets). --max overrides.
export const COLLAPSE_THRESHOLD = 60;

export const TEST_FILE_RE = /\.(test|ct)\.tsx?$/u;

export const WORKSPACE_PACKAGES = PACKAGE_NAMES;

export const GLOB_STAR_RE = /\*+/gu;

export const TS_SUFFIX_RE = /\.tsx?$/u;

export const DOT_SLASH_RE = /^\.\//u;

export const LEADING_SLASHES_RE = /^\/+/u;

export const TRAILING_SLASHES_RE = /\/+$/u;

// (declFile, declStart) identity separator — a NUL can never appear in a path or a decimal offset.
export const KEY_SEP = "\u0000";

const PACKAGE_SOURCE_RE = /\/packages\/[^/]+\/src\//u;

/** `--near` with no explicit percentage. */
export const RESPELL_NEAR_DEFAULT_PCT = 80;

/** A test source file (a `.test`/`.ct` file or anything under a `/tests/` tree) — never a prod node. */
export function isTestPath(fp: string): boolean {
  return TEST_FILE_RE.test(fp) || fp.includes("/tests/");
}

/** Authored shipped package source. Tooling, scripts, probes, tests, and package-root configs are outside
 *  this corpus even when they legitimately consume package exports. */
export function isPackageSourcePath(fp: string): boolean {
  return PACKAGE_SOURCE_RE.test(fp);
}
