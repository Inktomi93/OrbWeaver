// domain/plugin/substrate/manifest — the SOURCE-AGNOSTIC bundle funnel (owner-ruled): bytes in →
// unzip → validate → a typed `PluginBundle` out. A future first-party catalog fetcher is just another byte
// source (the safeFetch precedent) feeding THIS funnel — never a second install path. Pure + Principal-free;
// the verbs own persistence + the CAS write. Structural failures are typed `ManifestInvalidError`; a
// structurally valid but unsupported membrane major is `HostVersionUnservedError`. Both throw BEFORE anything
// persists (validate-at-the-boundary — the bundle is untrusted input).
//
// Unzip hardening is NON-optional: (a) STRICT ENTRY ALLOW-LIST
// — a bundle is `manifest.json` + `main.js`, plus the OPTIONAL `ui.js` (the Tier-C client guest,
//  U4 §4.6) and the OPTIONAL `ui/assets/<name>` image entries (#820 seam 11); any
// extra/unknown/traversal entry name is a refusal, so path traversal is impossible by construction (three
// exact names plus ONE anchored, flat, alphanumeric-led pattern — all four spellings are the ONE home in
// `@orb/contracts/plugin` rather than literals that could drift out of step with the manifest schema); (b)
// DECOMPRESSION-BOMB GUARD — a compressed-input cap + per-entry decompressed caps checked from the zip header
// BEFORE fflate allocates (the filter refuses an over-cap entry pre-alloc), belt-checked against the actual
// decompressed length after (a lying header can't slip a bomb through), PLUS — once a bundle may carry MANY
// entries — an entry COUNT cap and an AGGREGATE decompressed cap, because `count × per-entry` is the bound a
// per-entry check actually leaves you with and 64 × 2 MiB is not a bound worth having.
//
// THE THIRD ENTRY IS BICONDITIONAL WITH THE MANIFEST, both directions, and both directions are real defects:
// a bundle carrying `ui.js` bytes whose manifest declares no `uiEntry` is un-serveable code sitting inside the
// consent unit (nothing would ever load it, and nothing would ever have disclosed it), while a manifest
// declaring `uiEntry` with no `ui.js` in the zip is a scripted surface that can only fail at mount. Both are
// refused HERE, at the trust edge, before anything is persisted.
//
// THE `ui/assets/` ENTRIES ARE NOT BICONDITIONAL WITH ANYTHING, deliberately — there is no manifest field to
// disagree with. They are DATA, not code: the install/upgrade verbs write each one into the INSTALLER's own
// CAS and a UI node names it by PATH, so an unreferenced sprite is a wasted blob rather than the
// un-disclosed executable an undeclared `ui.js` would be. Declaring them would be a second inventory of the
// zip's own directory, which is the kind of doubling that goes stale.
//
// WHAT MAY BE IN ONE: FOUR RASTER IMAGE FORMATS, decided by the MAGIC BYTES and nothing else — the filename's
// extension is untrusted input and never consulted, and the stored mime is the SNIFFED one. `@orb/kit`'s
// `sniffMime` is the shared primitive (the same one `assets.store`'s `enforceMagic` belt runs), so the
// admitted set is exactly png/jpeg/gif/webp and everything else is the unrecognized sentinel.
// SVG IS REFUSED, and it is refused twice over: it carries no binary signature so it can never sniff to an
// admitted mime, and `domain/assets/substrate/mime.ts`'s ACTIVE_MIMES refuses `image/svg+xml` at the store
// boundary anyway (#709 — a stored blob is served from our OWN origin, where an SVG's embedded script runs
// with the owner's cookies). A bundle-shipped SVG would be plugin-authored script bytes taking a route the
// CSP-isolated `ui.frame` hatch exists to make explicit; the refusal names it so nobody re-adds it as a
// convenience.

