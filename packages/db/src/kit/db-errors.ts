// db-errors — the UNIFIED libSQL/SQLite constraint classifier. The previous codebase walked ONE level of
// `error.cause` and scattered per-domain marker predicates (`isCredentialUniqueViolation`, the workloads
// single-active marker). This unifies them into ONE 4-depth `error.cause` walk that also discriminates
// WHICH constraint fired — so a domain reads `.kind` instead of re-walking, and a FK-on-`ownerId`
// violation is never swallowed as "row already active". A db-layer concern (driver error shape), no
// domain knowledge. (Core-0-Architecture-and-Structure.md §2, kit-purity + Tier-1-DB.md "db-errors unification depth".)

import { isPlainObject } from "@orb/kit/guards";

// The constraint axis the classifier discriminates. Derived from the tuple so dispatch stays exhaustive
// (a new kind fails any `assertNever` over it) and the union is never re-spelled inline.
export const CONSTRAINT_KINDS = ["unique", "foreign-key", "check", "not-null", "primary-key", "unknown"] as const;
export type ConstraintKind = (typeof CONSTRAINT_KINDS)[number];

/** A classified constraint failure: the kind + the raw code/message that identified it. */
export interface ConstraintViolation {
  readonly kind: ConstraintKind;
  readonly detail: string;
}

// libSQL nests the original driver error under `.cause` (drizzle wraps it, the client wraps that). The
// walk used to stop at FOUR levels — a number chosen off "every observed shape", which is not a bound, it
// is a guess (#1377 item 4). Past it `isConstraintViolation` returned `undefined` and every caller that
// branches on `.kind` (e.g. `domain/tag/verbs/update.ts`) fell through to `throw err`, so a
// deeply-wrapped constraint violation surfaced as a raw opaque error instead of a typed domain conflict.
//
// The honest bound is the one the walk actually needs: a chain is finite unless it CYCLES, so track the
// links already seen and stop when one repeats. No arbitrary ceiling, and no way to spin.

function readErr(value: unknown): { code: string; message: string } | undefined {
  if (!isPlainObject(value)) {
    return;
  }
  const code = typeof value["code"] === "string" ? value["code"] : "";
  const message = typeof value["message"] === "string" ? value["message"] : "";
  if (code === "" && message === "") {
    return;
  }
  return { code, message };
}

function classify(code: string, message: string): ConstraintKind | undefined {
  const text = `${code} ${message}`.toUpperCase();
  if (!(text.includes("SQLITE_CONSTRAINT") || text.includes("CONSTRAINT FAILED"))) {
    return;
  }
  // Order matters: the specific codes (FK / PK / NOT NULL / CHECK) are checked before the generic
  // "UNIQUE constraint failed" message a PK violation also carries.
  if (text.includes("FOREIGNKEY") || text.includes("FOREIGN KEY")) {
    return "foreign-key";
  }
  if (text.includes("PRIMARYKEY") || text.includes("PRIMARY KEY")) {
    return "primary-key";
  }
  if (text.includes("NOTNULL") || text.includes("NOT NULL")) {
    return "not-null";
  }
  if (text.includes("CHECK")) {
    return "check";
  }
  if (text.includes("UNIQUE")) {
    return "unique";
  }
  return "unknown";
}

/**
 * Walk the whole `error.cause` chain (cycle-safe, no depth ceiling); return the classified constraint
 * violation, or `undefined` if no level is a SQLITE_CONSTRAINT error. Replaces every per-domain
 * `isXUniqueViolation` marker — read `.kind` to branch (e.g. `unique` ⇒ "already exists",
 * `foreign-key` ⇒ "missing referent").
 */
export function isConstraintViolation(err: unknown): ConstraintViolation | undefined {
  let found: ConstraintViolation | undefined;
  for (const level of causeChain(err)) {
    found = classifyLevel(level);
    if (found !== undefined) {
      break;
    }
  }
  return found;
}

/** Classify ONE level of a cause chain — `undefined` when it is not a readable SQLITE_CONSTRAINT error. */
function classifyLevel(value: unknown): ConstraintViolation | undefined {
  const read = readErr(value);
  if (read === undefined) {
    return;
  }
  const kind = classify(read.code, read.message);
  return kind === undefined ? undefined : { kind, detail: read.code !== "" ? read.code : read.message };
}

/** Walk `err` and every `.cause` under it, outermost first. The `seen` set is the whole termination
 *  argument: a cause chain is finite unless it CYCLES, and a cycle revisits a link — so the walk ends
 *  when the chain runs out or when a link repeats, never at an arbitrary depth (#1377 item 4). */
function* causeChain(err: unknown): Generator<unknown> {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (!seen.has(current)) {
    seen.add(current);
    yield current;
    if (!(isPlainObject(current) && "cause" in current)) {
      return;
    }
    current = current["cause"];
  }
}
