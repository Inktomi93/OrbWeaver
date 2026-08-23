// The write-side verbs: bootstrap (one-shot), sync (adopt new documents as pending rows), ratchet
// (re-baseline the allowed debt), and the generated catalog itself. `docs/catalog/catalog.json` is a
// DISPOSABLE projection — it is regenerated from lanes + receipts + the tree, never hand-edited.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DebtPaths, Doc, Lane, LaneConfig, Receipt, ReceiptEntry, State } from "../contract/types.ts";
import { migrationDebt, migrationMetrics, newDebtPathErrors } from "../lib/debt.ts";
import { catalogReceipt } from "../lib/receipt-rules.ts";
import { OUTPUT_PATH, RECEIPTS_DIR, SCHEMA_VERSION, STATE_PATH } from "../lib/vocab.ts";
import { json, loadReceipts, receiptPath, root, stableJson } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

function pendingEntry(doc: Doc): ReceiptEntry {
  return {
    path: doc.path,
    assignedSha256: doc.sha256,
    disposition: "pending",
    authority: "unclassified",
    fullRead: false,
    verifiedSha256: null,
    verifiedCommit: null,
    verifiedAt: null,
    evidence: [],
    summary: "",
  };
}

function catalogValue(docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>, receipts: readonly Receipt[]): unknown {
  const entries = new Map(receipts.flatMap((receipt) => receipt.entries.map((entry) => [entry.path, entry] as const)));
  return {
    schemaVersion: SCHEMA_VERSION,
    stats: migrationMetrics(docs, receipts),
    documents: docs.map((doc) => {
      const lane = assignments.get(doc.path) as Lane;
      return {
        path: doc.path,
        lane: lane.id,
        issue: lane.issue,
        lines: doc.lines,
        bytes: doc.bytes,
        sha256: doc.sha256,
        frontmatter: doc.frontmatter,
        ...catalogReceipt(entries.get(doc.path), doc.sha256),
      };
    }),
  };
}

/** The catalog bytes the tree SHOULD carry — `--check` compares, the write verbs land it. */
export function expectedCatalog(docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>, receipts: readonly Receipt[]): string {
  return stableJson(catalogValue(docs, assignments, receipts));
}

export function writeCatalog(contents: string): void {
  writeFileSync(join(root, OUTPUT_PATH), contents);
}

/** True when the tree's generated catalog does not match what the current inputs produce (missing counts
 *  as stale — `--check` must never pass on an absent artifact). */
export function catalogIsStale(expected: string): boolean {
  const path = join(root, OUTPUT_PATH);
  return !existsSync(path) || readFileSync(path, "utf8") !== expected;
}

export function bootstrap(config: LaneConfig, docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>): void {
  mkdirSync(join(root, RECEIPTS_DIR), { recursive: true });
  for (const lane of config.lanes) {
    const path = receiptPath(lane);
    if (existsSync(join(root, path))) {
      throw new Error(`${path} already exists; bootstrap is one-shot`);
    }
    const entries = docs.filter((doc) => assignments.get(doc.path)?.id === lane.id).map(pendingEntry);
    writeFileSync(join(root, path), stableJson({ schemaVersion: SCHEMA_VERSION, lane: lane.id, issue: lane.issue, entries } satisfies Receipt));
  }
  const allowed: DebtPaths = migrationDebt(docs, loadReceipts(config));
  writeFileSync(join(root, STATE_PATH), stableJson({ schemaVersion: SCHEMA_VERSION, allowed } satisfies State));
  writeCatalog(expectedCatalog(docs, assignments, loadReceipts(config)));
}

/** Adopt documents that have no receipt row yet as PENDING. A row whose document is gone is NOT
 *  auto-dropped — re-homing a document is a decision, so it refuses and names the rows. */
export function sync(config: LaneConfig, docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>): void {
  const docsByPath = new Map(docs.map((doc) => [doc.path, doc] as const));
  for (const receipt of loadReceipts(config)) {
    const lane = config.lanes.find((candidate) => candidate.id === receipt.lane) as Lane;
    const known = new Set(receipt.entries.map((entry) => entry.path));
    const added = docs.filter((doc) => assignments.get(doc.path)?.id === lane.id && !known.has(doc.path)).map(pendingEntry);
    const removed = receipt.entries.filter((entry) => !docsByPath.has(entry.path));
    if (removed.length > 0) {
      throw new Error(`${receipt.lane}: remove or re-home stale receipt rows manually:\n${removed.map((entry) => entry.path).join("\n")}`);
    }
    if (added.length > 0) {
      writeFileSync(
        join(root, receiptPath(lane)),
        stableJson({ ...receipt, entries: [...receipt.entries, ...added].toSorted((a, b) => a.path.localeCompare(b.path)) }),
      );
    }
  }
}

/** Re-baseline the allowance — refuses if the new baseline would ADD debt (the ratchet only clicks
 *  toward zero). */
export function ratchet(docs: readonly Doc[], receipts: readonly Receipt[]): void {
  const state = json<State>(STATE_PATH);
  const allowed = migrationDebt(docs, receipts);
  const errors = state.allowed === undefined ? [] : newDebtPathErrors(allowed, state.allowed);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  writeFileSync(join(root, STATE_PATH), stableJson({ schemaVersion: SCHEMA_VERSION, allowed } satisfies State));
}
