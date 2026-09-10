// The receipt RULES — pure judgment over an entry plus the pre-resolved facts (`ReceiptFacts`), so the
// whole D139 receipt contract is unit-testable with hand-built facts and no git.
//
// The two tiers this file keeps apart: a PENDING row is un-reviewed and must claim nothing; a REVIEWED
// row owes a full read, a current hash, an ancestor commit, a date, evidence, a summary, an authority —
// and, unless it is a lifecycle receipt (archive/generated/vendor/superseded), typed claims whose every
// evidence target RESOLVES on the tree. That last arm is why a moved file's receipt goes red: the target
// is re-derived, never re-prefixed.
import type { ReceiptClaim, ReceiptEntry, ReceiptEvidence, ReceiptFacts } from "../contract/types.ts";
import {
  COMMIT_RE,
  DATE_RE,
  FIRST_RESERVED_RULING,
  ISSUE_EVIDENCE_RE,
  LAST_RESERVED_RULING,
  LAW_EVIDENCE_RE,
  LOCAL_EVIDENCE_KINDS,
  LOCAL_EVIDENCE_RE,
  PROVENANCE_EVIDENCE_RE,
  RULING_EVIDENCE_RE,
  SHA256_RE,
  URL_EVIDENCE_RE,
  VALID_AUTHORITIES,
  VALID_DISPOSITIONS,
  VALID_EVIDENCE_KINDS,
} from "./vocab.ts";

function pendingClaimsEvidence(entry: ReceiptEntry): boolean {
  return (
    entry.fullRead ||
    entry.verifiedSha256 !== null ||
    entry.verifiedCommit !== null ||
    entry.verifiedAt !== null ||
    entry.evidence.length > 0 ||
    entry.summary !== "" ||
    entry.authority !== "unclassified"
  );
}

function isLifecycleReceipt(entry: ReceiptEntry): boolean {
  return (
    entry.disposition === "archive" ||
    entry.disposition === "generated-artifact" ||
    entry.disposition === "superseded" ||
    entry.disposition === "vendor-snapshot" ||
    entry.authority === "generated" ||
    entry.authority === "historical" ||
    entry.authority === "vendor"
  );
}

function hasExpectedEvidenceRoot(kind: string, path: string): boolean {
  if (kind === "code") {
    return !(path.startsWith("docs/") || path.startsWith("tests/"));
  }
  if (kind === "test") {
    return path.startsWith("tests/");
  }
  if (kind === "gate") {
    return path.startsWith("tooling/src/verify/");
  }
  return path.startsWith("docs/architecture/core/");
}

function localEvidenceErrors(entry: ReceiptEntry, evidence: ReceiptEvidence, facts: ReceiptFacts): readonly string[] {
  const match = LOCAL_EVIDENCE_RE.exec(evidence.target);
  if (match === null) {
    return [`${entry.path}: ${evidence.kind} evidence target must be path:line`];
  }
  const [, path, lineText] = match;
  const line = Number(lineText);
  const lines = facts.localEvidence.get(path ?? "");
  if (lines === undefined) {
    return [`${entry.path}: ${evidence.kind} evidence target does not resolve: ${evidence.target}`];
  }
  if (line < 1 || line > lines) {
    return [`${entry.path}: ${evidence.kind} evidence line is out of bounds: ${evidence.target}`];
  }
  if (path === undefined || !hasExpectedEvidenceRoot(evidence.kind, path)) {
    return [`${entry.path}: ${evidence.kind} evidence target has the wrong root: ${evidence.target}`];
  }
  const candidateTouchesEvidence = facts.candidateChangedPaths === null || facts.candidateChangedPaths.has(path);
  if (!(facts.candidateTouchesReceiptPair || candidateTouchesEvidence)) {
    return [];
  }
  if (facts.candidateEvidencePathsDifferFromIndex === null) {
    return [`${entry.path}: cannot establish candidate Git index consistency for ${evidence.kind} evidence: ${evidence.target}`];
  }
  return facts.candidateEvidencePathsDifferFromIndex.has(path)
    ? [`${entry.path}: ${evidence.kind} evidence target differs from the candidate Git index: ${evidence.target}`]
    : [];
}

