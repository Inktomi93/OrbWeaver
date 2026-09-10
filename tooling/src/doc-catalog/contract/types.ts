// doc-catalog's shapes: the lane config, the per-document receipt rows, the derived catalog facts, and
// the ratchet state. The receipt/claim shapes are the ones D139 makes normative — a receipt is a typed
// CLAIM plus resolvable evidence, so drift in these interfaces is drift in the documentation contract.

export interface Lane {
  readonly id: string;
  readonly issue: number;
  readonly patterns: readonly string[];
  readonly excludePatterns?: readonly string[];
}

export interface LaneConfig {
  readonly schemaVersion: number;
  readonly lanes: readonly Lane[];
}

export interface ReceiptEntry {
  readonly path: string;
  readonly assignedSha256: string;
  readonly disposition: string;
  readonly authority: string;
  readonly fullRead: boolean;
  readonly verifiedSha256: string | null;
  readonly verifiedCommit: string | null;
  readonly verifiedAt: string | null;
  readonly evidence: readonly string[];
  readonly claims?: readonly ReceiptClaim[];
  readonly summary: string;
}

export interface ReceiptEvidence {
  readonly kind: string;
  readonly target: string;
}

export interface ReceiptClaim {
  readonly claim: string;
  readonly evidence: readonly ReceiptEvidence[];
}

export interface Receipt {
  readonly schemaVersion: number;
  readonly lane: string;
  readonly issue: number;
  readonly entries: readonly ReceiptEntry[];
}

export interface Floors {
  readonly pending: number;
  readonly missingFrontmatter: number;
  readonly invalidFrontmatter: number;
  readonly malformedFrontmatter: number;
}

export interface DebtPaths {
  readonly pending: readonly string[];
  readonly missingFrontmatter: readonly string[];
  readonly invalidFrontmatter: readonly string[];
  readonly malformedFrontmatter: readonly string[];
}

export interface State {
  readonly schemaVersion: number;
  readonly allowed?: DebtPaths;
}

/** One HAND-AUTHORED catalog artifact's bytes on disk beside its canonical (biome-formatted) form (#968).
 *  `current !== canonical` is exactly "the repo's own formatter would rewrite this file" — the signal
 *  `check:doc-catalog` used to lack, which is how a receipt could be attested in a shape `lint:biome`
 *  rejects and red an unrelated stage hours later. */
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
  readonly lines: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly frontmatter: Frontmatter;
}

/** Everything a receipt row is judged against, resolved ONCE per run from git + the tree. */
export interface ReceiptFacts {
  readonly currentSha256: string;
  readonly verifiedBlobSha256: string | null;
  /** The exact current document and complete current receipt file coexist in the Git index. */
  readonly currentReceiptSnapshotExists: boolean;
  /** At least one side of the document/receipt pair differs between HEAD and the candidate index. */
  readonly candidateTouchesReceiptPair: boolean;
  readonly verifiedCommitExists: boolean;
  readonly verifiedCommitIsAncestor: boolean;
  readonly localEvidence: ReadonlyMap<string, number>;
  readonly lawSections: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly provenanceCommits: ReadonlySet<string>;
  readonly rulingAnchors: ReadonlyMap<string, number>;
}

export interface EvidenceSources {
  readonly localEvidence: ReadonlyMap<string, number>;
  readonly lawSections: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly ancestors: ReadonlySet<string>;
  readonly rulingAnchors: ReadonlyMap<string, number>;
}

export interface ValidationInput {
  readonly config: LaneConfig;
  readonly docs: readonly Doc[];
  readonly assignments: ReadonlyMap<string, Lane>;
  readonly receipts: readonly Receipt[];
  readonly state: State;
  readonly changedIndexPaths: ReadonlySet<string> | null;
}

export interface ReceiptValidationContext {
  readonly assignments: ReadonlyMap<string, Lane>;
  readonly docsByPath: ReadonlyMap<string, Doc>;
  readonly localEvidence: ReadonlyMap<string, number>;
  readonly lawSections: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly ancestors: ReadonlySet<string>;
  readonly rulingAnchors: ReadonlyMap<string, number>;
}

/** The catalog verbs — `--bootstrap` is one-shot and refuses a second run. ONE tuple, derived type: the
 *  cli's argv guard and the type cannot drift apart. */
export const CATALOG_MODES = ["--bootstrap", "--check", "--ratchet", "--sync", "--write"] as const;
export type CatalogMode = (typeof CATALOG_MODES)[number];

/** The formatter verbs (the ONE markdown writer; `--check` is a `pnpm check` stage). */
export const FORMAT_MODES = ["--check", "--write"] as const;
export type FormatMode = (typeof FORMAT_MODES)[number];
