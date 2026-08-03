// domain/export/contract/results — the verb result shapes. A not-owned/missing entity surfaces as null
// (→ 404) from the verb, not one of these shapes — there is no error class.

import type { ChatId } from "@orb/kit/ids";

/** One chat the owner HOSTS, paired with the handle of its primary seated character (first by join order).
 *  The bundle descriptor nests each transcript under that handle and import parses the handle back out of
 *  the directory. A chat with no seated character is absent from the list. */
export interface HostChatRef {
  readonly chatId: ChatId;
  readonly handle: string;
}

export interface ExportedCard {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

export interface ExportedText {
  readonly text: string;
  readonly filename: string;
}
