// infra/network/image-guard — `isAllowedImageBuffer`: the POLICY guard over the pure byte-facts sniff
// (`@orb/kit/image-sniff`) applied to REMOTE image bytes (hub-browse-design/01 §3 · gallery-design §6 · G6).
// It is deliberately NOT in `@orb/kit`: the caps + allow-set are tunable, security-load-bearing POLICY and
// policy doesn't live in kit — kit gets only the pure byte-facts (`sniffImageBytes`). This is an egress
// concern, co-located with its one caller class (the `FetchImageOp` = `safeFetch` + this guard, bound in
// `entry/` with a consumer's host allowlist for gif import / avatar-by-URL / D44 server-side media).
//
// The remote `Content-Type` header is NEVER consulted — the magic bytes are the truth (the classic failure
// this guards: an HTML error page served with `200 image/png`). Beyond the byte cap `safeFetch` already
// enforces on transfer, this adds the S4 defense marinara lacked: header-parsed DIMENSION caps (a valid
// 32000×32000 PNG is a decompression bomb by pixel count, not transfer bytes, and would land in sharp).

import type { SniffedImage } from "@orb/kit/image-sniff";
import { sniffImageBytes } from "@orb/kit/image-sniff";

/** The rejection reasons — declared as a tuple (§5.5 string-union dispatch discipline: an inline 5-member
 *  union is a `no-inline-union-redecl` violation) and derived below. File-local: the `no-inline-types` gate
 *  reserves `export type` for contract homes, and consumers branch on `err.reason` (a string) or reference
 *  the exported class's field type (`ImageRejectedError["reason"]`). */
const IMAGE_REJECT_REASONS = [
  "not-image",
  "mime-not-allowed",
  "too-large",
  "dimensions-unknown",
  "dimensions-exceeded",
] as const;
type ImageRejectReason = (typeof IMAGE_REJECT_REASONS)[number];

/** Thrown by {@link isAllowedImageBuffer} on any rejection. A plain `Error` subclass (an infra I/O-boundary
 *  failure, not a `DomainError`), carrying the typed {@link ImageRejectReason} for the caller to branch on. */
export class ImageRejectedError extends Error {
  readonly reason: ImageRejectReason;
  constructor(reason: ImageRejectReason, message: string) {
    super(message);
    this.name = "ImageRejectedError";
    this.reason = reason;
  }
}

/** The tunable caps + allow-set the guard enforces over the pure sniff. All optional at the call site —
 *  every field defaults (below); a consumer overrides only what it needs (e.g. a stricter `allowedMime`). */
export interface ImageGuardCaps {
  /** Hard cap on the buffer's byte length. Default 10 MiB (marinara's avatar cap, adopted). */
  readonly maxBytes: number;
  /** Max pixels per axis (width AND height). Default 8192 — the S4 dimension-bomb defense. */
  readonly maxDimension: number;
  /** Max total pixel count (width × height). Default 40_000_000 (≈ 8192 × 4884). */
  readonly maxPixels: number;
  /** If set, the sniffed mime must be a member. Default: all five sniffable formats. */
  readonly allowedMime?: readonly SniffedImage["mime"][];
  /** When true (the default — fail-closed), an image whose header dimensions are unparseable is rejected. */
  readonly requireDimensions?: boolean;
}

// A true 10 MiB (10 × 1024 × 1024), the marinara avatar cap. Named directly to stay noMagicNumbers-clean.
const DEFAULT_MAX_BYTES = 10_485_760;
const DEFAULT_MAX_DIMENSION = 8192;
const DEFAULT_MAX_PIXELS = 40_000_000;

/**
 * Validate REMOTE image bytes against the caps/allow-set, returning the pure {@link SniffedImage} on a pass
 * or throwing {@link ImageRejectedError} (typed reason) on any rejection. The enforcement order:
 *
 *   1. `not-image` — no known signature (PNG/JPEG/GIF/WebP/AVIF); catches the 200-status HTML error page.
 *   2. `too-large` — over the byte cap (defense-in-depth over `safeFetch`'s transfer cap).
 *   3. `mime-not-allowed` — a recognized format outside the caller's `allowedMime` set.
 *   4. `dimensions-unknown` — header dims unparseable AND `requireDimensions` (default true).
 *   5. `dimensions-exceeded` — width/height over `maxDimension`, or width×height over `maxPixels` (S4).
 *
 * Never trusts the remote `Content-Type` — the bytes are the truth.
 */
export function isAllowedImageBuffer(
  bytes: Uint8Array,
  caps: Partial<ImageGuardCaps> = {},
): SniffedImage {
  const maxBytes = caps.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = caps.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxPixels = caps.maxPixels ?? DEFAULT_MAX_PIXELS;
  const requireDimensions = caps.requireDimensions ?? true;

  const sniffed = sniffImageBytes(bytes);
  if (sniffed === null) {
    throw new ImageRejectedError("not-image", "buffer matches no known image signature");
  }
  if (bytes.byteLength > maxBytes) {
    throw new ImageRejectedError(
      "too-large",
      `image is ${bytes.byteLength} bytes, over the ${maxBytes}-byte cap`,
    );
  }
  if (caps.allowedMime !== undefined && !caps.allowedMime.includes(sniffed.mime)) {
    throw new ImageRejectedError(
      "mime-not-allowed",
      `mime ${sniffed.mime} is not in the allow-set`,
    );
  }
  if (sniffed.width === null || sniffed.height === null) {
    if (requireDimensions) {
      throw new ImageRejectedError("dimensions-unknown", "image header dimensions are unparseable");
    }
    return sniffed;
  }
  if (sniffed.width > maxDimension || sniffed.height > maxDimension) {
    throw new ImageRejectedError(
      "dimensions-exceeded",
      `image ${sniffed.width}×${sniffed.height} exceeds the ${maxDimension}px per-axis cap`,
    );
  }
  if (sniffed.width * sniffed.height > maxPixels) {
    throw new ImageRejectedError(
      "dimensions-exceeded",
      `image ${sniffed.width}×${sniffed.height} exceeds the ${maxPixels}-pixel cap`,
    );
  }
  return sniffed;
}
