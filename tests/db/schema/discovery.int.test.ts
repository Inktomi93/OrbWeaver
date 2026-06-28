// .int tests for schema/discovery — the library-semantics rollups (D23 ownership split / D24 per-type FK
// duplicate pairs). Real libSQL :memory: via freshDb (FK PRAGMA ON). Covers: the per-type FK pair
// round-trips + CASCADE on entity delete + the `relation` test-mirror/CHECK + the canonical-A<B CHECK +
// FK enforcement; the D23 ownership SHAPE per table (ownerId PRESENT on keyword_cooccurrence/theme_clusters,
// ABSENT on the 5 derived tables); the theme_clusters.centroid vector32 1024-dim round-trip; the
// digest_theme_assignments composite PK + its CASCADE to both parents.
//
// `relation` (`duplicate | forked`) is the db↔contracts mirror: the column DERIVES `RELATIONS` from
// `@orb/contracts/discovery` (D34 one-home) and this test pins `duplicate_chat_pairs.relation.enumValues`
// to that imported tuple. `relation` lives ONLY on the chat table (characters have no fork lineage, D28).

import { RELATIONS } from "@orb/contracts/discovery";
import type { Db } from "@orb/db";
import {
  characterKeywordProfiles,
  characterSummaries,
  characters,
  chatDigests,
  chats,
  digestThemeAssignments,
  duplicateCharacterPairs,
  duplicateChatPairs,
  isConstraintViolation,
  keywordCooccurrence,
  themeClusters,
  users,
} from "@orb/db";
import type {
  CharacterId,
  CharacterKeywordProfileId,
  ChatDigestId,
  ChatId,
  DuplicateCharacterPairId,
  DuplicateChatPairId,
  Handle,
  KeywordCooccurrenceId,
  ThemeClusterId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// The one space's dim (mirrors schema CENTROID_DIM). A deterministic ramp vector (no Math-random) — every
// value is exactly representable + round-trippable through F32_BLOB.
const DIM = 1024;
const MODEL = "qwen3-vl";
function rampVector(): Float32Array {
  return Float32Array.from({ length: DIM }, (_unused, i) => i / DIM);
}

async function seedOwner(db: Db, id: string): Promise<UserId> {
  const ownerId = castId<UserId>(id);
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>(`h-${id}`) });
  return ownerId;
}

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: `card-${id}`,
    ownerId,
    contentHash: "hash-card",
    name: "Card",
  });
  return characterId;
}

async function seedChat(db: Db, id: string): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId });
  return chatId;
}

