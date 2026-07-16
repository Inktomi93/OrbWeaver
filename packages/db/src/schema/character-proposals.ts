// schema/character-proposals — `card_evolution_proposals` (producer: domain/character, D59;
// chat-crew-design/02 §5). CHARACTER-owned, not crew-owned: the proposal is ABOUT the card, its accept
// path writes the card, and its review home is the character page (the tag domain's "proposed = a
// status in the owning domain" precedent). The crew only FILES proposals through
// `character.proposeCardEvolution`; any filer (import pass, human) can use the same verb with zero
// crew involvement. Accept takes a `pre-evolution` character_snapshots snapshot FIRST (D28 — always
// reversible); that lifecycle lands with crew CW1's character verbs — this table is the `0000_baseline`
// rider (decide-before-launch).
//
// WHY a sibling file and not character.ts (where the spec sentence places it): the `chats` provenance
// FK needs chat.ts, and chat.ts imports `characters` — the `noImportCycles` gate (biome, lint-tier
// enforcement) forbids that cycle. A character-named leaf that imports BOTH breaks it; ownership is a
// producer fact, not a file-adjacency fact.
//
// `status` derives `CARD_EVOLUTION_PROPOSAL_STATUSES` (`@orb/contracts/crew`) — drizzle `{ enum }`
// type-side + a tuple-built CHECK SQL-side (never re-spelled; users.ts pattern).

import type { CardEvolutionChange, CrewSpan } from "@orb/contracts/crew";
import { CARD_EVOLUTION_PROPOSAL_STATUSES } from "@orb/contracts/crew";
import type { CardEvolutionProposalId, CharacterId, ChatId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { characters } from "./character";
import { chats } from "./chat";

// CHECK list derived from the canonical tuple (NOT re-spelled) — static DDL fragment.
const STATUS_CHECK_LIST = CARD_EVOLUTION_PROPOSAL_STATUSES.map((status) => `'${status}'`).join(", ");

// card_evolution_proposals — the propose-don't-dispose card-drift queue. Authority DERIVES via
// `characterId → characters.ownerId` (D23 derive, no stamp). `chatId` is PROVENANCE only (which chat's
// play produced it) — SET NULL so the proposal survives chat deletion as history. Supersede is a
// STATUS FLIP, never a delete (the audit trail survives).
export const cardEvolutionProposals = sqliteTable(
  "card_evolution_proposals",
  {
    // TypeID PK (`cardprop_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<CardEvolutionProposalId>().primaryKey(),
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .$type<ChatId>()
      .references(() => chats.id, { onDelete: "set null" }),
    // The typed change list — `{field, op, text, rationale}[]` per `cardEvolutionChangeSchema`,
    // parsed at the read seam. NOT NULL: the changes ARE the proposal (an empty audit files no row).
    changes: text("changes", { mode: "json" }).$type<readonly CardEvolutionChange[]>().notNull(),
    // The transcript span audited — `{fromSeq, toSeq}`. Nullable: a non-crew filer (import pass, a
    // human on the character page) has no transcript span.
    sourceSpan: text("source_span", { mode: "json" }).$type<CrewSpan>(),
    // pending | accepted | dismissed | superseded — derives CARD_EVOLUTION_PROPOSAL_STATUSES.
    status: text("status", { enum: CARD_EVOLUTION_PROPOSAL_STATUSES }).notNull().default("pending"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [
    // ONE pending per (characterId, chatId) — a newer audit SUPERSEDES the old proposal (status flip).
    // SQLite UNIQUE treats NULLs as distinct, so chat-less (deleted-chat / non-crew) pendings coexist —
    // acceptable: the supersede semantic is per-chat-audit by design.
    uniqueIndex("card_evolution_proposals_pending_unique").on(t.characterId, t.chatId).where(sql`status = 'pending'`),
    check("card_evolution_proposals_status_check", sql.raw(`status in (${STATUS_CHECK_LIST})`)),
  ],
);
