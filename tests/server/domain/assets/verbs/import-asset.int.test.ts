// A bundle's asset file names its kinds and type in a filename nothing proved, so the restore checks them against the
// bytes. A picture under another type restores under the type its bytes are. A file whose bytes are not what its kinds
// admit, or not an image or video its claim says they are, is refused with its code; nothing of it is stored or linked,
// and the rest of the bundle imports.
// @subject packages/server/src/domain/assets/verbs/import-asset.ts
// @subject packages/server/src/domain/assets/substrate/mime.ts

import type { AssetKind } from "@orb/contracts/assets";
import { ASSET_LIST_LIMIT_MAX, ASSET_UPLOAD_REFUSAL_CODES, blobUrl } from "@orb/contracts/assets";
import type { PortableFile } from "@orb/contracts/portability";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { ID_PREFIX } from "@orb/kit/ids";
import { APNG_MIME } from "@orb/kit/image-sniff";
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
const JPEG = "image/jpeg";
const WEBP = "image/webp";
const MP4 = "video/mp4";
const HTML = "text/html";
const ZIP = "application/zip";
/** The type the blob route serves a stored file under when it is not a medium it serves inline. */
const DOWNLOAD = "application/octet-stream";
const PAGE = new TextEncoder().encode("<!doctype html><html><body><script>parent.postMessage(1)</script></body></html>");

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
  relabelledJpeg: magicBytes("jpeg", 74),
  relabelledWebp: magicBytes("webp", 81),
  animatedPicture: magicBytes("png", 82),
  jpegAsAnimated: magicBytes("jpeg", 83),
  pictureAsPage: magicBytes("png", 75),
  pictureAsVideo: magicBytes("png", 76),
  smuggledVideo: magicBytes("mp4", 73),
  heldVideo: magicBytes("mp4", 77),
  videoAsPage: magicBytes("mp4", 78),
  bundleAsPicture: magicBytes("zip", 79),
  bundleAsVideo: magicBytes("zip", 80),
  pageAsPicture: PAGE,
  svgAsPicture: magicBytes("svg"),
} as const;

/** Claims that restore, with the type the restored file is stored and served under. */
const RESTORED = {
  picture: { claim: { bytes: BYTES.picture, kinds: ["avatar"], mime: PNG }, stored: PNG, served: PNG },
  video: { claim: { bytes: BYTES.video, kinds: ["background"], mime: MP4 }, stored: MP4, served: MP4 },
  pluginBundle: { claim: { bytes: BYTES.pluginBundle, kinds: ["plugin"], mime: ZIP }, stored: ZIP, served: DOWNLOAD },
  // A picture under another type is still a picture: it restores under the type its bytes are.
  relabelledJpeg: { claim: { bytes: BYTES.relabelledJpeg, kinds: ["avatar"], mime: PNG }, stored: JPEG, served: JPEG },
  relabelledWebp: { claim: { bytes: BYTES.relabelledWebp, kinds: ["avatar"], mime: PNG }, stored: WEBP, served: WEBP },
  // The signature cannot tell an animated PNG from a still one, so the animated claim the upload door accepted stands.
  animatedPicture: { claim: { bytes: BYTES.animatedPicture, kinds: ["background"], mime: APNG_MIME }, stored: APNG_MIME, served: APNG_MIME },
  jpegAsAnimated: { claim: { bytes: BYTES.jpegAsAnimated, kinds: ["background"], mime: APNG_MIME }, stored: JPEG, served: JPEG },
  pictureAsPage: { claim: { bytes: BYTES.pictureAsPage, kinds: ["avatar"], mime: HTML }, stored: PNG, served: PNG },
  pictureAsVideo: { claim: { bytes: BYTES.pictureAsVideo, kinds: ["background"], mime: MP4 }, stored: PNG, served: PNG },
} as const satisfies Record<string, { readonly claim: Claim; readonly stored: string; readonly served: string }>;

