// Plans (the unit of preview-then-commit) + validation + path helpers.
// ── §5 ─ Plans ───────────────────────────────────────────────────────────────

import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
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

/** Resolve `p` to an absolute path against `repoRoot`. Pass-through for
 *  absolute paths. Throws if the result escapes `repoRoot` (the file-delete
 *  guard rail). */
export function absolutePath(p: string, repoRoot: string): string {
  assertPathString(p, "path");
  const root = resolve(repoRoot);
  const abs = isAbsolute(p) ? normalize(p) : resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new CodemodError(`Path escapes repo root: ${p}`, "Codemod helpers refuse to touch files outside the repo. Pass a path relative to the repo root.");
  }
  return abs;
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

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|mts|cts)$/u;

/** Does this filename look like a test/spec? */
export function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERN.test(filePath);
}

const TS_EXTENSION_PATTERN = /\.(tsx?)$/u;

/** Convert a TS file path to its likely test sibling (`foo.ts` →
 *  `foo.test.ts`). Useful when a move codemod wants to find + co-move the
 *  test file. */
export function siblingTestPath(filePath: string): string {
  return filePath.replace(TS_EXTENSION_PATTERN, ".test.$1");
}
