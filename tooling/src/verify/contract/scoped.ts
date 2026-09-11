// Result shapes for the non-gate verify verbs: the SCOPED single-pass run, the gate self-proof
// (conformance), the db schema-vs-baseline reconcile, the client boot-chunk ratchet, and the committed-
// ledger freshness stage. Homed here per the five-slot type law (docs/architecture/core/Core-Tooling-Law.md §2.5).
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { GateDescriptor } from "./gate.ts";
import type { PassResult } from "./pass.ts";
import type { GatePolicy } from "./policy.ts";
import type { PolicyPassResult } from "./policy-pass.ts";

/** What one `cli.ts scoped` run produced on the LEGACY side: the incremental-safe gates' pass, the whole-project
 *  gates it DEFERRED (a scoped clean is never a full all-clear), and how many files were in scope. */
export interface ScopedResult {
  readonly pass: PassResult;
  readonly deferred: readonly GateDescriptor[];
  readonly files: number;
}

/** The FINAL side of one scoped run (mixed runtime, #1584 §5): the dispatcher's result over the scoped fileset as
 *  `requestedPaths`, plus the policies it declined to run — an `entire-population` policy under a proper subset
 *  and a policy whose population never met the selection are both `not-applicable` owners, which is the final
 *  contract's whole-project fence. `pass` is null when the corpus holds no final policy. */
export interface ScopedPolicyResult {
  readonly pass: PolicyPassResult | null;
  readonly deferred: readonly GatePolicy[];
}

/** One failed gate self-proof example. A conformance failure is a TOOL error (exit 2), never a violation:
 *  the gate's own claim about itself is what broke. */
export interface ConformanceFailure {
  readonly gate: string;
  readonly arm: "mustFlag" | "mustPass";
  readonly why: string;
  readonly detail: string;
}

/** The committed squashed baseline vs what the live `@orb/db/schema` generates. */
export interface SchemaBaselineComparison {
  /** Statements the LIVE schema generates (normalized), sorted. */
  readonly expected: readonly string[];
  /** Statements the COMMITTED baseline holds (normalized), sorted. */
  readonly actual: readonly string[];
  /** In the live schema, absent from the baseline — the "you changed the schema and forgot to regen" arm. */
  readonly missingFromBaseline: readonly string[];
  /** In the baseline, absent from the live schema — a stale/hand-edited baseline. */
  readonly staleInBaseline: readonly string[];
}

/** One row of the assets domain's RETAINING registry (`ASSET_REFS`), read structurally so the comparator
 *  does not import the domain-internal `AssetRef` type (which the assets front door deliberately does not
 *  re-export). The COLUMN is the authority: a drizzle column carries its own owning table, so the coverage
 *  key derives from `column.table`, never from the row's declared `table` — a row pairing table X with a
 *  same-NAMED column belonging to table Y would otherwise read as coverage of a column it does not name. */
export interface AssetRefsRegistryRow {
  readonly table: SQLiteTable;
  readonly column: AnySQLiteColumn;
}

/** What one `check:asset-refs` reconciliation produced. Every list is `table.column` SQL keys, sorted.
 *  The three verdict lists are INDEPENDENT: a column may be unclassified while another is phantom. */
export interface AssetRefsCoverage {
  /** Every `SQLiteTable` the schema module exported — the denominator behind every list below. */
  readonly tables: number;
  /** Every live FK→`assets.id` column in the schema. Zero is BLINDNESS, refused by the comparator. */
  readonly assetFkColumns: readonly string[];
  /** The RETAINING classification (`ASSET_REFS`), resolved through `getTableConfig`. */
  readonly retaining: readonly string[];
  /** The DERIVED classification (`DERIVED_ASSET_COLUMNS`), already snake-case keys. */
  readonly derived: readonly string[];
  /** Asset-FK columns in NEITHER class — GC can reap their blobs and export will not bundle them. */
  readonly unclassified: readonly string[];
  /** Classified keys that are not asset FKs at all — a registry row naming nothing. */
  readonly phantom: readonly string[];
  /** Keys classified BOTH retaining and derived — the two lists must be disjoint. */
  readonly overlap: readonly string[];
  /** RETAINING rows whose `column` does not belong to the `table` they name. The pair is incoherent: the
   *  GC/export walk issues `SELECT … FROM <table> WHERE <column>`, which is a different table's column. */
  readonly mismatched: readonly string[];
}

/** One committed single-writer ledger judged against a FRESH derivation of itself (`ledgers:fresh`, #817).
 *  `drift` empty ⇒ the committed file is what the tree derives today. It is a LIST, never a boolean: the
 *  stage's whole job is naming the rows that moved, because "the census differs" sends a reader to a
 *  1,700-row JSON diff and a named row sends them to the regen. */
export interface LedgerFreshness {
  /** The committed artifact, repo-relative. */
  readonly ledger: string;
  /** The single-writer command that rewrites it (GATE-AUTHORING §4.8) — printed with every drift line. */
  readonly regen: string;
  /** How many rows/paths the FRESH derivation produced. Zero on a real tree is the blindness tripwire
   *  (the derivation went blind), never a clean verdict — the stage raises it as a tool error. */
  readonly derived: number;
  /** One line per difference, in a stable order. Empty ⇒ fresh. */
  readonly drift: readonly string[];
}

/** One `dist/assets/*.js` file the emitted `index.html` puts on the boot path. */
export interface BootChunkFile {
  /** The asset's basename, e.g. `index-BsalMtFR.js` / `jsx-runtime-DUeIs9Gz.js`. */
  readonly name: string;
  /** Its size on disk. */
  readonly bytes: number;
}

/** What the client's built `dist/` says about the BOOT PAYLOAD — the entry chunk PLUS every
 *  `dist/assets/*.js` the emitted `index.html` references (module `src` + `modulepreload` `href`), because
 *  the browser fetches a modulepreloaded sibling on the boot path too. `bytes === null` is the UNMEASURABLE
 *  state — a TOOL error, never a clean verdict: a blind zero here would read as "the budget is fine"
 *  forever after a vite output-naming change. */
export interface BootChunkVerdict {
  /** The directory that was read, repo-relative — printed so an unmeasurable verdict names its scope. */
  readonly assetsDir: string;
  /** Every filename in `assetsDir` matching the entry-chunk pattern. Exactly one = measurable. */
  readonly candidates: readonly string[];
  /** The whole boot set, sorted by name — empty when unmeasurable. Printed so a sum names its parts. */
  readonly bootFiles: readonly BootChunkFile[];
  /** The boot set's SUMMED size, or null when the tree could not be measured (see `unmeasurable`). */
  readonly bytes: number | null;
  /** The committed ceiling this run judged against (boot-chunk-ratchet.ts's calibration comment). */
  readonly ceilingBytes: number;
  /** Why the measurement is impossible, or null when `bytes` is a real number. */
  readonly unmeasurable: string | null;
}
