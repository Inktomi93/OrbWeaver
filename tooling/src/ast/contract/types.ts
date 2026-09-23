// The lens-fleet shapes of ast — every EXPORTED type of the pre-move monolith, one home
// (no-inline-types: tool types live in contract/). Split from scripts/codemods/ast.ts (P4 of #393).
import type { Node } from "ts-morph";
import type { ColumnClass } from "./scan-types.ts";

export type * from "./scan-types.ts";

/** What ONE `buildLiveness` call is asked to produce beyond the liveness sets. `edges` turns on the
 *  DECLARATION-GRANULAR consumption map (`Liveness.consumers`) — off by default so the push-tier ratchet
 *  pays neither its cost nor its risk. */
export interface LivenessOptions {
  readonly edges: boolean;
}

/** ONE orphan candidate — its export NAME plus the ORIGIN declaration node (the identity everything keys
 *  on, and the node a reader of leading comments needs). `starSuppressed` = the declaring file is the
 *  target of an `export *` somewhere, so a namespace consumer we cannot cheaply name MIGHT reach it: the
 *  candidate is reported and NAMED, but never counted as a hit. This is the SHARED substrate — the
 *  `orphans` verb prints it and the push-tier ratchet (`tooling/src/verify/ops/orphan-export-ratchet.ts`) judges
 *  it, so there is exactly one definition of "orphan candidate" in the repo. */
export interface OrphanCandidate {
  readonly name: string;
  readonly decl: Node;
  readonly starSuppressed: boolean;
}

/** A resolved `@public`-family marker on a declaration: the two named exemptions plus the legacy `bare` form
 *  (kept distinct so the ratchet can red it with a precise remedy). `twin.value` is the NAMED value the type
 *  faces (verified PUBLIC by the caller); `future.reason`/`bare.reason` carry the stated rationale. */
export type PublicMarker =
  | { readonly kind: "twin"; readonly value: string }
  | { readonly kind: "future"; readonly reason: string }
  | { readonly kind: "bare"; readonly reason: string };

/** One export's testonly verdict: not a hit at all, a hit, or a bucketed declared test seam. */
const TEST_ONLY_CLASSES = ["alive", "hit", "seam"] as const;
export type TestOnlyClass = (typeof TEST_ONLY_CLASSES)[number];

/** ONE swallowed candidate: the export, plus the namespace-import sites that are its ENTIRE liveness (the
 *  files a human must read to render the verdict — "does the API this namespace is handed to use it?"). */
export interface SwallowedCandidate {
  readonly name: string;
  readonly decl: Node;
  readonly sites: readonly string[];
}

// ── dead: a composite evidence-ladder verdict for ONE symbol ────────────────────────────────────────
// Classifying one orphan today costs five separate commands (refs, ident, swallowed, a marker grep, a
// comment grep) plus the reader's own glue to line the results up. This composite resolves the symbol
// ONCE (`declarationsNamed`, the same substrate `refs` uses) and lays the evidence out as a compact
// table: product references / tool-script references / test-only references / namespace-swallowed consumption / the `@public`
// marker / a vendored-file home / raw comment-line mentions — then states a verdict.
//
// IT IS A CANDIDATE LENS, like `swallowed`/`typeonly-alive`/`chains` — the verdict is a human's, never a
// delete signal ("unwired ≠ worthless", AGENTS.md "Posture"). Evidence PRIORITY, not accumulation: a single
// production reference outranks everything else (ALIVE); a namespace-only reach may still be load-bearing
// THROUGH the swallowing API (SWALLOWED-ONLY); a reasoned `@public`-family marker is the author's
// unadjudicated keep claim (TAGGED-KEEP in this conservative lens; the ratchet separately judges legality);
// reach from a tool/script alone is TOOL-ANCHORED; reach from a test alone is `testonly`'s class
// (TEST-ANCHORED); only when none apply is it a CANDIDATE.
/** The six-way verdict `dead` renders — evidence PRIORITY order (see the header above), not a tally. */
const DEAD_VERDICTS = ["ALIVE", "TOOL-ANCHORED", "TEST-ANCHORED", "SWALLOWED-ONLY", "TAGGED-KEEP", "CANDIDATE"] as const;
export type DeadVerdict = (typeof DEAD_VERDICTS)[number];

