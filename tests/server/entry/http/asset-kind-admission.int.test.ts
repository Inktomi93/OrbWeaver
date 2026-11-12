// @subject packages/server/src/domain/assets/substrate/mime.ts
// @subject packages/server/src/entry/http/upload.ts
// Each asset kind stores only the media its consumers render, whatever the file claims and whoever stores it, and the
// upload route stores only the kinds it has a client door for; every other kind enters through its own door.
import type { AssetKind, AssetMedia } from "@orb/contracts/assets";
import {
  ASSET_KIND_MEDIA,
  ASSET_KINDS,
  ASSET_UPLOAD_KINDS,
  ASSET_UPLOAD_REFUSAL_CODES,
  assetUploadRefusalSchema,
  storedAssetSchema,
} from "@orb/contracts/assets";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { NativeServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { magicBytes } from "@orb/testkit/node/helpers";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

const UPLOAD_ROUTE = "/api/assets/upload";
const OK = 200;
const BAD_REQUEST = 400;
const UNSUPPORTED_MEDIA_TYPE = 415;
const text = new TextEncoder();

// One file of each medium, its bytes carrying that medium's real signature, and the type it honestly claims.
const SAMPLES = {
  image: { bytes: magicBytes("png"), type: "image/png", name: "sample.png" },
  video: { bytes: magicBytes("mp4"), type: "video/mp4", name: "sample.mp4" },
  pdf: { bytes: text.encode("%PDF-1.4\n%sample\n"), type: "application/pdf", name: "sample.pdf" },
  zip: { bytes: magicBytes("zip"), type: "application/zip", name: "sample.zip" },
  text: { bytes: text.encode("a plain note"), type: "text/plain", name: "sample.txt" },
} as const satisfies Record<AssetMedia, { readonly bytes: Uint8Array; readonly type: string; readonly name: string }>;

// For each kind, a medium it stores (none for a kind nothing is stored as) and one it refuses.
const CASES = {
  card: { accepted: "image", refused: "text" },
  avatar: { accepted: "image", refused: "pdf" },
  export: { accepted: null, refused: "image" },
  generated: { accepted: "image", refused: "text" },
  gallery: { accepted: "image", refused: "video" },
  attachment: { accepted: "video", refused: "pdf" },
  document: { accepted: "pdf", refused: "image" },
  background: { accepted: "video", refused: "text" },
  plugin: { accepted: "zip", refused: "text" },
} as const satisfies Record<AssetKind, { readonly accepted: AssetMedia | null; readonly refused: AssetMedia }>;

async function ownerRoot(): Promise<NativeServerTestHarness> {
  return await createServerHarness({ env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => "127.0.0.1" });
}

async function upload(root: NativeServerTestHarness, kind: AssetKind, media: AssetMedia): Promise<Response> {
  const sample = SAMPLES[media];
  const form = new FormData();
  form.set("file", new File([Uint8Array.from(sample.bytes)], sample.name, { type: sample.type }));
  form.set("kind", kind);
  return await root.http.request(UPLOAD_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: form });
}

const refusalFor = (kind: AssetKind): string => {
  const media: readonly AssetMedia[] = ASSET_KIND_MEDIA[kind];
  return media.length === 1 && media[0] === "image" ? ASSET_UPLOAD_REFUSAL_CODES.notAnImage : ASSET_UPLOAD_REFUSAL_CODES.wrongMedia;
};

test.for(ASSET_KINDS)("the store keeps an asset of kind %s only of a medium its consumers render", async (kind) => {
  await using root = await ownerRoot();
  const principal = await root.principalFor(root.ownerId);
  const { accepted, refused } = CASES[kind];
  const refusedSample = SAMPLES[refused];

  await expect(root.app.assets.store({ principal, bytes: refusedSample.bytes, kind, mime: refusedSample.type })).rejects.toMatchObject({
    refusal: refusalFor(kind),
  });
  expect(await root.app.assets.listOwned({ principal, kind, limit: 1 })).toEqual([]);
  if (accepted === null) {
    return;
  }
  const acceptedSample = SAMPLES[accepted];
  const stored = await root.app.assets.store({ principal, bytes: acceptedSample.bytes, kind, mime: acceptedSample.type });
  expect(Array.from((await root.app.assets.readOwnedAssetBytes(principal, stored.assetId)).bytes)).toEqual(Array.from(acceptedSample.bytes));
});

test.for(ASSET_UPLOAD_KINDS)("the upload route stores a file of kind %s of a medium it renders and refuses one it does not, with its code", async (kind) => {
  await using root = await ownerRoot();
  const { accepted, refused } = CASES[kind];

  const refusedResponse = await upload(root, kind, refused);
  expect(refusedResponse.status).toBe(UNSUPPORTED_MEDIA_TYPE);
  expect(assetUploadRefusalSchema.parse(await refusedResponse.json()).reason).toBe(refusalFor(kind));

  const acceptedResponse = await upload(root, kind, accepted);
  expect(acceptedResponse.status).toBe(OK);
  storedAssetSchema.parse(await acceptedResponse.json());
});

forEachNonEmpty(
  ASSET_KINDS.filter((kind) => !ASSET_UPLOAD_KINDS.some((served) => served === kind)),
  "kinds with no client door on the upload route",
  (kind) => {
    test(`the upload route refuses an asset of kind ${kind}, even of a medium that kind stores, since no client door uploads it there`, async () => {
      await using root = await ownerRoot();
      const principal = await root.principalFor(root.ownerId);
      const { accepted } = CASES[kind];
      const response = await upload(root, kind, accepted ?? CASES[kind].refused);
      expect(response.status).toBe(BAD_REQUEST);
      await response.arrayBuffer();
      expect(await root.app.assets.listOwned({ principal, kind, limit: 1 })).toEqual([]);
    });
  },
);
