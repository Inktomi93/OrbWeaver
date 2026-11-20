// domain/export/contract/results — the verb result shapes. A not-owned/missing entity surfaces as null
// (→ 404) from the verb, not one of these shapes — there is no error class.

import type { GroupConfig } from "@orb/contracts/chat";
import type { PortableFile } from "@orb/contracts/portability";
import type { CharacterHandle, CharacterId, ChatId, DocumentId } from "@orb/kit/ids";

/** One chat the owner HOSTS, paired with the handle of its primary seated character (first by join order).
 *  The bundle descriptor nests each transcript under that handle and import parses the handle back out of
 *  the directory. A chat with no seated character is absent from the list. */
export interface HostChatRef {
  readonly chatId: ChatId;
  readonly handle: CharacterHandle;
  /** Every seated character's handle, the primary first, in join order. */
  readonly handles: readonly CharacterHandle[];
  readonly title: string | null;
  readonly starred: boolean;
  /** The room's group config, or null for none or one that does not parse. */
  readonly groupConfig: GroupConfig | null;
  /** More than one seat, or a group config of any shape: the room is a group. */
  readonly isGroup: boolean;
}

/** One owned card with what the SillyTavern export files it by: its handle and its accepted tag names. */
export interface StCardRef {
  readonly characterId: CharacterId;
  readonly handle: CharacterHandle;
  readonly tags: readonly string[];
}

/** One owned Data Bank document as the SillyTavern export files it, read without its text: its scopes, by the global
 *  bank and the handles of the cards it is attached to. */
export interface StDocumentRef {
  readonly documentId: DocumentId;
  readonly name: string;
  readonly importHash: string;
  readonly global: boolean;
  readonly characterHandles: readonly CharacterHandle[];
  readonly createdAt: number;
}

/** The character card's container-agnostic output (`png` or unwrapped `json`). */
export type ExportedCard = PortableFile;

export interface ExportedText {
  readonly text: string;
  readonly filename: string;
}
