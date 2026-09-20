// verb: editImage — explicit edit of an owned image (imagery-design/02 §4). Proves against a real libSQL db:
// the source bytes are resolved (owned asset via readAsset, or direct upload bytes), the CAPABILITY GATE
// throws `ImageEditUnsupportedError` on a non-edit model (the asymmetric posture — doc 01 §3.4), and a
// successful edit stores a `kind:"generated"` asset + an `imagery_generations` row (`edited:true`,
// `mode:"free"`, `identityHash` null — never reuse-gated) with the instruction as the verbatim prompt.

import type { Db } from "@orb/db";
import { assets, imageryGenerations } from "@orb/db";
import type { AssetId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageGenerateRequest } from "@orb/server/domain/imagery";
import { createImageryService, ImageEditUnsupportedError } from "@orb/server/domain/imagery";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, PNG_BYTES, principal, resolutionWith, seedOwner } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

const SOURCE_ASSET = castId<AssetId>("asset_source");

describe("editImage — the capability gate (doc 03 §1)", () => {
  test("a non-edit model throws ImageEditUnsupportedError — no asset, no row", async () => {
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db, { resolveGenerateImage: resolutionWith(false) });

    await expect(
      createImageryService(ctx).editImage({
        caller: principal(owner),
        source: { assetId: SOURCE_ASSET },
        instruction: "make it night",
      }),
    ).rejects.toThrow(ImageEditUnsupportedError);

    expect(await db.select().from(imageryGenerations)).toHaveLength(0);
    // No GENERATED asset was written (the source is read, never stored by this verb).
    expect(await db.select().from(assets)).toHaveLength(0);
  });
});

describe("editImage — the edit path (doc 02 §4)", () => {
  test("an owned-asset source is read via readAsset, edited, and stored (edited:true, mode:free, no identity hash)", async () => {
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const editReqs: ImageGenerateRequest[] = [];
    const { ctx, readAssetCalls } = makeHarness(db, {
      resolveGenerateImage: resolutionWith(true),
      generateImage: (req) => {
        editReqs.push(req);
        return Promise.resolve({
          images: [{ base64: Buffer.from(PNG_BYTES).toString("base64"), mediaType: "image/png", url: undefined }],
          model: "edit-model",
          usage: { costUsd: 0.04 },
          warnings: [],
        });
      },
    });

    const result = await createImageryService(ctx).editImage({
      caller: principal(owner),
      source: { assetId: SOURCE_ASSET },
      instruction: "make it night",
    });

    // The source rode the owner-gated readAsset port and became the edit init image.
    expect(readAssetCalls).toContain(SOURCE_ASSET);
    expect(editReqs).toHaveLength(1);
    expect(editReqs[0]?.edit?.image).toEqual(PNG_BYTES);
    expect(editReqs[0]?.prompt).toBe("make it night");

    expect(result.promptSource).toBe("user");
    expect(result.mode).toBe("free");
    expect(result.reused).toBe(false);
    expect(result.costUsd).toBe(0.04);

    const rows = await db.select().from(imageryGenerations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mode: "free", prompt: "make it night", edited: true });
    expect(rows[0]?.identityHash).toBeNull();
    expect(rows[0]?.subjectCharacterId).toBeNull();
    const assetRows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(assetRows[0]?.kind).toBe("generated");
  });

  test("an upload-bytes source is used directly — readAsset is never called; a mask rides the edit payload", async () => {
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const editReqs: ImageGenerateRequest[] = [];
    const maskBytes = Uint8Array.from([9, 9, 9, 9]);
    const { ctx, readAssetCalls } = makeHarness(db, {
      resolveGenerateImage: resolutionWith(true),
      generateImage: (req) => {
        editReqs.push(req);
        return Promise.resolve({
          images: [{ base64: Buffer.from(PNG_BYTES).toString("base64"), mediaType: "image/png", url: undefined }],
          model: "edit-model",
          usage: { costUsd: 0.04 },
          warnings: [],
        });
      },
    });

    await createImageryService(ctx).editImage({
      caller: principal(owner),
      source: { bytes: PNG_BYTES, mime: "image/png" },
      instruction: "add a scar",
      mask: { bytes: maskBytes, mime: "image/png" },
    });

    expect(readAssetCalls).toHaveLength(0);
    expect(editReqs[0]?.edit?.image).toEqual(PNG_BYTES);
    expect(editReqs[0]?.edit?.mask).toEqual(maskBytes);
  });

  test("a runner belt warning (e.g. a dropped mask) surfaces onto the result", async () => {
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db, {
      resolveGenerateImage: resolutionWith(true),
      generateImage: () =>
        Promise.resolve({
          images: [{ base64: Buffer.from(PNG_BYTES).toString("base64"), mediaType: "image/png", url: undefined }],
          model: "edit-model",
          usage: { costUsd: 0.04 },
          warnings: [{ code: "image_edit_dropped", detail: "edit-model: the mask was dropped" }],
        }),
    });

    const result = await createImageryService(ctx).editImage({
      caller: principal(owner),
      source: { bytes: PNG_BYTES, mime: "image/png" },
      instruction: "add a scar",
      mask: { bytes: Uint8Array.from([1, 2]), mime: "image/png" },
    });

    expect(result.warnings).toEqual([{ code: "image_edit_dropped", detail: "edit-model: the mask was dropped" }]);
  });
});

// ── composed-real: the resolved capability must ride domain → the REAL openrouter runner edit-strip belt ──
// The domain suites above assert against a FAKE `generateImage` that records the request and never runs the
// belt — so a missing `capability` on the request was invisible (the graduation-audit finding). These tests
// wire the domain to the REAL `runGenerateImage` through the EXACT compose bridge (real runner + the
