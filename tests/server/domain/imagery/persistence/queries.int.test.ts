// persistence: imagery/queries — the ONE `imagery_generations` writer (imagery-design/03 §4.1). Proves the
// INSERT lands a well-formed provenance row against the real schema (the FK to `assets`, the mode CHECK, the
// nullable free-mode columns left at their defaults).

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { Db } from "@orb/db";
import { assets, characters, imageryGenerations, users } from "@orb/db";
import type { AssetId, CharacterId, Handle, ImageryGenerationId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { findReusableGeneration, insertGeneration, readProvenanceByAsset } from "../../../../../packages/server/src/domain/imagery/persistence/queries";
import { freshDb } from "../../../../support/db";
import { makeCharacter } from "../../../../support/factories/character";
import { expect, test } from "../../../../support/fixtures";

const FROZEN_AT = 1_750_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

async function seedOwnedAsset(): Promise<{ owner: UserId; assetId: AssetId }> {
  const owner = castId<UserId>("user_owner");
  await db.insert(users).values({ id: owner, handle: castId<Handle>("owner"), role: "user", enabled: true });
  const assetId = castId<AssetId>("asset_gen");
  await db.insert(assets).values({
    id: assetId,
    ownerId: owner,
    kind: "generated",
    mime: "image/png",
    size: 8,
    hash: "hash_gen",
  });
  return { owner, assetId };
}

describe("insertGeneration", () => {
  test("writes one free-mode provenance row tied to the stored asset", async () => {
    const { assetId } = await seedOwnedAsset();
    const id = castId<ImageryGenerationId>("imagery_generation_1");

    await insertGeneration(db, {
      id,
      assetId,
      chatId: null,
      mode: "free",
      subjectCharacterId: null,
      identityHash: null,
      prompt: "a lighthouse at dusk",
      negativePrompt: null,
      model: castId<ModelId>("img-model"),
      costUsd: 0.05,
      edited: false,
      createdAt: FROZEN_AT,
    });

    const rows = await db.select().from(imageryGenerations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      assetId,
      chatId: null,
      mode: "free",
      prompt: "a lighthouse at dusk",
      model: "img-model",
      costUsd: 0.05,
      edited: false,
      // The free-mode call leaves the portrait/negative columns null.
      subjectCharacterId: null,
      identityHash: null,
      negativePrompt: null,
    });
  });

  test("fills the portrait columns (subject + identity hash + negative) when supplied", async () => {
    const { owner, assetId } = await seedOwnedAsset();
    await db.insert(characters).values(makeCharacter({ id: castId<CharacterId>("character_aria"), ownerId: owner }));
    await insertGeneration(db, {
      id: castId<ImageryGenerationId>("imagery_generation_p"),
      assetId,
      chatId: null,
      mode: "character",
      subjectCharacterId: castId<CharacterId>("character_aria"),
      identityHash: "deadbeef",
      prompt: "full body portrait, red hair",
      negativePrompt: "text, watermark",
      model: castId<ModelId>("img-model"),
      costUsd: null,
      edited: false,
      createdAt: FROZEN_AT,
    });
    const rows = await db.select().from(imageryGenerations);
    expect(rows[0]).toMatchObject({ subjectCharacterId: "character_aria", identityHash: "deadbeef", negativePrompt: "text, watermark" });
  });
});

const MODE_CHARACTER: PromptTemplateMode = "character";
const HASH = "identity_hash_aria";
const ARIA = castId<CharacterId>("character_aria");
const PORTRAIT_PROMPT = "full body portrait, red hair";

interface SeedArgs {
  readonly owner: UserId;
  readonly generationId: string;
  readonly assetId: string;
  readonly createdAt: number;
  readonly identityHash?: string | null;
  readonly subjectCharacterId?: string | null;
}

/** Seed one owned generation row (its own asset) so the reuse lookup + provenance read have real joins.
 *  `identityHash`/`subjectCharacterId` default to the Aria portrait; pass `null` to blank them. */