/** The full evidence ladder for one declaration — every arm `dead` prints ahead of the verdict. */
export interface DeadEvidence {
  readonly verdict: DeadVerdict;
  readonly prodRefs: readonly string[];
  readonly prodCount: number;
  readonly toolRefs: readonly string[];
  readonly toolCount: number;
  readonly testRefs: readonly string[];
  readonly testCount: number;
  readonly swallowedSites: readonly string[];
  readonly publicMarker: PublicMarker | undefined;
  readonly vendored: boolean;
  readonly commentMentions: number;
}

/** The field-level diff a near-hit REPORTS — the percentage is the admission threshold, this is the
 *  deliverable. Renames are matched GREEDILY: an unmatched domain field pairs with the first unmatched
 *  contracts field of the SAME resolved type and a DIFFERENT name; anything left over is each-side-only. */
export interface NearFieldDiff {
  readonly pct: number;
  readonly sharedCount: number;
  readonly totalFields: number;
  readonly renamed: readonly { readonly from: string; readonly to: string; readonly type: string }[];
  readonly domainOnly: readonly string[];
  readonly contractsOnly: readonly string[];
}

/** ONE near-match: the domain shape, the contracts twin it was compared against, its domain, and the diff
 *  that decided admission. */
export interface NearPairCandidate {
  readonly domain: string;
  readonly domainName: string;
  readonly domainDecl: Node;
  readonly contractsName: string;
  readonly contractsDecl: Node;
  readonly diff: NearFieldDiff;
}

/** One reasoned, pair-specific near-match exemption. The candidate carries both declaration identities and
 *  the exact diff the marker exempts, so human and machine evidence never need to re-derive the pair. */
export interface NearPairExemption {
  readonly candidate: NearPairCandidate;
  readonly reason: string;
}

/** Plain-data machine evidence for one exempt pair; declaration nodes never enter the JSON plane. */
export interface NearPairExemptionEvidence {
  readonly domainName: string;
  readonly target: string;
  readonly reason: string;
  readonly diff: string;
}

/** A valid marker whose named contracts declaration is no longer a candidate at the governed threshold. */
export interface StaleNearPairMarker {
  readonly domainName: string;
  readonly domainDecl: Node;
  readonly targetDomain: string;
  readonly targetName: string;
  readonly reason: string;
}

/** A leading comment claimed `@nearpair-ok:` but did not carry the complete target-specific grammar. */
export interface MalformedNearPairMarker {
  readonly domainName: string;
  readonly domainDecl: Node;
  readonly marker: string;
}

/** Plain-data machine evidence for one stale or malformed marker; declaration nodes stay out of JSON. */
export interface NearPairMarkerEvidence {
  readonly kind: "stale-nearpair-ok" | "malformed-nearpair-ok";
  readonly domainName: string;
  readonly file: string;
  readonly line: number;
  readonly target?: string;
  readonly reason?: string;
  readonly marker?: string;
}

/** The near tier's single classified result: raw candidates and every marker disposition. */
export interface NearPairAudit {
  readonly candidates: readonly NearPairCandidate[];
  readonly exemptions: readonly NearPairExemption[];
  readonly staleMarkers: readonly StaleNearPairMarker[];
  readonly malformedMarkers: readonly MalformedNearPairMarker[];
}

/** ONE type-only-alive candidate: the export, and the type-position reference SITES that are its entire
 *  liveness (the files a human must read to render the verdict — "is this shape-conformance deliberate?").
 *  `unionSource` marks the repo's `as const` + `typeof X[number]` idiom — a bucketed row, never a hit. */
export interface TypeOnlyCandidate {
  readonly name: string;
  readonly decl: Node;
  readonly sites: readonly string[];
  readonly unionSource: boolean;
}

