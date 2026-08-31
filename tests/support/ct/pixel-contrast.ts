// PIXEL-SAMPLED WCAG CONTRAST, in the CT browser — the over-art family's receipt instrument for a lane
// that cannot use `snap`.
//
// WHY IT EXISTS. The over-art contrast family (#167 #217 #221 #229 #232 #236 #237 #243 #468 #674) is
// decided by what is COMPOSITED on screen, and `getComputedStyle` cannot see it: a translucent plate over
// a photo, or a control on a fully transparent ancestor chain, both report a class list that says nothing
// about the pixel a reader looks at (#674's band read `rgba(0, 0, 0, 0)` all the way up while measuring
// 1.01:1). `snap --contrast --contrast-pixel` answers that on the LIVE app — but `:5173` serves MAIN, so a
// worktree lane's rendered proof has to come from the CT browser (§L.6), which is also the only place a
// lane can choose the WORST-CASE art rather than whatever wallpaper the dev account happens to carry.
//
// IT IS NOT A SECOND ALGORITHM. The ring geometry (`ringBackdrop`), the WCAG kernel (`contrastRatio`) and
// the dim composite (`compositeForeground` / `FOREGROUND_OPACITY_EPS` / `MEASURABLE_OPACITY_MIN`) are
// imported from the ONE home the probe instruments share (`@orb/tooling/_shared`), for the reason that
// module's own header states: two instruments must not disagree about what is behind a glyph. The only
// thing here is the screenshot→raw-pixels plumbing snap keeps private to its own op.
//
// IT USED TO CARRY AXE'S OWN BLIND SPOT (fixed 2026-08-30 while proving #874). It read the ink from
// `getComputedStyle().color` and the backdrop through the SAME dimming group, so an `opacity:.6` caption
// measured at its UNDIMMED ratio — the exact reason Lighthouse scored the bracket's 3.54:1 locked cell
// 100/100. A tool caught printing a false clean is fixed in the era it is found; the planted control is
// the locked-cell arm of `context-bracket.ct.tsx`, which is RED on the pre-#874 source and green after.

import { ringBackdrop } from "@orb/tooling/_shared/pixel-backdrop";
import type { Rgb } from "@orb/tooling/_shared/wcag";
import { compositeForeground, contrastRatio, FOREGROUND_OPACITY_EPS, MEASURABLE_OPACITY_MIN } from "@orb/tooling/_shared/wcag";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

export interface PixelContrastReceipt {
  /** The WCAG ratio of the element's resolved ink against its REAL composited backdrop. */
  readonly ratio: number;
  /** The ink as PAINTED — the computed `color`, composited over the backdrop at the accumulated ancestor
   *  opacity when a group dims it. */
  readonly ink: Rgb;
  /** The per-channel median of the element box's perimeter ring, read out of the framebuffer. */
  readonly backdrop: Rgb;
  /** `r,g,b` spellings — what a failing assertion prints, so a red row names the two colours. */
  readonly describe: string;
}

export interface TextContrastSubjectReceipt extends PixelContrastReceipt {
  /** Stable within this audit only; identifies the owning element of one rendered text node. */
  readonly subject: string;
  readonly text: string;
}

export interface TextContrastAuditReceipt {
  readonly declared: number;
  readonly reached: number;
  readonly sampled: number;
  readonly minimum: number;
  readonly subjects: readonly TextContrastSubjectReceipt[];
}

const show = ({ r, g, b }: Rgb): string => `${String(Math.round(r))},${String(Math.round(g))},${String(Math.round(b))}`;

/** The element's resolved ink as sRGB bytes, RESOLVED BY THE BROWSER rather than by a regex here.
 *
 *  This tree's tokens are `oklch`, and Chromium's `getComputedStyle().color` hands an oklch-authored colour
 *  straight back as `oklch(0.74 0.008 65)` — an `rgb\(…\)` regex returns nothing on it. (The first draft of
 *  this helper did exactly that and refused every measurement; the shared-memory entry is
 *  `oklch-kills-rgb-regex-probes`.) Painting the computed string into a 1x1 canvas and reading the pixel
 *  back makes the ENGINE do the conversion, so every CSS colour syntax — current and future — resolves the
 *  same way the glyph itself is rasterised. Annotated (the `tier-liveness` spelling) so the awaiting caller
 *  has a declared Promise rather than an inferred one. */
