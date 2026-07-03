// verb: generatePicture — the P5 free-mode orchestrator (imagery-design/02 §1). Proves against a real libSQL
// db: a returned base64 image is decoded, stored as a `kind:"generated"` asset (via the injected CAS write),
// a matching `imagery_generations` provenance row is written (store-THEN-provenance), one economics delta is
// recorded, and the `GeneratedPicture` carries a D44 media block. The infra executor + role resolver + CAS
// write are stubs (imagery declares their port; the composition root binds the real infra).

import type { ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { assets, imageryGenerations, users } from "@orb/db";
import type { AssetId, Handle, ImageryGenerationId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageryContext } from "@orb/server/domain/imagery";
import { createImageryService } from "@orb/server/domain/imagery";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { createSeededIds } from "../../../../support/ids";

const FROZEN_AT = 1_750_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

async function seedOwner(handle: string): Promise<UserId> {
  const id = castId<UserId>(`user_${handle}`);
  await db
    .insert(users)
    .values({ id, handle: castId<Handle>(handle), role: "user", enabled: true });
  return id;
}

function principal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

/** A tiny valid PNG header — sniffMime resolves it to image/png. */
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString("base64");

interface Harness {
  readonly ctx: ImageryContext;
  readonly recordedStats: StatsDelta[];
  readonly generateCalls: number[];
}

function makeHarness(overrides: Partial<ImageryContext> = {}): Harness {
  const ids = createSeededIds();
  const recordedStats: StatsDelta[] = [];
  const generateCalls: number[] = [];
  const connection = {
    api: "chat-completions",
    model: castId<ModelId>("img-model"),
    credential: {} as unknown as ResolvedCredential,
    capability: {} as unknown as ResolvedConnection["capability"],
  } as ResolvedConnection;
  const ctx: ImageryContext = {
    db,
    now: () => FROZEN_AT,
    newGenerationId: (): ImageryGenerationId =>
      castId<ImageryGenerationId>(ids.next("imagery_generation")),
    resolveGenerateImage: () => Promise.resolve({ connection, capability: connection.capability }),
    generateImage: (req) => {
      generateCalls.push(req.n ?? 1);
      return Promise.resolve({
        images: [{ base64: PNG_BASE64, mediaType: "image/png", url: undefined }],
        model: "img-model",
        usage: { costUsd: 0.02 },
      });
    },
    storeAsset: async (caller, bytes, kind, mime) => {
      const assetId = castId<AssetId>(ids.next("asset"));
      await db.insert(assets).values({
        id: assetId,
        ownerId: caller.userId,
        kind,
        mime,
        size: bytes.length,
        hash: ids.next("hash"),
      });
      return { assetId, hash: "h", size: bytes.length, created: true };
    },
    recordStats: (delta) => {
      recordedStats.push(delta);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { ctx, recordedStats, generateCalls };
}

describe("generatePicture (free mode)", () => {
  test("stores one generated asset + one provenance row + returns a media block", async () => {
    const owner = await seedOwner("owner");
    const { ctx, recordedStats, generateCalls } = makeHarness();

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      mode: "free",
      prompt: "a dragon over a castle",
    });

    // The provider was called once (fan-out via n, never a per-image loop).
    expect(generateCalls).toEqual([1]);

    // The result shape: one image, a D44 media block, user-sourced, not reused.
    expect(result.images).toHaveLength(1);
    expect(result.promptSource).toBe("user");
    expect(result.reused).toBe(false);
    expect(result.mode).toBe("free");
    expect(result.model).toBe("img-model");
    expect(result.costUsd).toBe(0.02);
    const block = result.images[0]?.block;
    expect(block).toMatchObject({ kind: "media", media: "image", src: { kind: "asset" } });

    // One stored asset, kind "generated".
    const assetRows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(assetRows).toHaveLength(1);
    expect(assetRows[0]?.kind).toBe("generated");

    // One provenance row, free-mode, tied to the stored asset.
    const genRows = await db.select().from(imageryGenerations);
    expect(genRows).toHaveLength(1);
    expect(genRows[0]).toMatchObject({
      mode: "free",
      prompt: "a dragon over a castle",
      model: "img-model",
      costUsd: 0.02,
      edited: false,
    });
    expect(genRows[0]?.assetId).toBe(assetRows[0]?.id);

    // One economics delta recorded, attributed to the caller.
    expect(recordedStats).toHaveLength(1);
    expect(recordedStats[0]).toMatchObject({ ownerId: owner, modelGenerations: 1 });
  });

  test("zero decodable images → GenerationFailedError (no asset, no row)", async () => {
    const owner = await seedOwner("owner");
    const { ctx } = makeHarness({
      generateImage: () =>
        Promise.resolve({ images: [], model: "img-model", usage: { costUsd: null } }),
    });

    await expect(
      createImageryService(ctx).generatePicture({
        caller: principal(owner),
        mode: "free",
        prompt: "nothing",
      }),
    ).rejects.toThrow();

    expect(await db.select().from(imageryGenerations)).toHaveLength(0);
    expect(await db.select().from(assets)).toHaveLength(0);
  });

  test("a missing prompt is refused (extraction is Phase 7)", async () => {
    const owner = await seedOwner("owner");
    const { ctx } = makeHarness();

    await expect(
      createImageryService(ctx).generatePicture({ caller: principal(owner), mode: "free" }),
    ).rejects.toThrow();
  });
});
