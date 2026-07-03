// schema/buddy — the per-user Tamagotchi companion (producer = `domain/buddy`). Three tables:
//   • `buddies`     — ONE per user (PK = `userId`, a NATURAL key; no TypeID). The soul (model-authored
//                     once at hatch), the bones (deterministic gacha body, snapshotted then MUTABLE as
//                     stats grow), and the reaction/agency state.
//   • `buddy_turns` — the solo user⇄buddy transcript (the agent conversation; the buddy's egocentric view).
//   • `buddy_quips` — the reaction engine's spoken output (swept to ~20/user; hover-history).
//
// DERIVE-DON'T-RESPELL (db.md §7.4): the bones/mood taxonomy has ONE home,
// `@orb/contracts/buddy`. The enum columns import the canonical tuples (`RARITIES`/`SPECIES`/`HATS`/
// `MOODS`) — never re-spelled — and a CHECK built from the SAME tuple enforces it at the SQL level
// (users.ts pattern); a test-mirror (`tests/db/buddy.int.test.ts`) pins db === contracts.
//
// `eye` is DELIBERATELY a typed-text column, NOT an enum/CHECK — per the `@orb/contracts/buddy` source
// annotation ("Eye (a typed-text column in db, not an enum, but a closed taxonomy axis here)") and the
// neo-tavern precedent. It still carries the `.$type<Eye>()` brand (schema-branding) from the one home.
//
// DERIVED, NEVER STORED: `bondTier`/`stage`/`form` are computed from `bondXp`/`stats` at read
// time — there is NO `bond_tier` column (so `BOND_TIERS`/`STAT_NAMES` are NOT db enum columns; `stats`
// is a JSON `CompanionStats` whose keys ARE the `STAT_NAMES` axis, validated at the read seam, not in SQL).

