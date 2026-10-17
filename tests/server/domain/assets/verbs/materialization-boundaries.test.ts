import "@orb/testkit/node/composed-real.ts";
import type { BackgroundStoreDeps, InlineReplyImageDeps, MaterializeBackgroundDeps } from "@orb/server/domain/assets";
import {
  createBackgroundStore,
  createGeneratedAssetStore,
  createImageryGalleryAdd,
  createMaterializeBackground,
  createStoreGeneratedImage,
  createStoreInlineReplyImage,
} from "@orb/server/domain/assets";
import { getLog } from "@orb/server/foundation/observability";
import { makeAsset } from "@orb/testkit/node/factories/asset.ts";
import { makeCharacter } from "@orb/testkit/node/factories/character.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const URL = "https://cdn.example/image.png";

test("the canonical background store fixes kind and magic while preserving optional live caps", async ({ harness }) => {
  const owner = await principal(harness, (await harness.actor()).id);
  const asset = makeAsset();
  const store = vi.fn<BackgroundStoreDeps["store"]>(() => Promise.resolve({ assetId: asset.id, hash: asset.hash, size: asset.size, created: true }));
  const params = { principal: owner, bytes: PNG, mime: "image/png" };
  let maxBytes = 1024;
  const capped = createBackgroundStore({ store, maxBytes: () => maxBytes });
  await capped(params);
  expect(store).toHaveBeenLastCalledWith({ ...params, kind: "background", enforceMagic: true, maxBytes: 1024 });
  maxBytes = 2048;
  await capped(params);
  expect(store).toHaveBeenLastCalledWith({ ...params, kind: "background", enforceMagic: true, maxBytes: 2048 });
  await createBackgroundStore({ store })(params);
  expect(store).toHaveBeenLastCalledWith({ ...params, kind: "background", enforceMagic: true });
});

test("generated storage preserves the supplied kind; host-id storage resolves authority and reads the live cap", async ({ harness }) => {
  const owner = await principal(harness, (await harness.actor({ role: "admin" })).id);
  const asset = makeAsset();
  const store = vi.fn<BackgroundStoreDeps["store"]>(() => Promise.resolve({ assetId: asset.id, hash: asset.hash, size: asset.size, created: true }));
  await createGeneratedAssetStore(store)(owner, PNG, "gallery", "image/png");
  expect(store).toHaveBeenLastCalledWith({ principal: owner, bytes: PNG, kind: "gallery", mime: "image/png", enforceMagic: true });
  const resolvePrincipal = vi.fn(() => Promise.resolve(owner));
  let maxBytes = 1024;
  const generated = createStoreGeneratedImage({ store, resolvePrincipal, maxBytes: () => maxBytes });
  await generated(owner.userId, PNG, "image/png");
  expect(store).toHaveBeenLastCalledWith({ principal: owner, bytes: PNG, kind: "generated", mime: "image/png", enforceMagic: true, maxBytes: 1024 });
  maxBytes = 2048;
  await generated(owner.userId, PNG, "image/png");
  expect(store).toHaveBeenLastCalledWith({ principal: owner, bytes: PNG, kind: "generated", mime: "image/png", enforceMagic: true, maxBytes: 2048 });
  expect(resolvePrincipal).toHaveBeenCalledWith(owner.userId);
});

