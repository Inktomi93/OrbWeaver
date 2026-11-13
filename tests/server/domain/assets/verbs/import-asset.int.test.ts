// A bundle's asset file names its kinds and type in a filename nothing proved, so the restore checks them against the
// bytes as the upload door does: a file whose bytes its claims do not describe is refused with its code, nothing of it
// is stored or linked, and the rest of the bundle imports.
// @subject packages/server/src/domain/assets/verbs/import-asset.ts
// @subject packages/server/src/domain/assets/substrate/mime.ts

import type { AssetKind } from "@orb/contracts/assets";
import { ASSET_LIST_LIMIT_MAX, ASSET_UPLOAD_REFUSAL_CODES } from "@orb/contracts/assets";
import type { PortableFile } from "@orb/contracts/portability";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { casOf, restoreBundle, signedInBox } from "@orb/testkit/node/composed";
import { magicBytes } from "@orb/testkit/node/helpers";
import { zipSync } from "fflate";
import { buildPortableAssetFilename, hashAssetBytes } from "#server/domain/assets/substrate/portable-asset-file.ts";

/** Asset ids restore verbatim, so the bundle mints from a band the target box never reaches. */
const BUNDLE_ID_CURSOR = 2 ** 29;
// fflate's DOS date reads local time and throws near the epoch, so a mid-year stamp stays valid in every zone.
const ZIP_MTIME = new Date("2025-07-01T12:00:00Z");
const PNG = "image/png";
const MP4 = "video/mp4";
const HTML = "text/html";
const ZIP = "application/zip";

/** One bundle asset file: its bytes and the kinds and type its filename claims for them. */
interface Claim {
  readonly bytes: Uint8Array;
  readonly kinds: readonly AssetKind[];
  readonly mime: string;
}

/** Distinct bytes per case: each size gives the same signature another hash. */
const BYTES = {
  picture: magicBytes("png", 70),
  video: magicBytes("mp4", 71),
  pluginBundle: magicBytes("zip", 72),
  smuggledVideo: magicBytes("mp4", 73),
  relabelledJpeg: magicBytes("jpeg", 74),
  pictureAsPage: magicBytes("png", 75),
  pictureAsVideo: magicBytes("png", 76),
  heldVideo: magicBytes("mp4", 77),
  videoAsPage: magicBytes("mp4", 78),
  bundleAsPicture: magicBytes("zip", 79),
  bundleAsVideo: magicBytes("zip", 80),
} as const;

/** Claims the bytes bear out: a picture, a video background and a plugin bundle stored as a ZIP. */
const MATCHING = {
  picture: { bytes: BYTES.picture, kinds: ["avatar"], mime: PNG },
  video: { bytes: BYTES.video, kinds: ["background"], mime: MP4 },
  pluginBundle: { bytes: BYTES.pluginBundle, kinds: ["plugin"], mime: ZIP },
} as const satisfies Record<string, Claim>;

