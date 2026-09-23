// The frontmatter-debt ratchet — PURE. Debt is tracked as PATHS, not counts: a count-only floor lets one
// document's debt be paid while another's is created and still reads green. Both directions are errors —
// a new debt path (regression) and a stale allowance row (a paid debt nobody removed).
import type { DebtPaths, Doc, Floors } from "../contract/types.ts";
import { STATE_PATH, VENDOR_PREFIX } from "./vocab.ts";

export function migrationDebt(docs: readonly Doc[]): DebtPaths {
  return {
    missingFrontmatter: docs
      .filter((doc) => !(doc.path.startsWith(VENDOR_PREFIX) || doc.frontmatter.present))
      .map((doc) => doc.path)
      .sort(),
    invalidFrontmatter: docs
      .filter((doc) => doc.frontmatter.present && doc.frontmatter.errors.length > 0)
      .map((doc) => doc.path)
      .sort(),
    malformedFrontmatter: docs
      .filter((doc) => doc.frontmatter.malformed)
      .map((doc) => doc.path)
      .sort(),
  };
}

export function migrationMetrics(docs: readonly Doc[]): Floors {
  const debt = migrationDebt(docs);
  return {
    missingFrontmatter: debt.missingFrontmatter.length,
    invalidFrontmatter: debt.invalidFrontmatter.length,
    malformedFrontmatter: debt.malformedFrontmatter.length,
  };
}

function newDebtPathErrors(current: DebtPaths, allowed: DebtPaths | undefined): readonly string[] {
  if (allowed === undefined) {
    return [`${STATE_PATH}: legacy count-only state must be upgraded with pnpm doc-catalog:ratchet`];
  }
  const errors: string[] = [];
  for (const key of Object.keys(current) as (keyof Floors)[]) {
    const accepted = new Set(allowed[key]);
    for (const path of current[key]) {
      if (!accepted.has(path)) {
        errors.push(`${key}: new debt path ${path} is not in the ratchet allowance`);
      }
    }
  }
  return errors;
}

/** Both directions — regressions AND paid-but-still-allowed rows (the ratchet only clicks one way if
 *  stale allowances are swept). */
export function debtPathErrors(current: DebtPaths, allowed: DebtPaths | undefined): readonly string[] {
  if (allowed === undefined) {
    return newDebtPathErrors(current, allowed);
  }
  const errors = [...newDebtPathErrors(current, allowed)];
  for (const key of Object.keys(current) as (keyof Floors)[]) {
    const actual = new Set(current[key]);
    for (const path of allowed[key]) {
      if (!actual.has(path)) {
        errors.push(`${key}: stale debt path ${path} remains in the ratchet allowance`);
      }
    }
  }
  return errors;
}

/** The ratchet's own guard: re-baselining may only DROP debt, never add it. */
export function ratchetRegressions(current: DebtPaths, allowed: DebtPaths | undefined): readonly string[] {
  return allowed === undefined ? [] : newDebtPathErrors(current, allowed);
}
