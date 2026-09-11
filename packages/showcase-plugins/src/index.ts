// @orb/showcase-plugins — the TYPED INDEX over the shipped showcase plugin bundles (#1692; the #1238 §2 house
// shape for default content, owner ruling 2026-09-02: default content ships as a workspace package the server
// DECLARES and resolves by node resolution, never an image-copy step and never a repo-relative path).
//
// WHY THIS IS A PACKAGE AND NOT A SERVER DIRECTORY. The bundles used to live at
// `packages/server/src/entry/boot/seed-assets/plugins/` precisely because that tree is the one the container
// image copies — a load-bearing dependence on an image build step, which is what the owner ruling refused. As
// a workspace package the server declares (`@orb/server`'s `dependencies`), dev, bare metal and any future
// container resolve it identically through `node_modules`, and the "easy to reach" half of the same ruling is
// satisfied too: a plugin author reads `packages/showcase-plugins/bundles/<slug>/`, not five directories into
// a server tier they have no business in.
//
// POSITION IN THE CAKE: BELOW `server`, beside `contracts`/`db` — placement follows REACHABILITY. It is
// consumed AT RUNTIME by the server's seeder, so it cannot sit above the cake the way `@orb/tooling` does
// (nothing at runtime consumes tooling). It depends on `@orb/contracts` (the bundle-entry vocabulary + the
// manifest schema — the SAME constants the unzip allow-list and the install funnel use, so the packer cannot
// drift out of step with the funnel that would reject it) and `fflate`, and on nothing else. That is the
// living proof the published plugin API is self-sufficient: this package compiles against contracts' PUBLIC
// plugin exports and nothing server-internal.
//
// WHAT IS AND IS NOT TYPECHECKED: `bundles/<slug>/{main,ui}.js` are GUEST sources for the QuickJS sandbox and
// are compiled by no program in the repo (`allowJs: false` repo-wide) — unchanged by this move, deliberately;
// see `tsconfig.json`'s header for the rot fix's own row. `bundles/host-v1.d.ts` is the PUBLISHED SDK mirror
// an author copies beside their `main.js`; it is pinned against `@orb/contracts/plugin` by
// `tests/contracts/plugin/host-v1.test-d.ts`.
//
// ONE READER, THREE CONSUMERS: the per-user seeder (`@orb/server`'s `entry/boot/seed-example-plugins.ts`,
// wired at `entry/compose/services.ts`), `scripts/pack-plugin.ts` (the distributable-zip door), and the
// package's own byte-identity pin. There is no committed zip artifact to drift.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY, PLUGIN_UI_ASSETS_DIR, PLUGIN_UI_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { zipSync } from "fflate";

/** The bundle ROOT — `packages/showcase-plugins/bundles/`, resolved off THIS module rather than off a
 *  repo-relative literal, so every consumer reaches the content the same way node resolves the package. */
const BUNDLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "bundles");

/** THE INDEX: every shipped bundle, by directory slug (which is also the manifest `id` — the install funnel's
 *  identity, pinned by this package's own test). ONE per ARCHETYPE, which is what makes the set a menu rather
 *  than a demo: event reactor (research-familiar), tool provider + the whole UI plane (oracle-deck), quiet
 *  thinker + Tier-C (affinity-tracker), text pipeline (draft-polish), room surface + composition subscriber
 *  (scene-chips), room mechanics over chat variables (story-clocks), the ui.frame escape hatch
 *  (pocket-arcade), spend pipeline — quiet LLM + imagery (keepsake-camera), and the hub browser flagship
 *  (card-atlas). Adding a tenth is this tuple plus its bundle directory; nothing else is per-plugin. The
 *  set's design + coverage matrix: `docs/design/plugin-showcase-set.md` (#774).
 *
 *  The VERSIONS are deliberately NOT spelled here — a version twin beside the manifests is a second home that
 *  goes stale the first time someone bumps one and not the other. `readShowcaseManifest` reads them from the
 *  manifests themselves, which is the same authority the install funnel judges.
 *
 *  A consumer that needs the SLUG TYPE derives it in place (`(typeof SHOWCASE_PLUGIN_SLUGS)[number]`) — this
 *  package is content plus a reader, not a type home (`no-inline-types`), and an exported alias here would be
 *  a second name for the tuple that already says it. */