/** Claims the bytes do not bear out, each with the code the store refuses it under. */
const MISMATCHED = {
  // The first kind admits a video, and the avatar beside it does not.
  smuggledVideo: { claim: { bytes: BYTES.smuggledVideo, kinds: ["background", "avatar"], mime: MP4 }, code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage },
  relabelledJpeg: { claim: { bytes: BYTES.relabelledJpeg, kinds: ["avatar"], mime: PNG }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
  pictureAsPage: { claim: { bytes: BYTES.pictureAsPage, kinds: ["avatar"], mime: HTML }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
  pictureAsVideo: { claim: { bytes: BYTES.pictureAsVideo, kinds: ["background"], mime: MP4 }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
  // The owner already holds these bytes as a background, and the file would add the avatar use to them.
  heldVideo: { claim: { bytes: BYTES.heldVideo, kinds: ["avatar"], mime: MP4 }, code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage },
  videoAsPage: { claim: { bytes: BYTES.videoAsPage, kinds: ["background"], mime: HTML }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
  // A plugin kind admits a ZIP, so only the picture or video claim over it is wrong.
  bundleAsPicture: { claim: { bytes: BYTES.bundleAsPicture, kinds: ["plugin"], mime: PNG }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
  bundleAsVideo: { claim: { bytes: BYTES.bundleAsVideo, kinds: ["plugin"], mime: MP4 }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
} as const satisfies Record<string, { readonly claim: Claim; readonly code: string }>;

type Case = keyof typeof MATCHING | keyof typeof MISMATCHED;

/** Every claim as the bundle file the production codec names, keyed by case. */
function bundleFiles(): Record<Case, PortableFile> {
  const ids = createSeededIds(BUNDLE_ID_CURSOR);
  const file = (claim: Claim): PortableFile => ({
    filename: buildPortableAssetFilename({ hash: hashAssetBytes(claim.bytes), id: ids.typeId(ID_PREFIX.asset), kinds: claim.kinds, mime: claim.mime }),
    bytes: claim.bytes,
  });
  return {
    picture: file(MATCHING.picture),
    video: file(MATCHING.video),
    pluginBundle: file(MATCHING.pluginBundle),
    smuggledVideo: file(MISMATCHED.smuggledVideo.claim),
    relabelledJpeg: file(MISMATCHED.relabelledJpeg.claim),
    pictureAsPage: file(MISMATCHED.pictureAsPage.claim),
    pictureAsVideo: file(MISMATCHED.pictureAsVideo.claim),
    heldVideo: file(MISMATCHED.heldVideo.claim),
    videoAsPage: file(MISMATCHED.videoAsPage.claim),
    bundleAsPicture: file(MISMATCHED.bundleAsPicture.claim),
    bundleAsVideo: file(MISMATCHED.bundleAsVideo.claim),
  };
}

/** The owner already holds the held video's bytes, as the background the upload door accepted. */
async function holdVideo(root: ServerTestHarness): Promise<void> {
  const principal = await root.principalFor(root.ownerId);
  await root.services.assets.store({ principal, bytes: BYTES.heldVideo, kind: "background", mime: MP4, enforceMagic: true });
}

/** Each case's bytes as the owner's library lists them: their kinds and whether the store holds a file, or null when no
 *  asset holds them. */
async function libraryState(root: ServerTestHarness): Promise<Record<Case, { readonly kinds: readonly AssetKind[]; readonly stored: boolean } | null>> {
  const page = await (await root.internalCallerFor(root.ownerId)).assets.listOwned({ limit: ASSET_LIST_LIMIT_MAX });
  if (page.length === ASSET_LIST_LIMIT_MAX) {
    throw new Error("the owned list outgrew one page; read it by cursor");
  }
  const state = async (bytes: Uint8Array): Promise<{ readonly kinds: readonly AssetKind[]; readonly stored: boolean } | null> => {
    const hash = hashAssetBytes(bytes);
    const listed = page.find((item) => item.hash === hash);
    return listed === undefined ? null : { kinds: listed.kinds, stored: await casOf(root).exists(root.ownerId, hash) };
  };
  return {
    picture: await state(BYTES.picture),
    video: await state(BYTES.video),
    pluginBundle: await state(BYTES.pluginBundle),
    smuggledVideo: await state(BYTES.smuggledVideo),
    relabelledJpeg: await state(BYTES.relabelledJpeg),
    pictureAsPage: await state(BYTES.pictureAsPage),
    pictureAsVideo: await state(BYTES.pictureAsVideo),
    heldVideo: await state(BYTES.heldVideo),
    videoAsPage: await state(BYTES.videoAsPage),
    bundleAsPicture: await state(BYTES.bundleAsPicture),
    bundleAsVideo: await state(BYTES.bundleAsVideo),
  };
}

test("a bundle restore refuses each asset file its bytes do not bear out and imports the rest", async () => {
  await using target = await signedInBox();
  await holdVideo(target);
  const files = Object.values(bundleFiles());
  const bundle = zipSync(Object.fromEntries(files.map((file) => [`${PORTABLE_DIRECTORIES.assets}${file.filename}`, file.bytes])), { mtime: ZIP_MTIME });

  const outcome = await restoreBundle(target, bundle);

  expect({ outcome, library: await libraryState(target) }).toEqual({
    outcome: { status: "succeeded", skipped: 0, failed: Object.keys(MISMATCHED).length },
    library: {
      picture: { kinds: ["avatar"], stored: true },
      video: { kinds: ["background"], stored: true },
      pluginBundle: { kinds: ["plugin"], stored: true },
      smuggledVideo: null,
      relabelledJpeg: null,
      pictureAsPage: null,
      pictureAsVideo: null,
      heldVideo: { kinds: ["background"], stored: true },
      videoAsPage: null,
      bundleAsPicture: null,
      bundleAsVideo: null,
    },
  });
});

test("each refused asset file names the store's refusal code", async () => {
  await using target = await signedInBox();
  await holdVideo(target);
  const descriptor = target.app.portability.find((entity) => entity.kind === "assets");
  if (descriptor === undefined) {
    throw new Error("production composition has no assets portability descriptor");
  }
  const outcomes = Object.fromEntries(
    await Promise.all(Object.entries(bundleFiles()).map(async ([name, file]) => [name, await descriptor.importFile(target.ownerId, file)] as const)),
  );

  expect(outcomes).toEqual({
    picture: { ok: true, created: true },
    video: { ok: true, created: true },
    pluginBundle: { ok: true, created: true },
    ...Object.fromEntries(Object.entries(MISMATCHED).map(([name, { code }]) => [name, { ok: false, error: expect.stringContaining(code) }])),
  });
});