async function seedGeneration(args: SeedArgs): Promise<void> {
  const { owner, generationId, createdAt, identityHash = HASH, subjectCharacterId = "character_aria" } = args;
  const assetId = castId<AssetId>(args.assetId);
  await db.insert(assets).values({ id: assetId, ownerId: owner, kind: "generated", mime: "image/png", size: 8, hash: args.assetId });
  if (subjectCharacterId !== null) {
    // The provenance FK needs a real character; upsert-ignore so repeated generations reuse the one row.
    const character = makeCharacter({ id: castId<CharacterId>(subjectCharacterId), ownerId: owner });
    await db.insert(characters).values(character).onConflictDoNothing();
  }
  await insertGeneration(db, {
    id: castId<ImageryGenerationId>(generationId),
    assetId,
    chatId: null,
    mode: MODE_CHARACTER,
    subjectCharacterId: subjectCharacterId === null ? null : castId<CharacterId>(subjectCharacterId),
    identityHash,
    prompt: PORTRAIT_PROMPT,
    negativePrompt: null,
    model: castId<ModelId>("img-model"),
    costUsd: 0.02,
    edited: false,
    createdAt,
  });
}

async function seedUser(handle: string): Promise<UserId> {
  const id = castId<UserId>(`user_${handle}`);
  await db.insert(users).values({ id, handle: castId<Handle>(handle), role: "user", enabled: true });
  return id;
}

function lookup(owner: UserId, identityHash: string): Promise<Awaited<ReturnType<typeof findReusableGeneration>>> {
  return findReusableGeneration(db, { ownerId: owner, subjectCharacterId: ARIA, mode: MODE_CHARACTER, identityHash });
}

describe("findReusableGeneration", () => {
  test("matches on (owner, subject, mode, identityHash) — the newest generation, all its images", async () => {
    const owner = await seedUser("owner");
    // An older single-image generation, then a newer 3-image generation (shared createdAt).
    await seedGeneration({ owner, generationId: "g_old", assetId: "asset_old", createdAt: FROZEN_AT });
    for (let i = 0; i < 3; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential seeding in a test.
      await seedGeneration({ owner, generationId: `g_new_${i}`, assetId: `asset_new_${i}`, createdAt: FROZEN_AT + 1000 });
    }

    const hits = await lookup(owner, HASH);
    // Newest-generation-wins: the 3-image set, never the older single row.
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.assetId).sort()).toEqual(["asset_new_0", "asset_new_1", "asset_new_2"]);
  });

  test("a changed identity hash misses (no reuse)", async () => {
    const owner = await seedUser("owner");
    await seedGeneration({ owner, generationId: "g1", assetId: "asset_1", createdAt: FROZEN_AT });
    expect(await lookup(owner, "different_hash")).toHaveLength(0);
  });

  test("cross-owner isolation — a match under another owner is never returned", async () => {
    const owner = await seedUser("owner");
    const other = await seedUser("other");
    await seedGeneration({ owner: other, generationId: "g_other", assetId: "asset_other", createdAt: FROZEN_AT });
    expect(await lookup(owner, HASH)).toHaveLength(0);
  });
});

describe("readProvenanceByAsset", () => {
  test("returns the provenance for an owned generated asset", async () => {
    const owner = await seedUser("owner");
    await seedGeneration({ owner, generationId: "g1", assetId: "asset_1", createdAt: FROZEN_AT });
    const prov = await readProvenanceByAsset(db, owner, castId<AssetId>("asset_1"));
    expect(prov).toMatchObject({
      generationId: "g1",
      assetId: "asset_1",
      mode: "character",
      prompt: PORTRAIT_PROMPT,
      subjectCharacterId: "character_aria",
      model: "img-model",
      costUsd: 0.02,
      edited: false,
    });
  });

  test("a foreign owner reads null (no cross-owner provenance leak)", async () => {
    const owner = await seedUser("owner");
    const other = await seedUser("other");
    await seedGeneration({ owner, generationId: "g1", assetId: "asset_1", createdAt: FROZEN_AT });
    expect(await readProvenanceByAsset(db, other, castId<AssetId>("asset_1"))).toBeNull();
  });

  test("an asset with no provenance row reads null", async () => {
    const owner = await seedUser("owner");
    const assetId = castId<AssetId>("asset_bare");
    await db.insert(assets).values({ id: assetId, ownerId: owner, kind: "generated", mime: "image/png", size: 8, hash: "bare" });
    expect(await readProvenanceByAsset(db, owner, assetId)).toBeNull();
  });
});
