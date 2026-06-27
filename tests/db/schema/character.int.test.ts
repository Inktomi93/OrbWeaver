// .int tests for schema/character (D28 — flat card + opaque snapshot log). Real libSQL :memory: via
// freshDb (FK PRAGMA ON). Covers: insert→select round-trip (branded id survives, always-a-list defaults),
// the card-content JSON round-trips through the @orb/db/kit read-seam, the snapshot opaque-blob round-trip,
// and the CASCADE on character delete (snapshots + character_personas junction both vanish).

import type { CharacterCard } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import { characterPersonas, characterSnapshots, characters, personas, users } from "@orb/db";
import { parseStringArray } from "@orb/db/kit";
import type { CharacterId, CharacterSnapshotId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

async function seedOwner(db: Db, id: string, handle: string): Promise<UserId> {
  const ownerId = castId<UserId>(id);
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>(handle) });
  return ownerId;
}

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: `card-${id}`,
    ownerId,
    contentHash: "hash-of-semantic-fields",
    name: "Test Card",
  });
  return characterId;
}

test("characters insert→select round-trips (branded id + always-a-list defaults)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_char_a", "char-owner-a");
  const id = await seedCharacter(db, ownerId, "character_roundtrip");

  const rows = await db.select().from(characters).where(eq(characters.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.ownerId).toBe(ownerId);
  expect(rows[0]?.name).toBe("Test Card");
  // Identity-flag defaults.
  expect(rows[0]?.starred).toBe(false);
  expect(rows[0]?.synthetic).toBe(false);
  // forbidExternalMedia is the tri-state — absent ⇒ null (inherit deployment default).
  expect(rows[0]?.forbidExternalMedia).toBeNull();
  // Always-a-list columns default to `[]`, never null (the parseStringArray asymmetry).
  expect(parseStringArray(rows[0]?.greetings)).toEqual([]);
  expect(rows[0]?.regexScripts).toEqual([]);
});

test("card-content JSON columns round-trip (greetings via the kit parser, extensions)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_char_b", "char-owner-b");
  const id = castId<CharacterId>("character_content");
  await db.insert(characters).values({
    id,
    handle: "card-content",
    ownerId,
    contentHash: "hash-b",
    name: "Greeter",
    greetings: ["Hello there", "Hi again"],
    extensions: { vendorKey: 42 },
  });

  const rows = await db.select().from(characters).where(eq(characters.id, id));
  expect(parseStringArray(rows[0]?.greetings)).toEqual(["Hello there", "Hi again"]);
  expect(rows[0]?.extensions).toEqual({ vendorKey: 42 });
});

test("character_snapshots stores ONE opaque card blob and round-trips", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_char_c", "char-owner-c");
  const characterId = await seedCharacter(db, ownerId, "character_snap");
  const card: CharacterCard = {
    name: "Aria",
    description: "calm",
    personality: null,
    scenario: null,
    greetings: ["hi"],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    regexScripts: [],
    extensions: null,
    avatarAssetId: null,
    refinery: null,
  };
  const snapshotId = castId<CharacterSnapshotId>("character_snapshot_one");
  await db.insert(characterSnapshots).values({
    id: snapshotId,
    characterId,
    content: card,
    label: "v1",
  });

  const rows = await db
    .select()
    .from(characterSnapshots)
    .where(eq(characterSnapshots.id, snapshotId));
  expect(rows[0]?.content).toEqual(card);
  expect(rows[0]?.label).toBe("v1");
});

test("deleting a character CASCADEs its snapshots and persona junctions", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_char_d", "char-owner-d");
  const characterId = await seedCharacter(db, ownerId, "character_cascade");

  const personaId = castId<PersonaId>("persona_for_cascade");
  await db.insert(personas).values({
    id: personaId,
    ownerId,
    name: "Linked",
    description: "",
  });
  await db.insert(characterPersonas).values({ characterId, personaId });
  await db.insert(characterSnapshots).values({
    id: castId<CharacterSnapshotId>("character_snapshot_cascade"),
    characterId,
    content: { name: "snap" } as unknown as CharacterCard,
  });

  await db.delete(characters).where(eq(characters.id, characterId));

  const snaps = await db
    .select()
    .from(characterSnapshots)
    .where(eq(characterSnapshots.characterId, characterId));
  const junctions = await db
    .select()
    .from(characterPersonas)
    .where(eq(characterPersonas.characterId, characterId));
  expect(snaps).toHaveLength(0);
  expect(junctions).toHaveLength(0);
  // The persona itself survives (the junction cascaded, not the persona).
  const survivingPersona = await db.select().from(personas).where(eq(personas.id, personaId));
  expect(survivingPersona).toHaveLength(1);
});
