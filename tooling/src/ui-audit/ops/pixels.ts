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
import { errorMessage } from "@orb/kit/error-message";
import { clampBoxToImage, ringBackdropOfRegion } from "@orb/tooling/_shared/pixel-backdrop";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { ContrastInput, RawSamples } from "../contract/samples.ts";
import type { BackdropRefusal, PixelPass } from "../contract/types.ts";

function isUnresolved(text: ContrastInput): boolean {
  return text.backdrop.kind === "unresolved";
}

/** ONE viewport screenshot decoded to raw pixels, or the reason there are none. */
async function viewportPixels(page: Page): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } } | { error: string }> {
  try {
    const shot: Buffer = await page.screenshot({ animations: "disabled", scale: "css" });
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    return { data, info };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function resolvePixelBackdrops(page: Page, samples: RawSamples): Promise<PixelPass> {
  const pending = samples.texts.filter(isUnresolved);
  if (pending.length === 0) {
    return { samples, sampled: 0, refusals: [] };
  }
  const raw = await viewportPixels(page);
  if ("error" in raw) {
    // No pixels at all: every pending sample is a refusal, and the report says why once.
    return {
      samples,
      sampled: 0,
      refusals: pending.map((t) => ({ selector: t.selector, reason: `pixel sample unavailable (${raw.error})` })),
    };
  }
  const refusals: BackdropRefusal[] = [];
  let sampled = 0;
  const texts = samples.texts.map((text) => {
    if (!isUnresolved(text)) {
      return text;
    }
    // Painted over: sampling the box would measure the OCCLUDER's pixels, which is how the first run of
    // this path reported 1.33:1 on a paragraph under the topbar (snap refuses the same case as OCCLUDED).
    if (text.occludedBy !== undefined && text.occludedBy !== null) {
      refusals.push({ selector: text.selector, reason: `painted over by ${text.occludedBy}` });
      return text;
    }
    const region = text.box === undefined ? null : clampBoxToImage(text.box, raw.info.width, raw.info.height);
    if (region === null) {
      refusals.push({ selector: text.selector, reason: text.box === undefined ? "walker sample carries no box" : "box is off-screen" });
      return text;
    }
    sampled += 1;
    return {
      ...text,
      backdrop: { kind: "flat", color: ringBackdropOfRegion(raw.data, raw.info.width, raw.info.channels, region) },
      backdropMethod: "pixel-sample",
    } satisfies ContrastInput;
  });
  return { samples: { ...samples, texts }, sampled, refusals };
}
