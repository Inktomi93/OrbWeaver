// The write-side verbs: bootstrap (one-shot), sync (adopt new documents as pending rows), ratchet
// (re-baseline the allowed debt), and the generated catalog itself. `docs/catalog/catalog.json` is a
// DISPOSABLE projection — it is regenerated from lanes + receipts + the tree, never hand-edited.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ArtifactForm, CatalogDocumentRow, DebtPaths, Doc, Lane, LaneConfig, Receipt, ReceiptEntry, State } from "../contract/types.ts";
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
        ...catalogReceipt(entries.get(doc.path), doc.sha256, doc.canonicalSha256),
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

/** The catalog as it stands on disk — the SCOPED write's base. Null when absent, which that door refuses
 *  rather than treating as an empty catalog it may fill in. */
export function readCatalog(): string | null {
  const path = join(root, OUTPUT_PATH);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** The catalog's INPUT CLOSURE — everything `expectedCatalog` reads. A whole-tree regeneration bakes the
 *  current state of every one of these into a COMMITTED artifact, so uncommitted movement in any of them
 *  is movement the run would attribute to whoever ran it. */
function isCatalogInput(path: string): boolean {
  return path === LANES_PATH || path === STATE_PATH || path.startsWith(`${RECEIPTS_DIR}/`) || (path.startsWith("docs/") && path.endsWith(".md"));
}

/** Uncommitted movement inside the catalog's input closure (#2165). A `null` census is DIRT, not clean:
 *  "I could not ask Git" is never "nothing is there". Sorted, so the refusal reads the same twice. */
export function catalogInputDirt(indexVsHead: ReadonlySet<string> | null, worktreeVsIndex: ReadonlySet<string> | null): readonly string[] {
  if (indexVsHead === null || worktreeVsIndex === null) {
    return [`${OUTPUT_PATH}: the Git census is unavailable, so a whole-tree regeneration cannot be shown to be safe`];
  }
  return [...new Set([...indexVsHead, ...worktreeVsIndex])].filter(isCatalogInput).toSorted((left, right) => left.localeCompare(right));
}

/** Every document row of a committed catalog, or null when the bytes are not the shape this tool writes.
 *  Null is a REFUSAL upstream — scoping against a catalog nobody can parse would silently write a whole
 *  new one, which is the exact blast radius the scoped door exists to avoid. */
function catalogRows(contents: string): readonly CatalogDocumentRow[] | null {
  let parsed: unknown;
  // @orb-waive caught-failure-ownership(catch): unparseable catalog bytes and a parseable non-catalog shape are the SAME refusal to the caller — "not the shape this tool writes", which names the file and the consequence — so the parse error carries nothing a reader could act on. Ends if that refusal starts naming the parse position.
  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }
  const documents = typeof parsed === "object" && parsed !== null ? (parsed as { readonly documents?: unknown }).documents : undefined;
  return Array.isArray(documents) ? (documents as readonly CatalogDocumentRow[]) : null;
}

/** Place rows the base has NEVER SEEN where a whole-tree run would put them, without re-ordering a single
 *  row the base already carried (#2473).
 *
 *  THE RULING ABOVE SURVIVES — ITS INPUT CHANGED. "Row order is the base's, not a fresh sort" was minted
 *  because re-sorting the whole union with `localeCompare` turned a one-document write into a 4141-line
 *  diff, and that is still forbidden: existing rows keep their committed positions, whatever they are.
 *  What was wrong is the case the base has NO OPINION about. A brand-new row was pushed onto the END, so
 *  `doc-catalog:write --paths` produced a catalog that `check:doc-catalog` — which compares against
 *  `expectedCatalog` over `documents()`, i.e. tracked order — immediately called STALE. A writer whose
 *  own checker rejects its output leaves the operator no green door but `--barrier`, the whole-tree
 *  regenerator the scoped form exists to avoid running.
 *
 *  `treeOrdered` is `documents()` — `git ls-files -- docs`, sorted — so an addition is inserted before the
 *  first surviving row that follows it on the tree, and appended when none does. A row NOT on the tree
 *  (one the base kept and nobody named) carries no position and is simply scanned past. When the base's
 *  order agrees with the tree's, which is what a catalog off a whole run always carries, the result is
 *  byte-identical to that whole run. */
function withAdditionsPlaced(kept: readonly Doc[], additions: readonly Doc[], treeOrdered: readonly Doc[]): readonly Doc[] {
  const treeIndex = new Map(treeOrdered.map((doc, index) => [doc.path, index] as const));
  const placed = [...kept];
  for (const addition of [...additions].toSorted((left, right) => (treeIndex.get(left.path) ?? 0) - (treeIndex.get(right.path) ?? 0))) {
    const at = treeIndex.get(addition.path) as number;
    const before = placed.findIndex((doc) => {
      const index = treeIndex.get(doc.path);
      return index !== undefined && index > at;
    });
    placed.splice(before === -1 ? placed.length : before, 0, addition);
  }
  return placed;
}

