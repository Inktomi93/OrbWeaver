// Pixel-sampled backdrops (issue #218).
//
// THE WALKER CANNOT SEE WHAT IS NOT AN ANCESTOR. Its resolveBackdrop says "unresolved" instead of
// fabricating one (a 0.65-alpha reading plate resolved against the near-black BODY base — past the fixed
// wallpaper photo painting over it — and reported 3.16:1 on 28 transcript nodes where the real composite
// is 4.94:1). Only PIXELS can answer that, so the runner settles each unresolved sample here, from ONE
// viewport screenshot taken at the same scroll position the samples were read at: a per-element clip shot
// (snap's shape, for its single target) would be one screenshot per text node.
//
// `scale: "css"` keeps image pixels 1:1 with CSS pixels under --mobile's DPR3, so a walker box indexes the
// buffer directly. An element whose box is off-screen, or a shot/decode that fails, gets NO VERDICT — the
// refusal is printed and written to the report, never a fabricated color (the #211 posture).
//
// OFF-SCREEN SAMPLES OVER A PAINT LAYER (#1730). A wallpapered room's transcript can have ~22 text nodes
// whose backdrop resolves as `unresolved(paint-layer-over-base)`. The pixel sampler settles the in-viewport
// ones to `flat`, but off-screen or occluded texts remain `unresolved`, which the population accounting
// tallies as `withheld` — and too many withheld samples make the run NO VERDICT over a surface that is
// perfectly measurable in the viewport. The honest reclassification: a text whose walker PROVED a paint
// layer (an art element that is no ancestor of the text) sits between it and the resolved base IS text over art;
// the sampler merely cannot resolve the exact composite. `image-indeterminate` is exactly that semantic:
// "there is a background-image layer here, contrast is indeterminate" — the `text-over-art` rule emits
// a P1, which is JUDGED rather than withheld, so the population can produce a verdict. Only
// `paint-layer-over-base` earns this: `no-opaque-base` carries no evidence of an image layer and stays
// `unresolved` (withheld).
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { Backdrop } from "../contract/backdrop.ts";
import type { ContrastInput, RawSamples } from "../contract/samples.ts";
import type { HoverForcedReadRow } from "../contract/samples-hover.ts";
import type { BorderContrastInput } from "../contract/samples-interactive.ts";
import type { BackdropRefusal, PixelPass } from "../contract/types.ts";
import type { PixelRaw } from "../lib/pixel-regions.ts";
import { OFF_SCREEN_REFUSAL, surroundBackdropRing, textBackdropRing } from "../lib/pixel-regions.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

function isUnresolved(text: ContrastInput): boolean {
  return text.backdrop.kind === "unresolved";
}

/** The reclassified backdrop for an unsampleable text over a proven paint layer (#1730). A typed constant
 *  rather than an inline literal so the spread preserves the discriminated-union narrowing. */
const IMAGE_INDETERMINATE_BACKDROP: Backdrop & { readonly kind: "image-indeterminate" } = { kind: "image-indeterminate" } as const;

/** When the pixel sampler cannot resolve an `unresolved(paint-layer-over-base)` sample (off-screen,
 *  occluded, or no box), reclassify it to `image-indeterminate` so the population counts it as JUDGED
 *  rather than WITHHELD (#1730). Returns the original text unchanged for other unresolved reasons. */
function reclassifyUnsampleable(text: ContrastInput): ContrastInput {
  if (text.backdrop.kind === "unresolved" && text.backdrop.reason === "paint-layer-over-base") {
    return { ...text, backdrop: IMAGE_INDETERMINATE_BACKDROP };
  }
  return text;
}

