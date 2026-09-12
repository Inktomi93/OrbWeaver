// Project bootstrap — CONSOLIDATED onto _shared/ts-workspace at P4 (#393): the kit's own
// `new Project(` site died; getWorkspace(types:true) is the ONE bootstrap (`tooling-project-home`
// proves it). `projectOptionsOverride`/`extraGlobs` were deleted at the move (zero users —
// stated clean cut); `tsConfigFilePath`+`replaceGlobs` survive (the int test drives a scratch root).
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
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

/**
 * Build a ts-morph Project pre-loaded with the codebase's standard globs — THROUGH the one
 * sanctioned bootstrap (_shared/ts-workspace getWorkspace, types:true: root-tsconfig resolution
 * options + our file set).
 *
 * Validates: tsconfig.json exists; at least one file matched the globs (early signal that the
 * glob is wrong rather than discovering the codemod has nothing to do).
 *
 * Reuse: same project instance for the whole codemod — each Project spins up its own compiler.
 */
export function createCodemodProject(opts: CreateProjectOptions = {}): Project {
  const cwd = process.cwd();
  const tsConfigFilePath = resolve(cwd, opts.tsConfigFilePath ?? "tsconfig.json");
  if (!existsSync(tsConfigFilePath)) {
    throw new CodemodError(`tsconfig.json not found at ${tsConfigFilePath}`, "Run the codemod from the repo root, or pass `tsConfigFilePath`.");
  }
  const root = dirname(tsConfigFilePath);
  const globs = opts.replaceGlobs ?? DEFAULT_GLOBS.map((g) => `${root}/${g}`);
  const project = getWorkspace({ root, types: true, globs });
  const fileCount = project.getSourceFiles().length;
  if (fileCount === 0) {
    throw new CodemodError(
      `Project loaded zero source files (globs: ${globs.join(", ")}).`,
      "Check the glob patterns + that you're running from the repo root.",
    );
  }
  return project;
}
