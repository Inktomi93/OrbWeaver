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
import { sniffMime } from "@orb/kit/image-sniff";
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
  readonly fetchImageCalls: string[];
}

function makeHarness(overrides: Partial<ImageryContext> = {}): Harness {
  const ids = createSeededIds();
  const recordedStats: StatsDelta[] = [];
  const generateCalls: number[] = [];
  const fetchImageCalls: string[] = [];
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
    fetchImage: (url) => {
      fetchImageCalls.push(url);
      return Promise.resolve(null);
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
  return { ctx, recordedStats, generateCalls, fetchImageCalls };
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

    // fan-out via n, never a per-image loop.
    expect(generateCalls).toEqual([1]);

    expect(result.images).toHaveLength(1);
    expect(result.promptSource).toBe("user");
    expect(result.reused).toBe(false);
    expect(result.mode).toBe("free");
    expect(result.model).toBe("img-model");
    expect(result.costUsd).toBe(0.02);
    const block = result.images[0]?.block;
    expect(block).toMatchObject({ kind: "media", media: "image", src: { kind: "asset" } });

    const assetRows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(assetRows).toHaveLength(1);
    expect(assetRows[0]?.kind).toBe("generated");

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

  test("a provider URL image is downloaded via the SSRF-safe fetchImage port, then stored", async () => {
    const owner = await seedOwner("owner");
    const url = "https://cdn.example/generated/dragon.png";
    const { ctx, fetchImageCalls } = makeHarness({
      generateImage: () =>
        Promise.resolve({
          images: [{ url, base64: undefined, mediaType: "image/png" }],
          model: "img-model",
          usage: { costUsd: 0.01 },
        }),
      fetchImage: (u) => {
        fetchImageCalls.push(u);
        return Promise.resolve(PNG_BYTES);
      },
    });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      mode: "free",
      prompt: "a dragon over a castle",
    });

    // The provider-controlled URL rode the injected port (→ safeFetch), never a raw fetch.
    expect(fetchImageCalls).toEqual([url]);
    expect(result.images).toHaveLength(1);
    const assetRows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(assetRows).toHaveLength(1);
    expect(assetRows[0]?.kind).toBe("generated");
  });

  test("a URL the SSRF-safe port rejects (null) is dropped → GenerationFailedError, no asset/row", async () => {
    const owner = await seedOwner("owner");
    // fetchImage returns null for an SSRF-blocked / non-2xx / oversized / failed download (the harness
    // default) — the only image drops, so the generation fails closed and nothing is persisted.
    const { ctx, fetchImageCalls } = makeHarness({
      generateImage: () =>
        Promise.resolve({
          images: [{ url: "http://169.254.169.254/latest/meta-data/", base64: undefined }],
          model: "img-model",
          usage: { costUsd: null },
        }),
    });

    await expect(
      createImageryService(ctx).generatePicture({
        caller: principal(owner),
        mode: "free",
        prompt: "exfiltrate",
      }),
    ).rejects.toThrow();

    expect(fetchImageCalls).toEqual(["http://169.254.169.254/latest/meta-data/"]);
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

// F4 — imagery derives the claimed mime from `@orb/kit/image-sniff`, the SAME signature table assets'
// `enforceMagic:true` re-checks against (the forked local copy DIVERGED — e.g. a 4-byte "GIF8" prefix vs the
// kit's strict GIF87a/89a — and could send a mismatch into a PAID store). The default harness fakes storeAsset
// without magic-checking, so that integration point was never exercised; these tests store through a fake that
// mirrors the real `enforceMagic` (re-sniff the bytes via the shared table; reject an unrecognized signature /
// a claimed-vs-sniffed mismatch — assets/persistence/queries.ts `storeBlob`).
const OCTET_STREAM = "application/octet-stream";
const MAGIC_ERROR = /magic/;

/** A storeAsset fake that mirrors assets' real `enforceMagic:true` (re-sniff via the SHARED kit table; reject
 *  an unrecognized signature / a claimed-vs-sniffed mismatch) — the integration point the default harness fakes
 *  away (F4). */
function enforcingStoreAsset(): ImageryContext["storeAsset"] {
  let n = 0;
  return async (caller, bytes, kind, mime) => {
    const sniffed = sniffMime(bytes);
    if (sniffed === OCTET_STREAM) {
      throw new Error(`assets.store: unrecognized magic bytes — claimed ${mime}`);
    }
    if (sniffed !== mime) {
      throw new Error(`assets.store: magic-byte mismatch — claimed ${mime}, sniffed ${sniffed}`);
    }
    n += 1;
    const assetId = castId<AssetId>(`asset_${n}`);
    await db.insert(assets).values({
      id: assetId,
      ownerId: caller.userId,
      kind,
      mime,
      size: bytes.length,
      hash: `h${n}`,
    });
    return { assetId, hash: `h${n}`, size: bytes.length, created: true };
  };
}

describe("generatePicture — sniff ↔ assets.enforceMagic agreement (F4)", () => {
  test("a real PNG: the claimed mime matches the shared magic check → stored (agreement)", async () => {
    const owner = await seedOwner("owner");
    const { ctx } = makeHarness({ storeAsset: enforcingStoreAsset() });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      mode: "free",
      prompt: "a dragon",
    });

    expect(result.images).toHaveLength(1);
    const rows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(rows).toHaveLength(1);
    // The claimed mime is what the shared kit table sniffs — so it passes `enforceMagic` byte-for-byte.
    expect(rows[0]?.mime).toBe("image/png");
  });

  test("an unrecognized signature (e.g. AVIF) is coherently rejected by the shared check, not silently stored", async () => {
    const owner = await seedOwner("owner");
    // Bytes the shared table does NOT recognize (kit → octet-stream); the provider claims image/avif. The
    // caller-policy fallback claims that mediaType, and the SAME magic check assets runs rejects it — a coherent
    // rejection at the store boundary, never a wrong-typed asset slipped through a divergent local table.
    const garbage = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const { ctx } = makeHarness({
      storeAsset: enforcingStoreAsset(),
      generateImage: () =>
        Promise.resolve({
          images: [
            {
              base64: Buffer.from(garbage).toString("base64"),
              mediaType: "image/avif",
              url: undefined,
            },
          ],
          model: "img-model",
          usage: { costUsd: 0.03 },
        }),
    });

    await expect(
      createImageryService(ctx).generatePicture({
        caller: principal(owner),
        mode: "free",
        prompt: "avif art",
      }),
    ).rejects.toThrow(MAGIC_ERROR);
    // No wrong-typed asset landed.
    expect(await db.select().from(assets).where(eq(assets.ownerId, owner))).toHaveLength(0);
  });
});
