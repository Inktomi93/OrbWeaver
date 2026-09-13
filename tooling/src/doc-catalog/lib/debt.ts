// The migration ratchet — PURE. Debt is tracked as PATHS, not counts: a count-only floor lets one
// document's debt be paid while another's is created and still reads green. Both directions are errors —
// a new debt path (regression) and a stale allowance row (a paid debt nobody removed).
import type { DebtPaths, Doc, Floors, Receipt } from "../contract/types.ts";
import { STATE_PATH, VENDOR_PREFIX } from "./vocab.ts";

export function migrationDebt(docs: readonly Doc[], receipts: readonly Receipt[]): DebtPaths {
  const entries = receipts.flatMap((receipt) => receipt.entries);
  return {
    pending: entries
      .filter((entry) => entry.disposition === "pending")
      .map((entry) => entry.path)
      .sort(),
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

export function migrationMetrics(docs: readonly Doc[], receipts: readonly Receipt[]): Floors {
  const debt = migrationDebt(docs, receipts);
  return {
    pending: debt.pending.length,
    missingFrontmatter: debt.missingFrontmatter.length,
    invalidFrontmatter: debt.invalidFrontmatter.length,
    malformedFrontmatter: debt.malformedFrontmatter.length,
  };
}

/** Keep the canonical document owner beside the text: scoped writers must not infer ownership from
 *  messages whose prefix is a debt category (#2339). Null names a corpus-wide state refusal. */
interface DebtFinding {
  readonly path: string | null;
  readonly message: string;
}

function newDebtPathFindings(current: DebtPaths, allowed: DebtPaths | undefined): readonly DebtFinding[] {
  if (allowed === undefined) {
    return [{ path: null, message: `${STATE_PATH}: legacy count-only state must be upgraded with pnpm doc-catalog:ratchet` }];
  }
  const errors: DebtFinding[] = [];
  for (const key of Object.keys(current) as (keyof Floors)[]) {
    const accepted = new Set(allowed[key]);
    for (const path of current[key]) {
      if (!accepted.has(path)) {
        errors.push({ path, message: `${key}: new debt path ${path} is not in the ratchet allowance` });
      }
    }
  }
  return errors;
}

/** Both directions — regressions AND paid-but-still-allowed rows (the ratchet only clicks one way if
 *  stale allowances are swept). */
export function debtPathFindings(current: DebtPaths, allowed: DebtPaths | undefined): readonly DebtFinding[] {
  if (allowed === undefined) {
    return newDebtPathFindings(current, allowed);
  }
  const errors = [...newDebtPathFindings(current, allowed)];
  for (const key of Object.keys(current) as (keyof Floors)[]) {
    const actual = new Set(current[key]);
    for (const path of allowed[key]) {
      if (!actual.has(path)) {
        errors.push({ path, message: `${key}: stale debt path ${path} remains in the ratchet allowance` });
      }
    }
  }
  return errors;
}

/** Existing whole-corpus callers retain the same ordered diagnostic text. */
export function newDebtPathErrors(current: DebtPaths, allowed: DebtPaths | undefined): readonly string[] {
  return newDebtPathFindings(current, allowed).map((finding) => finding.message);
}

export function debtPathErrors(current: DebtPaths, allowed: DebtPaths | undefined): readonly string[] {
  return debtPathFindings(current, allowed).map((finding) => finding.message);
}
