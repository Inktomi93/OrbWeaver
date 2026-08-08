// domain/export/contract/params — every verb's *Params, declared once. Every verb carries the resolved
// principal; ownership is scoped off principal.userId (never a users read — no-direct-users-read gate).

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";

export type ExportChatFormat = "jsonl" | "txt";

/** O-5: the character door's format axis, the chat door's shape generalized. `png` is the ST-parity card
 *  (the JSON welded into the avatar as a tEXt chunk); `json` is the SAME card object, unwrapped — the
 *  format people paste into tooling and diff. One producer, two containers. */
export type ExportCardFormat = "png" | "json";

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
}