/** ONE classified column — the counted sites that produced its verdict, so a reader can go look. `opaque`
 *  means the TABLE has a whole-row writer, so "no attributed write" is UNKNOWN, never "unwritten". */
export interface ColumnCandidate {
  readonly column: ColumnDef;
  readonly klass: ColumnClass;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly opaque: boolean;
  readonly rawSql: boolean;
}

/** A table with production read evidence and no resolved production writer of any kind. */
export interface ProducerlessTableCandidate {
  readonly table: TableDef;
  readonly anchor: Node;
  readonly reads: readonly string[];
}

/** The whole audit for one scope: every column classified, table-level producerless candidates, and the
 *  write maps the summary prints (returned together so the expensive structural scan runs once). */
export interface ColumnAudit {
  readonly candidates: readonly ColumnCandidate[];
  readonly producerlessTables: readonly ProducerlessTableCandidate[];
  readonly opaqueTables: ReadonlyMap<string, readonly string[]>;
  readonly tableWrites: ReadonlyMap<string, readonly string[]>;
}

/** ONE declared contract field: its name, the declaration node, and the owner shape it belongs to. */
export interface ContractField {
  readonly name: string;
  readonly node: Node;
  readonly owner: string;
}

/** ONE examined `*View`/`*Summary` field (the `viewgap` unit): the declared field, the `packages/client/src`
 *  files that spell its name as a read, and whether it carries a reasoned `@view-server-only:` marker. The
 *  two verdicts are the two ways those combine — no client reader and no marker is a GAP, a marker with
 *  client readers is a STALE marker (the two-sided arm). */
export interface ViewFieldCandidate {
  readonly field: ContractField;
  readonly clientReaders: readonly string[];
  readonly exempt: boolean;
}

/** Where a name is SPELLED as a read: the file, plus the node offsets when that file is a `contracts` file.
 *  Offsets are tracked ONLY there because the one file whose reads need node-level adjudication is the one
 *  DECLARING the field, and every declaration this lens examines lives under `packages/contracts/src`.
 *  Tracking them corpus-wide would cost ~5,000 files of positions for zero extra verdicts. */
export type FieldReadSites = Map<string, number[]>;

/** ONE link in a rendered chain: the dead consumer's name and site, whether it is the TERMINAL (unconsumed)
 *  head, and how many other dead consumers were elided at that step. */
export interface ChainLink {
  readonly name: string;
  readonly site: string;
  readonly terminal: boolean;
  readonly alternates: number;
}

/** ONE chain-dead declaration and the chain of dead consumers that is its entire liveness. */
export interface ChainCandidate {
  readonly name: string;
  readonly decl: Node;
  readonly exported: boolean;
  readonly chain: readonly ChainLink[];
}

/** The whole audit for one scope: the findings PLUS the graph's own size. The stats exist so a ZERO is
 *  legible as CLEAN rather than as blindness — the permanent-zero footgun this file already ate once (the
 *  `orphans contracts` bug: a 100%-barrel package reported clean while the lens could not see into it).
 *  "0 findings over 4 declarations" and "0 findings over 9 000 declarations and 40 000 edges" are different
 *  claims and a reader must be able to tell them apart. */
export interface ChainAudit {
  readonly candidates: readonly ChainCandidate[];
  readonly declarations: number;
  readonly edges: number;
  readonly unconsumedHeads: number;
}

/** ONE hop in a resolution chain: an intermediate alias the head resolves THROUGH, and where it lives. */
export interface StringyLink {
  readonly name: string;
  readonly site: string;
}

/** ONE alias whose resolved type is exactly `string`: the head declaration, the alias hops between it and the
 *  end of the chain, and the RHS TEXT the last alias in that chain spells (`string`, or the expression the
 *  checker still reduced to `string`). `exported` separates the two remedies — an exported passthrough is a
 *  lie told to other packages, a file-local one only to its own file. */
export interface StringyCandidate {
  readonly name: string;
  readonly decl: Node;
  readonly exported: boolean;
  readonly chain: readonly StringyLink[];
  readonly rhs: string;
}