function lawEvidenceErrors(entry: ReceiptEntry, evidence: ReceiptEvidence, facts: ReceiptFacts): readonly string[] {
  const match = LAW_EVIDENCE_RE.exec(evidence.target);
  if (match === null) {
    return [`${entry.path}: law evidence target must be current-law-path §<section>`];
  }
  const [, path, section] = match;
  const occurrences = facts.lawSections.get(path ?? "")?.get(section ?? "");
  if (occurrences === undefined) {
    return [`${entry.path}: law evidence target does not resolve: ${evidence.target}`];
  }
  return occurrences === 1 ? [] : [`${entry.path}: law evidence target is ambiguous: ${evidence.target}`];
}

function rulingEvidenceErrors(entry: ReceiptEntry, evidence: ReceiptEvidence, facts: ReceiptFacts): readonly string[] {
  const match = RULING_EVIDENCE_RE.exec(evidence.target);
  if (match === null) {
    return [`${entry.path}: ruling evidence target must be D<n>`];
  }
  const ruling = match[1] ?? "";
  const occurrences = facts.rulingAnchors.get(ruling);
  if (occurrences !== undefined) {
    return occurrences === 1 ? [] : [`${entry.path}: ruling evidence target is ambiguous: ${evidence.target}`];
  }
  const number = Number(ruling);
  return number >= FIRST_RESERVED_RULING && number <= LAST_RESERVED_RULING
    ? [`${entry.path}: ruling evidence target is reserved: ${evidence.target}`]
    : [`${entry.path}: ruling evidence target does not resolve: ${evidence.target}`];
}

function contextualEvidenceErrors(entry: ReceiptEntry, evidence: ReceiptEvidence, facts: ReceiptFacts | undefined): readonly string[] {
  if (facts === undefined) {
    return [];
  }
  if (LOCAL_EVIDENCE_KINDS.has(evidence.kind)) {
    return localEvidenceErrors(entry, evidence, facts);
  }
  if (evidence.kind === "law") {
    return lawEvidenceErrors(entry, evidence, facts);
  }
  if (evidence.kind === "ruling") {
    return rulingEvidenceErrors(entry, evidence, facts);
  }
  return [];
}

function evidenceErrors(entry: ReceiptEntry, evidence: ReceiptEvidence, facts: ReceiptFacts | undefined): readonly string[] {
  if (!VALID_EVIDENCE_KINDS.has(evidence.kind)) {
    return [`${entry.path}: invalid evidence kind ${evidence.kind}`];
  }
  const contextual = contextualEvidenceErrors(entry, evidence, facts);
  if (contextual.length > 0 || LOCAL_EVIDENCE_KINDS.has(evidence.kind) || evidence.kind === "law" || evidence.kind === "ruling") {
    return contextual;
  }
  if (evidence.kind === "issue") {
    return ISSUE_EVIDENCE_RE.test(evidence.target) ? [] : [`${entry.path}: issue evidence target must be #<number>`];
  }
  if (evidence.kind === "upstream") {
    return URL_EVIDENCE_RE.test(evidence.target) ? [] : [`${entry.path}: upstream evidence target must be an https URL`];
  }
  if (evidence.kind !== "provenance") {
    return [];
  }
  const match = PROVENANCE_EVIDENCE_RE.exec(evidence.target);
  return match !== null && facts?.provenanceCommits.has(match[1] ?? "") === true
    ? []
    : [`${entry.path}: provenance evidence target must resolve to an ancestor commit`];
}

function typedClaimErrors(entry: ReceiptEntry, claim: ReceiptClaim, facts: ReceiptFacts | undefined): readonly string[] {
  const errors: string[] = [];
  if (claim.claim.trim() === "") {
    errors.push(`${entry.path}: typed claim must not be blank`);
  }
  if (claim.evidence.length === 0) {
    errors.push(`${entry.path}: typed claim requires evidence`);
  }
  return [...errors, ...claim.evidence.flatMap((evidence) => evidenceErrors(entry, evidence, facts))];
}

function isReceiptEvidence(value: unknown): value is ReceiptEvidence {
  return (
    typeof value === "object" && value !== null && "kind" in value && typeof value.kind === "string" && "target" in value && typeof value.target === "string"
  );
}

