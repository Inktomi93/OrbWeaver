// domain/databank/contract/views — the read shapes the verbs return. `DocumentView` (the list-safe
// projection, extractedText deliberately absent) is the cross-boundary shape owned by
// `@orb/contracts/databank`; re-exported type-only here so verb signatures reference one name. The detail +
// attachments views are domain-local (the panel's source view + the "attached where" chips).

import type { VisibleRoomRef } from "@orb/contracts/chat";
import type { DocumentScopeSource, DocumentView } from "@orb/contracts/databank";
import type { CharacterId, ChatId } from "@orb/kit/ids";

export type { DocumentView } from "@orb/contracts/databank";

/** `get({ includeText })` — the panel's source view. `extractedText` present iff asked (list payloads never
 *  haul the canon); `extractorVersion` surfaces the re-extract-on-upgrade affordance. */
export interface DocumentDetailView extends DocumentView {
  readonly extractedText?: string;
  readonly extractorVersion: string;
}

/** One CHARACTER that carries this document, as the CONTEXT roster prints it: the id its door navigates to
 *  and the name it shows. A character HAS a name — one authored string the row owns — so unlike a room this
 *  needs no chain and no membership filter, only the owner scope the junction already has (`characters` is
 *  owner-stamped, and `attachToCharacter` gates on it). */
interface DocumentCharacterRef {
  readonly id: CharacterId;
  readonly name: string;
}

/** What the persistence read can answer ALONE — the view minus the room resolution. The chat ids stay ids
 *  here because whether the caller may see them is chat's question, injected at the verb. */
export interface DocumentAttachmentRows {
  readonly global: boolean;
  readonly chatIds: readonly ChatId[];
  readonly characters: readonly DocumentCharacterRef[];
}

/**
 * Reverse of the scope junctions: where a document is attached (the CONTEXT panel's "Active in" roster +
 * detach UX). `global` is a boolean (single-owned personal bank).
 *
 * NAMES, NOT IDS (#276, 2026-08-19). This used to hand back `chatIds`/`characterIds`, which is why the pane
 * above it could only render two integers and why its no-selection copy had to downgrade its promise. The
 * two scopes resolve differently and the difference is the whole design:
 *   • CHARACTERS are a cheap owner-scoped join — the caller owns both sides of that junction.
 *   • CHATS are membership-scoped (D18 — chats carry no `ownerId`) and `attachToChat` is HOST authority, so
 *     a `chat_documents` row OUTLIVES its attacher's seat. Naming those ids straight off the junction would
 *     tell an ex-host that a room they can no longer open still exists and still feeds on their document.
 *     They resolve through the injected `resolveVisibleRooms` (`@orb/contracts/chat`), which answers PRESENT
 *     membership only and drops the rest — no residue, no count of what was dropped.
 */
export interface DocumentAttachmentsView {
  readonly global: boolean;
  /** The rooms the CALLER may see, newest-first, carrying the client title chain's inputs. A room the caller
   *  has left is absent — the count is the visible count, deliberately (a "…and 2 more" would leak it). */
  readonly chats: readonly VisibleRoomRef[];
  readonly characters: readonly DocumentCharacterRef[];
}

/** `listActiveForChat` row (D85): a document ACTIVE for the chat's retrieval union + its host-visibility state.
 *  `hidden` = the host excluded it from retrieval (`chats.metadata.databankVisibility`). Only the HOST ever
 *  receives hidden rows (they own the toggle); a member's payload is filtered to the visible set, so a member
 *  never learns a host-hidden document's name (`hidden` is always `false` in a member's payload). */
export interface ActiveChatDocumentView extends DocumentView {
  readonly hidden: boolean;
  /** WHY this document is active (D-2): the scope junction(s) crediting it — `global` (a present member's
   *  global attachment) · `chat` (attached to THIS chat) · `character` (on a present roster character). A
   *  document can be credited by several at once. Never empty: a row exists only because a junction put it
   *  there. It is also the DETACHABILITY datum — only `chat` is a junction this room's host owns, so a row
   *  without it can be HIDDEN but never detached from here. */
  readonly sources: readonly DocumentScopeSource[];
}
