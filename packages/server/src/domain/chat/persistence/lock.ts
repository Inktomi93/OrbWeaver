// domain/chat/persistence/lock — the per-chat turn lock (chat.md §Decisions: "the chat turn lock home —
// RESOLVED: chat/persistence/lock.ts"). A DB-backed concurrency primitive over the `chat_locks` table
// (natural PK = `chatId`), the EXPLICIT named exception to "persistence is queries only" (inv #13): it does
// INSERT/UPDATE/DELETE, not just reads, because it IS the concurrency mechanism, co-located with the table it
// guards. Multi-replica-aware via a TTL horizon (`expiresAt`) + a `holder` tag; a stale lock is takeover-
// eligible. Determinism: `now`/`expiresAt` arrive as PARAMS (the verb's injected clock + the LOCK_TTL_MS it
// owns — the TTL constant is a domain concern, not a schema one).
//
// Home DECIDED (PD-62, closed 2026-07-01): the old "candidate → infra" target was ILLEGAL under the
// `infra-no-db` dep-cruiser law (a DB-backed primitive cannot live in infra — the proof case is
// `oidc-store.ts`, which moved OUT of infra for exactly this). The lock stays domain-local; promote to
// `@orb/db/kit` ONLY iff a second domain ever needs a DB lock (Alex-doctrine YAGNI).

import type { Db } from "@orb/db";
import { chatLocks } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, eq, lte } from "drizzle-orm";

/**
 * Try to acquire the per-chat turn lock. Inserts the lock row, or on a `chatId` conflict STEALS it ONLY when
 * the incumbent is stale (`expiresAt <= now` — the `setWhere` guard); a fresh held lock makes the conflict a
 * no-op (empty RETURNING). Returns `true` iff this caller now holds it. The `holder` identifies the
 * replica/turn for takeover diagnostics + the holder-scoped {@link releaseLock}.
 */
export async function tryAcquireLock(
  db: Db,
  params: {
    readonly chatId: ChatId;
    readonly holder: string;
    readonly now: number;
    readonly expiresAt: number;
  },
): Promise<boolean> {
  const acquired = await db
    .insert(chatLocks)
    .values({
      chatId: params.chatId,
      holder: params.holder,
      acquiredAt: params.now,
      expiresAt: params.expiresAt,
    })
    .onConflictDoUpdate({
      target: chatLocks.chatId,
      set: { holder: params.holder, acquiredAt: params.now, expiresAt: params.expiresAt },
      setWhere: lte(chatLocks.expiresAt, params.now),
    })
    .returning({ chatId: chatLocks.chatId });
  return acquired.length > 0;
}

/** Extend the lock's TTL during a long turn — ONLY while THIS holder still owns it (the `holder` guard stops a
 *  caller from refreshing a lock that was stolen out from under it). Returns `true` iff it refreshed. */
export async function refreshLock(
  db: Db,
  chatId: ChatId,
  holder: string,
  expiresAt: number,
): Promise<boolean> {
  const refreshed = await db
    .update(chatLocks)
    .set({ expiresAt })
    .where(and(eq(chatLocks.chatId, chatId), eq(chatLocks.holder, holder)))
    .returning({ chatId: chatLocks.chatId });
  return refreshed.length > 0;
}

/** Release the lock — ONLY if THIS holder owns it (a stolen lock is left for its new holder, never deleted out
 *  from under them). Idempotent: a no-op if already released/stolen. */
export async function releaseLock(db: Db, chatId: ChatId, holder: string): Promise<void> {
  await db.delete(chatLocks).where(and(eq(chatLocks.chatId, chatId), eq(chatLocks.holder, holder)));
}

/** Boot reclaim (`reclaimChatLocksOnBoot`): clear every lock this replica's `holder` orphaned when it last
 *  crashed (its in-flight turns are dead, so the locks are stale-by-intent regardless of TTL). Other replicas'
 *  live locks are untouched (the `holder` scope); cross-replica staleness is handled by the TTL steal in
 *  {@link tryAcquireLock}. Returns how many locks were reclaimed. */
export async function reclaimChatLocksOnBoot(db: Db, holder: string): Promise<number> {
  const reclaimed = await db
    .delete(chatLocks)
    .where(eq(chatLocks.holder, holder))
    .returning({ chatId: chatLocks.chatId });
  return reclaimed.length;
}
