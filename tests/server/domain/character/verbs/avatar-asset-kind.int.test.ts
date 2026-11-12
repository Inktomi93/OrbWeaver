// @subject packages/server/src/domain/character/persistence/queries.ts
// A character's avatar is drawn as a picture wherever the character appears, so the create and update writes link
// only the owner's asset of a picture kind; any other kind is refused with its code and nothing is linked.
import { ASSET_UPLOAD_REFUSAL_CODES } from "@orb/contracts/assets";
import { createCharacterSchema, updateCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { magicBytes } from "@orb/testkit/node/helpers";

type Owner = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;

const PDF = new TextEncoder().encode("%PDF-1.4\n%not a picture\n");
// A PNG whose header the store reads, as a real picture has: an IHDR of one by one pixel.
const PICTURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00,
]);

// An ISO-BMFF box: its size, its type, then its body.
function box(type: string, ...body: readonly Uint8Array[]): Uint8Array {
  const size = 8 + body.reduce((total, part) => total + part.byteLength, 0);
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, size);
  bytes.set(new TextEncoder().encode(type), 4);
  let offset = 8;
  for (const part of body) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}
function u32s(...values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (const [index, value] of values.entries()) {
    view.setUint32(index * 4, value);
  }
  return bytes;
}
// An AVIF image 64 pixels square: an `ftyp` box naming the brand, and the `ispe` extents the image header carries.
const AVIF_SIDE = 64;
const AVIF = new Uint8Array([
  ...box("ftyp", new TextEncoder().encode("avif"), u32s(0), new TextEncoder().encode("avif")),
  ...box("meta", u32s(0), box("iprp", box("ipco", box("ispe", u32s(0, AVIF_SIDE, AVIF_SIDE))))),
]);

async function ownedAssets(harness: ServerTestHarness, owner: Owner): Promise<{ readonly picture: string; readonly document: string }> {
  const picture = await harness.app.assets.store({ principal: owner, bytes: magicBytes("png"), kind: "avatar", mime: "image/png" });
  const document = await harness.app.assets.store({ principal: owner, bytes: PDF, kind: "document", mime: "application/pdf" });
  return { picture: picture.assetId, document: document.assetId };
}

test("creating a character with a document asset as its avatar is refused with its code, and a picture is linked", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const { picture, document } = await ownedAssets(harness, owner);
  const input = (avatarAssetId: string): ReturnType<typeof createCharacterSchema.parse> =>
    createCharacterSchema.parse({ name: "Lamp keeper", handle: "lamp-keeper", description: "Keeps the light.", avatarAssetId });

  await expect(harness.services.character.create({ principal: owner, input: input(document) })).rejects.toMatchObject({
    code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage,
  });
  expect(await harness.services.character.list({ principal: owner, limit: 10 })).toMatchObject({ items: [] });
  expect((await harness.services.character.create({ principal: owner, input: input(picture) })).avatarAssetId).toBe(picture);
});

test("updating a character's avatar to a document asset is refused with its code, and the avatar stays", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const { picture, document } = await ownedAssets(harness, owner);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Lamp keeper", handle: "lamp-keeper", description: "Keeps the light.", avatarAssetId: picture }),
  });

  await expect(
    harness.services.character.update({ principal: owner, characterId: card.id, input: updateCharacterSchema.parse({ avatarAssetId: document }) }),
  ).rejects.toMatchObject({ code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage });
  expect((await harness.services.character.get({ principal: owner, characterId: card.id })).avatarAssetId).toBe(picture);
});

// The store keeps one row per owner and content, so a picture first stored under a kind that also admits other media
// (a plugin's fetched asset, a chat attachment) stays that row when the same bytes are stored again as an avatar.
test("a picture first stored as a plugin or attachment asset links as an avatar, and a video attachment does not", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const fetched = await harness.app.assets.store({ principal: owner, bytes: PICTURE, kind: "plugin", mime: "image/png" });
  // The import's avatar store over the same bytes resolves to the plugin row.
  const restored = await harness.app.assets.store({ principal: owner, bytes: PICTURE, kind: "avatar", mime: "image/png" });
  expect(restored.assetId).toBe(fetched.assetId);
  const clip = await harness.app.assets.store({ principal: owner, bytes: magicBytes("webm"), kind: "attachment", mime: "video/webm" });
  const input = (avatarAssetId: string): ReturnType<typeof createCharacterSchema.parse> =>
    createCharacterSchema.parse({ name: "Lamp keeper", handle: "lamp-keeper", description: "Keeps the light.", avatarAssetId });

  await expect(harness.services.character.create({ principal: owner, input: input(clip.assetId) })).rejects.toMatchObject({
    code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage,
  });
  expect((await harness.services.character.create({ principal: owner, input: input(restored.assetId) })).avatarAssetId).toBe(fetched.assetId);
});

test("a picture first uploaded as a chat attachment, then uploaded as an avatar, links as the character's avatar", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const attached = await harness.app.assets.store({ principal: owner, bytes: PICTURE, kind: "attachment", mime: "image/png" });
  const uploaded = await harness.app.assets.store({ principal: owner, bytes: PICTURE, kind: "avatar", mime: "image/png" });
  expect(uploaded.assetId).toBe(attached.assetId);

  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Lamp keeper", handle: "lamp-keeper", description: "Keeps the light.", avatarAssetId: uploaded.assetId }),
  });
  expect(card.avatarAssetId).toBe(attached.assetId);
});

test("an AVIF image the store kept as an MP4 attachment is refused as an avatar, as the avatar upload refuses it", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  // The avatar upload refuses the bytes as an image and as a video.
  for (const mime of ["image/avif", "video/mp4"]) {
    await expect(harness.app.assets.store({ principal: owner, bytes: AVIF, kind: "avatar", mime, enforceMagic: true })).rejects.toMatchObject({
      refusal: ASSET_UPLOAD_REFUSAL_CODES.notAnImage,
    });
  }
  // A chat attachment takes any MP4-family file under a video claim.
  const attached = await harness.app.assets.store({ principal: owner, bytes: AVIF, kind: "attachment", mime: "video/mp4", enforceMagic: true });

  await expect(
    harness.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ name: "Lamp keeper", handle: "lamp-keeper", description: "Keeps the light.", avatarAssetId: attached.assetId }),
    }),
  ).rejects.toMatchObject({ code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage });
  expect(await harness.services.character.list({ principal: owner, limit: 10 })).toMatchObject({ items: [] });
});
