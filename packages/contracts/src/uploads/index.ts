// @orb/contracts/uploads — the ONE home for the deployment byte-cap catalog. Every upload boundary (the
// HTTP asset/import/databank routes, the profile-dir + bundle import runners) and every client pre-check
// derives its ceiling from HERE, so the server truth and the client hint can never drift into the invented
// per-widget numbers this module was minted to kill (composer 20 MB, avatar 20 MB, background 30 MB, and a
// hand-kept 256 MiB mirror — all replaced by a derive from the served catalog below).
//
// Two shapes ship from here:
//   • the raw byte constants (server routes + import runners import them directly);
//   • `UploadCaps`, the wire block SERVED to the client on `/api/auth/config` (a deployment fact, exactly
//     like `multiHumanCapable`) so the client's dropzone hints + pre-checks read the LIVE value and fall
//     back to `DEFAULT_UPLOAD_CAPS` only when the config fetch hasn't landed — never a third invented number.
//
// The security floors (the zip-bomb decompressed belt) live here WITH their rationale and are NOT served —
// they are internal ceilings, not a client affordance.

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;

// The MiB counts, named so the byte constants below carry no bare magic number (biome noMagicNumbers). Each
// is the single-source figure the whole codebase's caps derive from — change here, change everywhere.
const ASSET_UPLOAD_MIB = 64;
const DATABANK_UPLOAD_MIB = 20;
const IMPORT_TOTAL_MIB = 256;
const IMPORT_DECOMPRESSED_MIB = 10_240; // 10 GiB

// ── The single-asset family (a POSTed image/blob → /api/assets/upload) ─────────────────────────────────
/** A single asset (avatar/gallery/background image, a card PNG). Also handed to the CAS store's `maxBytes`
 *  belt, so an over-cap single field is rejected before the write even if it slips the HTTP body cap. The
 *  image-KIND arm of the upload route additionally clamps to the admin-tunable `maxImageBytes` (the tighter
 *  of the two wins); non-image kinds keep this route cap. */
export const ASSET_UPLOAD_MAX_BYTES = ASSET_UPLOAD_MIB * BYTES_PER_MIB;

/** A single databank source document (txt/md/pdf/html). The LEAN 20 MB upload cap;
 *  also the store's `maxBytes` belt on the CAS write. */
export const DATABANK_UPLOAD_MAX_BYTES = DATABANK_UPLOAD_MIB * BYTES_PER_MIB;

// ── The import family (a portability bundle / bare card → /api/import + the bundle runner) ─────────────
/** The per-request COMPRESSED archive cap (256 MiB). A larger upload is aborted mid-stream, never fully
 *  staged. Shared by the HTTP import edge, the bundle runner, and the profile-dir per-blob store belt. */
export const IMPORT_MAX_TOTAL_BYTES = IMPORT_TOTAL_MIB * BYTES_PER_MIB;

/** SECURITY FLOOR (not served) — the aggregate DECOMPRESSED cap (10 GiB, disk-staged). Sized so a genuine
 *  full-account all-blobs backup fits while an amplification/zip-bomb archive aborts. Moves with its
 *  rationale: this is a hostile-input belt, never a product limit or a client affordance. */
export const IMPORT_MAX_DECOMPRESSED_BYTES = IMPORT_DECOMPRESSED_MIB * BYTES_PER_MIB;

/** The client-served deployment byte caps — the honest upper bounds the client pre-checks + dropzone hints
 *  derive from (a deployment fact, served on `/api/auth/config`). The image cap is the EFFECTIVE ceiling for
 *  an image upload = `min(assetUpload, maxImageBytes)` resolved server-side, so the client hint matches what
 *  the route will actually accept. */
export interface UploadCaps {
  /** The single-asset route cap for a NON-image kind (documents/plugin bundles POSTed as an asset). */
  readonly assetUpload: number;
  /** The EFFECTIVE image cap = `min(assetUpload, effectiveConfig.maxImageBytes)` — what an image upload
   *  will actually be capped at (the admin-tunable `maxImageBytes` clamps the route cap when tighter). */
  readonly image: number;
  /** A single databank source document. */
  readonly databankUpload: number;
  /** The per-request import bundle / bare-card cap. */
  readonly importTotal: number;
}

/** The client fallback when `/api/auth/config` hasn't landed yet — byte-identical to the server defaults.
 *  `image` falls back to the route cap (the admin override only ever makes it TIGHTER, so this is a safe,
 *  never-too-permissive-in-practice floor for the hint before the served value arrives). */
export const DEFAULT_UPLOAD_CAPS: UploadCaps = {
  assetUpload: ASSET_UPLOAD_MAX_BYTES,
  image: ASSET_UPLOAD_MAX_BYTES,
  databankUpload: DATABANK_UPLOAD_MAX_BYTES,
  importTotal: IMPORT_MAX_TOTAL_BYTES,
};

/** The admin-tunable effective caps the served block clamps against. Each is the effective-config value; the
 *  served cap is the TIGHTER of the fixed route cap and the override — an admin override may only narrow a
 *  route cap, never widen it past the store/route belt (the security ceiling stays fixed). */
export interface EffectiveUploadOverrides {
  /** effectiveConfig.maxImageBytes — clamps the single-asset IMAGE cap. */
  readonly maxImageBytes: number;
  /** effectiveConfig.maxDatabankBytes — clamps the databank document cap (may only TIGHTEN below the route belt). */
  readonly maxDatabankBytes: number;
}

/** Resolve the served caps from the admin-tunable effective overrides. The image cap is the tighter of the
 *  route cap and `maxImageBytes`; the databank cap is the tighter of the route cap and `maxDatabankBytes`;
 *  everything else is the fixed route/runner cap. */
export function resolveUploadCaps(overrides: EffectiveUploadOverrides): UploadCaps {
  return {
    assetUpload: ASSET_UPLOAD_MAX_BYTES,
    image: Math.min(ASSET_UPLOAD_MAX_BYTES, overrides.maxImageBytes),
    databankUpload: Math.min(DATABANK_UPLOAD_MAX_BYTES, overrides.maxDatabankBytes),
    importTotal: IMPORT_MAX_TOTAL_BYTES,
  };
}
