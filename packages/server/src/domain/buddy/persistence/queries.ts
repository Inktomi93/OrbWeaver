// domain/buddy/persistence/queries — ALL db access for `buddies` + `buddy_turns` (queries only, no
// business logic). The domain's own tables; the only writer. Projections that call `substrate/mood`
// derived facets stay here (the read shape). The `buddy_quips` queries (insert/sweep/loadRecent) belong
// to the DEFERRED observer — added with it. Ids + timestamps are SUPPLIED by the verb (the injected
// determinism seam: `ctx.newTurnId()`/`ctx.now()`) — `persistence/` never mints an id or reads the clock.

import type { CompanionStats } from "@orb/contracts/buddy";
import type { Db } from "@orb/db";
import { buddies, buddyTurns } from "@orb/db";
import type { BuddyTurnId, UserId } from "@orb/kit/ids";
import { desc, eq, sql } from "drizzle-orm";
import type { BuddyTurnRole, BuddyTurnView } from "../contract/results";
import type { BuddyView } from "../contract/views";
import { bondTierOf, formOf, stageOf } from "../substrate/mood";
import { roll } from "../substrate/roll";

// DB-row types — drizzle-inferred, module-local (NOT exported; `no-inline-types`). Callers infer them.
type BuddyRow = typeof buddies.$inferSelect;
type BuddyTurnRow = typeof buddyTurns.$inferSelect;

/** Load the caller's buddy row, or null if not hatched. */
export async function loadBuddy(db: Db, userId: UserId): Promise<BuddyRow | null> {
  const rows = await db.select().from(buddies).where(eq(buddies.userId, userId)).limit(1);
  return rows[0] ?? null;
}

/** Map a stored row to the hatched view. Bones reassemble from the snapshot columns; bond tier / stage /
 *  form are DERIVED from the (mutable) stats + bondXp. Mood decay is applied by callers (read-time). The
 *  view's `hatchedAt` is the row's `createdAt` (the row is created at hatch; there is no separate column). */
export function rowToView(row: BuddyRow): BuddyView {
  return {
    status: "hatched",
    bones: {
      rarity: row.rarity,
      species: row.species,
      eye: row.eye,
      hat: row.hat,
      shiny: row.shiny,
      stats: row.stats,
    },
    name: row.name,
    personality: row.personality,
    hatchedAt: row.createdAt,
    mood: row.mood,
    reactionsEnabled: row.reactionsEnabled,
    agencyEnabled: row.agencyEnabled,
    bondTier: bondTierOf(row.bondXp),
    stage: stageOf(row.stats),
    form: formOf(row.stats),
  };
}

/** The pre-hatch preview view — deterministic body from the user id + neutral defaults. Shared by
 *  `get`/`setReactions`/`setAgency` so the unhatched shape lives in one place. */
export function previewView(userId: UserId): BuddyView {
  const bones = roll(userId).bones;
  return {
    status: "unhatched",
    bones,
    name: null,
    personality: null,
    hatchedAt: null,
    mood: "content",
    reactionsEnabled: true,
    agencyEnabled: true,
    bondTier: "stranger",
    stage: stageOf(bones.stats),
    form: formOf(bones.stats),
  };
}

/** The row a `hatch` insert writes. Module-local (callers infer); built by the verb, written here. */
interface NewBuddyRow {
  readonly userId: UserId;
  readonly name: string;
  readonly personality: string;
  readonly rarity: BuddyRow["rarity"];
  readonly species: BuddyRow["species"];
  readonly eye: BuddyRow["eye"];
  readonly hat: BuddyRow["hat"];
  readonly shiny: boolean;
  readonly stats: CompanionStats;
  readonly createdAt: number;
}

/** Insert the hatched buddy row. The caller supplies the rolled/authored values + `createdAt`; the
 *  reaction/agency columns take their schema defaults. Throws on a PK collision (the idempotent-hatch
 *  race — the verb catches it and reloads the winner). */
export async function insertBuddy(db: Db, row: NewBuddyRow): Promise<void> {
  await db.insert(buddies).values({
    userId: row.userId,
    name: row.name,
    personality: row.personality,
    rarity: row.rarity,
    species: row.species,
    eye: row.eye,
    hat: row.hat,
    shiny: row.shiny,
    stats: row.stats,
    mood: "content",
    reactionsEnabled: true,
    bondXp: 0,
    agencyEnabled: true,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  });
}

/** Toggle a buddy's boolean flag (`reactionsEnabled` / `agencyEnabled`) + bump `updatedAt`. The caller
 *  has already confirmed the row exists. `now` is the injected clock (the verb supplies it). */
export async function setBuddyFlag(
  db: Db,
  userId: UserId,
  patch: { readonly reactionsEnabled: boolean } | { readonly agencyEnabled: boolean },
  now: number,
): Promise<void> {
  await db
    .update(buddies)
    .set({ ...patch, updatedAt: now })
    .where(eq(buddies.userId, userId));
}

/** Rename a buddy (the `confirm` rename arm) + bump `updatedAt`. */
export async function renameBuddy(
  db: Db,
  userId: UserId,
  name: string,
  now: number,
): Promise<void> {
  await db.update(buddies).set({ name, updatedAt: now }).where(eq(buddies.userId, userId));
}

/** Grow a buddy's relationship XP by `amount` — a SERVER-SIDE `sql` increment (NOT read-modify-write):
 *  the row may have been read before a multi-second turn, so a read+write would lose a concurrent ask's
 *  increment. Bumps `updatedAt`. */
export async function growBond(db: Db, userId: UserId, amount: number, now: number): Promise<void> {
  await db
    .update(buddies)
    .set({ bondXp: sql`${buddies.bondXp} + ${amount}`, updatedAt: now })
    .where(eq(buddies.userId, userId));
}

/** Append one transcript turn. Id + `createdAt` come from the injected determinism seam (the verb). */
export async function appendTurn(
  db: Db,
  turn: {
    readonly id: BuddyTurnId;
    readonly userId: UserId;
    readonly role: BuddyTurnRole;
    readonly content: string;
    readonly createdAt: number;
  },
): Promise<void> {
  await db.insert(buddyTurns).values(turn);
}

/** The caller's transcript, oldest-first. `limit` caps how many of the MOST RECENT turns return (take
 *  them in SQL via DESC + LIMIT, then reverse to the oldest-first order callers expect). */
export async function loadTurns(db: Db, userId: UserId, limit: number): Promise<BuddyTurnRow[]> {
  const rows = await db
    .select()
    .from(buddyTurns)
    .where(eq(buddyTurns.userId, userId))
    .orderBy(desc(buddyTurns.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function clearTurns(db: Db, userId: UserId): Promise<number> {
  const removed = await db.delete(buddyTurns).where(eq(buddyTurns.userId, userId)).returning();
  return removed.length;
}

/** Map a stored turn to the client view (DB `user`→`you`, `assistant`→`buddy`). */
export function turnToView(row: BuddyTurnRow): BuddyTurnView {
  return {
    id: row.id,
    role: row.role === "user" ? "you" : "buddy",
    text: row.content,
    createdAt: row.createdAt,
  };
}