import type { CompanionStats, Eye } from "@orb/contracts/buddy";
import { HATS, MOODS, RARITIES, SPECIES } from "@orb/contracts/buddy";
import type { BuddyQuipId, BuddyTurnId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// CHECK lists derived from the canonical tuples (NOT re-spelled): `col in ('a', 'b', …)`. A CHECK is
// static DDL and cannot carry bound parameters, so it is built as a raw fragment (users.ts pattern).
const RARITY_CHECK_LIST = RARITIES.map((r) => `'${r}'`).join(", ");
const SPECIES_CHECK_LIST = SPECIES.map((s) => `'${s}'`).join(", ");
const HAT_CHECK_LIST = HATS.map((h) => `'${h}'`).join(", ");
const MOOD_CHECK_LIST = MOODS.map((m) => `'${m}'`).join(", ");

// The default initial mood at hatch (the contract `MOODS` member a fresh buddy wears until the reactor
// moves it). Matches the neo-tavern floor.
const DEFAULT_MOOD = "content";

// The buddy-chat transcript role axis — a buddy-LOCAL closed set (`user`/`assistant`; never `system`,
// so it is NOT `@orb/kit/message-role`'s 3-member `MESSAGE_ROLES`). One local home → column enum + CHECK.
const BUDDY_TURN_ROLES = ["user", "assistant"] as const;
const BUDDY_TURN_ROLE_CHECK_LIST = BUDDY_TURN_ROLES.map((r) => `'${r}'`).join(", ");

// ── buddies — one per user (natural-key PK = userId; FK users CASCADE) ─────────────
export const buddies = sqliteTable(
  "buddies",
  {
    // NATURAL key: exactly one buddy per user (no TypeID). FK users CASCADE — a deleted user takes their
    // buddy (and, transitively, its turns + quips) with them.
    userId: text("user_id")
      .$type<UserId>()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    // ── soul — model-authored once at hatch ──
    name: text("name").notNull(),
    personality: text("personality").notNull(),

    // ── bones — rolled deterministically from the user id at hatch, snapshotted here, then MUTABLE
    //    (stats grow). Enum columns DERIVE the contracts tuples; `eye` is typed-text (see header). ──
    rarity: text("rarity", { enum: RARITIES }).notNull(),
    species: text("species", { enum: SPECIES }).notNull(),
    eye: text("eye").$type<Eye>().notNull(),
    hat: text("hat", { enum: HATS }).notNull(),
    shiny: integer("shiny", { mode: "boolean" }).notNull().default(false),
    stats: text("stats", { mode: "json" }).$type<CompanionStats>().notNull(),

    // ── reaction-engine state ──
    mood: text("mood", { enum: MOODS }).notNull().default(DEFAULT_MOOD),
    // epoch-ms anchor for the reactor cooldown + lazy read-time mood decay; null until the first reaction.
    lastReactionAt: integer("last_reaction_at"),
    // dedup key of the last reacted-to signal (the reactor's "one signal, one quip" throttle).
    lastSignalKey: text("last_signal_key"),
    reactionsEnabled: integer("reactions_enabled", { mode: "boolean" }).notNull().default(true),

    // ── agency / bond ──
    // relationship XP → `bondTierOf` (derived, never stored). Server-side `sql` increment in the reactor.
    bondXp: integer("bond_xp").notNull().default(0),
    // the "hands" kill switch (the capability ceiling — pairs with the propose/confirm gate).
    agencyEnabled: integer("agency_enabled", { mode: "boolean" }).notNull().default(true),

    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // LOAD-BEARING: the reactor's optimistic-CAS write gates the UPDATE on the loaded `updatedAt`
    // (0 rows ⇒ reload + recompute; the deferred observer — proposed/buddy-observer-reaction-engine.md).
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [
    check("buddies_rarity_check", sql.raw(`rarity in (${RARITY_CHECK_LIST})`)),
    check("buddies_species_check", sql.raw(`species in (${SPECIES_CHECK_LIST})`)),
    check("buddies_hat_check", sql.raw(`hat in (${HAT_CHECK_LIST})`)),
    check("buddies_mood_check", sql.raw(`mood in (${MOOD_CHECK_LIST})`)),
  ],
);

// ── buddy_turns — the solo user⇄buddy transcript (PK TypeID `buddy_turn`) ──────────
// FK → buddies.userId CASCADE (a turn cannot exist without a hatched buddy; FK-enforced). The user line
// is INSERTed BEFORE the multi-second agent turn (crash-safety), the assistant line after.
export const buddyTurns = sqliteTable(
  "buddy_turns",
  {
    id: text("id").$type<BuddyTurnId>().primaryKey(),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => buddies.userId, { onDelete: "cascade" }),
    role: text("role", { enum: BUDDY_TURN_ROLES }).notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("buddy_turns_user_created_idx").on(t.userId, t.createdAt),
    check("buddy_turns_role_check", sql.raw(`role in (${BUDDY_TURN_ROLE_CHECK_LIST})`)),
  ],
);

// ── buddy_quips — the reaction engine's spoken output (PK TypeID `buddy_quip`) ──────
// Swept to the newest ~20/user (hover-history; the live bubble is ephemeral SSE). `signalKind` is the
// triggering `BuddySignalKind` — a buddy-LOCAL domain union (`domain/buddy/contract/signals.ts`), which
// `@orb/db` cannot import (db deps = kit + contracts only), so it stays a free typed-text column.
export const buddyQuips = sqliteTable(
  "buddy_quips",
  {
    id: text("id").$type<BuddyQuipId>().primaryKey(),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => buddies.userId, { onDelete: "cascade" }),
    text: text("text").notNull(),
    // The triggering signal's kind (domain-internal `BuddySignalKind`; free text — not a contracts tuple).
    signalKind: text("signal_kind").notNull(),
    mood: text("mood", { enum: MOODS }).notNull(),
    // true = the canned mood-keyed fallback fired (vLLM breaker open); false = model-generated.
    fromCanned: integer("from_canned", { mode: "boolean" }).notNull().default(false),
    generatedAt: integer("generated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("buddy_quips_user_generated_idx").on(t.userId, t.generatedAt),
    check("buddy_quips_mood_check", sql.raw(`mood in (${MOOD_CHECK_LIST})`)),
  ],
);
