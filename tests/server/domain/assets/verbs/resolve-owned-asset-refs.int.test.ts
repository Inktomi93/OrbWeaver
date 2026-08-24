// verb: resolveOwnedAssetRefs (#67) — the owner-scoped `(assetId, hash)` resolver shared by the inline-image
// RENDER path (tRPC `assets.resolveBlobRefs`) and the send-attach TRUST BOUNDARY. Proves: it returns the
// caller's OWN assets among the requested ids (with the stored hash the client turns into `blobUrl`), and a
// FOREIGN / unknown / gone id is simply absent (owner-scoped — no leak, no cross-user hash oracle). Empty
// input ⇒ empty result (no query).

import type { AssetId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, pngBytesWithDims, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

describe("resolveOwnedAssetRefs", () => {
  test("returns (assetId, hash) for the owner's assets among the requested ids", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const one = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "attachment",
      mime: PNG,
    });
    const two = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(2),
      kind: "attachment",
      mime: PNG,
    });

    const refs = await svc.resolveOwnedAssetRefs(owner, [one.assetId, two.assetId]);
    expect(new Map(refs.map((r) => [r.assetId, r.hash]))).toEqual(
      new Map([
        [one.assetId, one.hash],
        [two.assetId, two.hash],
      ]),
    );
  });

  test("#625: the ref carries the STORED dimensions — real for a parseable header, null when there is none", async () => {
    // The reservation seam end-to-end through persistence: `store` sniffs the header once and the resolver
    // hands both facts to the render side. The null arm is a legitimate outcome, not a failure — the
    // renderer falls back to its placeholder aspect for an asset whose bytes declare no size.
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const sized = await svc.store({ principal: principal(owner), bytes: pngBytesWithDims(1024, 1536, 7), kind: "attachment", mime: PNG });
    const headerless = await svc.store({ principal: principal(owner), bytes: pngBytes(9), kind: "attachment", mime: PNG });

    const refs = await svc.resolveOwnedAssetRefs(owner, [sized.assetId, headerless.assetId]);
    const byId = new Map(refs.map((r) => [r.assetId, { width: r.width, height: r.height }]));
    expect(byId.get(sized.assetId)).toEqual({ width: 1024, height: 1536 });
    expect(byId.get(headerless.assetId)).toEqual({ width: null, height: null });
  });

  test("owner-scoped: a foreign owner's asset id resolves to nothing (no leak)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });

    const mine = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "attachment",
      mime: PNG,
    });
    const theirs = await svc.store({
      principal: principal(other),
      bytes: pngBytes(2),
      kind: "attachment",
      mime: PNG,
    });

    // The owner asks for BOTH ids — only their own comes back; the foreign id is absent.
    const refs = await svc.resolveOwnedAssetRefs(owner, [mine.assetId, theirs.assetId]);
    expect(refs.map((r) => r.assetId)).toEqual([mine.assetId]);
  });

  test("an unknown id + empty input both resolve to empty", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    expect(await svc.resolveOwnedAssetRefs(owner, [castId<AssetId>("asset_missing")])).toEqual([]);
    expect(await svc.resolveOwnedAssetRefs(owner, [])).toEqual([]);
  });
});
