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
import { ManifestInvalidError, parseBundle } from "@orb/server/domain/plugin";
import { zipSync } from "fflate";
import { packShowcaseBundle, readShowcaseManifest, SHOWCASE_PLUGIN_SLUGS } from "../../packages/showcase-plugins/src/index.ts";
import { expect, test } from "../support/fixtures.ts";

/** sha256 of each shipped bundle's packed bytes, captured 2026-09-05 from the pre-move packer. */
const PACKED_SHA256: Readonly<Record<(typeof SHOWCASE_PLUGIN_SLUGS)[number], string>> = {
  "affinity-tracker": "434a9d1745a0f98dc723167238e0eeb2f5773ab6a0355cc0896812acd0c7b60d",
  // Re-blessed after 563833950 (#1698): the hub import states its outcome, which changed the guest's main.js.
  "card-atlas": "9d0327e4147787dba5cb7a1a7bd7887631c09b933ec74e38736cb0e6390e344c",
  "draft-polish": "543a5cdaf0549ca64a366b7f0b2d866becf7dfe50b715d3568b3a1408a7347c4",
  "keepsake-camera": "053696f2e17fc77668d255c5f7818a587dec4f18f34292301557aa34bc256e39",
  // re-pinned 2026-09-06: 3d1047b66 (#1391) rewrote the injective wire-name mint's comments
  // (`plugin_oracle_deck_*` -> `plugin_oracle__deck_*`, the hyphen-doubling rule) plus README.
  "oracle-deck": "71a9b63273768ec906baf189324e9f5eec79281ed9e69e121fc5b91d745d4032",
  "pocket-arcade": "7143d14c13b0e562e49b5834792e8205ba3e39c10bae4791508e9d4e768c4bbb",
  "research-familiar": "618d950dc5be019212fb7793a4c60d715d24b1ed8ba303abe0cd0069acaaf01e",
  "scene-chips": "f3cebbf02131bd20b2f7a5f2bfd34eabcbf29e1b3369ca3be8150582f531527e",
  // Re-pinned 2026-09-07 (#1865) + manifest 1.0.0 -> 1.0.1, so the auto-upgrade actually reaches installed
  // rows: the `advance_clock` tool declared `segments` as `{type:"integer", enum:[…]}`, which the host's
  // JSON-Schema lift refuses (no integer literal in zod), and a refused tool registration is
  // ACTIVATION-FATAL — this example has been dead on every install since it shipped. Now `type:"number"`.
  "story-clocks": "b63ea99029e033a35c24890ab6eac36ebe54e3f0a070909e546fc3392db8f615",
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("every indexed slug packs to the bytes it packed before the package move", { tags: "source-freshness" }, async () => {
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const packed = await packShowcaseBundle(slug);
    expect(packed, `${slug} ships no bundle`).not.toBeNull();
    expect(sha256(packed as Uint8Array), `${slug}'s installed bytes changed`).toBe(PACKED_SHA256[slug]);
  }
});

test("every indexed slug packs deterministically", async () => {
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const first = await packShowcaseBundle(slug);
    const second = await packShowcaseBundle(slug);
    expect(first, `${slug} ships no bundle`).not.toBeNull();
    expect(second, `${slug} ships no bundle on the second read`).not.toBeNull();
    // Same call, same bytes — the mtime is fixed, the asset read is sorted, nothing observes the clock.
    expect(sha256(first as Uint8Array), `${slug} does not pack deterministically`).toBe(sha256(second as Uint8Array));
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

// #1908 — THE PACKER VALIDATES NOTHING, BY DESIGN, SO SOMETHING ELSE HAS TO. `packShowcaseBundle` packs
// what is on disk (`ui.js` whenever the file exists, every `ui/assets/` image it finds) and states that it
// leaves every judgement to `parseBundle`. Until this row nothing asserted the pair actually agrees: the
// package's own pins checked the packed BYTES and the MANIFEST, and `readShowcaseManifest` runs
// `pluginManifestSchema` alone — which is blind to a forbidden entry, an over-cap entry, and BOTH
// directions of the `ui.js` ⟺ `uiEntry` biconditional. So a shipped slug that grew a `ui.js` without the
// matching `uiEntry` (or lost the file while keeping the declaration) would pack green, seed green, and
// fail at the install funnel for every user.
//
// This is also the control for the `plugin:pack` repair: that script now runs THIS function, so a slug
// that passes here is a zip the CLI will write and the installer will accept.
test("every indexed slug packs to a bundle the INSTALL FUNNEL accepts", async () => {
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const packed = await packShowcaseBundle(slug);
    expect(packed, `${slug} ships no bundle`).not.toBeNull();
    const parsed = parseBundle(packed as Uint8Array);
    expect(parsed.manifest.id, `${slug} packs a bundle the install funnel would key under another slug`).toBe(slug);
    // The biconditional, asserted on the SHIPPED pair rather than assumed: bytes present iff declared.
    expect(parsed.uiJs !== undefined, `${slug}'s ui.js presence disagrees with its uiEntry declaration`).toBe(parsed.manifest.uiEntry !== undefined);
  }
});

// POSITIVE CONTROL for the row above — it asserts an ACCEPTANCE, so on its own it cannot tell "the funnel
// agrees with the packer" from "the funnel accepts anything". These are the exact drift shapes the packer
// can produce from an ordinary source directory, rebuilt over a REAL shipped bundle's entries.
test("the funnel refuses the drift shapes the packer can produce (undeclared ui.js, declared-but-absent ui.js, a stray entry)", async () => {
  const [slug] = SHOWCASE_PLUGIN_SLUGS;
  const packed = await packShowcaseBundle(slug as string);
  const original = parseBundle(packed as Uint8Array);
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
  const manifestOf = (overrides: Record<string, unknown>): Uint8Array => encode(JSON.stringify({ ...original.manifest, ...overrides }));

  // A source dir that grew a `ui.js` nobody declared — un-serveable code inside the consent unit.
  expect(() =>
    parseBundle(zipSync({ "manifest.json": manifestOf({ uiEntry: undefined }), "main.js": encode("const x = 1;"), "ui.js": encode("const ui = 1;") })),
  ).toThrow(ManifestInvalidError);

  // …and the other direction: a declaration whose file is missing — a surface that can only fail at mount.
  expect(() => parseBundle(zipSync({ "manifest.json": manifestOf({ uiEntry: "ui.js" }), "main.js": encode("const x = 1;") }))).toThrow(ManifestInvalidError);

  // An entry outside the allow-list — the class `pluginManifestSchema` alone cannot see at all.
  expect(() =>
    parseBundle(zipSync({ "manifest.json": manifestOf({ uiEntry: undefined }), "main.js": encode("const x = 1;"), "steal.js": encode("exfil()") })),
  ).toThrow(ManifestInvalidError);
});