export const SHOWCASE_PLUGIN_SLUGS = [
  "research-familiar",
  "oracle-deck",
  "affinity-tracker",
  "draft-polish",
  "scene-chips",
  "story-clocks",
  "pocket-arcade",
  "keepsake-camera",
  "card-atlas",
] as const;

/** The two REQUIRED entries of a plugin bundle, from the ONE home (`@orb/contracts/plugin` — the same
 *  constants the unzip allow-list and the manifest schema use). */
const BUNDLE_ENTRIES = [PLUGIN_MANIFEST_ENTRY, PLUGIN_MAIN_ENTRY] as const;

/** A FIXED mtime for every packed entry, so `packShowcaseBundle` is a PURE function of the source files.
 *  Without it fflate stamps `Date.now()` and the same sources pack to different bytes on every call — each
 *  seeded install would land a different CAS hash and any byte-level pin would be flaky.
 *
 *  The VALUE is 1980-07-01T00:00:00Z, and it is mid-year on purpose. The DOS date field fflate writes cannot
 *  represent anything before 1980, and it derives the year with `new Date(mtime).getFullYear()` — in LOCAL
 *  time. So the obvious spellings both throw `date not in range 1980-2099` on any box west of UTC: `mtime: 0`
 *  (the unix epoch) always, and 1980-01-01T00:00:00Z whenever the local zone is behind UTC (measured). Six
 *  months of slack makes the stamp timezone-proof. */
const BUNDLE_MTIME_MS = 331_257_600_000;

/** Read one OPTIONAL bundle entry — `null` when the bundle ships none. Distinct from the required-entry read
 *  below, and the distinction is the point: a missing `manifest.json` means "no such bundle" (skip the slug),
 *  a missing `ui.js` means "this one is Tier-S" (pack two entries). Collapsing them would make a typo'd
 *  `ui.js` filename silently ship a plugin with no client guest. */
async function readOptionalEntry(slug: string, entry: string): Promise<Buffer | null> {
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — the header states the
  // contract: a missing `ui.js` means "this bundle is Tier-S" (skip that entry), not a failure. Ends if this
  // entry becomes required rather than optional.
  try {
    return await readFile(join(BUNDLES_DIR, slug, entry));
  } catch {
    return null;
  }
}

/** Every file in a bundle's `ui/assets/` directory, as `ui/assets/<name>` zip entries (#820 seam 11), sorted
 *  so the packed bytes stay a PURE function of the sources (the same reason the mtime is fixed).
 *
 *  IT PACKS WHAT IS THERE AND VALIDATES NOTHING, deliberately — `parseBundle` is the one authority on which
 *  names and which formats are admissible, and a second opinion here would either drift from it or silently
 *  drop a file the author meant to ship. A misnamed or non-image entry therefore fails LOUDLY at install/seed
 *  with the funnel's own message, which is where an author can act on it.
 *
 *  ONE LEVEL, no recursion: the funnel admits `ui/assets/<name>` and nothing deeper, so walking
 *  subdirectories would only build bundles it is going to refuse. */
async function readBundleAssets(slug: string): Promise<{ path: string; bytes: Uint8Array }[]> {
  const dir = join(BUNDLES_DIR, slug, PLUGIN_UI_ASSETS_DIR);
  let names: string[];
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — a bundle with no
  // `ui/assets/` directory ships no bundle assets, which is every one authored before #820. Ends if the
  // directory becomes required rather than optional.
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }
  names.sort();
  const assets: { path: string; bytes: Uint8Array }[] = [];
  for (const name of names) {
    assets.push({ path: `${PLUGIN_UI_ASSETS_DIR}${name}`, bytes: new Uint8Array(await readFile(join(dir, name))) });
  }
  return assets;
}

