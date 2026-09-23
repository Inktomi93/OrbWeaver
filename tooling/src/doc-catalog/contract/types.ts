// doc-catalog's shapes: the lane config, the per-document authority rows, the derived inventory, and the
// frontmatter-debt ratchet state. The hash-bound attestation (a whole-file sha, a verification commit,
// prose evidence per row) is GONE by owner ruling — it churned on every edit — so a row is a path and the
// human classification the citation gates read, and nothing here changes when a document's prose does.

export interface Lane {
  readonly id: string;
  readonly patterns: readonly string[];
  readonly excludePatterns?: readonly string[];
}

export interface LaneConfig {
  readonly schemaVersion: number;
  readonly lanes: readonly Lane[];
}

/** One document's classification. `authority` is what `dangling-refs` derives its law/design corpora from. */
export interface ReceiptEntry {
  readonly path: string;
  readonly authority: string;
}

export interface Receipt {
  readonly schemaVersion: number;
  readonly lane: string;
  readonly entries: readonly ReceiptEntry[];
}

export interface Floors {
  readonly missingFrontmatter: number;
  readonly invalidFrontmatter: number;
  readonly malformedFrontmatter: number;
}

export interface DebtPaths {
  readonly missingFrontmatter: readonly string[];
  readonly invalidFrontmatter: readonly string[];
  readonly malformedFrontmatter: readonly string[];
}

export interface State {
  readonly schemaVersion: number;
  readonly allowed?: DebtPaths;
}

/** One row of the GENERATED inventory. Only `kind`/`status` of the frontmatter are carried, so a review
 *  date bump or a prose edit never changes the committed artifact; the whole file regenerates when a
 *  document is added, removed, reclassified or re-kinded. */
export interface CatalogDocumentRow {
  readonly path: string;
  readonly lane: string;
  readonly frontmatter: { readonly fields: Readonly<Record<string, string>> };
  readonly receipt: { readonly authority: string } | null;
}

/** One HAND-AUTHORED catalog artifact's bytes on disk beside its canonical (biome-formatted) form (#968).
 *  `current !== canonical` is exactly "the repo's own formatter would rewrite this file". */
export interface ArtifactForm {
  readonly path: string;
  readonly current: string;
  readonly canonical: string;
}

export interface Frontmatter {
  readonly present: boolean;
  readonly malformed: boolean;
  readonly fields: Readonly<Record<string, string>>;
  readonly errors: readonly string[];
}

export interface Doc {
  readonly path: string;
  readonly frontmatter: Frontmatter;
}

export interface ValidationInput {
  readonly config: LaneConfig;
  readonly docs: readonly Doc[];
  readonly assignments: ReadonlyMap<string, Lane>;
  readonly receipts: readonly Receipt[];
  readonly state: State;
}

/** The catalog verbs. ONE tuple, derived type: the cli's argv guard and the type cannot drift apart. */
export const CATALOG_MODES = ["--check", "--ratchet", "--sync", "--write"] as const;
export type CatalogMode = (typeof CATALOG_MODES)[number];

/** The formatter verbs (the ONE markdown writer; `--check` is a `pnpm check` stage). */
export const FORMAT_MODES = ["--check", "--write"] as const;
export type FormatMode = (typeof FORMAT_MODES)[number];
