// Evidence policy — PURE (#923 P2, owner-approved 2026-09-01). GitHub's Project text column hard-
// rejects anything past EVIDENCE_MAX_LENGTH UTF-8 bytes (measured live — vocab.ts). The old shape REFUSED an
// over-cap `--evidence` and pushed the operator through a manual post-a-comment-and-retype loop; now
// the FIELD carries a deterministic head + pointer and the FULL text lands as an issue comment in the
// same invocation. The transform is pure and shared by verify/reverify/refute/done, so done's
// same-receipt match (field == transform(--evidence)) holds by construction on both sides.
import { createHash } from "node:crypto";
import { UsageError } from "../../_shared/run-tool.ts";
import { EVIDENCE_MAX_LENGTH } from "./vocab.ts";

/** GitHub caps COMMENT bodies at 65536 server-side — refuse before the network does. A receipt this
 *  size belongs in a committed file, cited by path. */
const EVIDENCE_HARD_CAP = 60_000;
const POINTER_HASH_LENGTH = 8;

export interface EvidenceText {
  /** What the Evidence column receives — always within the column cap. */
  readonly field: string;
  /** The full-receipt comment body to post, or null when the evidence fit the column. */
  readonly overflow: string | null;
}

/** The parse-time half: only the HARD cap refuses (misuse, exit 3) — overflow within it is handled,
 *  not refused. */
export function capEvidenceHard(value: string): string {
  if (value.length > EVIDENCE_HARD_CAP) {
    throw new UsageError(
      `evidence is ${value.length} chars; the hard cap is ${EVIDENCE_HARD_CAP} (GitHub's comment-body limit) — a receipt this size belongs in a committed file, cited by path`,
    );
  }
  return value;
}

/** The write-time half. The pointer carries a short hash of the FULL text so the field and its comment
 *  are pairable, and the transform is deterministic — verify writes it, done recomputes it and matches. */
export function evidenceText(evidence: string): EvidenceText {
  if (Buffer.byteLength(evidence, "utf8") <= EVIDENCE_MAX_LENGTH) {
    return { field: evidence, overflow: null };
  }
  const digest = createHash("sha256").update(evidence, "utf8").digest("hex").slice(0, POINTER_HASH_LENGTH);
  const pointer = ` … [full receipt in issue comment ${digest}]`;
  const prefixBudget = EVIDENCE_MAX_LENGTH - Buffer.byteLength(pointer, "utf8");
  let prefixBytes = 0;
  let prefixEnd = 0;
  // Iterate code points so a byte budget never slices a surrogate pair in half.
  for (const character of evidence) {
    const width = Buffer.byteLength(character, "utf8");
    if (prefixBytes + width > prefixBudget) {
      break;
    }
    prefixBytes += width;
    prefixEnd += character.length;
  }
  return {
    field: `${evidence.slice(0, prefixEnd)}${pointer}`,
    overflow: `Full verification receipt (${digest}):\n\n${evidence}`,
  };
}
