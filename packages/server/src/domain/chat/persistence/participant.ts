// domain/chat/persistence/participant — the `chat_participants` actor-XOR parser + the membership-lifecycle
// writes (chat.md Part III §1). QUERIES ONLY: the XOR/UNIQUE/atomic-upsert are DB-level invariants this layer
// enforces; the POLICY (who may join/kick/hand-off, targeting checks, AUTH_MODE gating) is the verbs'.
//
// THE RE-ADD UPSERT (Part III §1): a human (re)joins via the guarded atomic
// `INSERT … ON CONFLICT(chatId,userId) DO UPDATE SET joinSeq=<current head>, leftSeq=NULL, role='member'
// WHERE leftSeq IS NOT NULL`. The `(chatId,userId)` UNIQUE is the no-duplicate-membership enforcer; the
// `WHERE leftSeq IS NOT NULL` means a still-present member's redeem is a no-op (empty RETURNING). `role` is
// SERVER-FORCED `member` (never client-set) — the host role is only ever minted at chat creation / handoff.
//
// `joinSeq`/`leftSeq` are stamped against `messages.seq` (the join/leave HORIZON — Part III §1), NOT the
// stream cursor; the seq + clock arrive as PARAMS (the verb reads `loadMaxMessageSeq` + its injected clock).

