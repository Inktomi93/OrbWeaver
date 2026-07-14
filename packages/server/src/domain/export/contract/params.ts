// domain/export/contract/params — every verb's *Params, declared once. Every verb carries the resolved
// principal; ownership is scoped off principal.userId (never a users read — no-direct-users-read gate).

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";

export type ExportChatFormat = "jsonl" | "txt";

interface ExportActorParams {
  readonly principal: Principal;
}

export interface ExportCharacterParams extends ExportActorParams {
  readonly characterId: CharacterId;
}

/** The gate is the roster's host row; a non-host or missing chat returns null → 404. format defaults to jsonl. */
export interface ExportChatParams extends ExportActorParams {
  readonly chatId: ChatId;
  readonly format?: ExportChatFormat | undefined;
}
