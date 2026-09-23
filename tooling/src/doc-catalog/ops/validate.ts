// The whole-corpus reconciliation: every document has exactly one row in its lane's receipt, every row
// has a document, every authority is in the vocabulary, and the frontmatter debt is within the ratchet.
// Nothing here reads a document's bytes beyond its frontmatter, so a prose edit cannot red it.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Doc, ReceiptEntry, ValidationInput } from "../contract/types.ts";
import { debtPathErrors, migrationDebt } from "../lib/debt.ts";
import { SCHEMA_VERSION, VALID_AUTHORITIES } from "../lib/vocab.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

/** Every rule a single row must satisfy on its own. */
export function validateReceiptEntry(entry: ReceiptEntry): readonly string[] {
  return VALID_AUTHORITIES.has(entry.authority) ? [] : [`${entry.path}: invalid authority ${entry.authority}`];
}

function indexReceipts(input: ValidationInput): { readonly byPath: ReadonlyMap<string, ReceiptEntry>; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const byPath = new Map<string, ReceiptEntry>();
  for (const receipt of input.receipts) {
    const lane = input.config.lanes.find((candidate) => candidate.id === receipt.lane);
    if (receipt.schemaVersion !== SCHEMA_VERSION || lane === undefined) {
      errors.push(`${receipt.lane}: receipt header does not match lanes.json`);
    }
    for (const entry of receipt.entries) {
      if (byPath.has(entry.path)) {
        errors.push(`${entry.path}: duplicate receipt entry`);
      }
      byPath.set(entry.path, entry);
      const owner = input.assignments.get(entry.path)?.id;
      if (owner !== undefined && owner !== receipt.lane) {
        errors.push(`${entry.path}: receipt is in ${receipt.lane}, expected ${owner}`);
      }
      errors.push(...validateReceiptEntry(entry));
    }
  }
  return { byPath, errors };
}

function coverageErrors(docs: readonly Doc[], byPath: ReadonlyMap<string, ReceiptEntry>): readonly string[] {
  const errors: string[] = [];
  const paths = new Set(docs.map((doc) => doc.path));
  for (const doc of docs) {
    if (!byPath.has(doc.path)) {
      errors.push(`${doc.path}: missing receipt entry — run pnpm doc-catalog:sync`);
    }
  }
  for (const path of byPath.keys()) {
    if (!paths.has(path)) {
      errors.push(`${path}: receipt exists for an untracked document`);
    }
  }
  return errors;
}

export function validate(input: ValidationInput): readonly string[] {
  const indexed = indexReceipts(input);
  return [...indexed.errors, ...coverageErrors(input.docs, indexed.byPath), ...debtPathErrors(migrationDebt(input.docs), input.state.allowed)];
}