function readInk(target: Locator): Promise<{ color: Rgb; opacity: number }> {
  return target.evaluate((element): { color: Rgb; opacity: number } => {
    const canvas = element.ownerDocument.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("pixelContrast: no 2d context to resolve the ink colour through");
    }
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    // TWO INDEPENDENT DIMMERS, MULTIPLIED — both invisible to a naive read of `color`:
    //  · the INK's OWN ALPHA (`text-muted-foreground/70`). The canvas hands `getImageData` back
    //    UNPREMULTIPLIED, so `r,g,b` are the pure colour and the alpha is a separate byte — reading only
    //    the first three channels reports a `/70` ink as if it were opaque. MEASURED 2026-08-30: with that
    //    channel dropped, this sampler read the bracket's owning and receded kickers as the SAME ink
    //    (174,170,167 vs 174,170,166) while their authored alphas were 1.0 and 0.7.
    //  · the ACCUMULATED ANCESTOR OPACITY, multiplied up the whole chain because `opacity` composites per
    //    GROUP: two nested 0.6 groups paint at 0.36, and the element's own `opacity` counts.
    // 255 is spelled INLINE, not hoisted to a module constant: `evaluate` serialises this function and
    // runs it in the PAGE, where a module-scope binding does not exist (it fails as a ReferenceError, not
    // a type error — measured).
    const maxChannel = 255;
    let opacity = (a ?? maxChannel) / maxChannel;
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      opacity *= Number.parseFloat(getComputedStyle(node).opacity);
    }
    return { color: { r: r ?? 0, g: g ?? 0, b: b ?? 0 }, opacity };
  });
}

/** Decode a PNG shot to raw RGB(A) bytes. Annotated for the same reason as `readInk`: biome's type service
 *  does not resolve sharp's builder chain and reads the awaited value as non-thenable. */
function rawPixels(shot: Buffer): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> {
  return sharp(shot).raw().toBuffer({ resolveWithObject: true });
}

/** The per-channel MEDIAN of every pixel in a clip — the "what colour is this strip" reading. Median, not
 *  mean: a rail's box carries glyphs and captions, and a mean would drag the fill toward the ink while the
 *  median stays on the surface that occupies most of the box (the same reasoning the side-eye lane's
 *  mode-sample used, in a form that needs no binning). */
function medianRgb(data: Buffer, channels: number): Rgb {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  for (let i = 0; i + channels - 1 < data.length; i += channels) {
    reds.push(data[i] ?? 0);
    greens.push(data[i + 1] ?? 0);
    blues.push(data[i + 2] ?? 0);
  }
  if (reds.length === 0) {
    throw new Error("pixelSurface: the clip decoded to zero pixels");
  }
  const mid = (xs: number[]): number => {
    xs.sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)] ?? 0;
  };
  return { r: mid(reds), g: mid(greens), b: mid(blues) };
}

export interface PixelSurfaceReceipt {
  /** The element's own COMPOSITED surface colour, read out of the framebuffer. */
  readonly rgb: Rgb;
  readonly describe: string;
}

/**
 * The composited SURFACE colour of one element — what an alpha fill actually resolves to on screen.
 *
 * The companion to {@link pixelContrast}, and it exists for the same reason at one remove: an ownership
 * axis expressed as two alphas of one token (`bg-x/40` vs `bg-x/15`) is a decision taken in ALPHA space,
 * and `getComputedStyle` hands back the alpha, never the pixel. #860's F2 is exactly that failure — a
 * "quieter step of the same fill" that composited to 1.001:1 against the pane behind it. REFUSES rather
 * than fabricating, on the same terms as `pixelContrast`.
 */