import type { PluginManifest } from "@orb/contracts/plugin";
import {
  PLUGIN_HOST_VERSIONS,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_MANIFEST_ENTRY,
  PLUGIN_UI_ASSET_ENTRY_RE,
  PLUGIN_UI_ASSET_MAX_BYTES,
  PLUGIN_UI_ASSETS_DIR,
  PLUGIN_UI_ASSETS_MAX_COUNT,
  PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES,
  PLUGIN_UI_ENTRY,
  PLUGIN_UI_ENTRY_MAX_BYTES,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import { sniffMime } from "@orb/kit/image-sniff";
import type { UnzipFileInfo } from "fflate";
import { unzipSync } from "fflate";
import { z } from "zod";
import { HostVersionUnservedError, ManifestInvalidError, PluginBundleFetchError } from "../contract/errors.ts";

/** The stored bundle is the whole zip (re-parsed + re-validated on activation load); the CAS row's
 *  mime records that. install/upgrade store under this; the ONE home so the two verbs don't drift. */
export const PLUGIN_BUNDLE_MIME = "application/zip";

const MANIFEST_ENTRY = PLUGIN_MANIFEST_ENTRY;
const MAIN_ENTRY = PLUGIN_MAIN_ENTRY;
const UI_ENTRY = PLUGIN_UI_ENTRY;
/** The three legal NAMED bundle entries. `ui.js` is OPTIONAL (U4); the other two are required. The fourth
 *  entry class — `ui/assets/<name>` (#820) — is a PATTERN, not a name, and is admitted by
 *  {@link isBundleAssetEntry} instead. */
const ALLOWED_ENTRIES: readonly string[] = [MANIFEST_ENTRY, MAIN_ENTRY, UI_ENTRY];

/** The MIMEs a bundle asset may sniff to — the four raster formats `@orb/kit`'s `sniffMime` recognizes.
 *  Derived from what the sniff can PROVE rather than from a wish list: an entry whose bytes carry no
 *  recognized signature (an SVG, a script, a renamed zip) yields the `application/octet-stream` sentinel and
 *  is refused, so this set and the sniff's own vocabulary cannot drift apart. */
const ALLOWED_ASSET_MIMES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/** How many unexpected entry NAMES a refusal message repeats. A 1 MiB zip can carry tens of thousands of
 *  central-directory records, and echoing every one back builds a multi-hundred-KiB error string out of
 *  attacker-chosen text — the refusal names enough to debug an honest bundle and no more. */
const EXTRA_ENTRIES_REPORTED = 5;

/** Is this zip entry name an admitted bundle-asset path? The regex is the whole wall — anchored, flat, and
 *  alphanumeric-led, so `..`, a second path segment, a backslash and a leading `/` are all unspellable rather
 *  than filtered (see the constant's own note in `@orb/contracts/plugin`). */
function isBundleAssetEntry(name: string): boolean {
  return PLUGIN_UI_ASSET_ENTRY_RE.test(name);
}

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const MANIFEST_JSON_KIB = 64;
/** The COMPRESSED bundle cap ("ship one file, ≤ 1 MiB") — the first bomb bound (bounds the input). */
const MAX_BUNDLE_BYTES = BYTES_PER_MIB;
/** The DECOMPRESSED `main.js` cap (a single pre-bundled ES script ≤ 1 MiB) — server-internal, no client
 *  reaches it. The Tier-C `ui.js` carries the SAME ceiling but CITES it from contracts
 *  (`PLUGIN_UI_ENTRY_MAX_BYTES`, imported above and applied in {@link capFor}), so the guest-source route and
 *  this unzip allow-list bound the one artifact by ONE number: it is the same kind of thing — one pre-bundled
 *  ES script for one guest — and a divergent budget would be a number with no reason behind it. */
const MAX_MAIN_JS_BYTES = BYTES_PER_MIB;
/** The DECOMPRESSED `manifest.json` cap — a tiny metadata doc; 64 KiB is generous for the manifest shape. */
const MAX_MANIFEST_JSON_BYTES = MANIFEST_JSON_KIB * BYTES_PER_KIB;

/** ONE validated bundle-shipped image (#820): its zip path, its bytes, and the mime the MAGIC BYTES proved.
 *  The install/upgrade verbs turn each of these into a CAS asset + a `plugin_assets` link keyed by `path`. */
interface PluginBundleAsset {
  /** The full zip entry path (`ui/assets/<name>`) — the key a UI node names and the junction row stores. */
  readonly path: string;
  readonly bytes: Uint8Array;
  /** The SNIFFED mime, never a claimed one — the entry's filename extension is untrusted and unconsulted. */
  readonly mime: string;
}

/** The validated bundle: the parsed manifest + the guest entry sources + the bundle-shipped images. `uiJs` is
 *  present iff the manifest declares `uiEntry` AND the zip carried `ui.js` (the biconditional is enforced
 *  below); `uiAssets` is simply whatever admitted `ui/assets/` entries the zip carried (empty for every
 *  bundle that ships none, which is every bundle written before #820). Substrate-internal (the verb
 *  destructures `parseBundle`'s output) — not a domain type home, so it stays unexported. */
interface PluginBundle {
  readonly manifest: PluginManifest;
  readonly mainJs: string;
  readonly uiJs?: string;
  readonly uiAssets: readonly PluginBundleAsset[];
}

function capFor(entryName: string): number {
  if (entryName === MANIFEST_ENTRY) {
    return MAX_MANIFEST_JSON_BYTES;
  }
  if (entryName === UI_ENTRY) {
    return PLUGIN_UI_ENTRY_MAX_BYTES;
  }
  if (isBundleAssetEntry(entryName)) {
    return PLUGIN_UI_ASSET_MAX_BYTES;
  }
  return MAX_MAIN_JS_BYTES;
}

/** Is this entry admitted at all — one of the three exact names, or an `ui/assets/` image path (#820)? */
function isAllowedEntry(name: string): boolean {
  return ALLOWED_ENTRIES.includes(name) || isBundleAssetEntry(name);
}

/** The `ui/assets/` entries as validated {@link PluginBundleAsset}s. The size checks here are BELTS, not the
 *  control: the count, the per-entry cap and the aggregate budget were all enforced from the zip HEADERS in
 *  the filter, before fflate allocated anything — these re-sum the ACTUAL decompressed lengths so a lying
 *  header cannot slip a bomb past the pre-alloc guard. The FORMAT wall is not a belt: this is the only place
 *  the magic bytes are read, and it is what decides each entry's stored mime.
 *  Order is a path sort, so two installs of the same bundle mint their links in the same order. */
function collectBundleAssets(files: Record<string, Uint8Array>): PluginBundleAsset[] {
  const paths = Object.keys(files).filter(isBundleAssetEntry).sort();
  const assets: PluginBundleAsset[] = [];
  let totalBytes = 0;
  for (const path of paths) {
    const bytes = files[path];
    if (bytes === undefined) {
      continue;
    }
    // Belt vs a lying zip header, exactly as the three named entries get: the filter refused an over-cap
    // ORIGINAL SIZE pre-allocation, and this asserts what actually came out.
    if (bytes.byteLength > PLUGIN_UI_ASSET_MAX_BYTES) {
      throw new ManifestInvalidError(`bundle entry ${path} exceeds its ${PLUGIN_UI_ASSET_MAX_BYTES}-byte decompressed cap`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES) {
      throw new ManifestInvalidError(`bundle assets exceed the ${PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES}-byte total decompressed cap`);
    }
    // THE FORMAT WALL. The mime comes from the bytes and from nothing else — the extension is untrusted
    // input. An unrecognized signature is the sentinel `application/octet-stream`, which is where an SVG,
    // a script, or a renamed archive lands.
    const mime = sniffMime(bytes);
    if (!ALLOWED_ASSET_MIMES.includes(mime)) {
      throw new ManifestInvalidError(
        `bundle entry ${path} is not one of the admitted image formats (${ALLOWED_ASSET_MIMES.join(", ")}) — its magic bytes sniffed as ${mime}. SVG is refused outright: it is a script carrier, and a bundle-shipped document served from this app's own origin is exactly what the isolated \`ui.frame\` hatch exists for.`,
      );
    }
    assets.push({ path, bytes, mime });
  }
  return assets;
}

/** Unzip the bundle under the hardening rules, returning the entries' raw bytes (`uiBytes` absent when the
 *  bundle ships no `ui.js`; `uiAssets` empty when it ships none). Throws `ManifestInvalidError` on a corrupt
 *  zip, an over-cap bundle/entry, too many assets, an unknown/extra entry, a non-image asset, or a missing
 *  required entry. */
function unzipHardened(bundle: Uint8Array): {
  manifestBytes: Uint8Array;
  mainBytes: Uint8Array;
  uiBytes?: Uint8Array;
  uiAssets: readonly PluginBundleAsset[];
} {
  if (bundle.byteLength === 0) {
    throw new ManifestInvalidError("empty bundle");
  }
  if (bundle.byteLength > MAX_BUNDLE_BYTES) {
    throw new ManifestInvalidError(`bundle exceeds the ${MAX_BUNDLE_BYTES}-byte cap`);
  }

  const seen = new Set<string>();
  let assetCount = 0;
  let assetBytesClaimed = 0;
  const filter = (file: UnzipFileInfo): boolean => {
    seen.add(file.name);
    if (!isAllowedEntry(file.name)) {
      // Not decompressed; the post-unzip allow-list check turns this into a typed refusal.
      return false;
    }
    if (isBundleAssetEntry(file.name)) {
      assetCount += 1;
      // The COUNT bomb, refused before the (count+1)-th entry is ever inflated: a per-entry size cap says
      // nothing about how many entries there are, and each admitted one costs a CAS write + a junction row.
      if (assetCount > PLUGIN_UI_ASSETS_MAX_COUNT) {
        throw new ManifestInvalidError(`bundle carries more than ${PLUGIN_UI_ASSETS_MAX_COUNT} ${PLUGIN_UI_ASSETS_DIR} entries`);
      }
      // …and the AGGREGATE bomb, refused from the HEADERS so it bites BEFORE the allocation rather than after
      // it. This is the load-bearing half: without it the count and per-entry caps together still admit
      // 64 × 2 MiB = 128 MiB of inflation out of a 1 MiB upload, and a post-decompress check would have
      // already paid for every byte of it. `collectBundleAssets` re-sums the ACTUAL lengths as the belt
      // against a lying header, exactly as the named entries get.
      assetBytesClaimed += file.originalSize;
      if (assetBytesClaimed > PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES) {
        throw new ManifestInvalidError(`bundle assets exceed the ${PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES}-byte total decompressed cap`);
      }
    }
    // Bomb guard: refuse an over-cap entry from the header BEFORE fflate allocates its output buffer.
    if (file.originalSize > capFor(file.name)) {
      throw new ManifestInvalidError(`bundle entry ${file.name} exceeds its ${capFor(file.name)}-byte cap`);
    }
    return true;
  };

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bundle, { filter });
  } catch (err) {
    if (err instanceof ManifestInvalidError) {
      throw err;
    }
    throw new ManifestInvalidError("bundle is not a valid zip archive", { cause: err });
  }

  const extras = [...seen].filter((name) => !isAllowedEntry(name));
  if (extras.length > 0) {
    const listed = extras.slice(0, EXTRA_ENTRIES_REPORTED).join(", ");
    const rest = extras.length > EXTRA_ENTRIES_REPORTED ? ` (+${extras.length - EXTRA_ENTRIES_REPORTED} more)` : "";
    throw new ManifestInvalidError(`bundle contains unexpected entries: ${listed}${rest}`);
  }
  const manifestBytes = files[MANIFEST_ENTRY];
  const mainBytes = files[MAIN_ENTRY];
  const uiBytes = files[UI_ENTRY];
  if (manifestBytes === undefined || mainBytes === undefined) {
    throw new ManifestInvalidError(`bundle must contain ${MANIFEST_ENTRY} + ${MAIN_ENTRY}`);
  }
  // Belt vs a lying zip header: assert the ACTUAL decompressed length is within the cap.
  if (mainBytes.byteLength > MAX_MAIN_JS_BYTES || manifestBytes.byteLength > MAX_MANIFEST_JSON_BYTES) {
    throw new ManifestInvalidError("bundle entry exceeds its decompressed cap");
  }
  if (uiBytes !== undefined && uiBytes.byteLength > MAX_MAIN_JS_BYTES) {
    throw new ManifestInvalidError("bundle entry exceeds its decompressed cap");
  }
  const uiAssets = collectBundleAssets(files);
  return uiBytes === undefined ? { manifestBytes, mainBytes, uiAssets } : { manifestBytes, mainBytes, uiBytes, uiAssets };
}

