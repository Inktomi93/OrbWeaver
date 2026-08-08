// domain/export/contract/results — the verb result shapes. A not-owned/missing entity surfaces as null
// (→ 404) from the verb, not one of these shapes — there is no error class.

import type { CharacterHandle, ChatId } from "@orb/kit/ids";

/** One chat the owner HOSTS, paired with the handle of its primary seated character (first by join order).
 *  The bundle descriptor nests each transcript under that handle and import parses the handle back out of
 *  the directory. A chat with no seated character is absent from the list. */
export interface HostChatRef {
  readonly chatId: ChatId;
  readonly handle: CharacterHandle;
}

/** A BINARY portable artifact: the bytes plus the download filename. One shape because "bytes + filename" is
 *  one concept — the character card and the R6 orb-native chat bundle are two producers of it, not two
 *  shapes. (`ExportedText` stays separate: its payload is a string the HTTP door serves as text.) */
export interface ExportedFile {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

/** The character card's container-agnostic output (`png` or unwrapped `json`). */
export type ExportedCard = ExportedFile;

export interface ExportedText {
  readonly text: string;
  readonly filename: string;
}
