// domain/character/persistence/card-evolution-proposals — all `card_evolution_proposals`-table access
// (queries only). The table is CHARACTER-owned (chat-crew-design/02 §5): authority DERIVES via
// `characterId → characters.ownerId` (D23 derive, no stamp), so every owner-scoped read/flip JOINs
// `characters` and pins `characters.ownerId`. `chatId` is provenance only. JSON columns are zod-parsed at
// this read seam (the schema-header discipline). Supersede is a STATUS FLIP, never a delete.

import type { CardEvolutionChange, CardEvolutionProposalStatus, CrewSpan } from "@orb/contracts/crew";
import { cardEvolutionChangeSchema, crewSpanSchema } from "@orb/contracts/crew";
import type { Db } from "@orb/db";
import { cardEvolutionProposals, characters } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { CardEvolutionProposalId, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

const LIMIT_ONE = 1;

const changesParser = z.array(cardEvolutionChangeSchema);
const spanParser = crewSpanSchema.nullable();

/** The read-seam projection of one proposal row (owner-verified upstream via the `characters` join).
 *  File-local: callers consume the inferred return (the verbs map it to the contract view / destructure it),
 *  never the name — so it stays out of a type home (no-inline-types) as a persistence-internal row shape. */
interface CardEvolutionProposalRow {
  readonly id: CardEvolutionProposalId;
  readonly characterId: CharacterId;
  readonly chatId: ChatId | null;
  readonly changes: readonly CardEvolutionChange[];
  readonly sourceSpan: CrewSpan | null;
  readonly status: CardEvolutionProposalStatus;
  readonly createdAt: number;
}

/** A new proposal row — the verb mints `id` + passes its injected clock; changes are pre-validated. */
interface CardEvolutionProposalInsert {
  readonly id: CardEvolutionProposalId;
  readonly characterId: CharacterId;
  readonly chatId: ChatId | null;
  readonly changes: readonly CardEvolutionChange[];
  readonly sourceSpan: CrewSpan | null;
  readonly createdAt: number;
}

function rowOf(raw: {
  id: CardEvolutionProposalId;
  characterId: CharacterId;
  chatId: ChatId | null;
  changes: unknown;
  sourceSpan: unknown;
  status: CardEvolutionProposalStatus;
  createdAt: number;
}): CardEvolutionProposalRow {
  return {
    id: raw.id,
    characterId: raw.characterId,
    chatId: raw.chatId,
    changes: changesParser.parse(raw.changes),
    sourceSpan: spanParser.parse(raw.sourceSpan),
    status: raw.status,
    createdAt: raw.createdAt,
  };
}

const PROPOSAL_COLS = {
  id: cardEvolutionProposals.id,
  characterId: cardEvolutionProposals.characterId,
  chatId: cardEvolutionProposals.chatId,
  changes: cardEvolutionProposals.changes,
  sourceSpan: cardEvolutionProposals.sourceSpan,
  status: cardEvolutionProposals.status,
  createdAt: cardEvolutionProposals.createdAt,
} as const;

/** Insert one proposal, superseding any existing `pending` row for the SAME `(characterId, chatId)` in one
 *  batch (a newer audit wins — the status flip preserves the audit trail). A chat-LESS filing (import/human,
 *  `chatId === null`) never supersedes: SQLite treats NULLs as distinct in the partial unique, so chat-less
 *  pendings coexist by design (the schema header). */
export async function insertOrSupersedeProposal(db: Db, row: CardEvolutionProposalInsert, now: number): Promise<void> {
  const insert = db.insert(cardEvolutionProposals).values({
    id: row.id,
    characterId: row.characterId,
    chatId: row.chatId,
    changes: row.changes,
    sourceSpan: row.sourceSpan,
    status: "pending",
    createdAt: row.createdAt,
  });
  if (row.chatId === null) {
    await insert;
    return;
  }
  const supersede = db
    .update(cardEvolutionProposals)
    .set({ status: "superseded", resolvedAt: now })
    .where(
      and(eq(cardEvolutionProposals.characterId, row.characterId), eq(cardEvolutionProposals.chatId, row.chatId), eq(cardEvolutionProposals.status, "pending")),
    );
  await db.batch(batchMany([supersede, insert]));
}

/** Load one proposal owner-scoped (the `characters.ownerId` join IS the authority gate). Undefined when the
 *  id is unknown OR the character is not the caller's — one leak-free answer. */
export async function loadOwnedProposal(db: Db, ownerId: UserId, proposalId: CardEvolutionProposalId): Promise<CardEvolutionProposalRow | undefined> {
  const rows = await db
    .select(PROPOSAL_COLS)
    .from(cardEvolutionProposals)
    .innerJoin(characters, eq(characters.id, cardEvolutionProposals.characterId))
    .where(and(eq(cardEvolutionProposals.id, proposalId), eq(characters.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  const raw = rows[0];
  return raw === undefined ? undefined : rowOf(raw);
}

/** The character's PENDING proposals (owner-scoped via the join), newest-first — the review surface. */
export async function listPendingProposals(db: Db, ownerId: UserId, characterId: CharacterId): Promise<CardEvolutionProposalRow[]> {
  const rows = await db
    .select(PROPOSAL_COLS)
    .from(cardEvolutionProposals)
    .innerJoin(characters, eq(characters.id, cardEvolutionProposals.characterId))
    .where(and(eq(cardEvolutionProposals.characterId, characterId), eq(characters.ownerId, ownerId), eq(cardEvolutionProposals.status, "pending")))
    .orderBy(desc(cardEvolutionProposals.createdAt));
  return rows.map(rowOf);
}

/** Flip a proposal to a terminal status, but only while still `pending` (idempotent / race-safe). Returns
 *  whether a row was actually flipped. */
export async function resolvePendingProposal(db: Db, proposalId: CardEvolutionProposalId, status: CardEvolutionProposalStatus, now: number): Promise<boolean> {
  const updated = await db
    .update(cardEvolutionProposals)
    .set({ status, resolvedAt: now })
    .where(and(eq(cardEvolutionProposals.id, proposalId), eq(cardEvolutionProposals.status, "pending")))
    .returning({ id: cardEvolutionProposals.id });
  return updated.length > 0;
}
