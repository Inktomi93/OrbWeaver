// The next step a refused upload names, keyed on the refusal code the upload route sends beside its sentence. A zero-import
// leaf beyond the contract's vocabulary, so every upload surface words a refusal the same way.

import type { AssetUploadRefusalCode } from "@orb/contracts/assets";
import { ASSET_UPLOAD_REFUSAL_CODES } from "@orb/contracts/assets";

const UPLOAD_REFUSAL_ADVICE: Record<AssetUploadRefusalCode, string> = {
  [ASSET_UPLOAD_REFUSAL_CODES.contentRejected]: "Save the file again as its real type, or pick another one",
  [ASSET_UPLOAD_REFUSAL_CODES.notAnImage]: "Pick a PNG, JPEG, GIF or WebP image",
  [ASSET_UPLOAD_REFUSAL_CODES.wrongMedia]: "Pick a different file for this spot",
  [ASSET_UPLOAD_REFUSAL_CODES.tooLarge]: "Pick a smaller file",
};

/** The server's clause for a refused upload, followed by what to do next when the server named a code. It carries no
 *  closing period, so a caller ends it in its own grammar. */
export function uploadRefusalClause(refusal: { readonly sentence: string; readonly reason: AssetUploadRefusalCode | null }): string {
  return refusal.reason === null ? refusal.sentence : `${refusal.sentence}. ${UPLOAD_REFUSAL_ADVICE[refusal.reason]}`;
}
