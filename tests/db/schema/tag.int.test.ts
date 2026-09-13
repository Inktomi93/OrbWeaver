// .int tests for schema/tag — the one user-scoped tag namespace + the five per-type FK junctions
// (D23/D24/D28/D30). Real libSQL :memory: via freshDb (FK PRAGMA ON). Covers: tags insert→select round-trip
// (ownerId KEEP — D23, nullable color/sortOrder, folderType default, isHiddenOnCard default, epoch-ms
// createdAt number); the unique(ownerId, name) namespace key (same owner+name collides; different owner
// coexists); the source/folderType test-mirrors + CHECKs; character_tags.status test-mirror + CHECK + the
// pending→accepted flip (the proposedTags redesign); the D30 chat_tags per-user overlay (two taggers apply
// the same (chatId, tagId) independently and coexist; a dup by the SAME tagger is rejected on the composite
// PK; chat_tags HAS ownerId while the other three junctions do NOT); every junction FK rejects a dangling
// ref; and CASCADE both ways (delete a tag → all five junctions vanish; delete a target → its junction vanishes).

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { TAG_FOLDER_TYPES, TAG_SOURCES, TAG_STATUSES } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import { characters, characterTags, chats, chatTags, personas, personaTags, presets, presetTags, tags, users, worldBooks, worldBookTags } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { CharacterHandle, CharacterId, ChatId, PersonaId, PresetId, TagId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedChat, seedUser } from "./_support.ts";

// Named so the literals aren't bare magic numbers (noMagicNumbers).
const SORT_ORDER = 5;
// A short benign out-of-enum probe value (noSecrets) — used to trip the enum CHECKs.
const BAD_ENUM_VALUE = "nope";

async function seedTag(db: Db, ownerId: UserId, raw: string, name = `tag-${raw}`): Promise<TagId> {
  const id = castId<TagId>(raw);
  await db.insert(tags).values({ id, ownerId, name });
  return id;
}

async function seedCharacter(db: Db, ownerId: UserId, raw: string): Promise<CharacterId> {
  const id = castId<CharacterId>(raw);
  await db.insert(characters).values({ id, handle: castId<CharacterHandle>(`card-${raw}`), ownerId, contentHash: `hash-${raw}`, name: raw });
  return id;
}

async function seedPersona(db: Db, ownerId: UserId, raw: string): Promise<PersonaId> {
  const id = castId<PersonaId>(raw);
  await db.insert(personas).values({ id, ownerId, name: raw, description: "" });
  return id;
}

async function seedWorldBook(db: Db, ownerId: UserId, raw: string): Promise<WorldBookId> {
  const id = castId<WorldBookId>(raw);
  await db.insert(worldBooks).values({ id, ownerId, name: `book-${raw}` });
  return id;
}

async function seedPreset(db: Db, ownerId: UserId, raw: string): Promise<PresetId> {
  const id = castId<PresetId>(raw);
  await db.insert(presets).values({
    id,
    ownerId,
    name: `preset-${raw}`,
    kind: "roleplay",
    config: DEFAULT_PROMPT_CONFIG,
  });
  return id;
}

// ── tags round-trip (ownerId KEEP — D23, nullable cols, defaults) ─────────────

test("tags insert→select round-trips (ownerId KEEP, defaults, epoch-ms createdAt)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_tag_a" });
  const tagId = castId<TagId>("tag_rt");
  await db.insert(tags).values({
    id: tagId,
    ownerId,
    name: "favorites",
    color: "#ff0000",
    color2: "#ffffff",
    source: "manual",
    folderType: "OPEN",
    sortOrder: SORT_ORDER,
    isHiddenOnCard: true,
  });

  const rows = await db.select().from(tags).where(eq(tags.id, tagId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id).toBe(tagId);
  // D23: the tag references its owner DIRECTLY (KEEP ownerId — the partition key, not a derivable mirror).
  expect(row?.ownerId).toBe(ownerId);
  expect(row?.name).toBe("favorites");
  expect(row?.color).toBe("#ff0000");
  expect(row?.color2).toBe("#ffffff");
  expect(row?.source).toBe("manual");
  expect(row?.folderType).toBe("OPEN");
  expect(row?.sortOrder).toBe(SORT_ORDER);
  expect(row?.isHiddenOnCard).toBe(true);
  // Timestamps are epoch-ms NUMBERS (never Date) — born at insert.
  expect(row?.createdAt).toBeTypeOf("number");
});