/** The findings PLUS how many aliases were examined. The stats exist so a ZERO is legible as CLEAN rather
 *  than as blindness — the permanent-zero footgun this file already ate once (`orphans contracts`). */
export interface StringyAudit {
  readonly candidates: readonly StringyCandidate[];
  readonly aliases: number;
}

/** ONE call site of the subject verb: the call node, the first-argument object's KEY SET, and — when that
 *  set could not be read — the reason, which is REPORTED rather than dropped (an unjudged site is not
 *  evidence that the doors agree). `via` names the same-file const a key set was resolved THROUGH; `door`
 *  names the CLIENT-door resolution chain (the receiver, the factory hook it was bound to, and the tRPC
 *  procedure that hook was built against) when the site is a `.mutate(…)` fire rather than a direct call,
 *  and is null for a direct call site. */
export interface SubsetCallSite {
  readonly node: Node;
  readonly keys: readonly string[] | null;
  readonly unresolved: string | null;
  readonly via: string | null;
  readonly door: string | null;
}

/** ONE fire site whose VERB the door resolver refused — the node so the reader gets a `file:line`, and the
 *  reason so "unjudged" is a shape to act on rather than a number to shrug at. A bare count was the lens's
 *  own claim to NAME its refusals going unhonoured (#576). */
export interface SubsetUnjudgedFire {
  readonly node: Node;
  readonly reason: string;
}

/** WHICH DOOR CLASSES THE WALK COULD JUDGE — the zero-hygiene half of a client-door verdict. `factories` is
 *  the blindness denominator (zero on a real corpus means the client-door arm never ran, never "no doors");
 *  `unjudgedFires` NAMES the `.mutate(…)`/bare-`mutate(…)` sites whose door resolution could not follow, ANY
 *  of which could be another door on the subject; `procedures` is the distinct set the matched doors
 *  resolved to, so a bare member name that pooled two different verbs is visible instead of silent. */
export interface SubsetDoorCensus {
  readonly factories: number;
  readonly unjudgedFires: readonly SubsetUnjudgedFire[];
  readonly procedures: readonly string[];
}

/** The raw walk behind a {@link SubsetAudit}: the call sites plus the door census the banner prints. */
export interface SubsetSiteScan {
  readonly sites: readonly SubsetCallSite[];
  readonly doors: SubsetDoorCensus;
}

/** ONE likely-stale door: a call site whose key set is a STRICT SUBSET of one or more other sites', plus
 *  the union of the keys it does not pass — the features that door silently stopped carrying. */
export interface SubsetFinding {
  readonly site: SubsetCallSite;
  readonly supersets: readonly SubsetCallSite[];
  readonly missing: readonly string[];
}

/** The whole audit for one symbol: every call site, how many were RESOLVABLE (the denominator that makes a
 *  zero legible as clean rather than as blindness), and the subset findings. */
export interface SubsetAudit {
  readonly sites: readonly SubsetCallSite[];
  readonly resolved: number;
  readonly findings: readonly SubsetFinding[];
  readonly doors: SubsetDoorCensus;
}

/** The boundary class of an export. TEST-ONLY is the flagged arm of PUBLIC (cross-boundary but not prod API). */
const API_CLASSES = ["public", "internal", "test-only", "unused"] as const;
export type ApiClass = (typeof API_CLASSES)[number];

/** ONE classified export: its class, its home package, the consuming package(s) that decided a PUBLIC verdict
 *  (or the same-package/tooling consumer that decided an INTERNAL one), a reader-facing evidence site, and the
 *  two caveats a verdict is priced with (`typeOnly` for a PUBLIC shape only ever imported as a type;
 *  `starSuppressed` for an UNUSED candidate reachable through an `export *` chain, as `orphans` reports). */
export interface ApiSurfaceEntry {
  readonly name: string;
  readonly decl: Node;
  readonly klass: ApiClass;
  readonly ownPkg: string;
  readonly consumers: readonly string[];
  readonly evidence: string;
  readonly typeOnly: boolean;
  readonly starSuppressed: boolean;
}

