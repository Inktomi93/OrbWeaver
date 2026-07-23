// verb: addExternalBackground (F-P0-2) — materialize a user-pasted external image URL into an owned CAS asset
// and return a ready BackgroundLibraryEntry (the client appends it via the autosave form). Load-bearing:
//   • SUCCESS: the injected materialize op's asset becomes the entry; the original URL rides `provenanceUrl`;
//     a stable `entryId` is minted (never a paintable external URL persisted).
//   • REFUSAL: an unreachable / non-image / too-large URL throws a coded `background_unavailable`.
//   • an empty URL is rejected before any fetch (`background_url_empty`).

import { DomainOperationError } from "@orb/kit/errors";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

const STORED: { assetId: AssetId; assetHash: string; mime: string } = {
  assetId: castId<AssetId>("asset_materialized00000001"),
  assetHash: "hash_materialized",
  mime: "image/png",
};

describe("addExternalBackground", () => {
  test("materializes an external URL into a library entry: asset ref + provenanceUrl + minted entryId, name from the URL", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { materializeBackground: () => Promise.resolve({ ok: true, asset: STORED }) });
    const u = await seedUser(db, { id: "user_u" });

    const entry = await h.svc.addExternalBackground({ principal: principal(u, "user"), url: "https://cdn.example/wallpaper.png" });

    expect(entry).toEqual({
      entryId: "bg_entry_1", // the harness's deterministic newBackgroundEntryId
      assetId: STORED.assetId,
      assetHash: STORED.assetHash,
      mime: STORED.mime,
      name: "wallpaper", // the URL's last path segment, extension stripped
      provenanceUrl: "https://cdn.example/wallpaper.png",
    });
  });

  test("a URL the op refuses (unreachable / not-image / too-large) throws background_unavailable", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { materializeBackground: () => Promise.resolve({ ok: false, reason: "not-image" }) });
    const u = await seedUser(db, { id: "user_u" });

    const err = await h.svc.addExternalBackground({ principal: principal(u, "user"), url: "https://cdn.example/not-an-image.txt" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("background_unavailable");
  });

  test("an empty URL is refused before any fetch (background_url_empty)", async () => {
    const db = await freshDb();
    // The default harness op would refuse anyway, but the empty-URL guard fires FIRST (no materialize attempt).
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });

    const err = await h.svc.addExternalBackground({ principal: principal(u, "user"), url: "   " }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("background_url_empty");
  });
});