/** Parse untrusted bundle bytes into a validated, host-compatible `PluginBundle`. The ONE bundle funnel
 *  (source-agnostic). Structural faults throw `ManifestInvalidError`; a well-formed major absent from the
 *  contract-owned served tuple throws `HostVersionUnservedError`. */
export function parseBundle(bundle: Uint8Array): PluginBundle {
  const { manifestBytes, mainBytes, uiBytes, uiAssets } = unzipHardened(bundle);

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let mainJs: string;
  let manifestText: string;
  let uiJs: string | undefined;
  try {
    mainJs = decoder.decode(mainBytes);
    manifestText = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
    uiJs = uiBytes === undefined ? undefined : new TextDecoder("utf-8", { fatal: true }).decode(uiBytes);
  } catch (err) {
    throw new ManifestInvalidError("bundle entry is not valid UTF-8", { cause: err });
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestText);
  } catch (err) {
    throw new ManifestInvalidError("manifest.json is not valid JSON", { cause: err });
  }

  const parsed = pluginManifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    // `z.prettifyError` over a hand `issues.map(i => i.message)`: the hand-flatten dropped the PATH, so a
    // bundle refused for `net.hosts[2]` read as a bare "Invalid input" naming no field — and this refusal is
    // OPERATOR-facing (someone installing a plugin), not model-facing, so the human layout is the right one.
    throw new ManifestInvalidError(`manifest.json failed validation:\n${z.prettifyError(parsed.error)}`);
  }
  // Compatibility is a LIFECYCLE refusal, not a structural-manifest failure. Keeping this after the schema
  // parse means malformed values still get field-level Zod diagnostics, while a future positive-integer major
  // reaches the stable error code callers can use to say "rebuild for a served host". The tuple is also what
  // `orb.host(major)` consumes, so install-time admission and guest-runtime negotiation cannot drift.
  if (!PLUGIN_HOST_VERSIONS.some((served) => served === parsed.data.hostVersion)) {
    throw new HostVersionUnservedError(parsed.data.hostVersion, PLUGIN_HOST_VERSIONS);
  }
  // THE ui.js ⟺ uiEntry BICONDITIONAL (see the header). Both arms are refused at the trust edge because both
  // are real defects, not merely untidy: undeclared bytes are code inside the consent unit that nothing
  // disclosed and nothing would load; a declared-but-absent entry is a scripted surface that can only fail at
  // mount, after the user has already granted `ui.surface` on the strength of the declaration.
  const declaresUi = parsed.data.uiEntry !== undefined;
  if (declaresUi !== (uiJs !== undefined)) {
    throw new ManifestInvalidError(
      declaresUi ? `manifest declares uiEntry but the bundle contains no ${UI_ENTRY}` : `bundle contains ${UI_ENTRY} but the manifest declares no uiEntry`,
    );
  }
  return uiJs === undefined ? { manifest: parsed.data, mainJs, uiAssets } : { manifest: parsed.data, mainJs, uiJs, uiAssets };
}

