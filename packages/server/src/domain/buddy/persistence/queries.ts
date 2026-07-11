// domain/buddy/persistence/queries — ALL db access for `buddies` + `buddy_turns` + `buddy_quips` (queries
// only, no business logic). The domain's own tables; the only writer. Projections that call `substrate/mood`
// derived facets stay here (the read shape). The `buddy_quips` queries (insert/loadRecent/sweep) + the
// reactor's optimistic-CAS write (`casReact`) are the observer's persistence (PD-45/PD-64). Ids + timestamps
// are SUPPLIED by the caller (the injected determinism seam: `ctx.newTurnId()`/`env.newQuipId()`/`now()`) —
// `persistence/` never mints an id or reads the clock.

import type { CompanionStats, Mood } from "@orb/contracts/buddy";
import type { Db } from "@orb/db";
import { buddies, buddyQuips, buddyTurns } from "@orb/db";
import type { BuddyQuipId, BuddyTurnId, UserId } from "@orb/kit/ids";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { BuddyTurnRole, BuddyTurnView } from "../contract/results";
import type { BuddyView } from "../contract/views";
import { bondTierOf, formOf, stageOf } from "../substrate/mood";
import { roll } from "../substrate/roll";

// DB-row types — drizzle-inferred, module-local (NOT exported; `no-inline-types`). Callers infer them.
type BuddyRow = typeof buddies.$inferSelect;
type BuddyTurnRow = typeof buddyTurns.$inferSelect;
type BuddyQuipRow = typeof buddyQuips.$inferSelect;

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
 *  them in SQL via DESC + LIMIT, then reverse to the oldest-first order callers expect). The `id` tiebreak is
 *  LOAD-BEARING: `ask` writes the user + assistant lines with two separate `ctx.now()` calls that can land in
 *  the SAME millisecond (fast/scripted turns; a frozen-clock test makes them ALWAYS equal), leaving equal-
 *  `createdAt` pairs with SQL-undefined order — which would swap the pair (assistant before the user that
 *  prompted it) in both `history` + the `ask` seed prompt. `BuddyTurnId` is ms-sortable + minted in write
 *  order (user \< assistant), so `desc(id)` here reverses to `asc(id)` → the user line precedes the assistant. */
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

/** Map a stored turn to the client view (DB `user`→`you`, `assistant`→`buddy`). */
export function turnToView(row: BuddyTurnRow): BuddyTurnView {
  return {
    id: row.id,
    role: row.role === "user" ? "you" : "buddy",
    text: row.content,
    createdAt: row.createdAt,
  };
}

// ── The observer reaction engine's writes/reads (PD-45 / PD-64) ──────────────────────────────────────

/** The optimistic-CAS reactor write: apply ONE reaction (mood + stat nudge + bond growth + the dedup/
 *  cooldown anchors) to the `buddies` row, gated on the loaded `updatedAt`. Returns `true` when the row
 *  was still at `expectedUpdatedAt` (the write landed), `false` when a racing reaction moved it first (the
 *  reactor reloads + recomputes — the bounded retry). `bondXp` is a SERVER-SIDE `sql` increment (never
 *  read-modify-write — the same reason as {@link growBond}), so a concurrent bond grant is never lost even
 *  when the CAS itself succeeds. `stats` IS a read-modify-write (the caller computed the nudged map from the
 *  same loaded row), which is why the whole write is CAS-gated: a lost stats update ⇒ 0 rows ⇒ recompute. */
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

/** Append one reaction quip (the observer's spoken output). Id + `generatedAt` come from the injected
 *  determinism seam (the observer env). `signalKind` is the triggering `BuddySignalKind` (free text — the
 *  domain-internal union `@orb/db` cannot import; schema/buddy.ts). */
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

/** The caller's most-recent quips, newest-first (hover-history hydration; the live bubble is the SSE bus). */
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

/** Sweep a user's quip log down to the newest `keep` (schema/buddy.ts: "swept to ~20/user"). Two queries
 *  (find the survivors' ids, then delete the rest) rather than a correlated DELETE subquery — libSQL has no
 *  `DELETE … LIMIT`, and the survivor set is tiny. Returns the number deleted. */
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
