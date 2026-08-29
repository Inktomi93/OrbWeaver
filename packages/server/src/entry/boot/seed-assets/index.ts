// Reader for the bundled seed payloads the default-character/persona/demo-chat/example-plugin seeders lay
// down on a fresh user: the imagery (avatars + gallery pieces), the EXAMPLE chat transcripts, and the EXAMPLE
// PLUGIN bundles. Lives in entry (not a domain) because the bytes are read from disk relative to this module;
// domain seeders stay fs-unaware and take the read as an injected op.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY, PLUGIN_UI_ENTRY } from "@orb/contracts/plugin";
import type { CharacterHandle } from "@orb/kit/ids";
import { zipSync } from "fflate";

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
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — a missing/unreadable
  // bundled asset means "this pack ships none for this handle" (`null`), so the caller skips ONE seed item
  // instead of failing the whole seed. Ends if the seed pack becomes required rather than best-effort.
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

/** The two REQUIRED entries of a plugin bundle, from the ONE home (`@orb/contracts/plugin` — the same
 *  constants the unzip allow-list and the manifest schema use, so the packer cannot drift out of step with the
 *  funnel that will reject it). */
const PLUGIN_BUNDLE_ENTRIES = [PLUGIN_MANIFEST_ENTRY, PLUGIN_MAIN_ENTRY] as const;

/** A FIXED mtime for every packed entry, so `packSeedPluginBundle` is a PURE function of the two source
 *  files. Without it fflate stamps `Date.now()` and the same sources pack to different bytes on every call —
 *  each seeded install would land a different CAS hash and any byte-level pin would be flaky.
 *
 *  The VALUE is 1980-07-01T00:00:00Z, and it is mid-year on purpose. The DOS date field fflate writes cannot
 *  represent anything before 1980, and it derives the year with `new Date(mtime).getFullYear()` — in LOCAL
 *  time. So the obvious spellings both throw `date not in range 1980-2099` on any box west of UTC: `mtime: 0`
 *  (the unix epoch) always, and 1980-01-01T00:00:00Z whenever the local zone is behind UTC (measured here).
 *  Six months of slack makes the stamp timezone-proof. */
const PLUGIN_BUNDLE_MTIME_MS = 331_257_600_000;

/** Read one OPTIONAL bundle entry — `undefined` when the example ships none. Distinct from the required-entry
 *  read below, and the distinction is the point: a missing `manifest.json` means "no such example" (skip the
 *  slug), a missing `ui.js` means "this example is Tier-S" (pack two entries). Collapsing them would make a
 *  typo'd `ui.js` filename silently ship a plugin with no client guest. */
async function readOptionalEntry(slug: string, entry: string): Promise<Buffer | null> {
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — the header states the
  // contract: a missing `ui.js` means "this example is Tier-S" (skip that entry), not a failure. Ends if this
  // entry becomes required rather than optional.
  try {
    return await readFile(join(HERE, "plugins", slug, entry));
  } catch {
    return null; // `null` (not `undefined`) — the `readBundled`/`readSeedDemoChat` absence spelling in this file.
  }
}

/** Pack an EXAMPLE PLUGIN's source directory into the installable bundle: a zip of `manifest.json` + `main.js`,
 *  PLUS `ui.js` when the example ships a Tier-C client guest (plugin-ui-plane #679 U4) — the shape `parseBundle`
 *  admits. The sources live beside this module (`plugins/<slug>/…`) so they ride the same `packages/server/src`
 *  COPY the image already makes — a repo-root `examples/` directory would not exist at runtime. `null` when the
 *  pack ships no such slug, so a missing example skips ONE seed instead of failing the whole seed (the
 *  `readSeedDemoChat` posture).
 *
 *  THE OPTIONAL ENTRY IS PACKED WHENEVER IT EXISTS ON DISK, and the funnel is what judges that: `parseBundle`
 *  refuses a bundle whose `ui.js` presence disagrees with its manifest's `uiEntry`, in BOTH directions. So a
 *  half-authored example (a `ui.js` the manifest forgot to declare, or a declaration with no file) fails LOUDLY
 *  at seed time instead of installing a plugin whose scripted surface can never mount. The packer deliberately
 *  does not read the manifest to decide — one authority for that pairing, and it is the trust edge.
 *
 *  ONE SOURCE, TWO CONSUMERS: the per-user seeder calls this at seed time, and `scripts/pack-plugin.ts` calls
 *  it to emit a distributable `.zip` for a hand install. There is no committed zip artifact to drift. */
export async function packSeedPluginBundle(slug: string): Promise<Uint8Array | null> {
  let read: Buffer[];
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — SCOPED to the read
  // only (the comment below states why: a blanket catch around the whole function once turned a real fflate
  // refusal into a silent "example missing"). Ends if the zip step below is folded back into this try.
  try {
    read = await Promise.all(PLUGIN_BUNDLE_ENTRIES.map((entry) => readFile(join(HERE, "plugins", slug, entry))));
  } catch {
    // "This pack ships no such example" — the ONLY thing that answers `null`, and the catch is scoped to the
    // READ for that reason. A zip failure below is a packer DEFECT and throws: a blanket catch around the
    // whole function once turned a real fflate refusal (`date not in range 1980-2099`) into a silent
    // "example missing", which is the shape of a caller that never learns its instrument is broken.
    return null;
  }
  const uiSource = await readOptionalEntry(slug, PLUGIN_UI_ENTRY);
  const entries: Record<string, [Uint8Array, { mtime: number }]> = {};
  PLUGIN_BUNDLE_ENTRIES.forEach((entry, i) => {
    entries[entry] = [new Uint8Array(read[i] as Buffer), { mtime: PLUGIN_BUNDLE_MTIME_MS }];
  });
  if (uiSource !== null) {
    entries[PLUGIN_UI_ENTRY] = [new Uint8Array(uiSource), { mtime: PLUGIN_BUNDLE_MTIME_MS }];
  }
  return zipSync(entries);
}

/** One bundled EXAMPLE transcript's text, by its manifest `slug` — the VERBATIM bytes the real export verb
 *  (`GET /api/export/chat/:id?format=jsonl`) produced for the live-generated conversation. `null` when the
 *  file is absent, so a missing transcript skips ONE example instead of failing the seed. */
export async function readSeedDemoChat(slug: string): Promise<string | null> {
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — the header states the
  // contract: a missing transcript skips ONE example instead of failing the seed. Ends if this transcript
  // becomes required rather than best-effort.
  try {
    return await readFile(join(HERE, "demo-chats", `${slug}.jsonl`), "utf8");
  } catch {
    return null;
  }
}
