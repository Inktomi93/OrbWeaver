// db-errors — the UNIFIED libSQL/SQLite constraint classifier. neo-tavern walked ONE level of
// `error.cause` and scattered per-domain marker predicates (`isCredentialUniqueViolation`, the workloads
// single-active marker). This unifies them into ONE 4-depth `error.cause` walk that also discriminates
// WHICH constraint fired — so a domain reads `.kind` instead of re-walking, and a FK-on-`ownerId`
// violation is never swallowed as "row already active". A db-layer concern (driver error shape), no
// domain knowledge. (Legacy-Migration-and-Gaps.md §3 + Tier-1-DB.md "db-errors unification depth".)

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

// libSQL nests the original driver error up to a few levels under `.cause` (drizzle wraps it, the client
// wraps that). Four levels covers every observed shape without walking an unbounded chain.
const MAX_CAUSE_DEPTH = 4;

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
 * Walk up to 4 `error.cause` levels; return the classified constraint violation, or `undefined` if no
 * level is a SQLITE_CONSTRAINT error. Replaces every per-domain `isXUniqueViolation` marker — read
 * `.kind` to branch (e.g. `unique` ⇒ "already exists", `foreign-key` ⇒ "missing referent").
 */
export function isConstraintViolation(err: unknown): ConstraintViolation | undefined {
  let current: unknown = err;
  let found: ConstraintViolation | undefined;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && found === undefined; depth += 1) {
    const read = readErr(current);
    if (read !== undefined) {
      const kind = classify(read.code, read.message);
      if (kind !== undefined) {
        found = { kind, detail: read.code !== "" ? read.code : read.message };
      }
    }
    if (!(isPlainObject(current) && "cause" in current)) {
      break;
    }
    current = current["cause"];
  }
  return found;
}
