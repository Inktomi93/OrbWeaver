// entry/boot/seed-assets — the reader for the BUNDLED seed imagery (avatars + gallery pieces committed under
// this dir by `scripts/seed/gen-seed-images.ts`). The default-character + default-persona seeders store these
// bytes through `assets.store` on a fresh user, so the 5 characters + the "You" persona are born with on-brand
// art and each character's gallery starts non-empty.
//
// WHY entry/boot (not a domain): the bytes are a deploy-time bundled artifact read from disk relative to THIS
// module (`import.meta.url` — the server runs from source via tsx, so a module-relative fs path resolves at
// runtime). Reading files is an entry concern; the domain seeders stay fs-unaware and take the store as an
// injected op (`domain-no-cross-feature` — assets is a sibling domain).
//
// MIME matches the real bytes (the magic-byte sniff in `assets.store` accepts png/jpeg/webp): avatars are PNG,
// gallery pieces are WebP. A missing file returns `null` (a partial/absent pack degrades to avatar-less
// seeding, never a boot failure) — the seeder swallows it.

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
    // A missing bundled file (a stripped/partial pack) degrades to no-avatar seeding — never a boot failure.
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
