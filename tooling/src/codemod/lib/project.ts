// Project bootstrap for the mutable syntax carrier. Semantic/type-aware work goes through
// CodemodContext.semantic(), whose Projects follow the repository's native compiler programs.
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { readAuthoredRepositoryPathnames } from "@orb/tooling/_shared/authored-repository";
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import type { Project } from "ts-morph";
import type { CreateProjectOptions } from "../contract/types.ts";
import { CodemodError } from "./errors.ts";

/**
 * Standard glob patterns the codemod toolkit loads by default. The user can
 * override or supplement these by passing `extraGlobs` to
 * `createCodemodProject`. Order matters slightly — we add src first so a
 * test that imports from src finds the typed source files, not a stale d.ts.
 */
export const DEFAULT_GLOBS = [
  // Monorepo layout: package source lives under packages/*/src — a bare src/** here
  // silently loads ZERO package files from the repo root (the zero-file guard doesn't
  // fire because tests/ + scripts/ still match).
  "packages/*/src/**/*.ts",
  "packages/*/src/**/*.tsx",
  "tests/**/*.ts",
  "tests/**/*.tsx",
  "scripts/**/*.ts",
] as const;

function contains(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

function authoredPaths(root: string): ReadonlySet<string> | undefined {
  // The public kit also supports standalone scratch projects. A repository gets Git's exact lexical
  // authored set; the native semantic reader separately applies physical/symlink validation.
  return existsSync(join(root, ".git")) ? new Set(readAuthoredRepositoryPathnames(root)) : undefined;
}

function isStructuralNonSource(root: string, path: string): boolean {
  const segments = relative(root, path).split(sep);
  return segments.includes("node_modules") || (segments[0] === ".claude" && segments[1] === "worktrees");
}

/**
 * Build the mutable ts-morph syntax carrier pre-loaded with the codebase's standard globs.
 * The requested config supplies parsing/module-resolution options, including its exact basename;
 * it is not the semantic authority for type-aware planning across the repository.
 *
 * Validates: tsconfig.json exists; at least one file matched the globs (early signal that the
 * glob is wrong rather than discovering the codemod has nothing to do).
 *
 * Reuse: the same carrier lives for the whole transaction. Semantic views are fresh native-program
 * snapshots of its current text, requested through CodemodContext.semantic().
 */
export function createCodemodProject(opts: CreateProjectOptions = {}, repoRoot?: string): Project {
  const cwd = process.cwd();
  const tsConfigFilePath = opts.tsConfigFilePath === undefined ? resolve(repoRoot ?? cwd, "tsconfig.json") : resolve(cwd, opts.tsConfigFilePath);
  if (!existsSync(tsConfigFilePath)) {
    throw new CodemodError(`tsconfig.json not found at ${tsConfigFilePath}`, "Run the codemod from the repo root, or pass `tsConfigFilePath`.");
  }
  const root = resolve(repoRoot ?? (contains(cwd, tsConfigFilePath) ? cwd : dirname(tsConfigFilePath)));
  const globs = opts.replaceGlobs ?? DEFAULT_GLOBS.map((g) => `${root}/${g}`);
  const authored = authoredPaths(root);
  const project = getWorkspace({ root, types: true, tsConfigFilePath, globs, skipFileDependencyResolution: true });
  for (const sourceFile of project.getSourceFiles()) {
    if (
      isStructuralNonSource(root, sourceFile.getFilePath()) ||
      (authored !== undefined && !authored.has(relative(root, sourceFile.getFilePath()).split(sep).join("/")))
    ) {
      project.removeSourceFile(sourceFile);
    }
  }
  const fileCount = project.getSourceFiles().length;
  if (fileCount === 0) {
    throw new CodemodError(
      `Project loaded zero source files (globs: ${globs.join(", ")}).`,
      "Check the glob patterns + that you're running from the repo root.",
    );
  }
  return project;
}
