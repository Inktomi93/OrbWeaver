// .int tests for the two character-owned refinery ops: the owned-card read (foreign collapses to
// undefined — the consumer's leak-free NOT_FOUND source) and the merge-stamp (independent halves; the
// owner predicate IN THE WHERE — a foreign stamp writes NOTHING, the injected-op-caller-gate pin).

import type { RefineryAnalyzePayload } from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { createLoadOwnedCard, createStampRefinerySignals } from "../../../../../packages/server/src/domain/character/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

async function seedCard(db: Db, ownerId: UserId, key: string): Promise<CharacterId> {
  const id = castId<CharacterId>(`character_${key}`);
  await db.insert(characters).values({
    id,
    ownerId,
    handle: castId<CharacterHandle>(key),
    name: "Aria",
    description: "keeps the ledger",
    contentHash: key,
  });
  return id;
}

const ANALYSIS: RefineryAnalyzePayload = {
  preserved: ["voice"],
  lost: [],
  gained: [],
  soulScore: 9,
  soulAssessment: "intact",
  verdict: "ACCEPT",
  issues: [],
  recommendations: [],
};

test("createLoadOwnedCard: the owned card projects whole; foreign and absent collapse to undefined", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("ops-owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("ops-stranger") });
  const characterId = await seedCard(db, owner.id, "ops_read");
  const load = createLoadOwnedCard({ db });

  const card = await load({ ownerId: owner.id, characterId });
  expect(card?.name).toBe("Aria");
  expect(card?.description).toBe("keeps the ledger");
  expect(card?.refinery).toBeNull();
  expect(await load({ ownerId: stranger.id, characterId })).toBeUndefined();
  expect(await load({ ownerId: owner.id, characterId: castId<CharacterId>("character_phantom") })).toBeUndefined();
});

test("createStampRefinerySignals: halves merge independently; a foreign stamp writes NOTHING", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("ops-owner2") });
  const stranger = await seedUser(db, { handle: castId<Handle>("ops-stranger2") });
  const characterId = await seedCard(db, owner.id, "ops_stamp");
  const stamp = createStampRefinerySignals({ db });

  // Score half first…
  await stamp({ ownerId: owner.id, characterId, patch: { score: 6.5 } });
  let row = (await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.refinery).toEqual({ score: 6.5, analysis: null });
  // …the analysis half MERGES over it (never replaces it)…
  await stamp({ ownerId: owner.id, characterId, patch: { analysis: ANALYSIS } });
  row = (await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.refinery).toEqual({ score: 6.5, analysis: ANALYSIS });
  // …and a fresh score refresh keeps the analysis (the other direction).
  await stamp({ ownerId: owner.id, characterId, patch: { score: 8 } });
  row = (await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.refinery).toEqual({ score: 8, analysis: ANALYSIS });

  // The caller gate: a stranger's stamp is a silent no-op (the WHERE carries the owner predicate).
  await stamp({ ownerId: stranger.id, characterId, patch: { score: 1 } });
  row = (await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.refinery).toEqual({ score: 8, analysis: ANALYSIS });
});