/** The manifest version is exactly `major.minor.patch` (schema regex) — three numeric segments. */
const SEMVER_SEGMENTS = 3;

/** Semver compare on the `\d+.\d+.\d+` version the manifest schema already validates (`-1|0|1`). */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < SEMVER_SEGMENTS; i += 1) {
    if (pa[i] !== pb[i]) {
      return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
    }
  }
  return 0;
}

/** True when installing `candidate` over `installed` would ROLL BACK (owner-ruled) — the
 *  install/upgrade verb refuses it with `PluginDowngradeRefusedError`. Equal versions are a legal re-install. */
export function isVersionDowngrade(candidate: string, installed: string): boolean {
  return compareSemver(candidate, installed) < 0;
}

/** True when a REMOTE version is strictly newer than the INSTALLED one — the auto update-check's verdict
 *  (U8 2b, `checkForUpdates`). The exact complement of a downgrade is NOT this (equal
 *  versions are neither), so it is its own predicate: an equal remote is `up-to-date`, not `update-available`. */
export function isVersionNewer(remote: string, installed: string): boolean {
  return compareSemver(remote, installed) > 0;
}

/** The OTHER half of the URL-install funnel (U8, seam 15): fetch a bundle's bytes through
 *  the injected egress-guarded fetch (`ctx.fetchBundle` → `infra/network`'s `fetchPluginBundle` — `safeFetch`
 *  ANY_HOST: https-only, per-hop private-range/IP-literal denial, redirect budget, byte cap), then hand them to
 *  `parseBundle`. The two-line body is a SECURITY choke: it collapses EVERY fetch failure — an SSRF block, a
 *  scheme/redirect refusal, a non-2xx, a network error — to ONE leak-free {@link PluginBundleFetchError}. The
 *  original `cause` is deliberately DROPPED rather than attached: `safeFetch`'s own error carries the block
 *  REASON (`"private-address"` vs `"host-not-allowed"`), and a serialized cause would re-leak exactly the SSRF
 *  oracle the collapse exists to close. The domain never imports `#infra/network` to branch (the
 *  `fetchWebDocument`→`ScrapeFailedError` precedent) — infra performs the guarded fetch and throws; this catches. */
export async function fetchBundleThroughGuard(fetchBundle: (url: string) => Promise<Uint8Array>, url: string): Promise<Uint8Array> {
  try {
    return await fetchBundle(url);
  } catch (cause) {
    // `cause` is forwarded to the SERVER LOG only (never the client — see the error class): the client sees the
    // generic leak-free message, so the SSRF block REASON the cause carries is not an oracle a caller can read.
    throw new PluginBundleFetchError(url, { cause });
  }
}
