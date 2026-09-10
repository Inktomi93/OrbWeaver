// Receipt indexing + the whole-corpus reconciliation: every document has exactly one receipt row, every
// receipt row has a document, and every row passes the rules with tree-resolved facts.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Doc, Receipt, ReceiptEntry, ReceiptValidationContext, ValidationInput } from "../contract/types.ts";
import { debtPathErrors, migrationDebt } from "../lib/debt.ts";
import { validateReceiptEntry } from "../lib/receipt-rules.ts";
import { SCHEMA_VERSION } from "../lib/vocab.ts";
import { headAncestors, localEvidenceLines, receiptFacts, receiptPath, stableLawSections, stableRulingAnchors } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

interface ReceiptEntrySource {
  readonly path: string | undefined;
  readonly changedIndexPaths: ReadonlySet<string> | null;
}

function receiptEntryErrors(entry: ReceiptEntry, receipt: Receipt, source: ReceiptEntrySource, context: ReceiptValidationContext): readonly string[] {
  const errors: string[] = [];
  if (context.assignments.get(entry.path)?.id !== receipt.lane) {
    errors.push(`${entry.path}: receipt is in ${receipt.lane}, expected ${context.assignments.get(entry.path)?.id ?? "no lane"}`);
  }
  const doc = context.docsByPath.get(entry.path);
  errors.push(
    ...validateReceiptEntry(
      entry,
      doc === undefined
        ? undefined
        : receiptFacts(
            entry,
            doc,
            {
              path: source.path,
              candidateTouchesPair:
                source.changedIndexPaths === null ||
                source.changedIndexPaths.has(entry.path) ||
                (source.path !== undefined && source.changedIndexPaths.has(source.path)),
            },
            {
              localEvidence: context.localEvidence,
              lawSections: context.lawSections,
              ancestors: context.ancestors,
              rulingAnchors: context.rulingAnchors,
            },
          ),
    ),
  );
  return errors;
}

function indexReceipts(input: Omit<ValidationInput, "state">): { readonly byPath: ReadonlyMap<string, ReceiptEntry>; readonly errors: readonly string[] } {
  const { assignments, changedIndexPaths, config, docs, receipts } = input;
  const errors: string[] = [];
  const byPath = new Map<string, ReceiptEntry>();
  const docsByPath = new Map(docs.map((doc) => [doc.path, doc] as const));
  const localEvidence = localEvidenceLines();
  const lawSections = stableLawSections(docs);
  const ancestors = headAncestors();
  const rulingAnchors = stableRulingAnchors();
  for (const receipt of receipts) {
    const lane = config.lanes.find((candidate) => candidate.id === receipt.lane);
    if (receipt.schemaVersion !== SCHEMA_VERSION || lane === undefined || receipt.issue !== lane.issue) {
      errors.push(`${receipt.lane}: receipt header does not match lanes.json`);
    }
    for (const entry of receipt.entries) {
      // This is the exact source path loadReceipts opened; the loader admits no alternate receipt names.
      const receiptSourcePath = lane === undefined ? undefined : receiptPath(lane);
      if (byPath.has(entry.path)) {
        errors.push(`${entry.path}: duplicate receipt entry`);
      }
      byPath.set(entry.path, entry);
      errors.push(
        ...receiptEntryErrors(
          entry,
          receipt,
          { path: receiptSourcePath, changedIndexPaths },
          {
            assignments,
            docsByPath,
            localEvidence,
            lawSections,
            ancestors,
            rulingAnchors,
          },
        ),
      );
    }
  }
  return { byPath, errors };
}

function coverageErrors(docs: readonly Doc[], byPath: ReadonlyMap<string, ReceiptEntry>): readonly string[] {
  const errors: string[] = [];
  const paths = new Set(docs.map((doc) => doc.path));
  for (const doc of docs) {
    if (!byPath.has(doc.path)) {
      errors.push(`${doc.path}: missing receipt entry`);
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
  const debt = migrationDebt(input.docs, input.receipts);
  return [...indexed.errors, ...coverageErrors(input.docs, indexed.byPath), ...debtPathErrors(debt, input.state.allowed)];
}
