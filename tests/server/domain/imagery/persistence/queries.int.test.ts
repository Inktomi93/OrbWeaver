// persistence: imagery/queries — the ONE `imagery_generations` writer (imagery-design/03 §4.1). Proves the
// INSERT lands a well-formed provenance row against the real schema (the FK to `assets`, the mode CHECK, the
// nullable free-mode columns left at their defaults).

import type { Db } from "@orb/db";
import { assets, imageryGenerations, users } from "@orb/db";
import type { AssetId, Handle, ImageryGenerationId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { insertGeneration } from "../../../../../packages/server/src/domain/imagery/persistence/queries";
import { freshDb } from "../../../../support/db";
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
      prompt: "a lighthouse at dusk",
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
      // The Phase-7 reserved columns stay null in free mode.
      subjectCharacterId: null,
      identityHash: null,
      negativePrompt: null,
    });
  });
});