async function seedDigest(db: Db, chatId: ChatId, id: string): Promise<ChatDigestId> {
  const digestId = castId<ChatDigestId>(id);
  await db.insert(chatDigests).values({
    id: digestId,
    chatId,
    tier: 0,
    blockIdx: 0,
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  return digestId;
}

interface ThemeClusterSeed {
  ownerId: UserId;
  id: string;
  level: string;
  clusterIdx: number;
}

async function seedThemeCluster(db: Db, seed: ThemeClusterSeed): Promise<ThemeClusterId> {
  const themeClusterId = castId<ThemeClusterId>(seed.id);
  await db.insert(themeClusters).values({
    id: themeClusterId,
    ownerId: seed.ownerId,
    level: seed.level,
    clusterIdx: seed.clusterIdx,
    centroid: rampVector(),
    size: 5,
    model: MODEL,
  });
  return themeClusterId;
}

// ── relation test-mirror (the column enum === the canonical `duplicate | forked` tuple) ────────────────
test("relation lives ONLY on duplicate_chat_pairs and derives the contracts RELATIONS tuple; the character table has none", () => {
  // Chats have fork lineage (parentChatId, D27) so a chat pair can be `forked`; characters do not (D28),
  // so a character pair is always a `duplicate` and carries NO relation column. The db column DERIVES the
  // ONE canonical tuple in @orb/contracts/discovery (D34) — this is the db↔contracts mirror.
  expect(duplicateChatPairs.relation.enumValues).toEqual([...RELATIONS]);
  expect("relation" in duplicateCharacterPairs).toBe(false);
});

// ── D24 duplicate_character_pairs: per-type FK round-trip + DERIVE ownerId + CASCADE ───────────────────
test("duplicate_character_pairs round-trips a per-type FK pair (cslsScore/similarity reals, no ownerId)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_dcp");
  const a = await seedCharacter(db, ownerId, "character_aaa");
  const b = await seedCharacter(db, ownerId, "character_bbb");
  const id = castId<DuplicateCharacterPairId>("duplicate_character_pair_one");

  await db.insert(duplicateCharacterPairs).values({
    id,
    characterIdA: a,
    characterIdB: b,
    cslsScore: 0.91,
    similarity: 0.88,
    model: MODEL,
  });

  const rows = await db
    .select()
    .from(duplicateCharacterPairs)
    .where(eq(duplicateCharacterPairs.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.characterIdA).toBe(a);
  expect(rows[0]?.characterIdB).toBe(b);
  expect(rows[0]?.cslsScore).toBeCloseTo(0.91);
  expect(rows[0]?.similarity).toBeCloseTo(0.88);
  // computedAt is an epoch-MS NUMBER born at insert (not a Date).
  expect(rows[0]?.computedAt).toBeTypeOf("number");
  // DERIVE (D23/D24) — no ownerId column on a per-type FK pair (owner reachable via the entity FK).
  expect(Object.keys(rows[0] ?? {})).not.toContain("ownerId");
});

test("deleting a character CASCADEs its duplicate_character_pairs rows (D24 — physics, no sweep)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_dcp_casc");
  const a = await seedCharacter(db, ownerId, "character_aaa");
  const b = await seedCharacter(db, ownerId, "character_bbb");
  await db.insert(duplicateCharacterPairs).values({
    id: castId<DuplicateCharacterPairId>("duplicate_character_pair_casc"),
    characterIdA: a,
    characterIdB: b,
    cslsScore: 0.9,
    similarity: 0.9,
    model: MODEL,
  });

  await db.delete(characters).where(eq(characters.id, a));
  expect(await db.select().from(duplicateCharacterPairs)).toHaveLength(0);
});

