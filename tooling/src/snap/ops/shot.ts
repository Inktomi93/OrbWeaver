// Screenshot capture: paint-settle (#123 — two identical frames before the PNG), native stabilization
// (SHOT_BASE), element shots, volatile-region masks, and the native crop.
import type { Locator, Page } from "@playwright/test";
import type { Args } from "../contract/types.ts";
import { CROP_RE, PNG_EXT_RE } from "../lib/out-names.ts";

// Native screenshot stabilization, applied to EVERY shot (page + element):
//   animations:"disabled" — rewinds CSS animations/transitions to a consistent
//     finished state (correct way; supersedes probe-mode's injected killer CSS).
//   caret:"hide"          — no blinking text caret (also Playwright's default).
//   scale:"css"           — one image pixel per CSS pixel; on a hi-dpi context
//     this HALVES pixel count vs the "device" default → ~half the image tokens.
export const SHOT_BASE = { animations: "disabled", caret: "hide", scale: "css" } as const;

// ── Screenshot capture ──────────────────────────────────────────────────────
// One place that decides element-shot vs page-shot, applies native stabilization
// (SHOT_BASE), masks volatile regions, and does the native crop.

/** PAINT-SETTLE (#123). `settlePage` waits a fixed window, and the evidence phase (aria/eval/contrast/
 *  assertions) then runs for however long IT takes before the PNG is taken — so the primary capture can
 *  land on a frame that a late repaint has not reached yet: an image that finished decoding, a webfont
 *  swap, a virtualized list that re-measures after its first read. The artifact then shows a layout the
 *  run's own text evidence already disagrees with.
 *
 *  Hold until two CONSECUTIVE animation frames report the same document geometry, then shoot. Bounded
 *  twice over — a frame budget and a per-frame timeout — because a surface that never goes quiet (a
 *  streaming turn, a looping animation) must never block the shot: on a live surface this simply spends
 *  its budget and captures, which is the pre-#123 behaviour. */
const PAINT_SETTLE_MAX_FRAMES = 24;
const PAINT_SETTLE_FRAME_TIMEOUT_MS = 50;

async function waitForPaintSettle(page: Page): Promise<void> {
  try {
    // RAW STRING, not a function — the tooling program is DOM-less (document/requestAnimationFrame are
    // browser names), and a serialized function body picks up toolchain name-decoration; the string
    // evaluates untransformed in the page (the same idiom as scanDeadCss/buildContrastScript).
    await page.evaluate(`(async () => {
      const maxFrames = ${PAINT_SETTLE_MAX_FRAMES};
      const frameTimeoutMs = ${PAINT_SETTLE_FRAME_TIMEOUT_MS};
      const geometry = () => {
        const root = document.documentElement;
        const body = document.body;
        return [root.scrollWidth, root.scrollHeight, root.clientWidth, root.clientHeight, body ? body.scrollHeight : 0, body ? body.childElementCount : 0].join(":");
      };
      // rAF alone can hang forever on a throttled/background tab (--pages 2+), so every frame wait
      // carries its own timer and resolves on whichever comes first.
      const nextFrame = () =>
        new Promise((settled) => {
          const timer = setTimeout(settled, frameTimeoutMs);
          requestAnimationFrame(() => {
            clearTimeout(timer);
            settled(undefined);
          });
        });
      let previous = geometry();
      for (let framesLeft = maxFrames; framesLeft > 0; framesLeft -= 1) {
        await nextFrame();
        const current = geometry();
        if (current === previous) {
          return;
        }
        previous = current;
      }
    })()`);
  } catch {
    // A settle is an OPTIMISATION of the capture, never a precondition for it: if the page navigated or
    // the context went away mid-wait, the shot (and the caller's own error reporting) still has to happen.
    // Swallowing here is the difference between "the PNG is one frame stale" and "there is no PNG".
  }
}

export async function captureShot(page: Page, opts: Args, out: string, mask: Locator[]): Promise<void> {
  await waitForPaintSettle(page);
  if (opts.shotOf !== null) {
    // Just the element — Playwright auto-crops to its bounding box. The
    // no-pixel-math crop: the cheapest pixels that still show the thing.
    await page
      .locator(opts.shotOf)
      .first()
      .screenshot({ path: out, ...SHOT_BASE, mask });
    return;
  }
  await page.screenshot({ path: out, fullPage: opts.fullPage, ...SHOT_BASE, mask });
  // Native crop via clip (WxH+X+Y) → <out>-crop.png. No ffmpeg, and the cropped
  // PNG is itself a smaller (cheaper) image to read than the full viewport.
  if (opts.crop !== null) {
    const m = CROP_RE.exec(opts.crop);
    const g = m?.groups;
    if (g?.["w"] !== undefined && g["h"] !== undefined) {
      await page.screenshot({
        path: out.replace(PNG_EXT_RE, "-crop.png"),
        clip: {
          x: Number(g["x"] ?? 0),
          y: Number(g["y"] ?? 0),
          width: Number(g["w"]),
          height: Number(g["h"]),
        },
        ...SHOT_BASE,
        mask,
      });
    }
  }
}