test("both downloads use the full public firewall, sniff bytes and store under the supplied owner", async ({ harness }) => {
  const owner = await principal(harness, (await harness.actor()).id);
  const asset = makeAsset();
  const fetchImpl = vi.fn<NonNullable<MaterializeBackgroundDeps["fetchImpl"]>>((_url, options) => {
    expect(options).toEqual({ allowedHosts: expect.any(Symbol), method: "GET", maxBytes: 1024 });
    expect("ownerConfiguredEndpoint" in options).toBe(false);
    return Promise.resolve({ status: 200, headers: new Headers(), contentType: "text/html", bytes: () => Promise.resolve(PNG) });
  });
  const storeBackground = vi.fn<MaterializeBackgroundDeps["storeBackground"]>(() => Promise.resolve({ assetId: asset.id, hash: asset.hash }));
  const storeGenerated = vi.fn<InlineReplyImageDeps["storeGenerated"]>(() => Promise.resolve({ assetId: asset.id }));
  const background = createMaterializeBackground({ storeBackground, fetchImpl, maxBytes: () => 1024 });
  const inline = createStoreInlineReplyImage({ storeGenerated, fetchImpl, maxBytes: () => 1024 });
  expect(await background(owner, URL)).toEqual({ ok: true, asset: { assetId: asset.id, assetHash: asset.hash, mime: "image/png" } });
  expect(await inline(owner.userId, { url: URL, base64: undefined, mediaType: "image/svg+xml" })).toEqual({ assetId: asset.id });
  expect(storeBackground).toHaveBeenCalledWith({ principal: owner, bytes: PNG, mime: "image/png" });
  expect(storeGenerated).toHaveBeenCalledWith(owner.userId, PNG, "image/png");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("raster magic, byte caps and dimension caps reject both inline and downloaded content before storage", async ({ harness }) => {
  const owner = await principal(harness, (await harness.actor()).id);
  const asset = makeAsset();
  const store = vi.fn(() => Promise.resolve({ assetId: asset.id, hash: asset.hash }));
  let bytes = PNG;
  let maxBytes = 1024;
  const fetchImpl: NonNullable<MaterializeBackgroundDeps["fetchImpl"]> = () =>
    Promise.resolve({
      status: 200,
      headers: new Headers(),
      contentType: "image/png",
      bytes: () => Promise.resolve(bytes),
    });
  const background = createMaterializeBackground({ storeBackground: store, fetchImpl, maxBytes: () => maxBytes });
  const inline = createStoreInlineReplyImage({ storeGenerated: store, fetchImpl, maxBytes: () => maxBytes });
  expect((await background(owner, URL)).ok).toBe(true);
  for (const [payload, cap, reason] of [
    [Uint8Array.from(Buffer.from("<svg></svg>")), 1024, "not-image"],
    [PNG, 1, "too-large"],
    [Uint8Array.from([...PNG.slice(0, 16), 0, 0, 0x80, 0, ...PNG.slice(20)]), 1024, "too-large"],
  ] as const) {
    bytes = payload;
    maxBytes = cap;
    store.mockClear();
    expect(await background(owner, URL)).toEqual({ ok: false, reason });
    expect(await inline(owner.userId, { url: undefined, base64: Buffer.from(bytes).toString("base64"), mediaType: "image/png" })).toBeNull();
    expect(await inline(owner.userId, { url: URL, base64: undefined, mediaType: "image/png" })).toBeNull();
    expect(store).not.toHaveBeenCalled();
  }
});

test("non-success responses are disposed without reading bodies; thrown download detail stays off results", async ({ harness }) => {
  const owner = await principal(harness, (await harness.actor()).id);
  const asset = makeAsset();
  const store = vi.fn(() => Promise.resolve({ assetId: asset.id, hash: asset.hash }));
  const dispose = vi.fn();
  const bytes = vi.fn(() => Promise.resolve(PNG));
  const fetchImpl = vi.fn<NonNullable<MaterializeBackgroundDeps["fetchImpl"]>>(() =>
    Promise.resolve({ status: 503, headers: new Headers(), contentType: null, bytes, dispose }),
  );
  const background = createMaterializeBackground({ storeBackground: store, fetchImpl, maxBytes: () => 1024 });
  const inline = createStoreInlineReplyImage({ storeGenerated: store, fetchImpl, maxBytes: () => 1024 });
  expect(await background(owner, URL)).toEqual({ ok: false, reason: "unreachable" });
  expect(await inline(owner.userId, { url: URL, base64: undefined, mediaType: undefined })).toBeNull();
  expect(dispose).toHaveBeenCalledTimes(2);
  expect(bytes).not.toHaveBeenCalled();
  const warn = vi.spyOn(getLog(), "warn");
  fetchImpl.mockRejectedValue(new Error("private address detail"));
  expect(await background(owner, URL)).toEqual({ ok: false, reason: "unreachable" });
  expect(await inline(owner.userId, { url: URL, base64: undefined, mediaType: undefined })).toBeNull();
  expect(warn).toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
});

test("gallery refusals propagate with the supplied owner and subject", async ({ harness }) => {
  const owner = await principal(harness, (await harness.actor()).id);
  const asset = makeAsset();
  const character = makeCharacter();
  const add = vi.fn(() => Promise.reject(new Error("gallery refusal")));
  await expect(createImageryGalleryAdd(add)(owner, asset.id, character.id)).rejects.toThrow("gallery refusal");
  expect(add).toHaveBeenCalledWith({ principal: owner, assetId: asset.id, subjectCharacterId: character.id });
});
