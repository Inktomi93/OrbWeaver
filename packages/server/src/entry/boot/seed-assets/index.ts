// Reader for the bundled seed payloads the default-character/persona/demo-chat seeders lay down on a fresh
// user: the imagery (avatars + gallery pieces) and the EXAMPLE chat transcripts. Lives in entry (not a
// domain) because the bytes are read from disk relative to this module; domain seeders stay fs-unaware and
// take the read as an injected op.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CharacterHandle } from "@orb/kit/ids";

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
export function readSeedAvatar(handle: CharacterHandle): Promise<SeedAssetBytes | null> {
  return readBundled(join("avatars", `${handle}.png`), SEED_AVATAR_MIME);
}

/** The bundled gallery WebP for a character HANDLE, or `null` when the pack ships none for it. */
export function readSeedGalleryPiece(handle: CharacterHandle): Promise<SeedAssetBytes | null> {
  return readBundled(join("gallery", `${handle}-gallery.webp`), SEED_GALLERY_MIME);
}

/** One bundled EXAMPLE transcript's text, by its manifest `slug` — the VERBATIM bytes the real export verb
 *  (`GET /api/export/chat/:id?format=jsonl`) produced for the live-generated conversation. `null` when the
 *  file is absent, so a missing transcript skips ONE example instead of failing the seed. */
export async function readSeedDemoChat(slug: string): Promise<string | null> {
  try {
    return await readFile(join(HERE, "demo-chats", `${slug}.jsonl`), "utf8");
  } catch {
    return null;
  }
}