/** ONE viewport screenshot decoded to raw pixels, or the reason there are none. */
async function viewportPixels(page: Page): Promise<(PixelRaw & { data: Buffer }) | { error: string }> {
  try {
    const shot: Buffer = await page.screenshot({ animations: "disabled", scale: "css" });
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    return { data, info };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Resolve ONE unresolved text sample against the viewport screenshot. Returns the settled sample (with a
 *  `flat` backdrop from pixel data, or reclassified to `image-indeterminate` for paint-layer samples the
 *  sampler cannot reach), plus any refusal and whether a pixel sample was taken. Extracted from the map
 *  body so `resolvePixelBackdrops` stays under the cognitive-complexity ceiling. */
function settleOneSample(text: ContrastInput, raw: PixelRaw, refusals: BackdropRefusal[]): { text: ContrastInput; sampled: boolean } {
  // Painted over: sampling the box would measure the OCCLUDER's pixels, which is how the first run of
  // this path reported 1.33:1 on a paragraph under the topbar (snap refuses the same case as OCCLUDED).
  if (text.occludedBy !== undefined && text.occludedBy !== null) {
    refusals.push({ selector: text.selector, reason: `painted over by ${text.occludedBy}` });
    return { text: reclassifyUnsampleable(text), sampled: false };
  }
  if (text.box === undefined) {
    refusals.push({ selector: text.selector, reason: "walker sample carries no box" });
    return { text: reclassifyUnsampleable(text), sampled: false };
  }
  const read = textBackdropRing(raw, text.box, text.inkBox);
  if ("refusal" in read) {
    refusals.push({ selector: text.selector, reason: read.refusal });
    // A ring that is not one backdrop stays UNRESOLVED: calling it art would turn a measurement we could
    // not take into a finding. Only a box the screenshot cannot see is reclassified.
    return { text: read.refusal === OFF_SCREEN_REFUSAL ? reclassifyUnsampleable(text) : text, sampled: false };
  }
  return {
    text: { ...text, backdrop: { kind: "flat", color: read.color }, backdropMethod: "pixel-sample" } satisfies ContrastInput,
    sampled: true,
  };
}

/** A control's border is judged against the surface outside it; settle an unresolved one from the band
 *  just beyond its box. */
function settleOneBorder(input: BorderContrastInput, raw: PixelRaw, refusals: BackdropRefusal[]): { input: BorderContrastInput; sampled: boolean } {
  if (input.box === undefined) {
    refusals.push({ selector: input.selector, reason: "border sample carries no box" });
    return { input, sampled: false };
  }
  const read = surroundBackdropRing(raw, input.box);
  if ("refusal" in read) {
    refusals.push({ selector: input.selector, reason: read.refusal });
    return { input, sampled: false };
  }
  return { input: { ...input, surround: { kind: "flat", color: read.color } }, sampled: true };
}

/** Settle forced-`:hover` reads whose backdrop the DOM walk could not resolve, from a screenshot taken
 *  WHILE the subject is held. A ring that is not uniform stays unresolved and the rule withholds it. */
export async function settleHeldBackdrops(page: Page, reads: readonly HoverForcedReadRow[]): Promise<readonly HoverForcedReadRow[]> {
  if (!reads.some((read) => read.backdrop.kind === "unresolved" && read.box !== undefined)) {
    return reads;
  }
  const raw = await viewportPixels(page);
  if ("error" in raw) {
    return reads;
  }
  return reads.map((read) => {
    if (read.backdrop.kind !== "unresolved" || read.box === undefined) {
      return read;
    }
    const ring = textBackdropRing(raw, read.box);
    return "refusal" in ring ? read : { ...read, backdrop: { kind: "flat", color: ring.color } };
  });
}

export async function resolvePixelBackdrops(page: Page, samples: RawSamples): Promise<PixelPass> {
  const pendingTexts = samples.texts.filter(isUnresolved);
  const pendingBorders = (samples.borderContrasts ?? []).filter((input) => input.surround.kind === "unresolved");
  if (pendingTexts.length === 0 && pendingBorders.length === 0) {
    return { samples, sampled: 0, refusals: [] };
  }
  const raw = await viewportPixels(page);
  if ("error" in raw) {
    // No pixels at all: every pending sample is a refusal, and the report says why once.
    return {
      samples,
      sampled: 0,
      refusals: [...pendingTexts, ...pendingBorders].map((t) => ({ selector: t.selector, reason: `pixel sample unavailable (${raw.error})` })),
    };
  }
  const refusals: BackdropRefusal[] = [];
  let sampled = 0;
  const texts = samples.texts.map((text) => {
    if (!isUnresolved(text)) {
      return text;
    }
    const settled = settleOneSample(text, raw, refusals);
    if (settled.sampled) {
      sampled += 1;
    }
    return settled.text;
  });
  const borderContrasts = samples.borderContrasts?.map((input) => {
    if (input.surround.kind !== "unresolved") {
      return input;
    }
    const settled = settleOneBorder(input, raw, refusals);
    if (settled.sampled) {
      sampled += 1;
    }
    return settled.input;
  });
  return { samples: { ...samples, texts, ...(borderContrasts === undefined ? {} : { borderContrasts }) }, sampled, refusals };
}