/** Claims the bytes do not bear out, each with the code the store refuses it under. */
const REFUSED = {
  // The first kind admits a video, and the avatar beside it does not.
  smuggledVideo: { claim: { bytes: BYTES.smuggledVideo, kinds: ["background", "avatar"], mime: MP4 }, code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage },
  // The owner already holds these bytes as a background, and the file would add the avatar use to them.
  heldVideo: { claim: { bytes: BYTES.heldVideo, kinds: ["avatar"], mime: MP4 }, code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage },
  videoAsPage: { claim: { bytes: BYTES.videoAsPage, kinds: ["background"], mime: HTML }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
  // A plugin kind admits a ZIP, so only the picture or video claim over it is wrong.
  bundleAsPicture: { claim: { bytes: BYTES.bundleAsPicture, kinds: ["plugin"], mime: PNG }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
  bundleAsVideo: { claim: { bytes: BYTES.bundleAsVideo, kinds: ["plugin"], mime: MP4 }, code: ASSET_UPLOAD_REFUSAL_CODES.contentRejected },
  pageAsPicture: { claim: { bytes: BYTES.pageAsPicture, kinds: ["avatar"], mime: PNG }, code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage },
  svgAsPicture: { claim: { bytes: BYTES.svgAsPicture, kinds: ["avatar"], mime: PNG }, code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage },
} as const satisfies Record<string, { readonly claim: Claim; readonly code: string }>;

type Case = keyof typeof BYTES;
const CASES = { ...RESTORED, ...REFUSED } satisfies Record<Case, { readonly claim: Claim }>;

/** Every claim as the bundle file the production codec names, keyed by case. */
function bundleFiles(): Readonly<Record<Case, PortableFile>> {
  const ids = createSeededIds(BUNDLE_ID_CURSOR);
  const file = ({ claim }: { readonly claim: Claim }): PortableFile => ({
    filename: buildPortableAssetFilename({ hash: hashAssetBytes(claim.bytes), id: ids.typeId(ID_PREFIX.asset), kinds: claim.kinds, mime: claim.mime }),
    bytes: claim.bytes,
  });
  return {
    picture: file(CASES.picture),
    video: file(CASES.video),
    pluginBundle: file(CASES.pluginBundle),
    relabelledJpeg: file(CASES.relabelledJpeg),
    relabelledWebp: file(CASES.relabelledWebp),
    animatedPicture: file(CASES.animatedPicture),
    jpegAsAnimated: file(CASES.jpegAsAnimated),
    pictureAsPage: file(CASES.pictureAsPage),
    pictureAsVideo: file(CASES.pictureAsVideo),
    smuggledVideo: file(CASES.smuggledVideo),
    heldVideo: file(CASES.heldVideo),
    videoAsPage: file(CASES.videoAsPage),
    bundleAsPicture: file(CASES.bundleAsPicture),
    bundleAsVideo: file(CASES.bundleAsVideo),
    pageAsPicture: file(CASES.pageAsPicture),
    svgAsPicture: file(CASES.svgAsPicture),
  };
}

/** The owner already holds the held video's bytes, as the background the upload door accepted. */
async function holdVideo(root: ServerTestHarness): Promise<void> {
  const principal = await root.principalFor(root.ownerId);
  await root.services.assets.store({ principal, bytes: BYTES.heldVideo, kind: "background", mime: MP4, enforceMagic: true });
}

interface Held {
  readonly kinds: readonly AssetKind[];
  readonly mime: string;
  readonly stored: boolean;
  /** The type the owner's blob route serves the file under. */
  readonly served: string | null;
}

/** Each case's bytes as the owner's library holds them, or null when no asset holds them. */
async function libraryState(root: ServerTestHarness): Promise<Readonly<Record<string, Held | null>>> {
  const page = await (await root.internalCallerFor(root.ownerId)).assets.listOwned({ limit: ASSET_LIST_LIMIT_MAX });
  if (page.length === ASSET_LIST_LIMIT_MAX) {
    throw new Error("the owned list outgrew one page; read it by cursor");
  }
  const state = async (bytes: Uint8Array): Promise<Held | null> => {
    const hash = hashAssetBytes(bytes);
    const listed = page.find((item) => item.hash === hash);
    if (listed === undefined) {
      return null;
    }
    const response = await root.http.request(blobUrl(hash));
    await response.arrayBuffer();
    return { kinds: listed.kinds, mime: listed.mime, stored: await casOf(root).exists(root.ownerId, hash), served: response.headers.get("content-type") };
  };
  return Object.fromEntries(await Promise.all(Object.entries(BYTES).map(async ([name, bytes]) => [name, await state(bytes)] as const)));
}

test("a bundle restore keeps each picture under the type its bytes are, refuses what its claims misdescribe and imports the rest", async () => {
  await using target = await signedInBox();
  await holdVideo(target);
  const files = Object.values(bundleFiles());
  const bundle = zipSync(Object.fromEntries(files.map((file) => [`${PORTABLE_DIRECTORIES.assets}${file.filename}`, file.bytes])), { mtime: ZIP_MTIME });

  const outcome = await restoreBundle(target, bundle);

  expect({ outcome, library: await libraryState(target) }).toEqual({
    outcome: { status: "succeeded", skipped: 0, failed: Object.keys(REFUSED).length },
    library: {
      ...Object.fromEntries(
        Object.entries(RESTORED).map(([name, { claim, stored, served }]) => [name, { kinds: claim.kinds, mime: stored, stored: true, served }]),
      ),
      ...Object.fromEntries(Object.keys(REFUSED).map((name) => [name, null])),
      heldVideo: { kinds: ["background"], mime: MP4, stored: true, served: MP4 },
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
    ...Object.fromEntries(Object.keys(RESTORED).map((name) => [name, { ok: true, created: true }])),
    ...Object.fromEntries(Object.entries(REFUSED).map(([name, { code }]) => [name, { ok: false, error: expect.stringContaining(code) }])),
  });
});