function isReceiptClaim(value: unknown): value is ReceiptClaim {
  return (
    typeof value === "object" &&
    value !== null &&
    "claim" in value &&
    typeof value.claim === "string" &&
    "evidence" in value &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isReceiptEvidence)
  );
}

function claimEvidenceErrors(entry: ReceiptEntry, facts: ReceiptFacts | undefined): readonly string[] {
  if (isLifecycleReceipt(entry)) {
    return [];
  }
  if (entry.claims === undefined || !Array.isArray(entry.claims) || entry.claims.length === 0 || !entry.claims.every(isReceiptClaim)) {
    return [`${entry.path}: current/program/evidence receipt requires typed claims`];
  }
  return entry.claims.flatMap((claim) => typedClaimErrors(entry, claim, facts));
}

function receiptTruthErrors(entry: ReceiptEntry, facts: ReceiptFacts | undefined): readonly string[] {
  if (facts === undefined || entry.disposition === "pending") {
    return [];
  }
  const errors: string[] = [];
  if (entry.verifiedSha256 !== facts.currentSha256) {
    errors.push(`${entry.path}: verifiedSha256 does not match the current document`);
  }
  if ((entry.verifiedSha256 !== facts.verifiedBlobSha256 || facts.candidateTouchesReceiptPair) && !facts.currentReceiptSnapshotExists) {
    errors.push(`${entry.path}: current document and receipt do not coexist in a verified commit or the Git index`);
  }
  if (!facts.verifiedCommitExists) {
    errors.push(`${entry.path}: verifiedCommit does not resolve to a commit`);
  } else if (!facts.verifiedCommitIsAncestor) {
    errors.push(`${entry.path}: verifiedCommit is not an ancestor of HEAD`);
  }
  return errors;
}

function reviewedReceiptErrors(entry: ReceiptEntry): readonly string[] {
  const requirements: readonly [boolean, string][] = [
    [entry.fullRead, "reviewed disposition requires fullRead=true"],
    [SHA256_RE.test(entry.assignedSha256), "reviewed disposition requires an assigned SHA-256"],
    [SHA256_RE.test(entry.verifiedSha256 ?? ""), "reviewed disposition requires a SHA-256"],
    [COMMIT_RE.test(entry.verifiedCommit ?? ""), "reviewed disposition requires a full git commit"],
    [DATE_RE.test(entry.verifiedAt ?? ""), "reviewed disposition requires verifiedAt YYYY-MM-DD"],
    [entry.evidence.length > 0, "reviewed disposition requires evidence"],
    [entry.summary.trim() !== "", "reviewed disposition requires a summary"],
    [entry.authority !== "unclassified", "reviewed disposition requires an authority"],
  ];
  return requirements.filter(([satisfied]) => !satisfied).map(([, message]) => `${entry.path}: ${message}`);
}

/** Every rule a single receipt row must satisfy. `facts` absent = the document is gone (coverage reports
 *  that separately), so the tree-resolved arms are skipped rather than fabricated. */
export function validateReceiptEntry(entry: ReceiptEntry, facts?: ReceiptFacts): readonly string[] {
  const errors = [
    ...(VALID_DISPOSITIONS.has(entry.disposition) ? [] : [`${entry.path}: invalid disposition ${entry.disposition}`]),
    ...(VALID_AUTHORITIES.has(entry.authority) ? [] : [`${entry.path}: invalid authority ${entry.authority}`]),
  ];
  if (entry.disposition === "pending") {
    return pendingClaimsEvidence(entry) ? [...errors, `${entry.path}: pending receipt must not claim review evidence`] : errors;
  }
  return [...errors, ...reviewedReceiptErrors(entry), ...claimEvidenceErrors(entry, facts), ...receiptTruthErrors(entry, facts)];
}

/** The catalog's per-document receipt projection — `receiptCurrent` is FALSE the moment the document's
 *  bytes change, which is the hash-invalidation half of D139. */
export function catalogReceipt(
  receipt: ReceiptEntry | undefined,
  currentSha256: string,
): {
  readonly receipt: ReceiptEntry | null;
  readonly receiptCurrent: boolean;
} {
  return {
    receipt: receipt ?? null,
    receiptCurrent: receipt !== undefined && receipt.disposition !== "pending" && receipt.verifiedSha256 === currentSha256,
  };
}
