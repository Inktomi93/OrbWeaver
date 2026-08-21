// Artifact NAMING: the -p/-u/variant suffix contracts, the crop/png/url regex family, and the
// produce-a-shot decision. Pure.

import { extname } from "node:path";
import type { PagePlan } from "../contract/plan.ts";
import type { Args } from "../contract/types.ts";

export const CROP_RE = /^(?<w>\d+)x(?<h>\d+)(?:\+(?<x>\d+)\+(?<y>\d+))?$/u;
export const PNG_EXT_RE = /\.png$/u;
export const SSIM_ALL_RE = /All:(?<all>[\d.]+)/u;
export const HTTP_URL_RE = /^https?:\/\//u;

// The shot path for a page: `<out>.png` on page 0 / single-page (byte-identical), `<out>-p<idx>.png` on
// a --pages tab so N tabs never clobber one file.
export function pageOut(out: string, pageIndex: number, totalPages: number): string {
  return totalPages > 1 ? out.replace(PNG_EXT_RE, `-p${pageIndex}.png`) : out;
}

// `--contexts` mirrors pageOut's suffix idiom with its OWN letter ("-u<idx>", user) so a run combining
// reports never collides with a --pages "-p<idx>" file — the two modes are mutually exclusive (refused
// together), but the naming stays self-documenting regardless.
export function contextOut(out: string, contextIndex: number, totalContexts: number): string {
  return totalContexts > 1 ? out.replace(PNG_EXT_RE, `-u${contextIndex}.png`) : out;
}

// Extracted (not inlined) purely to keep `capture`'s cognitive-complexity count under the gate — the
// suffix decision itself is trivial.
export function planOut(plan: PagePlan, pageIndex: number, totalPages: number): string {
  return plan.unit === "u" ? contextOut(plan.out, pageIndex, totalPages) : pageOut(plan.out, pageIndex, totalPages);
}

/** One matrix variant's `--out`, with the suffix INSIDE any extension the base carries: a path-shaped
 *  `--out /tmp/home.png` must produce /tmp/home-desktop-dark-motion.png, not …png-desktop-dark-motion.png.
 *  A bare base has no extension and is suffixed exactly as before. */
export function variantOut(baseName: string, variantId: string): string {
  const ext = extname(baseName);
  const stem = ext === "" ? baseName : baseName.slice(0, -ext.length);
  return `${stem}-${variantId}${ext}`;
}

export function shouldProduceShot(opts: Args): boolean {
  return opts.shotOf !== null || opts.shot || opts.baseline || opts.diff;
}
