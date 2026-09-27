// Shared network stubs and rows for the gallery CTs (the dialog, its add-picker and its upload zone). Every
// suite mounts `CharacterGalleryDialogStory`, whose character is `character_ct_gallery` named "Aria".

import type { Page } from "@playwright/test";
import type { TrpcWireOutput } from "../../../support/node/route-trpc.ts";

type GalleryRow = TrpcWireOutput<"assets.listGallery">[number];
type OwnedRow = TrpcWireOutput<"assets.listOwned">[number];

/** The story's character: every gallery read and add names it. */
export const STORY_CHARACTER_ID = "character_ct_gallery";

export const ITEM = {
  galleryItemId: "galleryitem_ct_1",
  assetId: "asset_ct_1",
  hash: "a".repeat(64),
  mime: "image/png",
  animated: false,
  subjectCharacterId: STORY_CHARACTER_ID,
  createdAt: 1,
} satisfies GalleryRow;

/** A gallery cell's accessible name: its position in the grid and the day it joined. */
export const GALLERY_CELL = /^Image \d+, added /u;

/** An add-picker cell's accessible name: its position and the day it was uploaded. */
export const OWNED_CELL = /^Image \d+, uploaded /u;

/** The server's wire page size for both gallery reads. */
export const PAGE_SIZE = 100;

/** Gallery row `index` of a newest-first gallery: every row one millisecond older than the one before it. */
export function pagedItem(index: number): GalleryRow {
  return {
    ...ITEM,
    galleryItemId: `galleryitem_ct_page_${String(index).padStart(3, "0")}`,
    assetId: `asset_ct_page_${String(index)}`,
    hash: index.toString(16).padStart(4, "0").repeat(16),
    createdAt: 10_000 - index,
  };
}

/** Owned image `index` of a newest-first upload list: every row one millisecond older than the one before it. */
export function ownedItem(index: number): OwnedRow {
  return {
    assetId: `asset_ct_owned_${String(index).padStart(3, "0")}`,
    hash: (index + 1).toString(16).padStart(4, "0").repeat(16),
    mime: "image/png",
    size: 1024,
    uploadedAt: 10_000 - index,
    animated: false,
    kind: "gallery",
  };
}

/** THE app's toast outlet — `CtToastSurface`'s production `AppToaster` renders one root per notice. */
export const TOAST_ROOT = '[data-slot="toast-root"]';

/** The gallery dialog's upload zone (the lightbox and the picker hold no dropzone). */
export const DROPZONE = '[role="dialog"] [data-slot="file-dropzone"]';

/** The zone's one refusal line: the dropzone's own error slot. */
export const DROPZONE_ERROR = '[data-slot="file-dropzone-error"]';

const UPLOAD_ROUTE = "**/api/assets/upload";
export const IMAGE_CAP_BYTES = 64;
export const UPLOADED = { assetId: "asset_01h455vb4pex5vsknk084sn02q", hash: "9f2c4b1e".repeat(8), size: 8, created: true };
export const UPLOADED_ITEM = { ...ITEM, galleryItemId: "galleryitem_ct_uploaded", assetId: UPLOADED.assetId, hash: UPLOADED.hash } satisfies GalleryRow;
export const SMALL_PNG = { name: "sunset.png", mimeType: "image/png", content: "PNGBYTES" };
export const LARGE_PNG = { name: "poster.png", mimeType: "image/png", content: "P".repeat(IMAGE_CAP_BYTES + 1) };
export const NOT_AN_IMAGE = { name: "notes.txt", mimeType: "text/plain", content: "hello" };

/** Serve the upload caps with a small image cap; the other caps are irrelevant to this dialog. */
export async function capImageUploads(page: Page): Promise<void> {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { uploads: { assetUpload: 1_000_000, image: IMAGE_CAP_BYTES, databankUpload: 1_000_000, importTotal: 1_000_000 } } }),
  );
}

/** How the stubbed upload route answers: a stored asset, or a refusal with the server's reason. */
export type UploadAnswer = { readonly kind: "stored" } | { readonly kind: "refused"; readonly status: number; readonly reason: string };

const STORED: UploadAnswer = { kind: "stored" };

/** Record every upload POST's multipart body and answer it with `answer`. */
export async function recordUploads(page: Page, answer: UploadAnswer = STORED): Promise<string[]> {
  const bodies: string[] = [];
  await page.route(UPLOAD_ROUTE, async (route) => {
    bodies.push(route.request().postData() ?? "");
    await route.fulfill(answer.kind === "stored" ? { json: UPLOADED } : { status: answer.status, json: { error: answer.reason } });
  });
  return bodies;
}

/** An upload route that holds every POST until `release`, then stores each one. */
export interface HeldUploads {
  readonly count: () => number;
  readonly release: () => void;
}

export async function holdUploads(page: Page): Promise<HeldUploads> {
  let count = 0;
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(UPLOAD_ROUTE, async (route) => {
    count += 1;
    await released;
    await route.fulfill({ json: UPLOADED });
  });
  return { count: () => count, release: () => release() };
}

/** The gallery holds the uploaded picture once `addToGallery` has run for it. */
export function galleryAfterAdd(added: () => boolean): () => TrpcWireOutput<"assets.listGallery"> {
  return () => (added() ? [UPLOADED_ITEM] : []);
}
