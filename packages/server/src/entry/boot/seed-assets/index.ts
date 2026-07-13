// Reader for the bundled seed imagery (avatars + gallery pieces) the default-character/persona seeders
// store on a fresh user. Lives in entry (not a domain) because the bytes are read from disk relative to
// this module; domain seeders stay fs-unaware and take the store as an injected op.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The MIME of a bundled avatar (PNG — matches the card-avatar precedent + the byte signature). */
export const SEED_AVATAR_MIME = "image/png";
/** The MIME of a bundled gallery piece (WebP — smaller for the larger 1024² pieces). */
export const SEED_GALLERY_MIME = "image/webp";

/** One bundled asset's bytes + the mime that matches them. */
export interface SeedAssetBytes {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

async function readBundled(relPath: string, mime: string): Promise<SeedAssetBytes | null> {
  try {
    const buf = await readFile(join(HERE, relPath));
    return { bytes: new Uint8Array(buf), mime };
  } catch {
    return null;
  }
}

/** The bundled avatar PNG for a character HANDLE / the persona key (`persona-you`), or `null` when absent. */
export function readSeedAvatar(handle: string): Promise<SeedAssetBytes | null> {
  return readBundled(join("avatars", `${handle}.png`), SEED_AVATAR_MIME);
}

/** The bundled gallery WebP for a character HANDLE, or `null` when the pack ships none for it. */
export function readSeedGalleryPiece(handle: string): Promise<SeedAssetBytes | null> {
  return readBundled(join("gallery", `${handle}-gallery.webp`), SEED_GALLERY_MIME);
}
