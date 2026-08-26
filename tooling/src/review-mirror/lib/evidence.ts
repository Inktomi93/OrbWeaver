// Fail-closed evidence checks. A successful filesystem loop is not a successful instrument run unless it
// proves a non-empty tracked/mirrored/code population and a non-empty semantic + interactive census.
import type { ReviewMirrorEvidence } from "../contract/types.ts";

const GIT_COMMIT_HEX_CHARS = 40;

export function reviewEvidenceGaps(evidence: ReviewMirrorEvidence): readonly string[] {
  const gaps: string[] = [];
  if (evidence.sourceCommit.length !== GIT_COMMIT_HEX_CHARS) {
    gaps.push("source commit is missing or malformed");
  }
  if (evidence.mirror.tracked === 0) {
    gaps.push("git tracked-file census is empty");
  }
  if (evidence.mirror.mirroredFiles === 0 || evidence.mirror.mirroredCode === 0 || evidence.mirror.mirroredBytes === 0) {
    gaps.push("mirror generation produced empty file/code/byte evidence");
  }
  if (evidence.mirror.errors.length > 0) {
    gaps.push(`mirror generation reported ${evidence.mirror.errors.length.toString()} error(s)`);
  }
  if (evidence.mirror.missingCode.length > 0) {
    gaps.push(`mirror is missing ${evidence.mirror.missingCode.length.toString()} tracked code file(s)`);
  }
  if (
    evidence.reviewFocus.length === 0 ||
    !evidence.reviewFocus.some((row) => row.family === "E5") ||
    !evidence.reviewFocus.some((row) => row.family === "E6")
  ) {
    gaps.push("E5/E6 named review focus is absent or incomplete");
  }
  if (evidence.pendingGuard.scannedTsx === 0 || evidence.pendingGuard.directControls === 0 || evidence.pendingGuard.rows.length === 0) {
    gaps.push("E7 Button/Switch pending-guard census is empty");
  }
  if (evidence.pendingGuard.rows.length !== evidence.pendingGuard.directControls) {
    gaps.push("E7 receipt count does not equal its measured direct-control population");
  }
  return gaps;
}

export function assertReviewEvidence(evidence: ReviewMirrorEvidence): void {
  const gaps = reviewEvidenceGaps(evidence);
  if (gaps.length > 0) {
    throw new Error(`review-mirror evidence is not a verdict:\n${gaps.map((gap) => `  - ${gap}`).join("\n")}`);
  }
}