/** ONE drizzle column: its table's canonical declaration key and display spellings, its own two spellings,
 *  and the declaration node the `@column-ok` marker hangs on. */
export interface ColumnDef {
  readonly tableKey: string;
  readonly tableVar: string;
  readonly sqlTable: string;
  readonly jsProp: string;
  readonly sqlColumn: string;
  readonly decl: Node;
}

/** ONE table's columns plus the identity its writers resolve to (`declKey` of the table's own
 *  VariableDeclaration — an identifier alias or a `schema.<table>` hop cannot fork it). */
export interface TableDef {
  readonly varName: string;
  readonly sqlName: string;
  readonly key: string;
  readonly columns: readonly ColumnDef[];
}

/** Where writes land: every resolved table-write site, per-column attributed sites, and the opaque whole-row
 *  sites that make "no attributed write" mean UNKNOWN rather than "unwritten". */
export interface WriteScan {
  /** Keyed by {@link TableDef.key}, never the non-unique authored variable name. */
  readonly perTable: Map<string, string[]>;
  readonly perColumn: Map<string, string[]>;
  /** Keyed by {@link TableDef.key}; display names are never identities. */
  readonly opaqueTables: Map<string, string[]>;
}

// ── THE SCAN LEDGER — every invocation ends with ONE auditable epilogue ────────────────────────
// WHY (Codex repository audit, 2026-08-13): `no results` and `the search never happened` print the SAME
// line, so a lens can read clean while blind. Three shapes produce that lie here, all measured on this
// tree, none visible in the RESULT line:
//   1. THE CORPUS ROOTS. Syntactic verbs load `harnessGlobs`; `literal` uses the wider `searchGlobs`.
//      Their labels derive from those helpers. Typed verbs instead expose authored roots from native
//      per-tsconfig programs; the epilogue names that authority rather than claiming glob equivalence.
//   2. A SCOPE THAT ADMITS NOTHING. `resolveScope` has always rejected a zero-file positional scope with
//      exit 2 — but the verbs that take a raw path substring (`exports`, `aliases`, `cycles`) had no such
//      gate, and neither did `--in`, so a typo there degraded straight to a clean zero.
//      (`--filter` is a pnpm BUILD selector and never scoped this lens at all — `scope=` now says so.)
//   3. TS vs TSX. `.ts` and `.tsx` are different languages to every structural tool; `langs=` prints the
//      per-extension file counts so a mixed-tree answer cannot hide a single-language scan.
//
// So every invocation ends with ONE line on STDERR — stdout stays byte-identical, pipelines keep working:
//   [ast] verb=<v> scope=<parts> langs=<ext:count,…> scanned=<n> skipped=<n>(<reason:count,…>) matches=<n> status=…
// and `--json` carries the same fields as an ADDITIVE `meta` object (no existing key moves or changes).
//
// WHAT `scanned` MEANS, precisely — it is the CANDIDATE corpus: the files this invocation's scope admits,
// the files a hit can come from. A lens may additionally walk the whole workspace to DECIDE a verdict
// (`buildLiveness`, reference resolution, the depcruise graph); that substrate pass is deliberately not
// counted, because a scope typo cannot silence it and counting it would hide the number that a typo DOES
// move. The count is not re-derived either: it is taken by the same {@link scanCorpus} call that hands the
// verb its files, so it cannot drift from what the lens read. A verb that walks `project.getSourceFiles()`
// for its own candidates reports a scan it never proved — do not add one.
//
// `scanned=0` is a TOOL ERROR (status=error, `SCOPE ENTERED NOTHING`, exit 2), never a result — the
// exit-2 discipline `resolveScope` established, extended to every other way a scope can enter nothing.
// The same rule covers the scopes that resolve to UNITS rather than paths ({@link noteUnits}): zero
// procedures / tables / registries / domains is a blind lens, not a clean one.
/** Why a loaded source file is NOT in the scanned corpus. `out-of-filter` is the `--in` path filter: the
 *  file was walked but cannot contribute a hit (`dedupe` drops it), so it is skipped, never scanned. */
