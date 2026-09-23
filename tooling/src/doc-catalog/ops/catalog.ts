// The write-side verbs: sync (adopt new documents as unclassified rows), ratchet (re-baseline the
// allowed frontmatter debt), and the generated inventory itself. `docs/catalog/catalog.json` is a
// DISPOSABLE projection — regenerated from lanes + receipts + the tree, never hand-edited — and it
// carries no content hash, so a prose edit never changes it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ArtifactForm, CatalogDocumentRow, DebtPaths, Doc, Lane, LaneConfig, Receipt, ReceiptEntry, State } from "../contract/types.ts";
import { migrationDebt, ratchetRegressions } from "../lib/debt.ts";
import { OUTPUT_PATH, SCHEMA_VERSION, STATE_PATH } from "../lib/vocab.ts";
import { json, loadReceipts, receiptPath, root, stableJson } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

const INVENTORY_FIELDS = ["kind", "status"] as const;

function inventoryRow(doc: Doc, lane: Lane, entry: ReceiptEntry | undefined): CatalogDocumentRow {
  const fields: Record<string, string> = {};
  for (const key of INVENTORY_FIELDS) {
    const value = doc.frontmatter.fields[key];
    if (value !== undefined) {
      fields[key] = value;
    }
  }
  return { path: doc.path, lane: lane.id, frontmatter: { fields }, receipt: entry === undefined ? null : { authority: entry.authority } };
}

function catalogValue(docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>, receipts: readonly Receipt[]): unknown {
  const entries = new Map(receipts.flatMap((receipt) => receipt.entries.map((entry) => [entry.path, entry] as const)));
  return {
    schemaVersion: SCHEMA_VERSION,
    documents: docs.map((doc) => inventoryRow(doc, assignments.get(doc.path) as Lane, entries.get(doc.path))),
  };
}

/** The catalog bytes the tree SHOULD carry — `--check` compares, the write verbs land it. */
export function expectedCatalog(docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>, receipts: readonly Receipt[]): string {
  return stableJson(catalogValue(docs, assignments, receipts));
}

export function writeCatalog(contents: string): void {
  writeFileSync(join(root, OUTPUT_PATH), contents);
}

/** The catalog artifacts written BY HAND — every lane receipt plus the debt state. `catalog.json` is
 *  excluded because it is GENERATED and already two-sided through `catalogIsStale`. Exported as the
 *  DENOMINATOR: a formatter arm that examined zero artifacts is "I could not measure", never "clean". */
export function authoredArtifacts(config: LaneConfig): readonly string[] {
  return [...config.lanes.map(receiptPath), STATE_PATH];
}

function authoredArtifactForms(config: LaneConfig): readonly ArtifactForm[] {
  return authoredArtifacts(config).map((path) => ({
    path,
    current: readFileSync(join(root, path), "utf8"),
    canonical: stableJson(json<unknown>(path)),
  }));
}

/** The reconciliation core (exported for a proof test): the artifacts whose bytes are not canonical. */
export function offCanonicalPaths(forms: readonly ArtifactForm[]): readonly string[] {
  return forms.filter((form) => form.current !== form.canonical).map((form) => form.path);
}

/** #968: `check:doc-catalog` validated receipt CONTENT and never FORM, so a hand-edited receipt could
 *  carry JSON the repo's own formatter rejects and red `lint:biome` in an unrelated stage. This is the
 *  CHECK half; `normalizeAuthoredArtifacts` is the write half. */
export function unformattedArtifacts(config: LaneConfig): readonly string[] {
  return offCanonicalPaths(authoredArtifactForms(config));
}

export function normalizeAuthoredArtifacts(config: LaneConfig): readonly string[] {
  const forms = authoredArtifactForms(config);
  const dirty = new Set(offCanonicalPaths(forms));
  for (const form of forms) {
    if (dirty.has(form.path)) {
      writeFileSync(join(root, form.path), form.canonical);
    }
  }
  return [...dirty];
}

/** True when the tree's generated catalog does not match what the current inputs produce (missing counts
 *  as stale — `--check` must never pass on an absent artifact). */
export function catalogIsStale(expected: string): boolean {
  const path = join(root, OUTPUT_PATH);
  return !existsSync(path) || readFileSync(path, "utf8") !== expected;
}

/** Adopt documents that have no row yet as UNCLASSIFIED. A row whose document is gone is NOT auto-dropped
 *  — re-homing a document is a decision, so it refuses and names the rows. */
export function sync(config: LaneConfig, docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>): void {
  const docsByPath = new Map(docs.map((doc) => [doc.path, doc] as const));
  for (const receipt of loadReceipts(config)) {
    const lane = config.lanes.find((candidate) => candidate.id === receipt.lane) as Lane;
    const known = new Set(receipt.entries.map((entry) => entry.path));
    const added = docs
      .filter((doc) => assignments.get(doc.path)?.id === lane.id && !known.has(doc.path))
      .map((doc) => ({ path: doc.path, authority: "unclassified" }));
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
export function ratchet(docs: readonly Doc[]): void {
  const state = json<State>(STATE_PATH);
  const allowed: DebtPaths = migrationDebt(docs);
  const errors = ratchetRegressions(allowed, state.allowed);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  writeFileSync(join(root, STATE_PATH), stableJson({ schemaVersion: SCHEMA_VERSION, allowed } satisfies State));
}