/** THE SCOPED WRITE (#2165). The whole-tree form regenerates every row from the working tree; run on a
 *  shared tree after a ONE-FILE re-attest it produced 184 insertions across every document that had
 *  changed that day, exit 1, and a written file — a blast radius the operator had to catch by reading
 *  `git diff` because the exit code could not tell them. This form takes the COMMITTED catalog as its base
 *  and re-derives ONLY the named documents' rows, so an unnamed row keeps the bytes it was committed with
 *  no matter what any other lane has in flight.
 *
 *  It is the SAME generator: the named documents' `Doc`s come from the tree and every other row is turned
 *  back into the `Doc` it recorded (the row carries every field a `Doc` has), then `expectedCatalog` runs
 *  over the union. `stats` therefore stays internally consistent with the rows beside it without importing
 *  a sibling's uncommitted document.
 *
 *  ALL-OR-NOTHING, like `attest`: any refusal returns no contents at all. */
export function scopedCatalog(input: {
  readonly base: string | null;
  readonly named: readonly string[];
  readonly docs: readonly Doc[];
  readonly receipts: readonly Receipt[];
  readonly config: LaneConfig;
  /** Lane ownership for the NAMED documents only. The caller resolves it, because `laneAssignments`
   *  globs the real filesystem — an UNNAMED row's lane is read off the row instead, which is both purer
   *  and more faithful: what the row was committed with is what it keeps. */
  readonly assignments: ReadonlyMap<string, Lane>;
}): { readonly contents?: string; readonly refusals: readonly string[] } {
  if (input.base === null) {
    return { refusals: [`${OUTPUT_PATH}: absent, so there is no committed base to scope against — run the whole form once (--barrier) to mint it`] };
  }
  const rows = catalogRows(input.base);
  if (rows === null) {
    return { refusals: [`${OUTPUT_PATH}: not the shape this tool writes, so scoping against it would silently regenerate the whole catalog`] };
  }
  const named = new Set(input.named);
  const freshByPath = new Map(input.docs.map((doc) => [doc.path, doc] as const));
  const rowByPath = new Map(rows.map((row) => [row.path, row] as const));
  const refusals = [...named]
    .filter((path) => !(freshByPath.has(path) || rowByPath.has(path)))
    .map((path) => `${path}: not a catalogued document — it is neither on the tree nor a row of the committed catalog`);
  if (refusals.length > 0) {
    return { refusals };
  }
  // ROW ORDER IS THE BASE'S, NOT A FRESH SORT. Measured 2026-09-12: re-sorting with `localeCompare`
  // produced a 4141-line diff on a ONE-DOCUMENT write, because the committed order is the tracked-file
  // order (`docs/Mission.md` before `docs/architecture/…`, capital-M first) and a locale sort is
  // case-insensitive. A scoped write whose diff is the whole file is not a scoped write.
  // A named document absent from the tree is a DELETION: its row simply does not join the union, and a
  // named document with no row yet is an ADDITION, placed by `withAdditionsPlaced` at the position a
  // whole run would give it — the base has no opinion about where a row it has never seen belongs, and
  // until #2473 that silence was read as "the end", which made the write instantly stale to its checker.
  const rowAsDoc = (row: CatalogDocumentRow): readonly Doc[] => {
    if (!named.has(row.path)) {
      return [{ path: row.path, lines: row.lines, bytes: row.bytes, sha256: row.sha256, canonicalSha256: null, frontmatter: row.frontmatter }];
    }
    return freshByPath.has(row.path) ? [freshByPath.get(row.path) as Doc] : [];
  };
  const docs = withAdditionsPlaced(
    rows.flatMap(rowAsDoc),
    [...named].filter((path) => !rowByPath.has(path) && freshByPath.has(path)).map((path) => freshByPath.get(path) as Doc),
    input.docs,
  );
  const freshEntries = new Map(input.receipts.flatMap((receipt) => receipt.entries.map((entry) => [entry.path, entry] as const)));
  const entries = docs.flatMap((doc) => {
    const entry = named.has(doc.path) ? freshEntries.get(doc.path) : (rowByPath.get(doc.path)?.receipt ?? undefined);
    return entry === undefined ? [] : [entry];
  });
  const lanesById = new Map(input.config.lanes.map((lane) => [lane.id, lane] as const));
  const unowned = docs.filter((doc) => !(named.has(doc.path) ? input.assignments.has(doc.path) : lanesById.has(rowByPath.get(doc.path)?.lane ?? "")));
  if (unowned.length > 0) {
    return {
      refusals: unowned.map(
        (doc) => `${doc.path}: no lane owns this row, so the scoped write cannot reproduce it — the whole form (--barrier) owns a re-assignment`,
      ),
    };
  }
  const assignments = new Map(
    docs.map(
      (doc) =>
        [doc.path, named.has(doc.path) ? (input.assignments.get(doc.path) as Lane) : (lanesById.get(rowByPath.get(doc.path)?.lane ?? "") as Lane)] as const,
    ),
  );
  // `catalogValue`/`migrationMetrics` read receipts only as a FLAT entry list keyed by path, so the
  // synthetic grouping below carries no claim beyond which lane owns each row.
  const receipts = input.config.lanes.map((lane) => ({
    schemaVersion: SCHEMA_VERSION,
    lane: lane.id,
    issue: lane.issue,
    entries: entries.filter((entry) => assignments.get(entry.path)?.id === lane.id),
  }));
  return { contents: expectedCatalog(docs, assignments, receipts), refusals: [] };
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
