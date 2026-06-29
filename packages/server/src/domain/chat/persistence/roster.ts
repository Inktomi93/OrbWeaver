// domain/chat/persistence/roster — the roster READ + the initial-membership row BUILDER (chat.md Part I 8-slot
// `persistence/roster.ts`; un-exiled from neo's `_shared/group-character-rows`). QUERIES ONLY: `loadRoster`
// reads the present (or full) `chat_participants` set; `buildInitialRosterRows` is a PURE row builder (no I/O —
// the verb writes them via `participant.insertParticipants`). Name/handle/avatar resolution is the VERB's (no
// `users` join here — the `no-direct-users-read` chokepoint); this returns the raw rows.

import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { CharacterId, ChatId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import { and, asc, eq, isNull } from "drizzle-orm";
import { assertForcedCharacterMember } from "./participant";

type ParticipantInsertRow = typeof chatParticipants.$inferInsert;

/** The roster read (listParticipants / arbitration substrate). Default = PRESENT members only
 *  (`leftSeq IS NULL` — Part III §1); `includePast` returns the full history (kicked/left rows) for the host
 *  audit + `from-join`/`full` visibility resolution. Ordered by join order (`joinSeq`, then row id). */
export async function loadRoster(
  db: Db,
  chatId: ChatId,
  includePast = false,
): Promise<(typeof chatParticipants.$inferSelect)[]> {
  const base = db.select().from(chatParticipants).$dynamic();
  const scoped = includePast
    ? base.where(eq(chatParticipants.chatId, chatId))
    : base.where(and(eq(chatParticipants.chatId, chatId), isNull(chatParticipants.leftSeq)));
  return await scoped.orderBy(asc(chatParticipants.joinSeq), asc(chatParticipants.id));
}

/**
 * Build the initial roster rows for a brand-new chat (Part III §1; solo = a roster of {1 host human, N
 * characters}, byte-identical). The host human is `role='host'` (the ONE authority + funding source, D18);
 * every character is server-forced `role='member'` (guarded by {@link assertForcedCharacterMember}). All rows
 * share `joinSeq` (0 for a born-here chat) + the caller's clock (`now`) — the ids are caller-minted (the verb
 * owns id minting; determinism). PURE — returns the rows; the verb writes them.
 */
export function buildInitialRosterRows(params: {
  readonly chatId: ChatId;
  readonly joinSeq: number;
  readonly now: number;
  readonly host: {
    readonly participantId: ChatParticipantId;
    readonly userId: UserId;
    readonly activePersonaId?: PersonaId | null;
  };
  readonly characters: readonly {
    readonly participantId: ChatParticipantId;
    readonly characterId: CharacterId;
  }[];
}): ParticipantInsertRow[] {
  const hostRow: ParticipantInsertRow = {
    id: params.host.participantId,
    chatId: params.chatId,
    kind: "human",
    userId: params.host.userId,
    role: "host",
    activePersonaId: params.host.activePersonaId ?? null,
    joinedAt: params.now,
    joinSeq: params.joinSeq,
  };
  const characterRows = params.characters.map((c): ParticipantInsertRow => {
    assertForcedCharacterMember({ kind: "character", role: "member" });
    return {
      id: c.participantId,
      chatId: params.chatId,
      kind: "character",
      characterId: c.characterId,
      role: "member",
      joinedAt: params.now,
      joinSeq: params.joinSeq,
    };
  });
  return [hostRow, ...characterRows];
}
