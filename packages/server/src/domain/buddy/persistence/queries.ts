// domain/buddy/persistence/queries — all db access for buddies/buddy_turns/buddy_quips. Ids + timestamps
// are supplied by the caller (the injected determinism seam) — persistence never mints an id or reads the clock.

import type { CompanionStats, Mood } from "@orb/contracts/buddy";
import type { Db } from "@orb/db";
import { buddies, buddyQuips, buddyTurns } from "@orb/db";
import type { BuddyQuipId, BuddyTurnId, UserId } from "@orb/kit/ids";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { BuddyTurnRole, BuddyTurnView } from "../contract/results";
import type { BuddyView } from "../contract/views";
import { bondTierOf, formOf, stageOf } from "../substrate/mood";
import { roll } from "../substrate/roll";

type BuddyRow = typeof buddies.$inferSelect;
type BuddyTurnRow = typeof buddyTurns.$inferSelect;
type BuddyQuipRow = typeof buddyQuips.$inferSelect;

export async function loadBuddy(db: Db, userId: UserId): Promise<BuddyRow | null> {
  const rows = await db.select().from(buddies).where(eq(buddies.userId, userId)).limit(1);
  return rows[0] ?? null;
}

/** Bond tier/stage/form are derived from stats+bondXp; mood decay is applied by callers at read-time. */
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

/** Deterministic body from the user id + neutral defaults; shared by get/setReactions/setAgency. */
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

/** Throws on a PK collision (the idempotent-hatch race — the verb catches it and reloads the winner). */
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

export async function renameBuddy(
  db: Db,
  userId: UserId,
  name: string,
  now: number,
): Promise<void> {
  await db.update(buddies).set({ name, updatedAt: now }).where(eq(buddies.userId, userId));
}

/** Server-side sql increment, not read-modify-write — the row may have been read before a multi-second turn. */
export async function growBond(db: Db, userId: UserId, amount: number, now: number): Promise<void> {
  await db
    .update(buddies)
    .set({ bondXp: sql`${buddies.bondXp} + ${amount}`, updatedAt: now })
    .where(eq(buddies.userId, userId));
}

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

/** The id tiebreak is load-bearing: two turns can land in the same millisecond (frozen-clock tests always
 *  equal), and BuddyTurnId is ms-sortable + minted in write order, so desc(id) preserves user-before-assistant. */
export async function loadTurns(db: Db, userId: UserId, limit: number): Promise<BuddyTurnRow[]> {
  const rows = await db
    .select()
    .from(buddyTurns)
    .where(eq(buddyTurns.userId, userId))
    .orderBy(desc(buddyTurns.createdAt), desc(buddyTurns.id))
    .limit(limit);
  return rows.reverse();
}

export async function clearTurns(db: Db, userId: UserId): Promise<number> {
  const removed = await db.delete(buddyTurns).where(eq(buddyTurns.userId, userId)).returning();
  return removed.length;
}

export function turnToView(row: BuddyTurnRow): BuddyTurnView {
  return {
    id: row.id,
    role: row.role === "user" ? "you" : "buddy",
    text: row.content,
    createdAt: row.createdAt,
  };
}

/** Optimistic-CAS reactor write, gated on the loaded updatedAt. Returns false when a racing reaction moved
 *  it first (the reactor reloads + recomputes). stats is read-modify-write, which is why the whole write
 *  is CAS-gated: a lost stats update ⇒ 0 rows ⇒ recompute. */
export async function casReact(
  db: Db,
  args: {
    readonly userId: UserId;
    readonly expectedUpdatedAt: number;
    readonly mood: Mood;
    readonly stats: CompanionStats;
    readonly bondDelta: number;
    readonly lastSignalKey: string;
    readonly now: number;
  },
): Promise<boolean> {
  const moved = await db
    .update(buddies)
    .set({
      mood: args.mood,
      stats: args.stats,
      bondXp: sql`${buddies.bondXp} + ${args.bondDelta}`,
      lastReactionAt: args.now,
      lastSignalKey: args.lastSignalKey,
      updatedAt: args.now,
    })
    .where(and(eq(buddies.userId, args.userId), eq(buddies.updatedAt, args.expectedUpdatedAt)))
    .returning({ userId: buddies.userId });
  return moved.length > 0;
}

/** signalKind is the triggering BuddySignalKind stored as free text (\@orb/db cannot import the domain-internal union). */
export async function insertQuip(
  db: Db,
  quip: {
    readonly id: BuddyQuipId;
    readonly userId: UserId;
    readonly text: string;
    readonly signalKind: string;
    readonly mood: Mood;
    readonly fromCanned: boolean;
    readonly generatedAt: number;
  },
): Promise<void> {
  await db.insert(buddyQuips).values(quip);
}

export async function loadRecentQuips(
  db: Db,
  userId: UserId,
  limit: number,
): Promise<BuddyQuipRow[]> {
  return await db
    .select()
    .from(buddyQuips)
    .where(eq(buddyQuips.userId, userId))
    .orderBy(desc(buddyQuips.generatedAt), desc(buddyQuips.id))
    .limit(limit);
}

/** Two queries rather than a correlated DELETE subquery — libSQL has no DELETE ... LIMIT. */
export async function sweepQuips(db: Db, userId: UserId, keep: number): Promise<number> {
  const survivors = await db
    .select({ id: buddyQuips.id })
    .from(buddyQuips)
    .where(eq(buddyQuips.userId, userId))
    .orderBy(desc(buddyQuips.generatedAt), desc(buddyQuips.id))
    .limit(keep);
  const keepIds = survivors.map((r) => r.id);
  const removed = await db
    .delete(buddyQuips)
    .where(and(eq(buddyQuips.userId, userId), notInArray(buddyQuips.id, keepIds)))
    .returning({ id: buddyQuips.id });
  return removed.length;
}