import type { ParticipantKind, ParticipantRole } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { CharacterId, ChatId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

/** The validated participant ACTOR (the kind XOR resolved): exactly one of `userId`/`characterId` per the db
 *  `chat_participants_actor_xor` CHECK. The reserved `observer` kind is NOT wired into the XOR (it carries
 *  neither) — {@link parseParticipant} rejects it. File-local: callers read the inferred discriminant. */
type ParticipantActor =
  | { readonly kind: "human"; readonly userId: UserId }
  | { readonly kind: "character"; readonly characterId: CharacterId };

/** A participant insert row (the lifecycle writers' input). Columns with schema defaults (`talkativeness`/
 *  `disabled`/`joinHistoryVisibility`) are omittable; `joinedAt`/`joinSeq` are caller-stamped (determinism). */
type ParticipantInsertRow = typeof chatParticipants.$inferInsert;

/**
 * Validate + discriminate a `chat_participants` row's actor (the kind XOR — Part III §1; the db CHECK guards
 * the table, this is the parse-seam mirror). A `human` carries `userId` XOR a `character` carries
 * `characterId`; `observer` is reserved (not in the XOR) and the `default` is `never`-exhaustive, so a new
 * `PARTICIPANT_KINDS` member fails to compile until handled. Throws on a corrupt row (the CHECK should make
 * that unreachable).
 */
export function parseParticipant(row: {
  readonly kind: ParticipantKind;
  readonly userId: UserId | null;
  readonly characterId: CharacterId | null;
}): ParticipantActor {
  switch (row.kind) {
    case "human": {
      if (row.userId === null || row.characterId !== null) {
        throw new Error("corrupt participant: kind 'human' must carry userId XOR characterId");
      }
      return { kind: "human", userId: row.userId };
    }
    case "character": {
      if (row.characterId === null || row.userId !== null) {
        throw new Error("corrupt participant: kind 'character' must carry characterId XOR userId");
      }
      return { kind: "character", characterId: row.characterId };
    }
    case "observer": {
      throw new Error("participant kind 'observer' is reserved and not wired into the actor XOR");
    }
    default: {
      const _exhaustive: never = row.kind;
      throw new Error(`unknown participant kind: ${String(_exhaustive)}`);
    }
  }
}

/** Born-compliant guard: a `character` participant is ALWAYS `role='member'` — a character can never be the
 *  host (the host is the one human authority + funding source, D18). The initial-roster builder + the
 *  add-character verb run this before writing (the host role is minted only for a human). */
export function assertForcedCharacterMember(p: {
  readonly kind: ParticipantKind;
  readonly role: ParticipantRole;
}): void {
  if (p.kind === "character" && p.role !== "member") {
    throw new Error(`a character participant must be role 'member' (got '${p.role}')`);
  }
}

/** The present-and-contributing base predicate (Part III §1): `leftSeq IS NULL` ⇒ present (in EVERY union —
 *  WI / roster / arbitration). A left participant is gone from all of them. */
export function isPresent(p: { readonly leftSeq: number | null }): boolean {
  return p.leftSeq === null;
}

/** The arbiter-eligible predicate (Part III §1): present AND not muted. A `disabled` participant still
 *  contributes cards/WI but is never arbiter-selected + is excluded from `{{groupNotMuted}}`. (Offline-human
 *  cast-gating is presence — injected, not a DB column.) */
export function isArbiterEligible(p: {
  readonly leftSeq: number | null;
  readonly disabled: boolean;
}): boolean {
  return p.leftSeq === null && !p.disabled;
}

/** Bulk-insert participant rows (the initial host+character roster, or a host adding a character). A pure
 *  table write; the rows are built by `roster.buildInitialRosterRows` (host action — NOT the invite chokepoint,
 *  which is human-only via {@link upsertMemberOnJoin}). No-op on an empty list. */
export async function insertParticipants(
  db: Db,
  rows: readonly ParticipantInsertRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db.insert(chatParticipants).values([...rows]);
}

/**
 * The atomic human (re)join — the ONLY human-membership write (called by the invite-redeem chokepoint).
 * Inserts a fresh `member` row, or on a `(chatId,userId)` conflict re-joins a PREVIOUSLY-LEFT member
 * (`SET joinSeq=<head>, leftSeq=NULL, role='member' WHERE leftSeq IS NOT NULL`). `role` is server-forced
 * `member`; `joinSeq` is the caller-supplied canon head. Returns the resulting row, or `undefined` when the
 * user is ALREADY a present member (the conflict's `WHERE` matched nothing — an idempotent no-op).
 */
export async function upsertMemberOnJoin(
  db: Db,
  params: {
    readonly participantId: ChatParticipantId;
    readonly chatId: ChatId;
    readonly userId: UserId;
    readonly joinSeq: number;
    readonly now: number;
    readonly activePersonaId?: PersonaId | null;
  },
): Promise<typeof chatParticipants.$inferSelect | undefined> {
  const rows = await db
    .insert(chatParticipants)
    .values({
      id: params.participantId,
      chatId: params.chatId,
      kind: "human",
      userId: params.userId,
      role: "member",
      activePersonaId: params.activePersonaId ?? null,
      joinedAt: params.now,
      joinSeq: params.joinSeq,
    })
    .onConflictDoUpdate({
      target: [chatParticipants.chatId, chatParticipants.userId],
      set: { joinSeq: params.joinSeq, leftSeq: null, role: "member" },
      setWhere: isNotNull(chatParticipants.leftSeq),
    })
    .returning();
  return rows.at(0);
}

/** Self-leave / kick-a-human: stamp `leftSeq` on the caller's PRESENT row (atomic — `WHERE leftSeq IS NULL`,
 *  so only the winning call gets the row back to notify). Authored rows survive; the persona drops from the
 *  cast (Part III §2). Returns the row left this call, or `undefined` if already gone / not a member. */
export async function markUserLeft(
  db: Db,
  chatId: ChatId,
  userId: UserId,
  leftSeq: number,
): Promise<typeof chatParticipants.$inferSelect | undefined> {
  const rows = await db
    .update(chatParticipants)
    .set({ leftSeq })
    .where(
      and(
        eq(chatParticipants.chatId, chatId),
        eq(chatParticipants.userId, userId),
        isNull(chatParticipants.leftSeq),
      ),
    )
    .returning();
  return rows.at(0);
}

/** Kick ANY participant by id (host action — works for a character too, which has no `userId`). Atomic on the
 *  still-present row. Returns the row left this call, or `undefined` if already gone. */
export async function markParticipantLeft(
  db: Db,
  participantId: ChatParticipantId,
  leftSeq: number,
): Promise<typeof chatParticipants.$inferSelect | undefined> {
  const rows = await db
    .update(chatParticipants)
    .set({ leftSeq })
    .where(and(eq(chatParticipants.id, participantId), isNull(chatParticipants.leftSeq)))
    .returning();
  return rows.at(0);
}

/** Set a participant's `role` (the host-handoff atomic swap — Part III §2; the verb batches the old-host
 *  demotion + the nominee promotion). Returns the updated row, or `undefined` if the id is unknown. */
export async function setParticipantRole(
  db: Db,
  participantId: ChatParticipantId,
  role: ParticipantRole,
): Promise<typeof chatParticipants.$inferSelect | undefined> {
  const rows = await db
    .update(chatParticipants)
    .set({ role })
    .where(eq(chatParticipants.id, participantId))
    .returning();
  return rows.at(0);
}
