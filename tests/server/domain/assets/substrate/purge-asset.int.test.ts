// substrate/purge-asset — the ONE drop-row-BEFORE-blob primitive shared by both GC paths. Pins the header's
// two branches the verb-level tests (reap-if-orphan.int.test.ts) don't isolate directly: `assetId ===
// undefined` (a pure orphan blob — no row to drop, steps 2+3 only) and a newly-live row winning the race
// (returns false without touching either byte store).

import { assets } from "@orb/db";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { purgeAsset } from "../../../../../packages/server/src/domain/assets/substrate/purge-asset.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, principal, seedCharacter, seedUser, setCharacterAvatar } from "../_support.ts";

const PNG = "image/png";

describe("purgeAsset", () => {
  test("assetId undefined (a pure orphan blob): removes the blob, no row lookup involved", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await createAssetsService(h.ctx).store({ principal: principal(owner), bytes: pngBytes(30), kind: "avatar", mime: PNG });
    // Drop the row directly so only the blob remains — the "pure orphan blob" shape purgeAsset(assetId: undefined) targets.
    await db.delete(assets).where(eq(assets.id, stored.assetId));
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);

    const won = await purgeAsset({ db, cas: h.ctx.cas, variants: h.ctx.variants, assetId: undefined, ownerId: owner, hash: stored.hash });

    expect(won).toBe(true);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });

  test("a newly-live row (still referenced) wins the race — returns false, touches neither byte store", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await createAssetsService(h.ctx).store({ principal: principal(owner), bytes: pngBytes(31), kind: "avatar", mime: PNG });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    await setCharacterAvatar(db, character, stored.assetId);

    const won = await purgeAsset({ db, cas: h.ctx.cas, variants: h.ctx.variants, assetId: stored.assetId, ownerId: owner, hash: stored.hash });

    expect(won).toBe(false);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("an omitted variants handle (DR/rebuild env) is tolerated — the optional chain skips removeAll", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await createAssetsService(h.ctx).store({ principal: principal(owner), bytes: pngBytes(32), kind: "avatar", mime: PNG });

    const won = await purgeAsset({ db, cas: h.ctx.cas, variants: undefined, assetId: stored.assetId, ownerId: owner, hash: stored.hash });

    expect(won).toBe(true);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });
});
