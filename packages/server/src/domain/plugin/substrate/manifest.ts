// domain/plugin/substrate/manifest — the SOURCE-AGNOSTIC bundle funnel (owner-ruled): bytes in →
// unzip → validate → a typed `PluginBundle` out. A future first-party catalog fetcher is just another byte
// source (the safeFetch precedent) feeding THIS funnel — never a second install path. Pure + Principal-free;
// the verbs own persistence + the CAS write. Every failure is a typed `ManifestInvalidError` thrown BEFORE
// anything persists (validate-at-the-boundary — the bundle is untrusted input).
//
// Unzip hardening is NON-optional: (a) STRICT ENTRY ALLOW-LIST
// — a bundle is EXACTLY `manifest.json` + `main.js` (02 §1); any extra/unknown/traversal entry name is a
// refusal, so path traversal is impossible by construction (only two exact names are ever admitted); (b)
// DECOMPRESSION-BOMB GUARD — a compressed-input cap + per-entry decompressed caps checked from the zip header
// BEFORE fflate allocates (the filter refuses an over-cap entry pre-alloc), belt-checked against the actual
// decompressed length after (a lying header can't slip a bomb through).

import type { PluginManifest } from "@orb/contracts/plugin";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { UnzipFileInfo } from "fflate";
import { unzipSync } from "fflate";
import { z } from "zod";
import { ManifestInvalidError } from "../contract/errors.ts";

/** The stored bundle is the whole zip (re-parsed + re-validated on activation load — 02 §3); the CAS row's
 *  mime records that. install/upgrade store under this; the ONE home so the two verbs don't drift. */
export const PLUGIN_BUNDLE_MIME = "application/zip";

const MANIFEST_ENTRY = "manifest.json";
const MAIN_ENTRY = "main.js";
/** The two — and only two — legal bundle entries (02 §1). */
const ALLOWED_ENTRIES: readonly string[] = [MANIFEST_ENTRY, MAIN_ENTRY];

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const MANIFEST_JSON_KIB = 64;
/** The COMPRESSED bundle cap (02 §1 "ship one file, ≤ 1 MiB") — the first bomb bound (bounds the input). */
const MAX_BUNDLE_BYTES = BYTES_PER_MIB;
/** The DECOMPRESSED `main.js` cap (02 §1 — a single pre-bundled ES script ≤ 1 MiB). */
const MAX_MAIN_JS_BYTES = BYTES_PER_MIB;
/** The DECOMPRESSED `manifest.json` cap — a tiny metadata doc; 64 KiB is generous for the manifest shape. */
const MAX_MANIFEST_JSON_BYTES = MANIFEST_JSON_KIB * BYTES_PER_KIB;

/** The validated bundle: the parsed manifest + the guest entry source. Substrate-internal (the verb
 *  destructures `parseBundle`'s output) — not a domain type home, so it stays unexported. */
interface PluginBundle {
  readonly manifest: PluginManifest;
  readonly mainJs: string;
}

function capFor(entryName: string): number {
  return entryName === MAIN_ENTRY ? MAX_MAIN_JS_BYTES : MAX_MANIFEST_JSON_BYTES;
}

/** Unzip the bundle under the hardening rules, returning the two entries' raw bytes. Throws
 *  `ManifestInvalidError` on a corrupt zip, an over-cap bundle/entry, an unknown/extra entry, or a missing
 *  required entry. */
function unzipHardened(bundle: Uint8Array): { manifestBytes: Uint8Array; mainBytes: Uint8Array } {
  if (bundle.byteLength === 0) {
    throw new ManifestInvalidError("empty bundle");
  }
  if (bundle.byteLength > MAX_BUNDLE_BYTES) {
    throw new ManifestInvalidError(`bundle exceeds the ${MAX_BUNDLE_BYTES}-byte cap`);
  }

  const seen = new Set<string>();
  const filter = (file: UnzipFileInfo): boolean => {
    seen.add(file.name);
    if (!ALLOWED_ENTRIES.includes(file.name)) {
      // Not decompressed; the post-unzip allow-list check turns this into a typed refusal.
      return false;
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

  const extras = [...seen].filter((name) => !ALLOWED_ENTRIES.includes(name));
  if (extras.length > 0) {
    throw new ManifestInvalidError(`bundle contains unexpected entries: ${extras.join(", ")}`);
  }
  const manifestBytes = files[MANIFEST_ENTRY];
  const mainBytes = files[MAIN_ENTRY];
  if (manifestBytes === undefined || mainBytes === undefined) {
    throw new ManifestInvalidError(`bundle must contain exactly ${MANIFEST_ENTRY} + ${MAIN_ENTRY}`);
  }
  // Belt vs a lying zip header: assert the ACTUAL decompressed length is within the cap.
  if (mainBytes.byteLength > MAX_MAIN_JS_BYTES || manifestBytes.byteLength > MAX_MANIFEST_JSON_BYTES) {
    throw new ManifestInvalidError("bundle entry exceeds its decompressed cap");
  }
  return { manifestBytes, mainBytes };
}

/** Parse untrusted bundle bytes into a validated `PluginBundle`. The ONE bundle funnel (source-agnostic). */
export function parseBundle(bundle: Uint8Array): PluginBundle {
  const { manifestBytes, mainBytes } = unzipHardened(bundle);

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let mainJs: string;
  let manifestText: string;
  try {
    mainJs = decoder.decode(mainBytes);
    manifestText = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
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
  return { manifest: parsed.data, mainJs };
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
