// domain/databank/contract/views — the read shapes the verbs return. `DocumentView` (the list-safe
// projection, extractedText deliberately absent) is the cross-boundary shape owned by
// `@orb/contracts/databank`, alongside detail and attachment wire views. Type-only exports keep verb
// signatures canonical; persistence-only attachment rows remain local.

import type { DocumentCharacterRef } from "@orb/contracts/databank";
import type { ChatId } from "@orb/kit/ids";

export type { DocumentView } from "@orb/contracts/databank";

/** What the persistence read can answer ALONE — the view minus the room resolution. The chat ids stay ids
 *  here because whether the caller may see them is chat's question, injected at the verb. */
export interface DocumentAttachmentRows {
  readonly global: boolean;
  readonly chatIds: readonly ChatId[];
  readonly characters: readonly DocumentCharacterRef[];
}

export type { ActiveChatDocumentView, DocumentAttachmentsView, DocumentCharacterRef, DocumentDetailView } from "@orb/contracts/databank";
