// `isAllowedImageBuffer` — policy guard over the pure byte-facts sniff (`@orb/kit/image-sniff`), applied
// to REMOTE image bytes. Never trusts the remote Content-Type header — magic bytes are the truth (guards
// against a 200-status HTML error page). Adds header-parsed DIMENSION caps beyond `safeFetch`'s byte cap
// (S4: a valid 32000×32000 PNG is a decompression bomb by pixel count, not transfer bytes).

import type { SniffedImage } from "@orb/kit/image-sniff";
import { sniffImageBytes } from "@orb/kit/image-sniff";

const IMAGE_REJECT_REASONS = ["not-image", "mime-not-allowed", "too-large", "dimensions-unknown", "dimensions-exceeded"] as const;
type ImageRejectReason = (typeof IMAGE_REJECT_REASONS)[number];

/** Thrown by {@link isAllowedImageBuffer} on any rejection; carries the typed reason for branching. */
export class ImageRejectedError extends Error {
  readonly reason: ImageRejectReason;
  constructor(reason: ImageRejectReason, message: string) {
    super(message);
    this.name = "ImageRejectedError";
    this.reason = reason;
  }
}

/** Tunable caps + allow-set the guard enforces over the pure sniff; all optional, defaulted below. */
export interface ImageGuardCaps {
  readonly maxBytes: number;
  readonly maxDimension: number;
  readonly maxPixels: number;
  readonly allowedMime?: readonly SniffedImage["mime"][];
  /** Default true (fail-closed): unparseable header dimensions are rejected. */
  readonly requireDimensions?: boolean;
}

const DEFAULT_MAX_BYTES = 10_485_760;
const DEFAULT_MAX_DIMENSION = 8192;
const DEFAULT_MAX_PIXELS = 40_000_000;

/** Validates REMOTE image bytes against the caps/allow-set; enforcement order: not-image → too-large →
 *  mime-not-allowed → dimensions-unknown → dimensions-exceeded. Never trusts remote Content-Type. */
export function isAllowedImageBuffer(bytes: Uint8Array, caps: Partial<ImageGuardCaps> = {}): SniffedImage {
  const maxBytes = caps.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = caps.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxPixels = caps.maxPixels ?? DEFAULT_MAX_PIXELS;
  const requireDimensions = caps.requireDimensions ?? true;

  const sniffed = sniffImageBytes(bytes);
  if (sniffed === null) {
    throw new ImageRejectedError("not-image", "buffer matches no known image signature");
  }
  if (bytes.byteLength > maxBytes) {
    throw new ImageRejectedError("too-large", `image is ${bytes.byteLength} bytes, over the ${maxBytes}-byte cap`);
  }
  if (caps.allowedMime !== undefined && !caps.allowedMime.includes(sniffed.mime)) {
    throw new ImageRejectedError("mime-not-allowed", `mime ${sniffed.mime} is not in the allow-set`);
  }
  if (sniffed.width === null || sniffed.height === null) {
    if (requireDimensions) {
      throw new ImageRejectedError("dimensions-unknown", "image header dimensions are unparseable");
    }
    return sniffed;
  }
  if (sniffed.width > maxDimension || sniffed.height > maxDimension) {
    throw new ImageRejectedError("dimensions-exceeded", `image ${sniffed.width}×${sniffed.height} exceeds the ${maxDimension}px per-axis cap`);
  }
  if (sniffed.width * sniffed.height > maxPixels) {
    throw new ImageRejectedError("dimensions-exceeded", `image ${sniffed.width}×${sniffed.height} exceeds the ${maxPixels}-pixel cap`);
  }
  return sniffed;
}
