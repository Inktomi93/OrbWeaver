// Distorted/stretched + broken images, and buried rasters. Pure; thresholds cited. Provenance:
// lib/collect.ts header.
//
// WHAT `distorted-image` ACTUALLY JUDGES, stated narrowly (#1808, closed #1825). It judges the `<img>`
// census via `objectFit` (the element's real computed keyword) AND the background-image half via
// `backgroundSizeMode` (the real `background-size` disposition `ops/walker/census-text.ts` samples
// alongside the "fill" placeholder) — "auto" is excluded exactly like `object-fit: none` (natural size,
// cannot squish); anything else falls through to the same "fill" math the `<img>` arm already runs.
import type { CandidateDisposition, Finding, RulePopulationAccounting } from "../contract/findings.ts";
import type { BrokenImageInput } from "../contract/samples.ts";
import type { BuriedRasterInput, ImageDistortionInput } from "../contract/samples-media.ts";
import { settledPopulationAccounting } from "./population.ts";

// ── Distorted / stretched image ─────────────────────────────────────────────
const DISTORTION_THRESHOLD_PCT = 3;

const DISTORTION_SEVERE_PCT = 15;

const PCT_MULTIPLIER = 100;

/** THE `object-fit` KEYWORD SPACE, closed (CSS Images 3 §5.5). A value outside it is not a mode this
 *  rule can reason about — it is a measurement that did not arrive, and the walker's own
 *  `getComputedStyle(img).objectFit || "fill"` fallback (ops/walker/census-text.ts) is exactly how an
 *  empty read used to enter here wearing the ONE keyword that convicts. */
const OBJECT_FIT_KEYWORDS = new Set(["fill", "contain", "cover", "none", "scale-down"]);

/** Crops or letterboxes: the box/source aspect mismatch is the mode DOING ITS JOB. */
const CROPPING_OBJECT_FITS = new Set(["cover", "contain"]);

/** SCALES NOTHING INDEPENDENTLY, so it cannot squish (#1808, from #1504 claim 3). `none` paints the
 *  raster at its natural size and `scale-down` picks the smaller of `none`/`contain` — measured: a 3:1
 *  source in a 1:1 box under `object-fit: none` emitted `P1 66.7% aspect deviation` describing a crop.
 *  A SEPARATE reason from the cropping pair on purpose: "the mode letterboxes" and "the mode never
 *  scales" are different measured facts, and one printed count each is what keeps a widening of either
 *  set visible. Only `fill` stretches, which is what `contract/samples.ts` always claimed. */
const NON_SCALING_OBJECT_FITS = new Set(["none", "scale-down"]);

/** Every extent this rule divides by. `<= 0` is a RANGE test and NaN fails every comparison, so a
 *  non-finite extent used to sail through it and print `NaN% aspect deviation` as a P2 finding. */
function extentsAreReadable(input: ImageDistortionInput): boolean {
  return (
    Number.isFinite(input.naturalWidth) && Number.isFinite(input.naturalHeight) && Number.isFinite(input.renderedWidth) && Number.isFinite(input.renderedHeight)
  );
}

/** `distorted-image`'s disposition, and the ONE place its input is bounded. The census is every rendered
 *  image, so the declines that are not the aspect question itself are closed exclusions: an image with no
 *  natural or rendered extent has no aspect to compare and is `broken-image`'s subject; `cover`/`contain`
 *  crop or letterbox by design; `none`/`scale-down` scale nothing at all. The deviation threshold stays a
 *  judged pass.
 *
 *  THE TWO REFUSALS ARE `withheld`, NOT `excluded` (#1808). An unreadable extent and an unrecognised
 *  `object-fit` are not measured facts proving the rule inapplicable — they are the measurement MISSING,
 *  which the population contract (contract/findings.ts) makes NO VERDICT. Silently skipping either was
 *  the alternative, and a silent skip is indistinguishable from a clean image. */
export function classifyImageDistortion(input: ImageDistortionInput): CandidateDisposition {
  if (!extentsAreReadable(input)) {
    return { kind: "withheld", reason: "unreadableExtent" };
  }
  if (!OBJECT_FIT_KEYWORDS.has(input.objectFit)) {
    return { kind: "withheld", reason: "unreadableObjectFit" };
  }
  if (input.naturalWidth <= 0 || input.naturalHeight <= 0 || input.renderedWidth <= 0 || input.renderedHeight <= 0) {
    return { kind: "excluded", reason: "noComparableExtent" };
  }
  if (CROPPING_OBJECT_FITS.has(input.objectFit)) {
    return { kind: "excluded", reason: "objectFitCropsOrLetterboxes" };
  }
  if (NON_SCALING_OBJECT_FITS.has(input.objectFit) || input.backgroundSizeMode === "auto") {
    return { kind: "excluded", reason: "objectFitDoesNotScale" };
  }
  return { kind: "judged", finding: checkImageDistortion(input) };
}

/** The judged verdict alone. It answers `null` for every input the classifier above declines — the LOUD
 *  refusal is the classifier's, because only a disposition can reach the population row; a bare check
 *  cannot say "I could not read this" in its return type and must not guess instead. */
export function checkImageDistortion(input: ImageDistortionInput): Finding | null {
  const { naturalWidth, naturalHeight, renderedWidth, renderedHeight, selector, objectFit } = input;
  if (!extentsAreReadable(input)) {
    return null;
  }
  if (!OBJECT_FIT_KEYWORDS.has(objectFit)) {
    return null;
  }
  if (naturalWidth <= 0 || naturalHeight <= 0 || renderedWidth <= 0 || renderedHeight <= 0) {
    return null;
  }
  if (CROPPING_OBJECT_FITS.has(objectFit) || NON_SCALING_OBJECT_FITS.has(objectFit) || input.backgroundSizeMode === "auto") {
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
