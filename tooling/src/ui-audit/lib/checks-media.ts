// Distorted/stretched + broken images, and buried rasters. Pure; thresholds cited. Provenance:
// lib/collect.ts header.
import type { Finding, RulePopulationAccounting } from "../contract/findings.ts";
import type { BrokenImageInput, ImageDistortionInput } from "../contract/samples.ts";
import type { BuriedRasterInput } from "../contract/samples-media.ts";
import { settledPopulationAccounting } from "./population.ts";

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

// ── Buried raster ────────────────────────────────────────────────────────────
// Owner ruling: this detector is not built to fire on today's tree — a clean run IS the pass, and the
// threshold is never loosened to manufacture a finding.
const BURIED_OPACITY_THRESHOLD = 0.15;

const BURIED_OPACITY_DECIMALS = 3;

export function checkBuriedRaster(input: BuriedRasterInput): Finding | null {
  if (input.effectiveOpacity >= BURIED_OPACITY_THRESHOLD) {
    return null;
  }
  return {
    rule: "buried-raster",
    severity: "P1",
    selector: input.selector,
    value: `effective opacity ${input.effectiveOpacity.toFixed(BURIED_OPACITY_DECIMALS)} (${input.kind === "img" ? "<img>" : "background-image"})`,
    message:
      input.kind === "img"
        ? "an <img> paints at effective opacity below 0.15 — the raster ships but never reaches the screen, and the page shows flat colour where the material should be"
        : "an element's background-image paints at effective opacity below 0.15 — the raster ships but never reaches the screen, and the page shows flat colour where the material should be",
    origin: "impeccable",
  };
}

/** Bespoke accounting (the `duplicate-action-door` precedent in collect.ts — not one of the four
 *  population-strategies.ts rungs): the candidate population is walker-gathered raster carriers
 *  already display/visibility/geometry-filtered (the same scope decision the `images`/`bgCandidates`
 *  census makes for every other media rule), so there is no upstream census contract to join against.
 *
 *  A candidate whose own `transition-property` covers `opacity` is EXCLUDED rather than judged — it may
 *  be mid-entrance (a reveal driven by a later class/data-attribute flip) and a static snapshot cannot
 *  tell "will never reveal" from "hasn't revealed yet", so the rule withholds judgment rather than
 *  guessing (per design ruling: withhold rather than false-positive an entering element). `withheld` is
 *  never populated for this rule — `effectiveOpacity` is a walker-normalized real number by
 *  construction (samples-media.ts), never unresolved. */
export function checkBuriedRasterPopulations(inputs: readonly BuriedRasterInput[]): {
  readonly accounting: RulePopulationAccounting;
  readonly findings: readonly Finding[];
} {
  const findings: Finding[] = [];
  let judged = 0;
  let excludedTransitioning = 0;
  for (const input of inputs) {
    if (input.opacityTransitions && input.effectiveOpacity < BURIED_OPACITY_THRESHOLD) {
      excludedTransitioning += 1;
      continue;
    }
    judged += 1;
    const finding = checkBuriedRaster(input);
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return {
    findings,
    accounting: settledPopulationAccounting("buried-raster", {
      candidates: inputs.length,
      judged,
      affected: findings.length,
      populations: findings.length,
      emitted: findings.length,
      withheld: {},
      excluded: excludedTransitioning > 0 ? { "opacity-transition": excludedTransitioning } : {},
      collapsed: {},
    }),
  };
}