test("tags defaults: null color/color2/source/sortOrder, folderType NONE, isHiddenOnCard false", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_tag_def" });
  const tagId = await seedTag(db, ownerId, "tag_def");

  const row = (await db.select().from(tags).where(eq(tags.id, tagId)))[0];
  expect(row?.color).toBeNull();
  expect(row?.color2).toBeNull();
  expect(row?.source).toBeNull();
  expect(row?.sortOrder).toBeNull();
  expect(row?.folderType).toBe("NONE");
  expect(row?.isHiddenOnCard).toBe(false);
});

// ── unique(ownerId, name) — one namespace per owner (invariant #1) ────────────

test("tags unique(ownerId, name) rejects a duplicate name for the same owner", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_tag_uniq" });
  await seedTag(db, ownerId, "tag_uniq_1", "dup");
  let caught: unknown;
  try {
    await db.insert(tags).values({ id: castId<TagId>("tag_uniq_2"), ownerId, name: "dup" });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("tags unique(ownerId, name) allows the same name for a DIFFERENT owner", async () => {
  const db = await freshDb();
  const ownerA = await seedUser(db, { id: "user_tag_owA" });
  const ownerB = await seedUser(db, { id: "user_tag_owB" });
  await seedTag(db, ownerA, "tag_owA", "shared");
  // Different owner, same name — a distinct namespace, no collision.
  await seedTag(db, ownerB, "tag_owB", "shared");

  expect(await db.select().from(tags).where(eq(tags.name, "shared"))).toHaveLength(2);
});

// ── source / folderType test-mirrors + CHECKs ────────────────────────────────

test("test-mirror: tags.source derives TAG_SOURCES, tags.folderType derives TAG_FOLDER_TYPES", () => {
  expect([...tags.source.enumValues]).toEqual([...TAG_SOURCES]);
  expect([...tags.folderType.enumValues]).toEqual([...TAG_FOLDER_TYPES]);
});

test("tags source CHECK rejects an out-of-enum value", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_tag_badsrc" });
  let caught: unknown;
  try {
    await db.insert(tags).values({
      id: castId<TagId>("tag_badsrc"),
      ownerId,
      name: "bad-source",
      // @orb-waive no-test-fabrication(unknown): deliberate out-of-enum probe — the value must NOT satisfy the enum type. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      source: BAD_ENUM_VALUE as unknown as (typeof TAG_SOURCES)[number],
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("tags folderType CHECK rejects an out-of-enum value", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_tag_badfolder" });
  let caught: unknown;
  try {
    await db.insert(tags).values({
      id: castId<TagId>("tag_badfolder"),
      ownerId,
      name: "bad-folder",
      // @orb-waive no-test-fabrication(unknown): deliberate out-of-enum probe — the value must NOT satisfy the enum type. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      folderType: BAD_ENUM_VALUE as unknown as (typeof TAG_FOLDER_TYPES)[number],
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

// ── character_tags.status — the proposed/accepted surface (test-mirror + CHECK + flip) ──

test("test-mirror: character_tags.status derives TAG_STATUSES", () => {
  expect([...characterTags.status.enumValues]).toEqual([...TAG_STATUSES]);
});

test("character_tags defaults to status 'pending' and flips to 'accepted'", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ct_status" });
  const characterId = await seedCharacter(db, ownerId, "character_ct_status");
  const tagId = await seedTag(db, ownerId, "tag_ct_status");
  await db.insert(characterTags).values({ characterId, tagId });

  // The proposedTags redesign: a freshly-attached tag is a suggestion (pending) awaiting "Accept".
  let row = (
    await db
      .select()
      .from(characterTags)
      .where(and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, tagId)))
  )[0];
  expect(row?.status).toBe("pending");
  // D23: a character tag carries NO ownerId — its owner is reached via characterId → characters.ownerId.
  expect(Object.keys(row ?? {})).not.toContain("ownerId");

  // "Accept" is a status flip (UPDATE), not a copy into a parallel surface.
  await db
    .update(characterTags)
    .set({ status: "accepted" })
    .where(and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, tagId)));
  row = (
    await db
      .select()
      .from(characterTags)
      .where(and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, tagId)))
  )[0];
  expect(row?.status).toBe("accepted");
});

test("character_tags status CHECK rejects an out-of-enum value", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ct_badstatus" });
  const characterId = await seedCharacter(db, ownerId, "character_ct_badstatus");
  const tagId = await seedTag(db, ownerId, "tag_ct_badstatus");
  let caught: unknown;
  try {
    await db.insert(characterTags).values({
      characterId,
      tagId,
      // @orb-waive no-test-fabrication(unknown): deliberate out-of-enum probe — the value must NOT satisfy the enum type. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      status: BAD_ENUM_VALUE as unknown as (typeof TAG_STATUSES)[number],
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

// ── D30: chat_tags is the per-user overlay (keeps ownerId; coexist across taggers) ──

test("D30: two taggers apply the same (chatId, tagId) independently and both rows coexist", async () => {
  const db = await freshDb();
  const ownerA = await seedUser(db, { id: "user_ct_taggerA" });
  const ownerB = await seedUser(db, { id: "user_ct_taggerB" });
  const chatId = await seedChat(db, { id: "chat_overlay" });
  // The tag itself is owned by A but is applied to the shared chat by BOTH members.
  const tagId = await seedTag(db, ownerA, "tag_overlay");
  await db.insert(chatTags).values({ chatId, tagId, ownerId: ownerA });
  await db.insert(chatTags).values({ chatId, tagId, ownerId: ownerB });

  const rows = await db
    .select()
    .from(chatTags)
    .where(and(eq(chatTags.chatId, chatId), eq(chatTags.tagId, tagId)));
  // Per-user overlay: two coexisting rows, one per tagger.
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((r) => r.ownerId))).toEqual(new Set([ownerA, ownerB]));
  // chat_tags HAS its OWN ownerId (the tagger) — D30, the one junction that keeps it.
  expect(Object.keys(rows[0] ?? {})).toContain("ownerId");
});

test("D30: chat_tags rejects a duplicate (chatId, tagId, ownerId) by the SAME tagger", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ct_dup" });
  const chatId = await seedChat(db, { id: "chat_dup" });
  const tagId = await seedTag(db, ownerId, "tag_dup");
  await db.insert(chatTags).values({ chatId, tagId, ownerId });
  let caught: unknown;
  try {
    // Same tagger applying the same tag to the same chat twice — the composite PK (= unique(chatId,
    // tagId, ownerId)) rejects it. SQLite reports a duplicate composite PK as "UNIQUE constraint failed".
    await db.insert(chatTags).values({ chatId, tagId, ownerId });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("the four target-derived junctions carry NO ownerId; only chat_tags does (D23/D30)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_owner_presence" });
  const tagId = await seedTag(db, ownerId, "tag_owner_presence");
  const characterId = await seedCharacter(db, ownerId, "character_owner_presence");
  const worldBookId = await seedWorldBook(db, ownerId, "world_book_owner_presence");
  const personaId = await seedPersona(db, ownerId, "persona_owner_presence");
  const presetId = await seedPreset(db, ownerId, "preset_owner_presence");
  const chatId = await seedChat(db, { id: "chat_owner_presence" });

  await db.insert(characterTags).values({ characterId, tagId });
  await db.insert(worldBookTags).values({ worldBookId, tagId });
  await db.insert(personaTags).values({ personaId, tagId });
  await db.insert(presetTags).values({ presetId, tagId });
  await db.insert(chatTags).values({ chatId, tagId, ownerId });

  const charRow = (await db.select().from(characterTags).where(eq(characterTags.tagId, tagId)))[0];
  const wbRow = (await db.select().from(worldBookTags).where(eq(worldBookTags.tagId, tagId)))[0];
  const personaRow = (await db.select().from(personaTags).where(eq(personaTags.tagId, tagId)))[0];
  const presetRow = (await db.select().from(presetTags).where(eq(presetTags.tagId, tagId)))[0];
  const chatRow = (await db.select().from(chatTags).where(eq(chatTags.tagId, tagId)))[0];

  expect(Object.keys(charRow ?? {})).not.toContain("ownerId");
  expect(Object.keys(wbRow ?? {})).not.toContain("ownerId");
  expect(Object.keys(personaRow ?? {})).not.toContain("ownerId");
  expect(Object.keys(presetRow ?? {})).not.toContain("ownerId");
  // The one exception (D30).
  expect(Object.keys(chatRow ?? {})).toContain("ownerId");
});

// ── junction FK enforcement (dangling refs rejected) ─────────────────────────

test("character_tags FK rejects a dangling tag ref", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ct_fk" });
  const characterId = await seedCharacter(db, ownerId, "character_ct_fk");
  let caught: unknown;
  try {
    await db.insert(characterTags).values({ characterId, tagId: castId<TagId>("tag_missing") });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("chat_tags FK rejects a dangling chat ref", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_chattag_fk" });
  const tagId = await seedTag(db, ownerId, "tag_chattag_fk");
  let caught: unknown;
  try {
    await db.insert(chatTags).values({ chatId: castId<ChatId>("chat_missing"), tagId, ownerId });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

// ── CASCADE: delete a tag → ALL FIVE junctions vanish ────────────────────────

test("deleting a tag CASCADEs all five junctions", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_tag_casc" });
  const tagId = await seedTag(db, ownerId, "tag_cascade");
  const characterId = await seedCharacter(db, ownerId, "character_tag_casc");
  const chatId = await seedChat(db, { id: "chat_tag_casc" });
  const worldBookId = await seedWorldBook(db, ownerId, "world_book_tag_casc");
  const personaId = await seedPersona(db, ownerId, "persona_tag_casc");
  const presetId = await seedPreset(db, ownerId, "preset_tag_casc");

  await db.insert(characterTags).values({ characterId, tagId });
  await db.insert(chatTags).values({ chatId, tagId, ownerId });
  await db.insert(worldBookTags).values({ worldBookId, tagId });
  await db.insert(personaTags).values({ personaId, tagId });
  await db.insert(presetTags).values({ presetId, tagId });

  await db.delete(tags).where(eq(tags.id, tagId));

  expect(await db.select().from(characterTags).where(eq(characterTags.tagId, tagId))).toEqual([]);
  expect(await db.select().from(chatTags).where(eq(chatTags.tagId, tagId))).toEqual([]);
  expect(await db.select().from(worldBookTags).where(eq(worldBookTags.tagId, tagId))).toEqual([]);
  expect(await db.select().from(personaTags).where(eq(personaTags.tagId, tagId))).toEqual([]);
  expect(await db.select().from(presetTags).where(eq(presetTags.tagId, tagId))).toEqual([]);
});

// ── CASCADE: delete a tagged target → that target's junction rows vanish ─────

test("deleting a tagged target CASCADEs its junction rows (tag survives)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_target_casc" });
  const tagId = await seedTag(db, ownerId, "tag_target_casc");
  const characterId = await seedCharacter(db, ownerId, "character_target_casc");
  const chatId = await seedChat(db, { id: "chat_target_casc" });
  const worldBookId = await seedWorldBook(db, ownerId, "world_book_target_casc");
  const personaId = await seedPersona(db, ownerId, "persona_target_casc");
  const presetId = await seedPreset(db, ownerId, "preset_target_casc");

  await db.insert(characterTags).values({ characterId, tagId });
  await db.insert(chatTags).values({ chatId, tagId, ownerId });
  await db.insert(worldBookTags).values({ worldBookId, tagId });
  await db.insert(personaTags).values({ personaId, tagId });
  await db.insert(presetTags).values({ presetId, tagId });

  await db.delete(characters).where(eq(characters.id, characterId));
  await db.delete(chats).where(eq(chats.id, chatId));
  await db.delete(worldBooks).where(eq(worldBooks.id, worldBookId));
  await db.delete(personas).where(eq(personas.id, personaId));
  await db.delete(presets).where(eq(presets.id, presetId));

  expect(await db.select().from(characterTags).where(eq(characterTags.tagId, tagId))).toEqual([]);
  expect(await db.select().from(chatTags).where(eq(chatTags.tagId, tagId))).toEqual([]);
  expect(await db.select().from(worldBookTags).where(eq(worldBookTags.tagId, tagId))).toEqual([]);
  expect(await db.select().from(personaTags).where(eq(personaTags.tagId, tagId))).toEqual([]);
  expect(await db.select().from(presetTags).where(eq(presetTags.tagId, tagId))).toEqual([]);
  // The tag itself survives — CASCADE flows target → junction, never junction → tag.
  expect(await db.select().from(tags).where(eq(tags.id, tagId))).toHaveLength(1);
});

// ── CASCADE: delete the tagger → only their chat_tags overlay rows vanish (D30) ──

test("deleting the tagger CASCADEs only their chat_tags overlay rows (D30)", async () => {
  const db = await freshDb();
  const ownerA = await seedUser(db, { id: "user_tagger_casc_A" });
  const ownerB = await seedUser(db, { id: "user_tagger_casc_B" });
  const chatId = await seedChat(db, { id: "chat_tagger_casc" });
  const tagId = await seedTag(db, ownerA, "tag_tagger_casc");
  await db.insert(chatTags).values({ chatId, tagId, ownerId: ownerB });

  // Deleting tagger B removes B's overlay row (its own ownerId FK CASCADE) but the chat + tag survive.
  await db.delete(users).where(eq(users.id, ownerB));

  expect(await db.select().from(chatTags).where(eq(chatTags.ownerId, ownerB))).toEqual([]);
  expect(await db.select().from(chats).where(eq(chats.id, chatId))).toHaveLength(1);
  expect(await db.select().from(tags).where(eq(tags.id, tagId))).toHaveLength(1);
});