export async function pixelSurface(page: Page, target: Locator): Promise<PixelSurfaceReceipt> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("pixelSurface: the target has no box (not rendered)");
  }
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("pixelSurface: the page has no viewport size");
  }
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.min(Math.ceil(box.width), viewport.width - x);
  const height = Math.min(Math.ceil(box.height), viewport.height - y);
  if (width < 1 || height < 1) {
    throw new Error(`pixelSurface: the target box is empty or off-screen (${JSON.stringify(box)})`);
  }
  const shot = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  const { data, info } = await rawPixels(shot);
  const rgb = medianRgb(data, info.channels);
  return { rgb, describe: show(rgb) };
}

/**
 * The pixel-sampled contrast of one element's text against what is actually painted behind it.
 *
 * REFUSES rather than fabricating: an element with no box, a box entirely outside the viewport, or a
 * screenshot/decode failure throws — "I could not measure" is never a passing number (the #211 posture).
 */
export async function pixelContrast(page: Page, target: Locator): Promise<PixelContrastReceipt> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("pixelContrast: the target has no box (not rendered)");
  }
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("pixelContrast: the page has no viewport size");
  }
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.min(Math.ceil(box.width), viewport.width - x);
  const height = Math.min(Math.ceil(box.height), viewport.height - y);
  if (width < 1 || height < 1) {
    throw new Error(`pixelContrast: the target box is empty or off-screen (${JSON.stringify(box)})`);
  }
  const raw = await readInk(target);
  const shot = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  const { data, info } = await rawPixels(shot);
  const backdrop = ringBackdrop(data, info.width, info.height, info.channels);
  if (raw.opacity < MEASURABLE_OPACITY_MIN) {
    throw new Error(
      `pixelContrast: the target paints at α${raw.opacity.toFixed(2)} — below the measurable floor, so a ratio would be arithmetic, not evidence`,
    );
  }
  // THE ANCESTOR-OPACITY COMPOSITE (#874, 2026-08-30 — the blind spot that made axe score a 3.5:1 caption
  // 100/100). `getComputedStyle().color` reports the AUTHORED ink whatever `opacity` an ancestor group
  // paints it at, and the perimeter ring reads the backdrop through that same group — so a dimmed glyph
  // measured naively comes out at its UNDIMMED ratio and a real WCAG failure reads clean. What the eye
  // reads is the composite; snap and design-audit both composite here, and this uses their function.
  const dimmed = raw.opacity < FOREGROUND_OPACITY_EPS;
  const ink = dimmed ? compositeForeground(raw.color, backdrop, raw.opacity) : raw.color;
  const dimNote = dimmed ? ` · dimmed α${raw.opacity.toFixed(2)}` : "";
  return { ratio: contrastRatio(ink, backdrop), ink, backdrop, describe: `ink ${show(ink)} on backdrop ${show(backdrop)}${dimNote}` };
}

interface DeclaredTextSubject {
  readonly owner: string;
  readonly text: string;
  readonly reached: boolean;
  readonly reason: string | null;
}

/**
 * Walk every visually rendered text node below `root`, then measure its owning element through
 * {@link pixelContrast}. The population accounting is deliberately strict: an off-viewport or fully
 * occluded subject remains DECLARED but cannot become REACHED, and any missing sample fails the audit.
 * Intentional non-visual text (`aria-hidden`, `hidden`, and the house `sr-only` recipe) is outside the
 * declared visual population.
 */
