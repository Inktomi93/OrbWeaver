// domain/chat/persistence/participants-read — the participants READ + the initial-membership row BUILDER
// (un-exiled from neo's `_shared/group-character-rows`). The `-read` half of the name is load-bearing: the
// WRITE half of `chat_participants` is the sibling `participant.ts` (the kind-shape parser + the
// membership-lifecycle writes), and the two were named one letter apart before #1010 split them by verb.
// QUERIES ONLY: `loadParticipants`
// reads the present (or full) `chat_participants` set; `buildInitialParticipantRows` is a PURE row builder (no I/O —
// the verb writes them via `participant.insertParticipants`). Name/handle/avatar resolution is the VERB's (no
// `users` join here — the `no-direct-users-read` chokepoint); this returns the raw rows.

import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { CharacterId, ChatId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { assertForcedCharacterMember } from "./participant.ts";

/** How many rows an existence probe needs. */
const LIMIT_ONE = 1;

/** The caller's PRESENT participant role in a chat (`leftSeq IS NULL`), or `null` — not a present member OR
 *  no such chat, collapsed into one leak-free answer. The narrow membership read behind the injected
 *  `getMembership` op (rpg's `can()` feed, rpg-design/02 §1.1 #3); rpg never reads `chat_participants` itself. */
export async function loadPresentRole(db: Db, chatId: ChatId, userId: UserId): Promise<ParticipantRole | null> {
  const rows = await db
    .select({ role: chatParticipants.role })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .limit(LIMIT_ONE);
  return rows.at(0)?.role ?? null;
}

/** The caller's PRESENT participant row narrowed to the three columns a VISIBILITY verdict is derived from —
 *  the role plus the D16 horizon pair (`joinSeq` + `joinHistoryVisibility`) the ONE clamp resolver consumes.
 *  `null` = not a present member OR no such chat (the same leak-free collapse as {@link loadPresentRole}).
 *  Deliberately raw: the policy→number derivation stays in `substrate/auth/clamp`, so this file cannot become
 *  a second clamp home. Backs the injected `resolveViewerVisibility` op (`verbs/resolve-viewer-visibility`). */
export async function loadPresentVisibilityRow(
  db: Db,
  chatId: ChatId,
  userId: UserId,
): Promise<Pick<typeof chatParticipants.$inferSelect, "role" | "joinSeq" | "joinHistoryVisibility"> | null> {
  const rows = await db
    .select({ role: chatParticipants.role, joinSeq: chatParticipants.joinSeq, joinHistoryVisibility: chatParticipants.joinHistoryVisibility })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .limit(LIMIT_ONE);
  return rows.at(0) ?? null;
}

/** The BATCHED twin of {@link loadPresentVisibilityRow}: one viewer's present participant row across a SET
 *  of chats, in ONE read (the listing projections resolve a per-caller floor for every row on the page — a
 *  per-chat call would be the N+1 the `loadChatMessageStats` precedent exists to avoid). Same three raw
 *  columns, same policy home (`substrate/auth/clamp` derives the number); a chat the viewer is not a present
 *  member of is ABSENT from the map, which the caller must read fail-closed (never "floor 0"). */
export async function loadPresentVisibilityRows(
  db: Db,
  chatIds: readonly ChatId[],
  userId: UserId,
): Promise<Map<ChatId, Pick<typeof chatParticipants.$inferSelect, "role" | "joinSeq" | "joinHistoryVisibility">>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local lookup map for the per-chat viewer verdict
  const out = new Map<ChatId, Pick<typeof chatParticipants.$inferSelect, "role" | "joinSeq" | "joinHistoryVisibility">>();
  if (chatIds.length === 0) {
    return out;
  }
  const rows = await db
    .select({
      chatId: chatParticipants.chatId,
      role: chatParticipants.role,
      joinSeq: chatParticipants.joinSeq,
      joinHistoryVisibility: chatParticipants.joinHistoryVisibility,
    })
    .from(chatParticipants)
    .where(and(inArray(chatParticipants.chatId, [...chatIds]), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)));
  for (const { chatId, ...verdict } of rows) {
    out.set(chatId, verdict);
  }
  return out;
}

type ParticipantInsertRow = typeof chatParticipants.$inferInsert;

/** The roster read (listParticipants / arbitration substrate). Default = PRESENT members only
 *  (`leftSeq IS NULL` — Part III §1); `includePast` returns the full history (kicked/left rows) for the host
 *  audit + `from-join`/`full` visibility resolution. Ordered by join order (`joinSeq`, then row id). */
