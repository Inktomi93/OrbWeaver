// Pixel-only half of Snap contrast. Kept separate because the browser fact resolver is already a
// substantial instrument; this module owns the one honest path from a rendered box to composited RGB.

import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { Viewport } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { ringBackdrop } from "../../_shared/pixel-backdrop.ts";
import type { Rgb } from "../../_shared/wcag.ts";
import type { ContrastBox, ContrastMeasured } from "../contract/contrast.ts";
import { parseRgbString } from "../lib/contrast-verdict.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

async function pixelSampleBackdrop(page: Page, box: ContrastBox, viewport: Viewport): Promise<{ rgb: Rgb } | { error: string }> {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.min(Math.ceil(box.width), viewport.width - x);
  const height = Math.min(Math.ceil(box.height), viewport.height - y);
  if (width < 1 || height < 1) {
    return { error: "element box is empty or fully off-screen" };
  }
  let buffer: Buffer;
  try {
    buffer = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  } catch (error) {
    return { error: `screenshot failed: ${errorMessage(error)}` };
  }
  try {
    const decoded = sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const { data, info } = await Promise.resolve(decoded);
    return { rgb: ringBackdrop(data, info.width, info.height, info.channels) };
  } catch (error) {
    return { error: `pixel decode failed: ${errorMessage(error)}` };
  }
}

export async function resolveContrastBackdrop(
  page: Page,
  facts: ContrastMeasured,
  forcePixel: boolean,
  viewport: Viewport,
): Promise<{ rgb: Rgb; method: "css-resolve" | "pixel-sample" } | { error: string }> {
  if (!forcePixel && facts.backdrop.kind === "flat") {
    const rgb = parseRgbString(facts.backdrop.color);
    return rgb === null ? { error: `unparseable backdrop (${facts.backdrop.color})` } : { rgb, method: "css-resolve" };
  }
  const sampled = await pixelSampleBackdrop(page, facts.box, viewport);
  if ("error" in sampled) {
    const why = facts.backdrop.kind === "indeterminate" ? "over background-image" : "transparent ancestor chain";
    return { error: `UNRESOLVED  ${why}; pixel sample failed (${sampled.error}) — refusing a fabricated flat baseline` };
  }
  return { rgb: sampled.rgb, method: "pixel-sample" };
}
