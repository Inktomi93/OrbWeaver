// @orb/default-content — the DEFAULT CONTENT a fresh user is born with, plus the one reader over it: the
// character/persona avatar PNGs (`avatars/<handle>.png`) and the EXAMPLE chat transcripts
// (`demo-chats/<slug>.jsonl`, the verbatim bytes `GET /api/export/chat/:id?format=jsonl` produced for a
// live-generated conversation).
//
// WHY THIS IS A PACKAGE AND NOT A SERVER DIRECTORY (D160, owner ruling 2026-09-02, verbatim: "if dockerfile
// which we don't even use yet is moving default assets around that's a nah from me dog — that's crunchy and
// fragile"). These two families used to live at `packages/server/src/entry/boot/seed-assets/` precisely
// because that tree is the one a container image copies — default content load-bearing on an image build
// step, invisible to the toolchain and silently divergent per environment. As a workspace package the server
// DECLARES (`@orb/server`'s `dependencies`), dev, bare metal and any future container resolve it identically
// through node resolution. `@orb/showcase-plugins` was the first family to move (#1692); D160 named these
// two as the SAME class still unmigrated, and this package is that migration.
//
// POSITION IN THE CAKE: BELOW `server`, beside `contracts`/`db` — placement follows REACHABILITY. It is
// consumed AT RUNTIME by the server's per-user seeders, so it cannot sit above the cake the way `@orb/tooling`
// does (nothing at runtime consumes tooling). It depends on `@orb/kit` alone (the `CharacterHandle` brand) —
// no `@orb/db`, no `@orb/server`, no browser package. Enforcers in ladder order: the pnpm workspace
// dependency is RESOLVE-TIME physics (an undeclared import does not resolve), the `default-content-cake` +
// `browser-no-default-content` dep-cruiser rules name the direction at lint time, and
// `tests/default-content/index.test.ts` holds the sha256 of every shipped file so a content edit reds exactly
// one row where a reviewer can see which bytes a user now receives.
//
// THE SEAM IS THE INJECTED OP, NOT AN IMPORT INTO A DOMAIN: the composition root (`entry/compose/`) closes
// over these readers and hands the bytes to the character/persona/demo-chat seeders, which stay fs-unaware.
// No `domain/**` module imports this package.
//
// THERE IS NO GALLERY READER. The `gallery/<handle>-gallery.webp` family was placeholder art, deleted with
// the authored default-card pack v2 (`bb6d50646`); its reader outlived its content and returned `null` for
// every handle. Re-introducing starter gallery art is a file drop plus a reader here — not a reason to ship
// a reader for a directory this package does not contain.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CharacterHandle } from "@orb/kit/ids";

/** The content ROOT — `packages/default-content/`, resolved off THIS module rather than off a repo-relative
 *  literal, so every consumer reaches the bytes the same way node resolves the package. */
const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The MIME of a shipped avatar (PNG — matches the card-avatar precedent + the byte signature the assets
 *  store sniffs with `enforceMagic`). */
export const SEED_AVATAR_MIME = "image/png";

/** One shipped asset's bytes + the mime that matches them. */
export interface SeedAssetBytes {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

/** The shipped avatar PNG for a character HANDLE / the persona key (`persona-you`), or `null` when this
 *  package ships none for it — so a missing file seeds ONE card art-less instead of failing the whole seed. */
export async function readSeedAvatar(handle: CharacterHandle): Promise<SeedAssetBytes | null> {
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — a missing/unreadable
  // shipped avatar means "this pack ships none for this handle" (`null`), so the caller skips ONE seed item
  // instead of failing the whole seed. Ends if the pack becomes required rather than best-effort.
  try {
    const buf = await readFile(join(CONTENT_DIR, "avatars", `${handle}.png`));
    return { bytes: new Uint8Array(buf), mime: SEED_AVATAR_MIME };
  } catch {
    return null;
  }
}

/** One shipped EXAMPLE transcript's text, by its manifest `slug` — the VERBATIM bytes the real export verb
 *  (`GET /api/export/chat/:id?format=jsonl`) produced for the live-generated conversation. `null` when the
 *  file is absent, so a missing transcript skips ONE example instead of failing the seed. */
export async function readSeedDemoChat(slug: string): Promise<string | null> {
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — the header states the
  // contract: a missing transcript skips ONE example instead of failing the seed. Ends if this transcript
  // becomes required rather than best-effort.
  try {
    return await readFile(join(CONTENT_DIR, "demo-chats", `${slug}.jsonl`), "utf8");
  } catch {
    return null;
  }
}
