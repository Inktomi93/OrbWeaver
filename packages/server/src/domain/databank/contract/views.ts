// domain/databank/contract/views — the read shapes the verbs return. `DocumentView` (the list-safe
// projection, extractedText deliberately absent) is the cross-boundary shape owned by
// `@orb/contracts/databank`; re-exported type-only here so verb signatures reference one name. The detail +
// attachments views are domain-local (the panel's source view + the "attached where" chips).

import type { DocumentView } from "@orb/contracts/databank";
import type { CharacterId, ChatId } from "@orb/kit/ids";

export type { DocumentView } from "@orb/contracts/databank";

/** `get({ includeText })` — the panel's source view. `extractedText` present iff asked (list payloads never
 *  haul the canon); `extractorVersion` surfaces the re-extract-on-upgrade affordance. */
export interface DocumentDetailView extends DocumentView {
  readonly extractedText?: string;
  readonly extractorVersion: string;
}

/** Reverse of the scope junctions: where a document is attached (the panel's "attached to" chips + detach UX).
 *  `global` is a boolean (single-owned personal bank); chat/character are the id lists. */
export interface DocumentAttachmentsView {
  readonly global: boolean;
  readonly chatIds: readonly ChatId[];
  readonly characterIds: readonly CharacterId[];
}

/** `listActiveForChat` row (D85): a document ACTIVE for the chat's retrieval union + its host-visibility state.
 *  `hidden` = the host excluded it from retrieval (`chats.metadata.databankVisibility`). Only the HOST ever
 *  receives hidden rows (they own the toggle); a member's payload is filtered to the visible set, so a member
 *  never learns a host-hidden document's name (`hidden` is always `false` in a member's payload). */
export interface ActiveChatDocumentView extends DocumentView {
  readonly hidden: boolean;
}
