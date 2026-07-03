// domain/export/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose card" (NEVER a `users` read — the `no-direct-users-read` gate).
//
// PD-44 (resolved): the card-emitter input shapes (`ExportCardFields` / `ExportWorldEntry`) now live in the
// shared serde core (`@orb/server/kit/serde/card`) next to `buildCardV3` / `cardFromJson` — one card serde
// home. This file keeps only the verb `*Params`.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

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

// ── The chat-builder input shapes — the `substrate/chat-jsonl.ts` inputs; the verb maps DB rows to
//    these. ──

/** The chat-level header facts for the JSONL/TXT builders. */
export interface ExportChatMeta {
  readonly characterName: string;
  readonly userName: string | null;
  readonly createDate: number | null;
  /** The parent chat's imported source filename (the branch relink key) — null when never imported /
   *  no parent. */
  readonly parentRef?: string | null | undefined;
  /** The ST author's note (`note_prompt`) — orbweaver's home is `roomOverrides.authorsNote`. */
  readonly notePrompt?: string | null | undefined;
}

/** One swipe/variant of a message (verbatim, incl. the active one). */
export interface ExportVariant {
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly genStarted: number | null;
  readonly genFinished: number | null;
}

/** One canon message (D26: content/economics from the SELECTED variant; `variants` = the full swipe set —
 *  a length ≤ 1 set emits no swipe arrays). `role` derives the canonical `MessageRole` union (D32). */
export interface ExportMessage {
  readonly role: MessageRole;
  /** The display name of the ACTUAL speaker of THIS turn — the voicing character for an assistant row, the
   *  authoring persona for a user row (a group room has many of each; D18/Part III). The verb resolves it
   *  from the canon row's `characterId`/`personaId` against a per-chat name map — NOT the single header
   *  `characterName` (which stays the ST-header primary). This is what makes a multi-speaker export honest. */
  readonly speakerName: string;
  readonly content: string;
  readonly sendDate: number | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly genStarted: number | null;
  readonly genFinished: number | null;
  readonly activeVariantIdx: number | null;
  readonly variants: readonly ExportVariant[];
}
