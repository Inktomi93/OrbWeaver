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

/** Re-attestation's inputs (#1996) — every tree, git and clock fact as DATA, so the verb's refusals are
 *  provable without a repository. `selection` is the caller's literal argv: the verb has no default and
 *  no pattern expansion, because a receipt asserts a human read. */
export interface AttestInput {
  readonly config: LaneConfig;
  readonly docs: readonly Doc[];
  readonly receipts: readonly Receipt[];
  readonly selection: readonly string[];
  readonly headCommit: string | null;
  /** YYYY-MM-DD, injected rather than read from a clock inside the plan. */
  readonly today: string;
  /** Selected documents whose worktree bytes are not in the Git index — a receipt written over one of
   *  these would assert a pair that does not coexist. */
  readonly unstagedDocuments: ReadonlySet<string>;
  /** Per selected document, the GRAMMAR errors its row would carry once written (#1996) — resolved by the
   *  driver through `receiptEvidenceErrors`, so the plan stays a pure function of its inputs. A re-attest
   *  copies evidence through untouched, and the tree moves underneath it: a `code` citation whose file was
   *  renamed, a `law §N` whose section was renumbered, a `provenance` commit rebased out of HEAD's ancestry
   *  all pass silently into a receipt that reds at `check:doc-catalog` AFTER the write. Empty for a
   *  document whose row is clean. */
  readonly evidenceErrors: ReadonlyMap<string, readonly string[]>;
}

/** A named reason re-attestation did not happen. `misuse` = the SELECTION was not an explicit document
 *  list (exit 3); `violation` = a named row cannot be re-attested (exit 1). Either way nothing is written. */
export interface AttestRefusal {
  readonly kind: "misuse" | "violation";
  readonly message: string;
}

/** What re-attestation WOULD write, what it re-attested, and every refusal. `writes` is empty whenever
 *  `refusals` is not — the write set is all-or-nothing. */
export interface AttestPlan {
  readonly writes: readonly { readonly path: string; readonly receipt: Receipt }[];
  readonly attested: readonly string[];
  readonly refusals: readonly AttestRefusal[];
}

/** One row of the GENERATED catalog — the projection `catalogValue` writes. Declared because the SCOPED
 *  write (#2165) reads the committed catalog BACK as its base: every field a `Doc` carries is already in
 *  the row, so an unnamed document's row is reproduced from what was committed rather than re-derived from
 *  a working tree that belongs to four other lanes. */
export interface CatalogDocumentRow {
  readonly path: string;
  readonly lane: string;
  readonly issue: number;
  readonly lines: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly frontmatter: Frontmatter;
  readonly receipt: ReceiptEntry | null;
  readonly receiptCurrent: boolean;
}

/** The `catalog --write` tail (#2165). `paths` EMPTY means the whole-tree form, which regenerates every
 *  row from the current working tree and is therefore a BARRIER operation: on a busy day it sweeps every
 *  document any lane has changed into one commit, attributed to whoever ran it. `barrier` is the operator
 *  saying so out loud. */
export interface CatalogWriteRequest {
  readonly paths: readonly string[];
  readonly barrier: boolean;
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
  /** Paths changed between HEAD and the candidate index; null means Git could not establish the census. */
  readonly candidateChangedPaths: ReadonlySet<string> | null;
  /** Paths whose worktree entries differ from the candidate index; null means Git could not establish the delta. */
  readonly candidateEvidencePathsDifferFromIndex: ReadonlySet<string> | null;
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
  readonly worktreeIndexChangedPaths: ReadonlySet<string> | null;
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
