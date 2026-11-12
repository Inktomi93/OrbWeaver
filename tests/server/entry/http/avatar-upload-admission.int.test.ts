// @subject packages/server/src/domain/assets/substrate/mime.ts
// An avatar is drawn as a picture everywhere it appears, so the upload door stores one only when its bytes carry the
// signature of an image type the store accepts, whatever type the file claims. Anything else is refused with its
// code and stored nowhere.
import { ASSET_UPLOAD_REFUSAL_CODES, assetUploadRefusalSchema, IMAGE_ONLY_ASSET_KINDS, storedAssetSchema } from "@orb/contracts/assets";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import type { NativeServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { magicBytes } from "@orb/testkit/node/helpers";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

const UPLOAD_ROUTE = "/api/assets/upload";
const OK = 200;
const UNSUPPORTED_MEDIA_TYPE = 415;
const [AVATAR] = IMAGE_ONLY_ASSET_KINDS;
const LIST_LIMIT = 10;
const TEXT_BYTES = new TextEncoder().encode("a note, not a picture");

async function ownerRoot(): Promise<NativeServerTestHarness> {
  return await createServerHarness({ env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => "127.0.0.1" });
}

async function upload(root: NativeServerTestHarness, file: File): Promise<Response> {
  const form = new FormData();
  form.set("file", file);
  form.set("kind", AVATAR);
  return await root.http.request(UPLOAD_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: form });
}

async function ownedAvatars(root: NativeServerTestHarness): Promise<number> {
  const principal = await root.principalFor(root.ownerId);
  return (await root.app.assets.listOwned({ principal, kind: AVATAR, limit: LIST_LIMIT })).length;
}

test.for([
  { name: "UTF-8 text", file: new File([TEXT_BYTES], "note.txt", { type: "text/plain" }) },
  { name: "text bytes named and typed as a PNG", file: new File([TEXT_BYTES], "face.png", { type: "image/png" }) },
  { name: "bytes with no type at all", file: new File([TEXT_BYTES], "face") },
] as const)("an avatar upload of $name is refused as not an image and stores nothing", async ({ file }) => {
  await using root = await ownerRoot();
  const response = await upload(root, file);
  expect(response.status).toBe(UNSUPPORTED_MEDIA_TYPE);
  expect(assetUploadRefusalSchema.parse(await response.json()).reason).toBe(ASSET_UPLOAD_REFUSAL_CODES.notAnImage);
  expect(await ownedAvatars(root)).toBe(0);
});

test.for(["png", "jpeg", "gif", "webp"] as const)("an avatar upload of a %s image is stored byte for byte", async (format) => {
  await using root = await ownerRoot();
  const bytes = magicBytes(format);
  const response = await upload(root, new File([Uint8Array.from(bytes)], `face.${format}`, { type: `image/${format}` }));
  expect(response.status).toBe(OK);
  const stored = storedAssetSchema.parse(await response.json());
  const principal = await root.principalFor(root.ownerId);
  expect(Array.from((await root.app.assets.readOwnedAssetBytes(principal, stored.assetId)).bytes)).toEqual(Array.from(bytes));
  expect(await ownedAvatars(root)).toBe(1);
});
