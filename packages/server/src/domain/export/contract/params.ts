// domain/export/contract/params — every verb's *Params, declared once. Every verb carries the resolved
// principal; ownership is scoped off principal.userId (never a users read — the `orb/no-direct-users-read` lint rule).

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { PortableSeatCard } from "#primitives/serde/chat-bundle";

/** The hashes a seat's exported card restores under, without the seat's handle. */
export type SeatCardIdentity = Omit<PortableSeatCard, "handle">;

const EXPORT_CHAT_FORMATS = ["jsonl", "txt"] as const;
export type ExportChatFormat = (typeof EXPORT_CHAT_FORMATS)[number];

const EXPORT_CARD_FORMATS = ["png", "json"] as const;
/** O-5: the character door's format axis, the chat door's shape generalized. `png` is the ST-parity card
 *  (the JSON welded into the avatar as a tEXt chunk); `json` is the SAME card object, unwrapped — the
 *  format people paste into tooling and diff. One producer, two containers. */
export type ExportCardFormat = (typeof EXPORT_CARD_FORMATS)[number];

interface ExportActorParams {
  readonly principal: Principal;
}

/** No scope beyond the actor: the owner's own hosted chats. */
export type ListHostChatsParams = ExportActorParams;

export interface ExportCharacterParams extends ExportActorParams {
  readonly characterId: CharacterId;
  /** Defaults to `png` — the bundle descriptor never passes it, so a backup always carries cards. */
  readonly format?: ExportCardFormat | undefined;
}

/** The gate is the roster's host row; a non-host or missing chat returns null → 404. format defaults to jsonl. */
export interface ExportChatParams extends ExportActorParams {
  readonly chatId: ChatId;
  readonly format?: ExportChatFormat | undefined;
}

/** R6 — the orb-native chat bundle. NO format axis by design: the bundle IS the format, and the ST
 *  interchange containers live on `ExportChatParams` where the ST-shaped verb can reach them. Same host gate. */
export interface ExportChatBundleParams extends ExportActorParams {
  readonly chatId: ChatId;
  /** One export pass's seat-card identities, so a card seated in many rooms renders once per pass. */
  readonly seatCardCache?: Map<CharacterId, SeatCardIdentity | null>;
}
