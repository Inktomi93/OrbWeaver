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

// The composer's send path: a toast away from the tile it concerns, so it names the file and the step. Each says what is
// wrong with the file, and `attachmentRefusalSentence` adds the one next step that works for every code.
const ATTACHMENT_REFUSAL_FACT: Record<AssetUploadRefusalCode, (fileName: string) => string> = {
  [ASSET_UPLOAD_REFUSAL_CODES.contentRejected]: (fileName) => `${fileName} doesn't match its file type.`,
  [ASSET_UPLOAD_REFUSAL_CODES.notAnImage]: (fileName) => `${fileName} isn't an image or a video.`,
  [ASSET_UPLOAD_REFUSAL_CODES.wrongMedia]: (fileName) => `${fileName} isn't an image or a video.`,
  [ASSET_UPLOAD_REFUSAL_CODES.tooLarge]: (fileName) => `${fileName} is too large to send.`,
};

/** What is wrong with the file. A refusal with no code carries only the server's own sentence, which is already whole. */
function attachmentRefusalFact(fileName: string, refusal: { readonly sentence: string; readonly reason: AssetUploadRefusalCode | null }): string {
  if (refusal.reason !== null) {
    return ATTACHMENT_REFUSAL_FACT[refusal.reason](fileName);
  }
  const sentence = `${refusal.sentence.charAt(0).toUpperCase()}${refusal.sentence.slice(1)}`;
  return `${fileName} wasn't sent. ${sentence.endsWith(".") ? sentence : `${sentence}.`}`;
}

/** The sentence for an attachment the server refused, naming the file and what to do: a whole sentence, so a toast shows it
 *  as written. */
export function attachmentRefusalSentence(fileName: string, refusal: { readonly sentence: string; readonly reason: AssetUploadRefusalCode | null }): string {
  return `${attachmentRefusalFact(fileName, refusal)} Remove it, then send again.`;
}

/** The server's clause for a refused upload, followed by what to do next when the server named a code. It carries no
 *  closing period, so a caller ends it in its own grammar. */
export function uploadRefusalClause(refusal: { readonly sentence: string; readonly reason: AssetUploadRefusalCode | null }): string {
  return refusal.reason === null ? refusal.sentence : `${refusal.sentence}. ${UPLOAD_REFUSAL_ADVICE[refusal.reason]}`;
}
