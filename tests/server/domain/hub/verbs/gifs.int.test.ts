// verbs: searchGifs + importGif (D61 gif slice). Unit-tests the verb LOGIC over fake injected ops (the
// Tenor adapter + credential + assets ops are faked at the edge — the real adapter/guard behavior is pinned
// in infra/network/gif-search.test.ts). Pins: the no-credential floor, the adapter-error mapping, and — the
// security core — that importGif gates the subject character EARLY (leak-free NOT_FOUND, and NO fetch) before
// any egress, then fetch → store → curate in order.

import type { GalleryItemView, GifSearchResult } from "@orb/contracts/hub";
import type { Principal } from "@orb/contracts/identity";
import {
  DomainNoCredentialError,
  DomainNotFoundError,
  DomainOperationError,
} from "@orb/kit/errors";
import type { AssetId, CharacterId, GalleryItemId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { HubContext } from "@orb/server/domain/hub";
import { createHubService } from "@orb/server/domain/hub";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";

const OWNER: Principal = {
  userId: castId<UserId>("user_owner"),
  role: "user",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "cookie",
};

const GALLERY_VIEW: GalleryItemView = {
  galleryItemId: castId<GalleryItemId>("gallery_item_1"),
  assetId: castId<AssetId>("asset_1"),
  hash: "abc",
  mime: "image/gif",
  animated: true,
  subjectCharacterId: null,
  createdAt: 0,
};

/** A fully-faked HubContext; overrides let each test swap one op. Recorders assert ordering/args. */
function makeCtx(over: Partial<HubContext> = {}): HubContext {
  return {
    searchGifs: (): Promise<GifSearchResult> => Promise.resolve({ hits: [] }),
    fetchGifImage: (): Promise<{ bytes: Uint8Array; mime: string }> =>
      Promise.resolve({ bytes: new Uint8Array([1]), mime: "image/gif" }),
    resolveGifKey: (): Promise<string | null> => Promise.resolve("tenor-key"),
    storeGalleryAsset: (): Promise<{ assetId: AssetId }> =>
      Promise.resolve({ assetId: castId<AssetId>("asset_1") }),
    addToGallery: (): Promise<GalleryItemView> => Promise.resolve(GALLERY_VIEW),
    assertCharacterOwned: (): Promise<boolean> => Promise.resolve(true),
    ...over,
  };
}

describe("searchGifs", () => {
  test("no gif-search key → DomainNoCredentialError (the no-credential floor)", async () => {
    const hub = createHubService(makeCtx({ resolveGifKey: () => Promise.resolve(null) }));
    await expect(hub.searchGifs({ principal: OWNER, query: "cat", limit: 20 })).rejects.toThrow(
      DomainNoCredentialError,
    );
  });

  test("resolves the caller's key, passes it to the adapter, returns the hits", async () => {
    const searchGifs = vi.fn(() =>
      Promise.resolve<GifSearchResult>({
        hits: [
          {
            id: "g1",
            previewUrl: "https://media.tenor.com/p.gif",
            fullUrl: "https://media.tenor.com/f.gif",
            width: 200,
            height: 100,
          },
        ],
        nextCursor: "c1",
      }),
    );
    const hub = createHubService(makeCtx({ searchGifs }));
    const result = await hub.searchGifs({ principal: OWNER, query: "cat", limit: 20 });
    expect(result.hits).toHaveLength(1);
    expect(result.nextCursor).toBe("c1");
    expect(searchGifs).toHaveBeenCalledWith({
      apiKey: "tenor-key",
      query: "cat",
      limit: 20,
      cursor: undefined,
    });
  });

  test("an adapter failure maps to a leak-free hub_unavailable (no upstream detail)", async () => {
    const hub = createHubService(
      makeCtx({
        searchGifs: () => Promise.reject(new Error("tenor 500: <html>secret upstream body</html>")),
      }),
    );
    const err = await hub.searchGifs({ principal: OWNER, query: "cat", limit: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("hub_unavailable");
    expect((err as Error).message).not.toContain("secret upstream body");
  });
});

describe("importGif", () => {
  const characterId = castId<CharacterId>("character_a");

  test("EARLY leak-free gate: a foreign subject character → NOT_FOUND, and NO fetch happens", async () => {
    const fetchGifImage = vi.fn(() =>
      Promise.resolve({ bytes: new Uint8Array([1]), mime: "image/gif" }),
    );
    const hub = createHubService(
      makeCtx({ assertCharacterOwned: () => Promise.resolve(false), fetchGifImage }),
    );
    await expect(
      hub.importGif({
        principal: OWNER,
        url: "https://media.tenor.com/x.gif",
        subjectCharacterId: characterId,
      }),
    ).rejects.toThrow(DomainNotFoundError);
    expect(fetchGifImage).not.toHaveBeenCalled(); // no egress on a rejected ownership gate (IDOR + DoS)
  });

  test("owned character: fetch → store → curate, in order; returns the gallery view", async () => {
    const calls: string[] = [];
    const hub = createHubService(
      makeCtx({
        assertCharacterOwned: () => {
          calls.push("assert");
          return Promise.resolve(true);
        },
        fetchGifImage: () => {
          calls.push("fetch");
          return Promise.resolve({ bytes: new Uint8Array([1]), mime: "image/gif" });
        },
        storeGalleryAsset: () => {
          calls.push("store");
          return Promise.resolve({ assetId: castId<AssetId>("asset_1") });
        },
        addToGallery: (args) => {
          calls.push("curate");
          expect(args.subjectCharacterId).toBe(characterId);
          return Promise.resolve(GALLERY_VIEW);
        },
      }),
    );
    const view = await hub.importGif({
      principal: OWNER,
      url: "https://media.tenor.com/x.gif",
      subjectCharacterId: characterId,
    });
    expect(view).toEqual(GALLERY_VIEW);
    expect(calls).toEqual(["assert", "fetch", "store", "curate"]);
  });

  test("no subjectCharacterId: skips the ownership gate, still imports", async () => {
    const assertCharacterOwned = vi.fn(() => Promise.resolve(true));
    const hub = createHubService(makeCtx({ assertCharacterOwned }));
    const view = await hub.importGif({ principal: OWNER, url: "https://media.tenor.com/x.gif" });
    expect(view).toEqual(GALLERY_VIEW);
    expect(assertCharacterOwned).not.toHaveBeenCalled();
  });

  test("a rejected buffer / bad host maps to a leak-free hub_rejected_content", async () => {
    const hub = createHubService(
      makeCtx({ fetchGifImage: () => Promise.reject(new Error("not-image")) }),
    );
    const err = await hub
      .importGif({ principal: OWNER, url: "https://media.tenor.com/x.gif" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("hub_rejected_content");
  });
});
