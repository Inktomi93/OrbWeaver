// The `@orb/showcase-plugins` package pins (#1692). Three properties the seeder, the `plugin:pack` script and
// #803's auto-upgrade all stand on, and that nothing else in the tree asserts:
//
//   1. THE PACK IS A PURE FUNCTION OF THE SOURCES — byte-identical across calls. The fixed zip mtime exists
//      for exactly this (`BUNDLE_MTIME_MS`'s own comment): without it fflate stamps `Date.now()`, every
//      seeded install lands a different CAS hash, and any byte-level pin is flaky. This is also the MOVE's
//      own receipt: the sha256 set below was captured from `packSeedPluginBundle` at the OLD home
//      (`packages/server/src/entry/boot/seed-assets/`) before the directory was `git mv`d, so a green here
//      is the seed-byte-identity proof that the relocation changed no installed byte.
//   2. EVERY INDEXED SLUG SHIPS, and its manifest `id` IS its directory name — the identity the install
//      funnel keys `(owner, slug)` on. A tuple member with no directory, or a directory whose manifest
//      renamed itself, would seed a plugin under a slug nobody indexed.
//   3. AN UNKNOWN SLUG IS AN ABSENCE, NOT A THROW — the "this package ships no such bundle" arm both
//      readers answer with `null`, which is what lets one missing bundle skip ONE seed instead of failing
//      the whole pass (`seed-example-plugins.ts`'s `unavailable` outcome).
//
// The hashes are VALUES, not a golden file: a deliberate bundle edit is meant to red exactly one row here and
// be re-blessed in the same commit that edits it, which is the only place a reviewer can see that the bytes a
// user installs changed. (#803 upgrades on the manifest VERSION, so a content edit without a version bump
// reaches nobody — that is the reader this row is for.)

import { createHash } from "node:crypto";
import { packShowcaseBundle, readShowcaseManifest, SHOWCASE_PLUGIN_SLUGS } from "../../packages/showcase-plugins/src/index.ts";
import { expect, test } from "../support/fixtures.ts";

/** sha256 of each shipped bundle's packed bytes, captured 2026-09-05 from the pre-move packer. */
const PACKED_SHA256: Readonly<Record<(typeof SHOWCASE_PLUGIN_SLUGS)[number], string>> = {
  "affinity-tracker": "434a9d1745a0f98dc723167238e0eeb2f5773ab6a0355cc0896812acd0c7b60d",
  // Re-blessed after 563833950 (#1698): the hub import states its outcome, which changed the guest's main.js.
  "card-atlas": "9d0327e4147787dba5cb7a1a7bd7887631c09b933ec74e38736cb0e6390e344c",
  "draft-polish": "543a5cdaf0549ca64a366b7f0b2d866becf7dfe50b715d3568b3a1408a7347c4",
  "keepsake-camera": "053696f2e17fc77668d255c5f7818a587dec4f18f34292301557aa34bc256e39",
  "oracle-deck": "2e5a49acb000b327c90ae9173b3f8ed7cfca6ec5c0d84e4d82f531ba31a8225c",
  "pocket-arcade": "7143d14c13b0e562e49b5834792e8205ba3e39c10bae4791508e9d4e768c4bbb",
  "research-familiar": "618d950dc5be019212fb7793a4c60d715d24b1ed8ba303abe0cd0069acaaf01e",
  "scene-chips": "f3cebbf02131bd20b2f7a5f2bfd34eabcbf29e1b3369ca3be8150582f531527e",
  "story-clocks": "1a6cb109a08497a4eabe231a46a9f88561589c2f9d05a7d9fbce40582a4ed68c", // re-pinned at the fold: #1555 changed the tick (conditional write) after the move
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("every indexed slug packs to the bytes it packed before the package move, deterministically", async () => {
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const first = await packShowcaseBundle(slug);
    expect(first, `${slug} ships no bundle`).not.toBeNull();
    const second = await packShowcaseBundle(slug);
    // Same call, same bytes — the mtime is fixed, the asset read is sorted, nothing observes the clock.
    expect(sha256(first as Uint8Array), `${slug} does not pack deterministically`).toBe(sha256(second as Uint8Array));
    expect(sha256(first as Uint8Array), `${slug}'s installed bytes changed`).toBe(PACKED_SHA256[slug]);
  }
});

test("every indexed slug ships a valid manifest whose id IS its directory name", async () => {
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const manifest = await readShowcaseManifest(slug);
    expect(manifest, `${slug} ships no valid manifest`).not.toBeNull();
    // `(owner, slug)` is the install identity, and the seeder's `alreadyInstalled` check keys on the
    // DIRECTORY name while `install` keys on `manifest.id` — a disagreement seeds a second copy forever.
    expect(manifest?.id).toBe(slug);
    // #803 reads the bundled version off this manifest; an unparseable one would read as "no such bundle".
    expect(manifest?.version).toMatch(/^\d+\.\d+\.\d+/);
  }
});

test("a slug this package does not ship is an absence, never a throw", async () => {
  expect(await packShowcaseBundle("no-such-showcase-plugin")).toBeNull();
  expect(await readShowcaseManifest("no-such-showcase-plugin")).toBeNull();
});