export async function auditRenderedTextContrast(
  page: Page,
  root: Locator,
  options: { readonly floor: number; readonly label: string },
): Promise<TextContrastAuditReceipt> {
  const marker = `orb-contrast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const subjects = await root.evaluate((element, auditMarker): readonly DeclaredTextSubject[] => {
    const document = element.ownerDocument;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const isIntentionallyHidden = (owner: Element): boolean => {
      const style = getComputedStyle(owner);
      return owner.closest('[aria-hidden="true"], [hidden], .sr-only') !== null || style.display === "none" || style.visibility === "hidden";
    };
    const pointReaches = (owner: Element, rawX: number, rawY: number): boolean => {
      const x = Math.max(0, Math.min(viewport.width - 1, rawX));
      const y = Math.max(0, Math.min(viewport.height - 1, rawY));
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === owner || owner.contains(hit) || hit.contains(owner));
    };
    const rectReaches = (owner: Element, rect: DOMRect): boolean => {
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + 1, rect.top + rect.height / 2],
        [rect.right - 1, rect.top + rect.height / 2],
      ] as const;
      return points.some(([x, y]) => pointReaches(owner, x, y));
    };
    const reachReason = (rectCount: number, inViewport: boolean, isReached: boolean): string | null => {
      if (rectCount === 0) {
        return "no rendered text rect";
      }
      if (!inViewport) {
        return "off viewport";
      }
      return isReached ? null : "fully occluded";
    };
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const owners = new Map<Element, string>();
    const declared: DeclaredTextSubject[] = [];
    let nextOwner = 0;
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent?.replace(/\s+/gu, " ").trim() ?? "";
      const owner = node.parentElement;
      if (text === "" || owner === null) {
        continue;
      }
      if (isIntentionallyHidden(owner)) {
        continue;
      }
      let ownerId = owners.get(owner);
      if (ownerId === undefined) {
        ownerId = `${auditMarker}-${String(nextOwner)}`;
        nextOwner += 1;
        owners.set(owner, ownerId);
        owner.setAttribute("data-orb-contrast-owner", ownerId);
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      const inViewport = rects.some((rect) => rect.right > 0 && rect.bottom > 0 && rect.left < viewport.width && rect.top < viewport.height);
      const reached = inViewport && rects.some((rect) => rectReaches(owner, rect));
      declared.push({
        owner: ownerId,
        text,
        reached,
        reason: reachReason(rects.length, inViewport, reached),
      });
    }
    return declared;
  }, marker);

  const reached = subjects.filter((subject) => subject.reached);
  const measured: TextContrastSubjectReceipt[] = [];
  try {
    if (subjects.length === 0) {
      throw new Error(`${options.label}: declared=0 reached=0 sampled=0 — no rendered text nodes`);
    }
    if (reached.length !== subjects.length) {
      const missed = subjects.filter((subject) => !subject.reached).map((subject) => `${JSON.stringify(subject.text)} (${subject.reason ?? "unreached"})`);
      throw new Error(`${options.label}: declared=${String(subjects.length)} reached=${String(reached.length)} sampled=0 — ${missed.join(", ")}`);
    }
    for (const subject of reached) {
      const target = page.locator(`[data-orb-contrast-owner="${subject.owner}"]`);
      try {
        const receipt = await pixelContrast(page, target);
        measured.push({ ...receipt, subject: subject.owner, text: subject.text });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${options.label}: declared=${String(subjects.length)} reached=${String(reached.length)} sampled=${String(measured.length)} — unmeasurable ${JSON.stringify(subject.text)}: ${detail}`,
          { cause: error },
        );
      }
    }
    const minimum = Math.min(...measured.map((receipt) => receipt.ratio));
    const population = `declared=${String(subjects.length)} reached=${String(reached.length)} sampled=${String(measured.length)} minimum=${minimum.toFixed(3)}`;
    console.info(`[contrast-audit] ${options.label}: ${population}`);
    const failed = measured.filter((receipt) => receipt.ratio < options.floor);
    if (failed.length > 0) {
      throw new Error(
        `${options.label}: ${population}; below ${options.floor.toFixed(1)}: ${failed
          .map((receipt) => `${JSON.stringify(receipt.text)} ${receipt.ratio.toFixed(3)} (${receipt.describe})`)
          .join(", ")}`,
      );
    }
    return { declared: subjects.length, reached: reached.length, sampled: measured.length, minimum, subjects: measured };
  } finally {
    await root.evaluate((element, auditMarker) => {
      for (const owner of element.querySelectorAll(`[data-orb-contrast-owner^="${auditMarker}"]`)) {
        owner.removeAttribute("data-orb-contrast-owner");
      }
    }, marker);
  }
}
