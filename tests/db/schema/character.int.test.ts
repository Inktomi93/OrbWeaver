// .int tests for schema/character (D28 — flat card + opaque snapshot log). Real libSQL :memory: via
// freshDb (FK PRAGMA ON). Covers: insert→select round-trip (branded id survives, always-a-list defaults),
// the card-content JSON round-trips through the @orb/db/kit read-seam (greetings, extensions, depthPrompt,
// refinery, a non-empty regexScripts), the snapshot opaque-blob round-trip, the CASCADE on character delete
// (snapshots + character_personas junction both vanish), the per-owner unique(ownerId, handle) namespace
// (same-owner dup collides → kind "unique"; a different owner with the same handle coexists), and the
// avatar SET NULL on asset delete (the character survives).

import type { CardDepthPrompt, CharacterCard, RefinerySignals } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import {
  assets,
  characterPersonas,
  characterSnapshots,
  characters,
  isConstraintViolation,
  personas,
  users,
} from "@orb/db";
import { parseRecord, parseStringArray } from "@orb/db/kit";
import type {
  AssetId,
  CharacterId,
  CharacterSnapshotId,
  Handle,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// Named so the literals aren't bare magic numbers (noMagicNumbers).
const DEPTH_PROMPT_DEPTH = 4;
const REFINERY_SCORE = 0.85;

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

test("card-content JSON columns round-trip (greetings, extensions, depthPrompt, refinery, regexScripts)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_char_b", "char-owner-b");
  const id = castId<CharacterId>("character_content");
  // Character's Note @ Depth — the shared {depth, role?} directive + note text.
  const depthPrompt: CardDepthPrompt = {
    depth: DEPTH_PROMPT_DEPTH,
    role: "system",
    prompt: "Stay in character.",
  };
  // CardRefinery pipeline signals (derived) — a numeric score + an opaque analysis blob.
  const refinery: RefinerySignals = { score: REFINERY_SCORE, analysis: { summary: "clean" } };
  // A complete typed regex script (defaults filled via the contract schema, so it round-trips intact).
  const regexScript: RegexScript = regexScriptSchema.parse({
    id: "rx-strip",
    name: "Strip",
    findRegex: "foo",
    replaceString: "bar",
    placement: [],
  });
  await db.insert(characters).values({
    id,
    handle: "card-content",
    ownerId,
    contentHash: "hash-b",
    name: "Greeter",
    greetings: ["Hello there", "Hi again"],
    extensions: { vendorKey: 42 },
    depthPrompt,
    refinery,
    regexScripts: [regexScript],
  });

  const rows = await db.select().from(characters).where(eq(characters.id, id));
  expect(parseStringArray(rows[0]?.greetings)).toEqual(["Hello there", "Hi again"]);
  expect(rows[0]?.extensions).toEqual({ vendorKey: 42 });
  // depthPrompt + refinery are nullable JSON blobs — round-trip through the @orb/db/kit read-seam parser.
  expect(parseRecord(rows[0]?.depthPrompt)).toEqual(depthPrompt);
  expect(parseRecord(rows[0]?.refinery)).toEqual(refinery);
  // regexScripts is the typed always-a-list column; the non-empty value round-trips intact.
  expect(rows[0]?.regexScripts).toEqual([regexScript]);
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

// ── unique(ownerId, handle) — the per-owner handle namespace (the `__group__${chatId}` mint/find key) ──

test("unique(ownerId, handle) rejects a duplicate handle for the same owner", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_char_handle", "char-owner-handle");
  await db.insert(characters).values({
    id: castId<CharacterId>("character_handle_1"),
    handle: "dup-handle",
    ownerId,
    contentHash: "hash-h1",
    name: "First",
  });
  let caught: unknown;
  try {
    await db.insert(characters).values({
      id: castId<CharacterId>("character_handle_2"),
      handle: "dup-handle",
      ownerId,
      contentHash: "hash-h2",
      name: "Second",
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("unique(ownerId, handle) allows the same handle for a DIFFERENT owner", async () => {
  const db = await freshDb();
  const ownerA = await seedOwner(db, "user_char_hA", "char-owner-hA");
  const ownerB = await seedOwner(db, "user_char_hB", "char-owner-hB");
  await db.insert(characters).values({
    id: castId<CharacterId>("character_hA"),
    handle: "shared-handle",
    ownerId: ownerA,
    contentHash: "hash-hA",
    name: "A",
  });
  // Different owner, same handle — a distinct per-owner namespace, no collision.
  await db.insert(characters).values({
    id: castId<CharacterId>("character_hB"),
    handle: "shared-handle",
    ownerId: ownerB,
    contentHash: "hash-hB",
    name: "B",
  });

  const rows = await db.select().from(characters).where(eq(characters.handle, "shared-handle"));
  expect(rows).toHaveLength(2);
});

// ── avatar SET NULL on asset delete (the character survives) ──────────────────

test("avatar_asset_id is SET NULL when its asset is deleted (character survives)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_char_avatar", "char-owner-avatar");
  const assetId = castId<AssetId>("asset_character_avatar");
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "avatar",
    mime: "image/webp",
    size: 1,
    hash: "f".repeat(64),
  });
  const id = castId<CharacterId>("character_with_avatar");
  await db.insert(characters).values({
    id,
    handle: "card-avatar",
    ownerId,
    contentHash: "hash-avatar",
    name: "Pic",
    avatarAssetId: assetId,
  });

  await db.delete(assets).where(eq(assets.id, assetId));

  const rows = await db.select().from(characters).where(eq(characters.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.avatarAssetId).toBeNull();
});
