// .int tests for the two character-owned refinery ops: the owned-card read (foreign collapses to
// undefined — the consumer's leak-free NOT_FOUND source) and the merge-stamp (independent halves; the
// owner predicate IN THE WHERE — a foreign stamp writes NOTHING, the injected-op-caller-gate pin).

import type { CharacterCard } from "@orb/contracts/character";
import type { RefineryAnalyzePayload } from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import { characterSnapshots, characters } from "@orb/db";
import type { CharacterHandle, CharacterId, CharacterSnapshotId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { createDeleteSnapshot, createLoadOwnedCard, createStampRefinerySignals } from "../../../../../packages/server/src/domain/character/index.ts";
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

test("createStampRefinerySignals: two CONCURRENT stamps of the independent halves both survive", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("ops-owner3") });
  const characterId = await seedCard(db, owner.id, "ops_race");
  const stamp = createStampRefinerySignals({ db });

  // A score run and an analyze run are legitimate concurrent workloads. Under the read-merge-write this
  // op used to do, both read the same blob and whoever wrote second clobbered the other's half —
  // silently, with no error anywhere. Interleaved here the way the two workloads interleave in production.
  await Promise.all([stamp({ ownerId: owner.id, characterId, patch: { score: 7 } }), stamp({ ownerId: owner.id, characterId, patch: { analysis: ANALYSIS } })]);

  const row = (await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.refinery).toEqual({ score: 7, analysis: ANALYSIS });
});

test("createStampRefinerySignals: an unusable stored blob degrades to the skeleton rather than eating the stamp", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("ops-owner4") });
  const characterId = await seedCard(db, owner.id, "ops_corrupt");
  // A JSON SCALAR in the column: `json_set` on a `$.score` path whose parent is not an object silently
  // drops the write. The SQL heal is the twin of the read seam's field-level `.catch`.
  await db.update(characters).set({ refinery: sql`'"legacy-garbage"'` }).where(eq(characters.id, characterId));

  await createStampRefinerySignals({ db })({ ownerId: owner.id, characterId, patch: { score: 3 } });

  const row = (await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.refinery).toEqual({ score: 3, analysis: null });
});

test("#1571 (train-78, injected-op-caller-param): createDeleteSnapshot retracts the exact row by id + owner; a foreign owner's retraction deletes nothing", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("ops-owner5") });
  const stranger = await seedUser(db, { handle: castId<Handle>("ops-stranger5") });
  const characterId = await seedCard(db, owner.id, "ops_snap");
  const snapshotId = castId<CharacterSnapshotId>("character_snapshot_ops_snap");
  // @orb-waive no-test-fabrication(unknown): the verb under test deletes BY ID + OWNER and never reads the snapshot content — the row's Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // presence is the subject, so a two-field stub is the honest fixture (a full card would assert nothing more).
  const content = { name: "Aria", description: "keeps the ledger" } as unknown as CharacterCard;
  await db.insert(characterSnapshots).values({ id: snapshotId, characterId, content, label: "auto: before refinery apply" });
  const del = createDeleteSnapshot({ db });

  // A foreign owner's retraction deletes NOTHING — the row survives, exactly as a foreign stamp writes
  // nothing (the sibling test above).
  await del({ ownerId: stranger.id, snapshotId, characterId });
  expect(await db.select().from(characterSnapshots).where(eq(characterSnapshots.id, snapshotId))).toHaveLength(1);

  // The real owner's retraction removes exactly that row.
  await del({ ownerId: owner.id, snapshotId, characterId });
  expect(await db.select().from(characterSnapshots).where(eq(characterSnapshots.id, snapshotId))).toHaveLength(0);
});
