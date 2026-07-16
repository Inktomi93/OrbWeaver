// .int tests for schema/roster-preset (D61 — the saved-rosters baseline rider). Real libSQL :memory: via
// freshDb (FK PRAGMA ON). Covers: roster_presets round-trip + born defaults; unique(ownerId, name) (dupe
// collides, same name across owners OK); owner CASCADE; anchorPersonaId SET NULL on persona delete;
// roster_preset_members composite PK (dupe collides), position/disabled, and BOTH CASCADEs (preset delete
// wipes members; character delete drops the member row but the preset survives — D23 derive-not-stamp).

import type { Db } from "@orb/db";
import { characters, isConstraintViolation, personas, rosterPresetMembers, rosterPresets, users } from "@orb/db";
import type { CharacterId, PersonaId, RosterPresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

// `.toSatisfy` needs a `=> boolean`; `isConstraintViolation` returns the violation|undefined, so wrap it.
function isConstraintErr(err: unknown): boolean {
  return isConstraintViolation(err) !== undefined;
}

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: `card-${id}`,
    ownerId,
    contentHash: "hash",
    name: "Card",
  });
  return characterId;
}

async function seedPreset(db: Db, ownerId: UserId, id: string, name: string): Promise<RosterPresetId> {
  const presetId = castId<RosterPresetId>(id);
  await db.insert(rosterPresets).values({ id: presetId, ownerId, name });
  return presetId;
}

test("roster_presets round-trips + borns description/timestamps defaults", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_rp_a", handle: "rp-a" });
  const id = await seedPreset(db, ownerId, "roster_preset_a", "Tavern");
  const rows = await db.select().from(rosterPresets).where(eq(rosterPresets.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.name).toBe("Tavern");
  expect(rows[0]?.description).toBe("");
  expect(rows[0]?.anchorPersonaId).toBeNull();
  expect(rows[0]?.groupConfig).toBeNull();
  expect(rows[0]?.createdAt).toBeGreaterThan(0);
});

test("unique(ownerId, name): a dupe name for one owner collides; the same name across owners is fine", async () => {
  const db = await freshDb();
  const ownerA = await seedUser(db, { id: "user_rp_ua", handle: "rp-ua" });
  const ownerB = await seedUser(db, { id: "user_rp_ub", handle: "rp-ub" });
  await seedPreset(db, ownerA, "roster_preset_u1", "Party");
  await expect(seedPreset(db, ownerA, "roster_preset_u2", "Party")).rejects.toSatisfy(isConstraintErr);
  // Same name, different owner — allowed.
  await expect(seedPreset(db, ownerB, "roster_preset_u3", "Party")).resolves.toBeDefined();
});

test("owner delete CASCADEs the preset; persona delete SET NULLs the anchor", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_rp_c", handle: "rp-c" });
  const personaId = castId<PersonaId>("persona_rp_c");
  await db.insert(personas).values({ id: personaId, ownerId, name: "POV", description: "" });
  const id = castId<RosterPresetId>("roster_preset_c");
  await db.insert(rosterPresets).values({ id, ownerId, name: "Anchored", anchorPersonaId: personaId });

  await db.delete(personas).where(eq(personas.id, personaId));
  const afterPersona = await db.select().from(rosterPresets).where(eq(rosterPresets.id, id));
  expect(afterPersona[0]?.anchorPersonaId).toBeNull(); // SET NULL — preset survives, degraded

  await db.delete(users).where(eq(users.id, ownerId));
  expect(await db.select().from(rosterPresets).where(eq(rosterPresets.id, id))).toHaveLength(0);
});

test("roster_preset_members: composite PK dupe collides; born disabled=false", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_rp_m", handle: "rp-m" });
  const presetId = await seedPreset(db, ownerId, "roster_preset_m", "Crew");
  const characterId = await seedCharacter(db, ownerId, "character_rp_m");
  await db.insert(rosterPresetMembers).values({ presetId, characterId, position: 0 });
  const rows = await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, presetId));
  expect(rows[0]?.disabled).toBe(false);
  expect(rows[0]?.talkativeness).toBeNull();
  await expect(db.insert(rosterPresetMembers).values({ presetId, characterId, position: 1 })).rejects.toSatisfy(isConstraintErr);
});

test("member CASCADEs: preset delete wipes members; character delete drops the member, preset survives", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_rp_x", handle: "rp-x" });
  const presetId = await seedPreset(db, ownerId, "roster_preset_x", "X");
  const charA = await seedCharacter(db, ownerId, "character_rp_x1");
  const charB = await seedCharacter(db, ownerId, "character_rp_x2");
  await db.insert(rosterPresetMembers).values({ presetId, characterId: charA, position: 0 });
  await db.insert(rosterPresetMembers).values({ presetId, characterId: charB, position: 1 });

  // Character delete → its member row goes, the OTHER member + the preset survive.
  await db.delete(characters).where(eq(characters.id, charA));
  const afterChar = await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, presetId));
  expect(afterChar).toHaveLength(1);
  expect(afterChar[0]?.characterId).toBe(charB);
  expect(await db.select().from(rosterPresets).where(eq(rosterPresets.id, presetId))).toHaveLength(1);

  // Preset delete → remaining members CASCADE away.
  await db.delete(rosterPresets).where(eq(rosterPresets.id, presetId));
  expect(await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, presetId))).toHaveLength(0);
});
