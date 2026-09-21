// Plans (the unit of preview-then-commit) + validation + path helpers.
// ── §5 ─ Plans ───────────────────────────────────────────────────────────────

import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { classifyTestFilename } from "@orb/tooling/_shared/test-kinds";
import type { OperationOptions, Plan } from "../contract/types.ts";
import { CodemodError } from "./errors.ts";

/** Compose multiple plans into one. Useful for helpers that internally batch
 *  several smaller plans (e.g. "delete file + remove its imports everywhere"). */
export function composePlans(description: string, plans: readonly Plan[]): Plan {
  const touched = new Set<string>();
  for (const p of plans) {
    for (const t of p.touchedFiles) {
      touched.add(t);
    }
  }
  return {
    description,
    touchedFiles: [...touched],
    transform(ctx): void {
      for (const p of plans) {
        p.transform(ctx);
      }
    },
  };
}

/** The ` (note)` tail every plan description carries. ONE home for the rule, which is that an
 *  ABSENT note and a BLANK one render the same (nothing) — a blank one would print an empty pair
 *  of parens into the preview. Seventeen description builders spelled this inline before #472. */
export function noteSuffix(opts: OperationOptions): string {
  return opts.note === undefined || opts.note === "" ? "" : ` (${opts.note})`;
}

// ── §6 ─ Validation helpers ──────────────────────────────────────────────────

/** Assert `cond`. On failure throw CodemodError with `msg` and a hint. Prefer
 *  this over bare `if (...) throw` so failures look consistent in the harness
 *  output. `boolean`, not `unknown`: every call site already passes a comparison
 *  (`sf !== undefined`, `paths.length > 0`, `existsSync(abs)`), and an `unknown`
 *  parameter turns the body's `!cond` into a JS-truthiness read of a value nobody
 *  ever passes. */
export function assert(cond: boolean, msg: string, hint = "(no hint)"): asserts cond {
  if (!cond) {
    throw new CodemodError(msg, hint);
  }
}

/** Validate a glob/path string is well-formed enough to feed into ts-morph.
 *  Doesn't check for existence (callers vary). */
export function assertPathString(value: unknown, name: string): asserts value is string {
  assert(
    typeof value === "string" && value.length > 0,
    `${name} must be a non-empty string`,
    `Got: ${typeof value === "string" ? `"${value}"` : typeof value}`,
  );
}

// ── §7 ─ Path helpers ────────────────────────────────────────────────────────

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function isContained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

function containmentInspectionError(path: string, error: unknown): CodemodError {
  return new CodemodError(`Cannot inspect path containment: ${path}`, error instanceof Error ? error.message : String(error));
}

function pathEntryExists(path: string): boolean {
  // @orb-waive caught-failure-ownership(error): ENOENT/ENOTDIR means this entry is absent and the caller continues to an existing ancestor; other failures throw. Ends if false is treated as a containment verdict.
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }
    throw containmentInspectionError(path, error);
  }
}

function resolvePhysicalExistingPath(path: string, unborn: readonly string[]): string {
  try {
    return resolve(realpathSync(path), ...unborn);
  } catch (error) {
    return throwUnresolvedPhysicalPath(path, error);
  }
}

function throwUnresolvedPhysicalPath(path: string, error: unknown): never {
  throw new CodemodError(
    `Cannot resolve path containment: ${path}`,
    `${error instanceof Error ? error.message : String(error)}. Dangling or cyclic symlinks are refused.`,
  );
}

/** Resolve the existing prefix of `path` through every symlink, then project any unborn suffix
 *  from that physical ancestor. Returning the caller's lexical path is deliberate: ts-morph keys
 *  SourceFile identity by that spelling, while this second path exists only to judge containment. */
function physicalPath(path: string): string {
  let existing = path;
  const unborn: string[] = [];
  while (!pathEntryExists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      throw new CodemodError(`Cannot resolve path containment: ${path}`, "No existing path ancestor could be resolved.");
    }
    unborn.unshift(basename(existing));
    existing = parent;
  }
  return resolvePhysicalExistingPath(existing, unborn);
}

/** Resolve `p` to an absolute lexical path against `repoRoot`. Pass-through for absolute paths.
 *  Refuses both lexical escapes and paths whose existing symlink ancestry resolves outside the
 *  physical repo root; unborn destinations inherit their nearest existing ancestor's location. */
export function absolutePath(p: string, repoRoot: string): string {
  assertPathString(p, "path");
  const root = resolve(repoRoot);
  const abs = isAbsolute(p) ? normalize(p) : resolve(root, p);
  if (!isContained(root, abs)) {
    throw new CodemodError(`Path escapes repo root: ${p}`, "Codemod helpers refuse to touch files outside the repo. Pass a path relative to the repo root.");
  }
  const physicalRoot = physicalPath(root);
  const physical = physicalPath(abs);
  if (!isContained(physicalRoot, physical)) {
    throw new CodemodError(
      `Path resolves outside repo root: ${p}`,
      "Codemod helpers refuse symlinked paths whose physical target leaves the repo. Use a path whose resolved ancestry stays inside the repo root.",
    );
  }
  return abs;
}

/** Canonical physical identity for an already-authorized codemod path. This is the ONE resolver for
 *  alias-aware mutation and compiler-overlay keys; callers must not reproduce the ancestry walk. */
export function physicalPathIdentity(p: string, repoRoot: string): string {
  return physicalPath(absolutePath(p, repoRoot));
}

/** Refuse two distinct lexical mutation paths that name the same physical file through in-repo
 *  symlink ancestry. Call this on the final ACTUAL changed-path set, not every declaration: a plan may
 *  legitimately snapshot one unchanged file or edit the same lexical SourceFile more than once. */
export function assertUniquePhysicalMutationPaths(paths: readonly string[], repoRoot: string): void {
  const physicalRoot = physicalPathIdentity(repoRoot, repoRoot);
  const lexicalPaths = new Set(paths.map((path) => absolutePath(path, repoRoot)));
  const lexicalByPhysical = new Map<string, string>();
  for (const lexical of [...lexicalPaths].sort((left, right) => left.localeCompare(right))) {
    const physical = physicalPathIdentity(lexical, repoRoot);
    const prior = lexicalByPhysical.get(physical);
    if (prior !== undefined) {
      throw new CodemodError(
        `Physical path collision: ${repoRelative(prior, repoRoot)} and ${repoRelative(lexical, repoRoot)} both resolve to ${repoRelative(physical, physicalRoot)}.`,
        "Codemod apply refuses multiple changed paths that would overwrite the same physical file. Remove the alias collision from the plan.",
      );
    }
    lexicalByPhysical.set(physical, lexical);
  }
}

/** Convert an absolute path to a repo-relative `posix-style` path. Used in
 *  preview output for readability. */
export function repoRelative(p: string, repoRoot: string): string {
  return relative(resolve(repoRoot), p).split(sep).join("/");
}

/** Does this path live under `src/`? */
export function isUnderSrc(filePath: string): boolean {
  return filePath.includes(`${sep}src${sep}`) || filePath.startsWith(`src${sep}`);
}

/** Does this filename use one of the repository's canonical authored test kinds? */
export function isTestFile(filePath: string): boolean {
  return classifyTestFilename(filePath) !== undefined;
}

const TS_EXTENSION_PATTERN = /\.(tsx?)$/u;

/** Convert a TS file path to its likely test sibling (`foo.ts` →
 *  `foo.test.ts`). Useful when a move codemod wants to find + co-move the
 *  test file. */
export function siblingTestPath(filePath: string): string {
  return filePath.replace(TS_EXTENSION_PATTERN, ".test.$1");
}
