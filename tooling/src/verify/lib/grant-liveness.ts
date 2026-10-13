// Retained runner identities, authored-path glob selection and the backreference budget share these primitives.
import { existsSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import type { Finding } from "../contract/gate.ts";

/** Glob metacharacters distinguish literal runner paths from selector patterns. */
const GLOB_META_RE = /[*?[\]{}]/u;

/** True iff `p` is a literal path (no glob metacharacters) — i.e. a grant on ONE named file. */
export function isFileExact(p: string): boolean {
  return !GLOB_META_RE.test(p);
}

/** One classified file-exact row: the config FILE it was declared in (findings anchor there — a registry may
 *  span several config files, e.g. tsconfig.json + tsconfig.tests-dom.json), the literal path, and the
 *  1-based source line it sits on (0 when the line scan can't place it — the finding still stands, it just
 *  anchors file-level). */
export interface ExactRow {
  readonly file: string;
  readonly path: string;
  readonly line: number;
}

interface ExistenceInput {
  readonly root?: string;
  readonly exists?: (path: string) => boolean;
}

function existenceOracle(input: ExistenceInput): (path: string) => boolean {
  return input.exists ?? ((path): boolean => existsSync(join(input.root ?? "", path)));
}

interface DeadExactInput extends ExistenceInput {
  readonly exact: readonly ExactRow[];
  readonly message: string;
}

/** DEAD findings for already-extracted file-exact rows, with no exemption domain. */
export function deadExactFindings(input: DeadExactInput): Finding[] {
  const exists = existenceOracle(input);
  return input.exact.filter((row) => !exists(row.path)).map((row) => ({ file: row.file, line: row.line, column: 0, token: row.path, message: input.message }));
}

/** Resolve repeated literal selector values to their successive authored lines. */
export function lineFinder(text: string): (path: string) => number {
  const lines = text.split(/\r?\n/u);
  const cursor = new Map<string, number>();
  return (path) => {
    const quoted = `"${path}"`;
    const from = cursor.get(quoted) ?? 0;
    const at = lines.findIndex((line, index) => index >= from && line.includes(quoted));
    if (at < 0) {
      return 0;
    }
    cursor.set(quoted, at + 1);
    return at + 1;
  };
}

/** Index of the first glob metacharacter — the end of the pattern's literal head. */
function headLength(pattern: string): number {
  const at = pattern.search(/[*?[\]{}!]/u);
  return at === -1 ? pattern.length : at;
}

/** A GLOB matcher over repo-relative members, using node's OWN `path.matchesGlob` — never a hand-rolled
 *  translator (a bespoke glob DSL is the lying-proof class: it passes its own fixtures and silently
 *  mis-answers the corpus). The second arm covers a DIRECTORY entry: `packages/db/src/schema` names a tree
 *  node, and every file under it is a member. */
export function globMatcher(pattern: string): (member: string) => boolean {
  // `matchesGlob` recompiles the pattern on EVERY call, so a bare per-member call over the whole corpus is
  // the dominant cost (measured: +3.9s on eslint's 78 globs alone). The literal head — everything before the
  // first metacharacter — is a SOUND necessary condition: every one of these syntaxes matches that prefix
  // verbatim, and a pattern that starts with a metacharacter yields "" and filters nothing. It only ever
  // skips members that could not have matched.
  const head = pattern.slice(0, headLength(pattern));
  return (member) => member.startsWith(head) && (matchesGlob(member, pattern) || matchesGlob(member, `${pattern}/**`));
}

/** The no-growth/stale arm for an IRREDUCIBLE family whose members cannot be enumerated at all (a
 *  dep-cruiser `$1` backreference, a `${configDir}` template): the count is budgeted, and BOTH directions
 *  are RED — growth adds unreviewed authority, and a shrink that was not committed leaves a budget nobody
 *  can trust. Never a silent counter. */
export function irreducibleBudgetFindings(file: string, actual: number, budget: number, message: string): readonly Finding[] {
  return actual === budget
    ? []
    : [
        {
          file,
          line: 0,
          column: 0,
          token: `${String(actual)} vs ${String(budget)}`,
          message: message.replace("{actual}", String(actual)).replace("{budget}", String(budget)),
        },
      ];
}