test("duplicate_chat_pairs.relation CHECK rejects a non-member value", async () => {
  // The relation CHECK is covered on the chat table — the only one carrying the column.
  const db = await freshDb();
  const a = await seedChat(db, "chat_aaa");
  const b = await seedChat(db, "chat_bbb");
  let caught: unknown;
  try {
    await db.insert(duplicateChatPairs).values({
      id: castId<DuplicateChatPairId>("duplicate_chat_pair_badrel"),
      chatIdA: a,
      chatIdB: b,
      cslsScore: 0.5,
      similarity: 0.5,
      relation: "nope" as never,
      model: MODEL,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("duplicate_character_pairs canonical CHECK rejects a non-A<B order and a self-pair", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_dcp_canon");
  const a = await seedCharacter(db, ownerId, "character_aaa");
  const b = await seedCharacter(db, ownerId, "character_bbb");

  // a > b (B placed first) violates `character_id_a < character_id_b`.
  let caughtOrder: unknown;
  try {
    await db.insert(duplicateCharacterPairs).values({
      id: castId<DuplicateCharacterPairId>("duplicate_character_pair_unordered"),
      characterIdA: b,
      characterIdB: a,
      cslsScore: 0.5,
      similarity: 0.5,
      model: MODEL,
    });
  } catch (err) {
    caughtOrder = err;
  }
  expect(isConstraintViolation(caughtOrder)?.kind).toBe("check");

  // a == b (a self-pair) also fails the strict A<B CHECK.
  let caughtSelf: unknown;
  try {
    await db.insert(duplicateCharacterPairs).values({
      id: castId<DuplicateCharacterPairId>("duplicate_character_pair_self"),
      characterIdA: a,
      characterIdB: a,
      cslsScore: 0.5,
      similarity: 0.5,
      model: MODEL,
    });
  } catch (err) {
    caughtSelf = err;
  }
  expect(isConstraintViolation(caughtSelf)?.kind).toBe("check");
});

test("keyword_cooccurrence canonical CHECK rejects a non-A<B order and a self-pair", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_kc_canon");

  // keywordA="knight" > keywordB="dragon" violates `keyword_a < keyword_b` (reversed order).
  let caughtOrder: unknown;
  try {
    await db.insert(keywordCooccurrence).values({
      id: castId<KeywordCooccurrenceId>("keyword_cooccurrence_unordered"),
      ownerId,
      keywordA: "knight",
      keywordB: "dragon",
      count: 1,
    });
  } catch (err) {
    caughtOrder = err;
  }
  expect(isConstraintViolation(caughtOrder)?.kind).toBe("check");

  // keyword_a === keyword_b (a self-pair) also fails the strict A<B CHECK.
  let caughtSelf: unknown;
  try {
    await db.insert(keywordCooccurrence).values({
      id: castId<KeywordCooccurrenceId>("keyword_cooccurrence_self"),
      ownerId,
      keywordA: "dragon",
      keywordB: "dragon",
      count: 1,
    });
  } catch (err) {
    caughtSelf = err;
  }
  expect(isConstraintViolation(caughtSelf)?.kind).toBe("check");
});

test("duplicate_character_pairs enforces its FKs (a missing character is rejected)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_dcp_fk");
  const a = await seedCharacter(db, ownerId, "character_aaa");
  let caught: unknown;
  try {
    await db.insert(duplicateCharacterPairs).values({
      id: castId<DuplicateCharacterPairId>("duplicate_character_pair_fk"),
      characterIdA: a,
      // B is lexically greater (canonical CHECK passes) but does not exist → FK failure.
      characterIdB: castId<CharacterId>("character_zzz_missing"),
      cslsScore: 0.5,
      similarity: 0.5,
      model: MODEL,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("duplicate_character_pairs unique index rejects the same canonical pair twice", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_dcp_uniq");
  const a = await seedCharacter(db, ownerId, "character_aaa");
  const b = await seedCharacter(db, ownerId, "character_bbb");
  await db.insert(duplicateCharacterPairs).values({
    id: castId<DuplicateCharacterPairId>("duplicate_character_pair_u1"),
    characterIdA: a,
    characterIdB: b,
    cslsScore: 0.9,
    similarity: 0.9,
    model: MODEL,
  });
  let caught: unknown;
  try {
    await db.insert(duplicateCharacterPairs).values({
      id: castId<DuplicateCharacterPairId>("duplicate_character_pair_u2"),
      characterIdA: a,
      characterIdB: b,
      cslsScore: 0.7,
      similarity: 0.7,
      model: MODEL,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

// ── D24 duplicate_chat_pairs: per-type FK round-trip + `forked` + CASCADE + no ownerId ─────────────────
test("duplicate_chat_pairs round-trips a per-type FK pair (relation=forked) and CASCADEs on chat delete", async () => {
  const db = await freshDb();
  const a = await seedChat(db, "chat_aaa");
  const b = await seedChat(db, "chat_bbb");
  const id = castId<DuplicateChatPairId>("duplicate_chat_pair_one");
  await db.insert(duplicateChatPairs).values({
    id,
    chatIdA: a,
    chatIdB: b,
    cslsScore: 0.95,
    similarity: 0.6,
    relation: "forked",
    model: MODEL,
  });

  const rows = await db.select().from(duplicateChatPairs).where(eq(duplicateChatPairs.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.relation).toBe("forked");
  // DERIVE (D23/D24) — no ownerId (owner reachable via chat → host).
  expect(Object.keys(rows[0] ?? {})).not.toContain("ownerId");

  await db.delete(chats).where(eq(chats.id, b));
  expect(await db.select().from(duplicateChatPairs)).toHaveLength(0);
});

// ── D23 KEEP ownerId: keyword_cooccurrence (parentless per-user aggregate) ─────────────────────────────
test("keyword_cooccurrence KEEPS ownerId (D23), is owner×keyword-pair unique, and FKs the owner", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_kc");
  const id = castId<KeywordCooccurrenceId>("keyword_cooccurrence_one");
  await db.insert(keywordCooccurrence).values({
    id,
    ownerId,
    keywordA: "dragon",
    keywordB: "knight",
    count: 7,
  });

  const rows = await db.select().from(keywordCooccurrence).where(eq(keywordCooccurrence.id, id));
  expect(rows).toHaveLength(1);
  // KEEP (D23) — ownerId IS a column (its own key dimension, not a derivable mirror).
  expect(rows[0]?.ownerId).toBe(ownerId);
  expect(rows[0]?.count).toBe(7);
  expect(rows[0]?.computedAt).toBeTypeOf("number");

  // The (owner, keywordA, keywordB) unique rejects a duplicate pair.
  let caught: unknown;
  try {
    await db.insert(keywordCooccurrence).values({
      id: castId<KeywordCooccurrenceId>("keyword_cooccurrence_dup"),
      ownerId,
      keywordA: "dragon",
      keywordB: "knight",
      count: 2,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  // A missing owner is rejected (FK).
  let caughtFk: unknown;
  try {
    await db.insert(keywordCooccurrence).values({
      id: castId<KeywordCooccurrenceId>("keyword_cooccurrence_fk"),
      ownerId: castId<UserId>("user_missing"),
      keywordA: "ghost",
      keywordB: "manor",
      count: 1,
    });
  } catch (err) {
    caughtFk = err;
  }
  expect(isConstraintViolation(caughtFk)?.kind).toBe("foreign-key");
});

// ── D23 DERIVE: character_keyword_profiles (FK character; no ownerId) ──────────────────────────────────
test("character_keyword_profiles DERIVE ownerId (no column), FK character CASCADE, unique(character,keyword)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_ckp");
  const characterId = await seedCharacter(db, ownerId, "character_ckp");
  const id = castId<CharacterKeywordProfileId>("character_keyword_profile_one");
  await db
    .insert(characterKeywordProfiles)
    .values({ id, characterId, keyword: "brooding", count: 4 });

  const rows = await db
    .select()
    .from(characterKeywordProfiles)
    .where(eq(characterKeywordProfiles.id, id));
  expect(rows).toHaveLength(1);
  // DERIVE (D23) — no ownerId column (owner via characterId → characters.ownerId).
  expect(Object.keys(rows[0] ?? {})).not.toContain("ownerId");

  // unique(character, keyword).
  let caught: unknown;
  try {
    await db.insert(characterKeywordProfiles).values({
      id: castId<CharacterKeywordProfileId>("character_keyword_profile_dup"),
      characterId,
      keyword: "brooding",
      count: 9,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  // CASCADE on character delete.
  await db.delete(characters).where(eq(characters.id, characterId));
  expect(await db.select().from(characterKeywordProfiles)).toHaveLength(0);
});

// ── D23 DERIVE: character_summaries (PK characterId; no ownerId; facet JSON defaults) ──────────────────
test("character_summaries is keyed by characterId, DERIVE ownerId (no column), and CASCADEs on character delete", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_cs");
  const characterId = await seedCharacter(db, ownerId, "character_cs");
  await db.insert(characterSummaries).values({
    characterId,
    genre: "fantasy",
    tone: "dark",
    setting: "a ruined keep",
    elevatorPitch: "a brooding knight",
    overview: "long form",
    model: MODEL,
  });

  const rows = await db
    .select()
    .from(characterSummaries)
    .where(eq(characterSummaries.characterId, characterId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.genre).toBe("fantasy");
  // JSON facet columns default to [] (never null).
  expect(rows[0]?.subGenres).toEqual([]);
  expect(rows[0]?.tags).toEqual([]);
  expect(rows[0]?.computedAt).toBeTypeOf("number");
  // DERIVE (D23) — no ownerId column (owner via characterId → characters.ownerId).
  expect(Object.keys(rows[0] ?? {})).not.toContain("ownerId");

  // The PK is characterId — a second summary for the same character collides.
  let caught: unknown;
  try {
    await db.insert(characterSummaries).values({ characterId, model: MODEL });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  await db.delete(characters).where(eq(characters.id, characterId));
  expect(await db.select().from(characterSummaries)).toHaveLength(0);
});

// ── D23 KEEP: theme_clusters (ownerId + centroid vector32 + unique(owner,level,idx)) ───────────────────
test("theme_clusters KEEPS ownerId (D23) and round-trips the centroid vector32 (k-means MEAN, 1024-dim)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_tc");
  const id = await seedThemeCluster(db, {
    ownerId,
    id: "theme_cluster_one",
    level: "scene",
    clusterIdx: 0,
  });

  const rows = await db.select().from(themeClusters).where(eq(themeClusters.id, id));
  expect(rows).toHaveLength(1);
  // KEEP (D23) — ownerId IS a column.
  expect(rows[0]?.ownerId).toBe(ownerId);
  expect(rows[0]?.level).toBe("scene");
  // The centroid is a real F32_BLOB ⇄ Float32Array round-trip (the slice() alignment idiom).
  expect(rows[0]?.centroid).toBeInstanceOf(Float32Array);
  expect(rows[0]?.centroid).toHaveLength(DIM);
  expect(rows[0]?.name).toBeNull();

  // unique(owner, level, clusterIdx) — a same-address cluster collides; a different level coexists.
  let caught: unknown;
  try {
    await seedThemeCluster(db, {
      ownerId,
      id: "theme_cluster_dup",
      level: "scene",
      clusterIdx: 0,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
  await seedThemeCluster(db, { ownerId, id: "theme_cluster_arc", level: "arc", clusterIdx: 0 });
  expect(
    await db.select().from(themeClusters).where(eq(themeClusters.ownerId, ownerId)),
  ).toHaveLength(2);

  // CASCADE on owner delete.
  await db.delete(users).where(eq(users.id, ownerId));
  expect(await db.select().from(themeClusters)).toHaveLength(0);
});

// ── D23 DERIVE: digest_theme_assignments (composite PK; no ownerId; CASCADE to BOTH parents) ───────────
test("digest_theme_assignments uses a composite PK, DERIVE ownerId, and CASCADEs from digest and cluster", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_dta");
  const chatId = await seedChat(db, "chat_dta");
  const digestId = await seedDigest(db, chatId, "chat_digest_dta");
  const themeClusterId = await seedThemeCluster(db, {
    ownerId,
    id: "theme_cluster_dta",
    level: "scene",
    clusterIdx: 0,
  });

  await db.insert(digestThemeAssignments).values({ digestId, themeClusterId, msgMidAt: 1700 });

  const rows = await db
    .select()
    .from(digestThemeAssignments)
    .where(
      and(
        eq(digestThemeAssignments.digestId, digestId),
        eq(digestThemeAssignments.themeClusterId, themeClusterId),
      ),
    );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.msgMidAt).toBe(1700);
  expect(rows[0]?.computedAt).toBeTypeOf("number");
  // DERIVE (D23) — no ownerId column (owner via digest → chat → host).
  expect(Object.keys(rows[0] ?? {})).not.toContain("ownerId");

  // The composite PK (digest, cluster) rejects a duplicate (SQLite reports it as a UNIQUE failure).
  let caught: unknown;
  try {
    await db.insert(digestThemeAssignments).values({ digestId, themeClusterId });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  // CASCADE from the cluster side (a recompute deletes clusters → assignments vanish).
  await db.delete(themeClusters).where(eq(themeClusters.id, themeClusterId));
  expect(await db.select().from(digestThemeAssignments)).toHaveLength(0);
});

test("digest_theme_assignments CASCADEs when its digest is deleted", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_dta2");
  const chatId = await seedChat(db, "chat_dta2");
  const digestId = await seedDigest(db, chatId, "chat_digest_dta2");
  const themeClusterId = await seedThemeCluster(db, {
    ownerId,
    id: "theme_cluster_dta2",
    level: "scene",
    clusterIdx: 0,
  });
  await db.insert(digestThemeAssignments).values({ digestId, themeClusterId });

  await db.delete(chatDigests).where(eq(chatDigests.id, digestId));
  expect(await db.select().from(digestThemeAssignments)).toHaveLength(0);
});

// ── The D23 ownership-shape SUMMARY: ownerId present on the 2 KEEP tables, absent on the 5 DERIVE ──────
test("D23 ownership shape: ownerId column exists ONLY on keyword_cooccurrence + theme_clusters", () => {
  expect(keywordCooccurrence.ownerId).toBeDefined();
  expect(themeClusters.ownerId).toBeDefined();
  // The 5 derived tables carry NO ownerId column (owner reached via one FK).
  expect("ownerId" in duplicateCharacterPairs).toBe(false);
  expect("ownerId" in duplicateChatPairs).toBe(false);
  expect("ownerId" in characterKeywordProfiles).toBe(false);
  expect("ownerId" in characterSummaries).toBe(false);
  expect("ownerId" in digestThemeAssignments).toBe(false);
});
