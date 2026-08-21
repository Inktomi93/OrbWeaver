// Distorted/stretched + broken images. Pure; thresholds cited. Provenance: lib/collect.ts header.
import type { Finding } from "../contract/findings.ts";
import type { BrokenImageInput, ImageDistortionInput } from "../contract/samples.ts";

// ── Distorted / stretched image ─────────────────────────────────────────────
const DISTORTION_THRESHOLD_PCT = 3;

const DISTORTION_SEVERE_PCT = 15;

const PCT_MULTIPLIER = 100;

const NON_STRETCHING_OBJECT_FITS = new Set(["cover", "contain"]);

export function checkImageDistortion(input: ImageDistortionInput): Finding | null {
  const { naturalWidth, naturalHeight, renderedWidth, renderedHeight, selector, objectFit } = input;
  if (naturalWidth <= 0 || naturalHeight <= 0 || renderedWidth <= 0 || renderedHeight <= 0) {
    return null;
  }
  if (NON_STRETCHING_OBJECT_FITS.has(objectFit)) {
    return null;
  }
  const naturalRatio = naturalWidth / naturalHeight;
  const renderedRatio = renderedWidth / renderedHeight;
  const deviationPct = (Math.abs(renderedRatio - naturalRatio) / naturalRatio) * PCT_MULTIPLIER;
  if (deviationPct <= DISTORTION_THRESHOLD_PCT) {
    return null;
  }
  return {
    rule: "distorted-image",
    severity: deviationPct >= DISTORTION_SEVERE_PCT ? "P1" : "P2",
    selector,
    value: `${deviationPct.toFixed(1)}% aspect deviation (natural ${naturalRatio.toFixed(2)}, rendered ${renderedRatio.toFixed(2)})`,
    message: "image is squished/stretched — rendered aspect ratio doesn't match its source; use object-fit or fix explicit width/height",
    origin: "orbweaver",
  };
}

export function checkBrokenImage(input: BrokenImageInput): Finding {
  return {
    rule: "broken-image",
    severity: "P1",
    selector: input.selector,
    value: input.reason,
    message:
      input.reason === "empty-src"
        ? "<img> has an empty/missing src — ships as a broken-image box; use a real asset or remove the tag"
        : "<img> failed to load (naturalWidth 0) — a broken-image box is rendering; fix the source or the fallback",
    origin: "impeccable",
  };
}
