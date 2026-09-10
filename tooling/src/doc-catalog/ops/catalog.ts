// The write-side verbs: bootstrap (one-shot), sync (adopt new documents as pending rows), ratchet
// (re-baseline the allowed debt), and the generated catalog itself. `docs/catalog/catalog.json` is a
// DISPOSABLE projection — it is regenerated from lanes + receipts + the tree, never hand-edited.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ArtifactForm, DebtPaths, Doc, Lane, LaneConfig, Receipt, ReceiptEntry, State } from "../contract/types.ts";
import { migrationDebt, migrationMetrics, newDebtPathErrors } from "../lib/debt.ts";
import { catalogReceipt } from "../lib/receipt-rules.ts";
import { LANES_PATH, OUTPUT_PATH, RECEIPTS_DIR, SCHEMA_VERSION, STATE_PATH } from "../lib/vocab.ts";
import { indexFileMatchesWorkingTree, indexTrackedPaths, json, loadReceipts, receiptPath, root, stableJson } from "./tree.ts";

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

/** The catalog artifacts written BY HAND — every lane receipt (a lane attests its rows straight into the
 *  file) plus the debt state. `catalog.json` is excluded because it is GENERATED and already two-sided
 *  through `catalogIsStale`, which compares the tree against `stableJson` output. Exported as the
 *  DENOMINATOR: a formatter arm that examined zero artifacts is "I could not measure", never "clean". */
export function authoredArtifacts(config: LaneConfig): readonly string[] {
  return [...config.lanes.map(receiptPath), STATE_PATH];
}

/** Each authored artifact's bytes ON DISK beside its CANONICAL form (#968). `stableJson` is the ONE
 *  serializer — it round-trips the value through the repo's own biome formatter — so "current !==
 *  canonical" is exactly "the repo's formatter would rewrite this file". */
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

/** #968: `check:doc-catalog` validated receipt CONTENT and never FORM, so a hand-attested receipt could
 *  carry JSON the repo's own formatter rejects — `lint:biome` then went red in an unrelated stage,
 *  attributed to whoever next regenerated the catalog, and the hand-fix was undone by the next attest.
 *  This is the CHECK half; `normalizeAuthoredArtifacts` is the write half. */
export function unformattedArtifacts(config: LaneConfig): readonly string[] {
  return offCanonicalPaths(authoredArtifactForms(config));
}

/** The write half of #968: land every authored artifact in its canonical (biome-formatted) form. Content
 *  is untouched — the value is re-serialized through the same writer the generator uses — so this can
 *  never turn a lane's attestation into a different fact, only into the form both tools agree on. */
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

/** Candidate-index twin of catalogIsStale; production preserves a commit hook's temporary index. */
export function catalogIndexIsStale(expected: string, repoRoot = root, isolateGitEnvironment = false): boolean {
  const path = join(repoRoot, OUTPUT_PATH);
  return !existsSync(path) || readFileSync(path, "utf8") !== expected || !indexFileMatchesWorkingTree(OUTPUT_PATH, repoRoot, isolateGitEnvironment);
}

export function candidateTouchesCatalog(changedIndexPaths: ReadonlySet<string> | null): boolean {
  if (changedIndexPaths === null) {
    return true;
  }
  return [...changedIndexPaths].some(
    (path) =>
      path === LANES_PATH ||
      path === OUTPUT_PATH ||
      path === STATE_PATH ||
      (path.startsWith("docs/") && path.endsWith(".md")) ||
      (path.startsWith(`${RECEIPTS_DIR}/`) && path.endsWith(".json")),
  );
}

/** Candidate-index closure over every source expectedCatalog or validate reads, including removed receipt files. */
export function catalogSourcesMatchIndex(config: LaneConfig, repoRoot = root, isolateGitEnvironment = false): boolean {
  const receiptSources = new Set(config.lanes.map(receiptPath));
  const indexedReceipts = indexTrackedPaths(RECEIPTS_DIR, repoRoot, isolateGitEnvironment);
  return (
    indexedReceipts !== null &&
    indexedReceipts.size === receiptSources.size &&
    [...receiptSources].every((path) => indexedReceipts.has(path) && indexFileMatchesWorkingTree(path, repoRoot, isolateGitEnvironment)) &&
    indexFileMatchesWorkingTree(LANES_PATH, repoRoot, isolateGitEnvironment) &&
    indexFileMatchesWorkingTree(STATE_PATH, repoRoot, isolateGitEnvironment)
  );
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
