// verbs: importPoses + listOwnedPoses — BYO OpenPose skeleton import (comfyui-control §4.12.2, C6c). Stores
// each skeleton as a `kind:"pose"` CAS asset + a `pose_library` entry; single and batch share one verb with
// honest-partial (a magic-sniff refusal drops THAT item, the rest land). Owner-scoped via the `asset_id →
// assets.ownerId` join (the row has no ownerId). Orientation is COMPUTED from the decoded dims. The FK is
// ON DELETE CASCADE — deleting the skeleton asset erases its registry entry (GC coherence).

import { assets, poseLibrary } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

describe("importPoses", () => {
  test("a single skeleton stores a kind:pose asset + a pose_library entry (orientation from dims)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    h.imageProbe.mockResolvedValueOnce({ format: "png", width: 832, height: 1216 }); // portrait
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "a" });

    const result = await svc.importPoses({
      principal: principal(owner),
      items: [{ bytes: pngBytes(1), mime: PNG, name: "  Warrior Stance  ", category: "Standing", tags: ["Hero", "hero", " "] }],
    });

    expect(result.failures).toEqual([]);
    expect(result.imported).toHaveLength(1);
    const pose = result.imported[0];
    expect(pose?.orientation).toBe("portrait");
    expect(pose?.name).toBe("warrior stance"); // trim → NFKC → lowercase
    expect(pose?.category).toBe("standing");
    expect(pose?.tags).toEqual(["hero"]); // normalized + de-duped, empties dropped
    expect(pose?.source).toBe("byo");
    // the CAS asset is kind:"pose"
    const assetRows = await db
      .select({ kind: assets.kind })
      .from(assets)
      .where(eq(assets.id, pose?.assetId ?? castId<AssetId>("asset_none")));
    expect(assetRows[0]?.kind).toBe("pose");
    // asset.created emitted (the indexer subscribes)
    expect(h.emitted.some((e) => e.type === "asset.created")).toBe(true);
    // it surfaces on the owner's list
    const list = await svc.listOwnedPoses({ principal: principal(owner) });
    expect(list.map((p) => p.id)).toEqual([pose?.id]);
  });

  test("a batch drops ONLY the bad image (honest-partial), the rest land", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "a" });

    const result = await svc.importPoses({
      principal: principal(owner),
      items: [
        { bytes: pngBytes(1), mime: PNG, name: "good-1", category: "action" },
        { bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]), mime: PNG, name: "not-an-image", category: "action" }, // magic mismatch
        { bytes: pngBytes(2), mime: PNG, name: "good-2", category: "action" },
      ],
    });

    expect(result.imported.map((p) => p.name)).toEqual(["good-1", "good-2"]);
    expect(result.failures.map((f) => f.name)).toEqual(["not-an-image"]);
    expect(result.failures[0]?.reason.length).toBeGreaterThan(0);
    // the whole batch was NOT rolled back — two rows persisted
    expect(await svc.listOwnedPoses({ principal: principal(owner) })).toHaveLength(2);
  });

  test("owner-scoped: B never sees A's imported poses", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const a = await seedUser(db, { handle: "a" });
    const b = await seedUser(db, { handle: "b" });

    await svc.importPoses({ principal: principal(a), items: [{ bytes: pngBytes(1), mime: PNG, name: "a-pose", category: "lying" }] });

    expect(await svc.listOwnedPoses({ principal: principal(b) })).toEqual([]);
    expect((await svc.listOwnedPoses({ principal: principal(a) })).map((p) => p.name)).toEqual(["a-pose"]);
  });

  test("the category filter narrows the list", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "a" });

    await svc.importPoses({
      principal: principal(owner),
      items: [
        { bytes: pngBytes(1), mime: PNG, name: "s1", category: "standing" },
        { bytes: pngBytes(2), mime: PNG, name: "k1", category: "kneeling" },
      ],
    });

    expect((await svc.listOwnedPoses({ principal: principal(owner), category: "standing" })).map((p) => p.name)).toEqual(["s1"]);
  });

  test("FK CASCADE: deleting the skeleton asset erases its pose_library entry", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "a" });

    const result = await svc.importPoses({ principal: principal(owner), items: [{ bytes: pngBytes(1), mime: PNG, name: "p", category: "action" }] });
    const assetId = result.imported[0]?.assetId ?? castId<AssetId>("asset_none");
    expect((await db.select().from(poseLibrary).where(eq(poseLibrary.assetId, assetId))).length).toBe(1);

    await db.delete(assets).where(eq(assets.id, assetId));
    expect((await db.select().from(poseLibrary).where(eq(poseLibrary.assetId, assetId))).length).toBe(0);
  });
});
