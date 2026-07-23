// persistence/card-evolution-proposals — the table-level invariants. Real db. Covers: insert + the per-
// (characterId, chatId) supersede (a chat-scoped re-file flips the prior pending; a chat-LESS re-file
// COEXISTS — NULLs are distinct in the partial unique); the owner-scoped load/list (the `characters.ownerId`
// join is the gate — a foreign owner sees nothing); resolvePendingProposal flips ONLY a pending row.

import type { CardEvolutionChange } from "@orb/contracts/crew";
import type { Db } from "@orb/db";
import type { CardEvolutionProposalId, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import {
  insertOrSupersedeProposal,
  listPendingProposals,
  loadOwnedProposal,
  resolvePendingProposal,
} from "../../../../../packages/server/src/domain/character/persistence/card-evolution-proposals.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedChat } from "../../chat/_support.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

const CHANGES: readonly CardEvolutionChange[] = [{ field: "description", op: "append", text: "drift", rationale: "shown" }];

/** Seed one owned character; returns its id + the owner's UserId. */
async function seedCharacter(db: Db): Promise<{ ownerId: UserId; characterId: CharacterId }> {
  const h = makeHarness(db);
  const svc = createCharacterService(h.ctx);
  const owner = await seedUser(db, { handle: "owner" });
  const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });
  return { ownerId: owner, characterId: character.id };
}

const mintId = (): CardEvolutionProposalId => mintTypeId(ID_PREFIX.cardEvolutionProposal);

/** File one proposal for `characterId` (test convenience — mints the id + threads the clock). */
async function file(db: Db, characterId: CharacterId, chatId: ChatId | null, at: number): Promise<CardEvolutionProposalId> {
  const id = mintId();
  await insertOrSupersedeProposal(db, { id, characterId, chatId, changes: CHANGES, sourceSpan: null, createdAt: at }, at);
  return id;
}

describe("persistence/card-evolution-proposals", () => {
  test("a chat-scoped re-file supersedes the prior pending; a chat-less re-file coexists", async () => {
    const db = await freshDb();
    const { ownerId, characterId } = await seedCharacter(db);
    const chatId = await seedChat(db, "prov");

    const a = await file(db, characterId, chatId, FROZEN_AT_MS);
    const b = await file(db, characterId, chatId, FROZEN_AT_MS + 1);
    // Two chat-less filings coexist (NULLs distinct in the partial unique).
    const c = await file(db, characterId, null, FROZEN_AT_MS + 2);
    const d = await file(db, characterId, null, FROZEN_AT_MS + 3);

    const pending = await listPendingProposals(db, ownerId, characterId);
    const ids = pending.map((p) => p.id);
    expect(ids).not.toContain(a); // superseded by b
    expect(ids).toEqual(expect.arrayContaining([b, c, d]));
    expect(ids).toHaveLength(3);
  });

  test("loadOwnedProposal is owner-scoped — a foreign owner sees undefined", async () => {
    const db = await freshDb();
    const { ownerId, characterId } = await seedCharacter(db);
    const stranger = await seedUser(db, { handle: "stranger" });
    const id = await file(db, characterId, null, FROZEN_AT_MS);

    expect((await loadOwnedProposal(db, ownerId, id))?.id).toBe(id);
    expect(await loadOwnedProposal(db, stranger, id)).toBeUndefined();
  });

  test("resolvePendingProposal flips only a pending row (idempotent on a resolved one)", async () => {
    const db = await freshDb();
    const { characterId } = await seedCharacter(db);
    const id = await file(db, characterId, null, FROZEN_AT_MS);

    expect(await resolvePendingProposal(db, id, "accepted", FROZEN_AT_MS)).toBe(true);
    // A second flip finds no pending row → false (never double-resolves).
    expect(await resolvePendingProposal(db, id, "dismissed", FROZEN_AT_MS)).toBe(false);
  });
});
