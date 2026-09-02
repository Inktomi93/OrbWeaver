// The `--scale` contract: the ONE place that decides how many IMAGE pixels one CSS pixel becomes, the
// pixel budget that refuses a run before it writes an unreadable PNG, and the dimensions the RESULT line
// states. PURE — no browser, no fs — so the budget arithmetic is unit-testable in node.
//
// WHY THE DEFAULT IS `css` AND MUST STAY (#915, owner-ruled 2026-08-30): ops/shot.ts's SHOT_BASE pins
// `scale:"css"` = one image pixel per CSS pixel, which on a hi-dpi context HALVES the pixel count versus
// Playwright's `device` default and therefore roughly halves the image TOKENS an agent pays to read it.
// That is correct for the case snap was minted for (an agent is the reader). `--scale` is the escape
// hatch for the one case where a HUMAN is the reader: committed design-mock renders, a durable visual
// record that was previously produced at 2x by the Claude Design canvas export. Do not "fix" the default.
import type { Viewport } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ShotScale } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Today's default, byte-identical to every pre-#915 invocation. */
export const CSS_SHOT_SCALE: ShotScale = { mode: "css", deviceScaleFactor: null };

/** Playwright's own `device` arm: whatever DPR the CONTEXT carries (1 on desktop, 3 under `--mobile`,
 *  whose descriptor supplies it). No override, so it composes with a device descriptor. */
const DEVICE_SHOT_SCALE: ShotScale = { mode: "device", deviceScaleFactor: null };

/** A numeric `--scale n` raises the CONTEXT's deviceScaleFactor to n and shoots with Playwright's
 *  `device` arm — `page.screenshot({ scale })` itself accepts ONLY "css" | "device", so n is unreachable
 *  any other way. */
function factorShotScale(factor: number): ShotScale {
  return { mode: "device", deviceScaleFactor: factor };
}

/** The refusal ceiling on the PNG a run may produce, in image pixels. Anchored on the case the flag
 *  exists for: the largest committed mock board is a 1920x1080 desktop render, which at the intended 2x
 *  is 8.3 MP. Twice that is the ceiling — past it the PNG is a cost nobody asked for, which is exactly
 *  the silent outcome #915 refuses ("refuse loudly rather than silently producing a huge PNG"). */
export const SHOT_PIXEL_BUDGET = 16_000_000;

const MIN_SHOT_SCALE_FACTOR = 1;
const SCALE_FACTOR_RE = /^\d+(?:\.\d+)?$/u;

/** argv value → ShotScale, or null when the value is not one of the three spellings. */
export function parseShotScale(raw: string): ShotScale | null {
  if (raw === "css") {
    return CSS_SHOT_SCALE;
  }
  if (raw === "device") {
    return DEVICE_SHOT_SCALE;
  }
  if (!SCALE_FACTOR_RE.test(raw)) {
    return null;
  }
  const factor = Number(raw);
  return Number.isFinite(factor) && factor >= MIN_SHOT_SCALE_FACTOR ? factorShotScale(factor) : null;
}

/** The image dimensions a shot of `viewport` will produce under `scale`, given the CONTEXT's own DPR
 *  (1 for a plain desktop context, the descriptor's value under `--mobile`). This is what the RESULT line
 *  states, so a run always says what it actually produced. */
export function shotScaleDimensions(scale: ShotScale, viewport: Viewport, contextDeviceScaleFactor: number): Viewport {
  const factor = scale.mode === "css" ? 1 : (scale.deviceScaleFactor ?? contextDeviceScaleFactor);
  return { width: Math.round(viewport.width * factor), height: Math.round(viewport.height * factor) };
}

/** The RESULT-line value. `css` stays a bare word so an existing run's line reads as it always did. */
export function shotScaleResultValue(scale: ShotScale, viewport: Viewport, contextDeviceScaleFactor: number): string {
  const { width, height } = shotScaleDimensions(scale, viewport, contextDeviceScaleFactor);
  const label = scale.deviceScaleFactor === null ? scale.mode : String(scale.deviceScaleFactor);
  return `${label}/${width}x${height}`;
}

/** The budget refusal, or null when the ask is affordable. Stated in the same shape as every other snap
 *  parse refusal: what was asked, what it would produce, and the limit — never a silent downscale. */
export function shotScaleBudgetRefusal(scale: ShotScale, viewport: Viewport): string | null {
  const dimensions = shotScaleDimensions(scale, viewport, 1);
  const pixels = dimensions.width * dimensions.height;
  if (pixels <= SHOT_PIXEL_BUDGET) {
    return null;
  }
  return (
    `--scale ${scale.deviceScaleFactor ?? scale.mode} at ${viewport.width}x${viewport.height} would produce ` +
    `${dimensions.width}x${dimensions.height} (${pixels} px), past the ${SHOT_PIXEL_BUDGET}px image budget — ` +
    "lower the scale, or narrow --viewport."
  );
}
