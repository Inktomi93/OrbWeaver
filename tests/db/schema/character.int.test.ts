// .int tests for schema/character (D28 — flat card + opaque snapshot log). Real libSQL :memory: via
// freshDb (FK PRAGMA ON). Covers: insert→select round-trip (branded id survives, always-a-list defaults),
// the card-content JSON round-trips through the @orb/db/kit read-seam (greetings, extensions, residualData,
// depthPrompt, refinery, a non-empty regexScripts), the snapshot opaque-blob round-trip, the CASCADE on character delete
// (snapshots + character_personas junction both vanish), the per-owner unique(ownerId, handle) namespace
// (same-owner dup collides → kind "unique"; a different owner with the same handle coexists), and the
// avatar SET NULL on asset delete (the character survives).

import type { CardDepthPrompt, CharacterCard, RefinerySignals } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { assets, characterPersonas, characterSnapshots, characters, personas } from "@orb/db";
import { isConstraintViolation, parseRecord, parseStringArray, parseStringArrayColumn } from "@orb/db/kit";
import type { AssetId, CharacterId, CharacterSnapshotId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

// Named so the literals aren't bare magic numbers (noMagicNumbers).
const DEPTH_PROMPT_DEPTH = 4;
const REFINERY_SCORE = 0.85;

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
  const ownerId = await seedUser(db, { id: "user_char_a", handle: "char-owner-a" });
  const id = await seedCharacter(db, ownerId, "character_roundtrip");

  const rows = await db.select().from(characters).where(eq(characters.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.ownerId).toBe(ownerId);
  expect(rows[0]?.name).toBe("Test Card");
  expect(rows[0]?.starred).toBe(false);
  expect(rows[0]?.synthetic).toBe(false);
  // forbidExternalMedia is the tri-state — absent ⇒ null (inherit deployment default).
  expect(rows[0]?.forbidExternalMedia).toBeNull();
  // trustHtml (D44 §12.0) is the same tri-state — absent on create ⇒ null (inherit the deployment default).
  expect(rows[0]?.trustHtml).toBeNull();
  // Always-a-list columns default to `[]`, never null (the parseStringArray asymmetry).
  expect(parseStringArray(rows[0]?.greetings)).toEqual([]);
  expect(rows[0]?.regexScripts).toEqual([]);
});

// A genuinely-unknown / deferred residual key (ST wire snake_case) — `assets` still rides residual pending
// its own lane (`group_only_greetings` no longer does — it folds into the greetings array, V3 promotion B).

const DEFERRED_RESIDUAL = { assets: [{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }] };

test("card-content JSON columns round-trip (greetings, extensions, residualData, depthPrompt, refinery, regexScripts)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_char_b", handle: "char-owner-b" });
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
    greetings: [{ text: "Hello there" }, { text: "Hi again" }],
    extensions: { vendorKey: 42 },
    // The promoted V3 fields are now typed COLUMNS; residual carries only genuinely-unknown vendor residue.
    nickname: "Ari",
    source: ["https://example.com/card"],
    creationDate: 1_700_000_000,
    modificationDate: 1_700_100_000,
    residualData: DEFERRED_RESIDUAL,
    depthPrompt,
    refinery,
    regexScripts: [regexScript],
  });

  const rows = await db.select().from(characters).where(eq(characters.id, id));
  expect(rows[0]?.greetings).toEqual([{ text: "Hello there" }, { text: "Hi again" }]);
  expect(rows[0]?.extensions).toEqual({ vendorKey: 42 });
  // The V3 content promotions persist as their own typed columns (source is the nullable-list column).
  expect(rows[0]?.nickname).toBe("Ari");
  expect(parseStringArrayColumn(rows[0]?.source)).toEqual(["https://example.com/card"]);
  expect(rows[0]?.creationDate).toBe(1_700_000_000);
  expect(rows[0]?.modificationDate).toBe(1_700_100_000);
  expect(rows[0]?.residualData).toEqual(DEFERRED_RESIDUAL);
  // depthPrompt + refinery are nullable JSON blobs — round-trip through the @orb/db/kit read-seam parser.
  expect(parseRecord(rows[0]?.depthPrompt)).toEqual(depthPrompt);
  expect(parseRecord(rows[0]?.refinery)).toEqual(refinery);
  // regexScripts is the typed always-a-list column; the non-empty value round-trips intact.
  expect(rows[0]?.regexScripts).toEqual([regexScript]);
});

test("character_snapshots stores ONE opaque card blob and round-trips", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_char_c", handle: "char-owner-c" });
  const characterId = await seedCharacter(db, ownerId, "character_snap");
  const card: CharacterCard = {
    name: "Aria",
    description: "calm",
    personality: null,
    scenario: null,
    greetings: [{ text: "hi" }],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
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

  const rows = await db.select().from(characterSnapshots).where(eq(characterSnapshots.id, snapshotId));
  expect(rows[0]?.content).toEqual(card);
  expect(rows[0]?.label).toBe("v1");
});

test("deleting a character CASCADEs its snapshots and persona junctions", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_char_d", handle: "char-owner-d" });
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

  const snaps = await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId));
  const junctions = await db.select().from(characterPersonas).where(eq(characterPersonas.characterId, characterId));
  expect(snaps).toHaveLength(0);
  expect(junctions).toHaveLength(0);
  // The persona itself survives (the junction cascaded, not the persona).
  const survivingPersona = await db.select().from(personas).where(eq(personas.id, personaId));
  expect(survivingPersona).toHaveLength(1);
});

// ── unique(ownerId, handle) — the per-owner handle namespace (the `__group__${chatId}` mint/find key) ──

test("unique(ownerId, handle) rejects a duplicate handle for the same owner", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_char_handle", handle: "char-owner-handle" });
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
  const ownerA = await seedUser(db, { id: "user_char_hA", handle: "char-owner-hA" });
  const ownerB = await seedUser(db, { id: "user_char_hB", handle: "char-owner-hB" });
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
  const ownerId = await seedUser(db, { id: "user_char_avatar", handle: "char-owner-avatar" });
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
