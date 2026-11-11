// What the add-document dialog says when the server refuses an uploaded file. A leaf module with no component
// imports, so a spec's node side reads the sentences without loading the component graph.
//
// Each sentence is keyed on the refusal's code (`EXTRACTION_OP_CODES`), never on the server's own wording, which is
// the operator's. The record is total over the codes, so a new extraction code fails `tsc` until it has a sentence.
// A reason that is not an extraction code, or none at all, gets the general line.

import type { ExtractionOpCode } from "@orb/contracts/extraction";
import { EXTRACTION_OP_CODES, extractionOpCodeOf } from "@orb/contracts/extraction";

/** For a refusal that carries no extraction code: an over-size body the server cut off, a failed destination, a network fault. */
export const DOCUMENT_UPLOAD_GENERAL_FAILURE = "Couldn't add the document. Check the destination, file type and size, then try again.";

/** The sentence for each extraction refusal: what happened to the file and the one move that gets the text in. */
export const DOCUMENT_UPLOAD_FAILURE: Record<ExtractionOpCode, string> = {
  [EXTRACTION_OP_CODES.failed]: "That file couldn't be read. It may be damaged or locked with a password. Try a fresh copy, or paste its text instead.",
  [EXTRACTION_OP_CODES.tooLarge]: "That file is too large once it's unpacked. Split it into smaller files, or paste the part you need as text.",
  [EXTRACTION_OP_CODES.unsupportedType]: "That file type isn't supported. Pick a supported format, or paste its text instead.",
};

/** The line the upload field shows for a refusal's `reason` (`null` when the server stated none). */
export function documentUploadFailureLine(reason: string | null): string {
  const code = reason === null ? null : extractionOpCodeOf(reason);
  return code === null ? DOCUMENT_UPLOAD_GENERAL_FAILURE : DOCUMENT_UPLOAD_FAILURE[code];
}