export async function loadParticipants(db: Db, chatId: ChatId, includePast = false): Promise<(typeof chatParticipants.$inferSelect)[]> {
  const base = db.select().from(chatParticipants).$dynamic();
  const scoped = includePast
    ? base.where(eq(chatParticipants.chatId, chatId))
    : base.where(and(eq(chatParticipants.chatId, chatId), isNull(chatParticipants.leftSeq)));
  return await scoped.orderBy(asc(chatParticipants.joinSeq), asc(chatParticipants.id));
}

/**
 * Does this character hold a `chat_participants` seat in any OTHER chat? The PD-96 first-chat existence
 * probe: `startChat` asks it BEFORE the new room's roster rows commit, so `false` ⇒ this creation is the
 * character's FIRST chat (`StatsDelta.newCharacter`). PAST seats count (`leftSeq` is NOT filtered) — the
 * stats rebuild's per-character chat aggregation joins `chat_participants` without a presence filter, and
 * the live delta must mirror the rebuild (the drift-gate contract). `excludeChatId` is a belt: the claim
 * chokepoint asks AFTER the room's own seats exist, so excluding them is what makes the answer "any OTHER".
 *
 * HUSKS DO NOT COUNT (R0 §4.7): the seat's chat must be CLAIMED (`chats.started_at` NOT NULL). Without this
 * join a husk seating a character would make the next REAL chat read "not first" and the `newCharacter` bump
 * would be lost forever — even after the husk reaps. The rebuild's chat aggregations carry the SAME arm
 * (`domain/stats/write/rebuild-from-canon.ts`), because the drift-gate contract above binds BOTH writers:
 * fixing one side alone is a guaranteed reconcile diff the moment any husk exists.
 */
export async function characterSeatedInAnotherChat(db: Db, characterId: CharacterId, excludeChatId: ChatId): Promise<boolean> {
  const rows = await db
    .select({ id: chatParticipants.id })
    .from(chatParticipants)
    .innerJoin(chats, eq(chats.id, chatParticipants.chatId))
    .where(and(eq(chatParticipants.characterId, characterId), ne(chatParticipants.chatId, excludeChatId), isNotNull(chats.startedAt)))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/**
 * Has this character EVER held a seat in THIS chat — present OR left? The #1147 census idempotency probe:
 * `addCharacterToChat` credits the room to the joining character's `character_stats.chats` only on a seat
 * the room has never held before.
 *
 * PAST SEATS COUNT, and that is the whole point. A removed character keeps its `chat_participants` row with
 * `leftSeq` stamped (era-per-row, F8), so a re-add mints a SECOND row for the same pair — while the rebuild
 * counts `COUNT(DISTINCT cp.chat_id)`, which stays 1. A presence-filtered probe here would push a second
 * `+1` on the re-add and drift the live census above the rebuild forever.
 *
 * Asked BEFORE the new seat's row commits, so `true` means "some earlier seat", never "the one I am adding".
 */
export async function characterEverSeatedInChat(db: Db, characterId: CharacterId, chatId: ChatId): Promise<boolean> {
  const rows = await db
    .select({ id: chatParticipants.id })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.characterId, characterId), eq(chatParticipants.chatId, chatId)))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/**
 * Build the initial roster rows for a brand-new chat (Part III §1; solo = a roster of `{1 host human, N characters}`,
 * byte-identical). The host human is `role='host'` (the ONE authority + funding source, D18);
 * every character is server-forced `role='member'` (guarded by {@link assertForcedCharacterMember}). All rows
 * share `joinSeq` (0 for a born-here chat) + the caller's clock (`now`) — the ids are caller-minted (the verb
 * owns id minting; determinism). PURE — returns the rows; the verb writes them.
 */
export function buildInitialParticipantRows(params: {
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
    /** Pre-send roster tuning (draft carry) applied at founding — omitted ⇒ the column default. */
    readonly disabled?: boolean | undefined;
    readonly talkativeness?: number | undefined;
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
      // Pre-send roster tuning (draft carry) — omitted ⇒ the column default (byte-identical).
      ...(c.disabled === undefined ? {} : { disabled: c.disabled }),
      ...(c.talkativeness === undefined ? {} : { talkativeness: c.talkativeness }),
    };
  });
  return [hostRow, ...characterRows];
}
