// domain/export/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose card" (NEVER a `users` read — the `no-direct-users-read` gate).
//
// PD-44 (resolved): the card-emitter input shapes (`ExportCardFields` / `ExportWorldEntry`) now live in the
// shared serde core (`@orb/server/kit/serde/card`). W0a: the chat-builder input shapes (`ExportChatMeta` /
// `ExportMessage` / `ExportVariant`) likewise moved to the ONE chat serde core (`@orb/server/kit/serde/chat`)
// as `ParsedChat` / `ParsedChatMessage` / `ParsedVariant` — the verb now maps DB rows to those. This file
// keeps only the verb `*Params`.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";

/** The chat transcript formats — ONE canonical union (§7.5; declared here to keep contract/ acyclic,
 *  re-exported from service.ts + the front door). Dispatched once in `export-chat.ts`. */
export type ExportChatFormat = "jsonl" | "txt";

/** Common to every export verb: the acting principal whose `userId` scopes ownership. */
export interface ExportActorParams {
  readonly principal: Principal;
}

export interface ExportCharacterParams extends ExportActorParams {
  /** The owned character to serialize to a V3 card PNG. */
  readonly characterId: CharacterId;
}

/** `exportChat` — the HOST's chat transcript (D29: chats are membership-scoped (D18), so the gate is the
 *  roster's host row; a non-host / missing chat returns `null` → 404). `format` defaults to `jsonl`. */
export interface ExportChatParams extends ExportActorParams {
  readonly chatId: ChatId;
  readonly format?: ExportChatFormat | undefined;
}