/** Pack a showcase bundle's source directory into the installable bundle: a zip of `manifest.json` +
 *  `main.js`, PLUS `ui.js` when the bundle ships a Tier-C client guest (plugin-ui-plane #679 U4) — the shape
 *  `parseBundle` admits. `null` when this package ships no such slug, so a missing bundle skips ONE seed
 *  instead of failing the whole seed.
 *
 *  THE OPTIONAL ENTRY IS PACKED WHENEVER IT EXISTS ON DISK, and the funnel is what judges that: `parseBundle`
 *  refuses a bundle whose `ui.js` presence disagrees with its manifest's `uiEntry`, in BOTH directions. So a
 *  half-authored bundle (a `ui.js` the manifest forgot to declare, or a declaration with no file) fails
 *  LOUDLY at seed time instead of installing a plugin whose scripted surface can never mount. The packer
 *  deliberately does not read the manifest to decide — one authority for that pairing, and it is the trust
 *  edge. */
export async function packShowcaseBundle(slug: string): Promise<Uint8Array | null> {
  let read: Buffer[];
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — SCOPED to the read
  // only (the comment below states why: a blanket catch around the whole function once turned a real fflate
  // refusal into a silent "bundle missing"). Ends if the zip step below is folded back into this try.
  try {
    read = await Promise.all(BUNDLE_ENTRIES.map((entry) => readFile(join(BUNDLES_DIR, slug, entry))));
  } catch {
    // "This package ships no such bundle" — the ONLY thing that answers `null`, and the catch is scoped to
    // the READ for that reason. A zip failure below is a packer DEFECT and throws: a blanket catch around the
    // whole function once turned a real fflate refusal (`date not in range 1980-2099`) into a silent
    // "bundle missing", which is the shape of a caller that never learns its instrument is broken.
    return null;
  }
  const uiSource = await readOptionalEntry(slug, PLUGIN_UI_ENTRY);
  const entries: Record<string, [Uint8Array, { mtime: number }]> = {};
  BUNDLE_ENTRIES.forEach((entry, i) => {
    entries[entry] = [new Uint8Array(read[i] as Buffer), { mtime: BUNDLE_MTIME_MS }];
  });
  if (uiSource !== null) {
    entries[PLUGIN_UI_ENTRY] = [new Uint8Array(uiSource), { mtime: BUNDLE_MTIME_MS }];
  }
  for (const asset of await readBundleAssets(slug)) {
    entries[asset.path] = [asset.bytes, { mtime: BUNDLE_MTIME_MS }];
  }
  return zipSync(entries);
}

/** The SHIPPED manifest for one slug, validated by the SAME `pluginManifestSchema` the install funnel runs —
 *  `null` when this package ships no such bundle. This is where a consumer reads the bundled `version` from
 *  (#803's auto-upgrade compares it against the installed row's): the manifest is the one authority, and a
 *  version re-spelled anywhere else is a second home that drifts on the first bump.
 *
 *  It VALIDATES rather than merely `JSON.parse`-ing, because a manifest this package ships that the funnel
 *  would refuse is a defect in this package, and the caller that reads a version off it deserves to have been
 *  told. A malformed/absent file answers `null` — the same "no such bundle" arm `packShowcaseBundle` uses, so
 *  a consumer has one absence to handle rather than two. */
export async function readShowcaseManifest(slug: string): Promise<PluginManifest | null> {
  let raw: string;
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — "this package ships
  // no such bundle" is the contract (the `packShowcaseBundle` arm one function up). Ends if a missing bundle
  // becomes a failure rather than an absence.
  try {
    raw = await readFile(join(BUNDLES_DIR, slug, PLUGIN_MANIFEST_ENTRY), "utf8");
  } catch {
    return null;
  }
  const parsed = pluginManifestSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}
