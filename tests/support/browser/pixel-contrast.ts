// PIXEL-SAMPLED WCAG CONTRAST, in the CT browser — the over-art contrast instrument for a worktree that
// cannot use `snap`.
//
// WHY IT EXISTS. Contrast over art is decided by what is COMPOSITED on screen, and `getComputedStyle`
// cannot see it: a translucent plate over a photo, or a control on a fully transparent ancestor chain,
// both report a class list that says nothing about the pixel a reader looks at (a band can read
// `rgba(0, 0, 0, 0)` all the way up while measuring 1.01:1). `snap --contrast --contrast-pixel` answers
// that on the LIVE app — but `:5173` serves MAIN, so a worktree's rendered proof has to come from the CT
// browser, which is also the only place to choose the WORST-CASE art rather than whatever wallpaper the
// dev account happens to carry.
//
// IT IS NOT A SECOND ALGORITHM. The ring geometry (`ringBackdrop`), the WCAG kernel (`contrastRatio`) and
// the dim composite (`compositeForeground` / `FOREGROUND_OPACITY_EPS` / `MEASURABLE_OPACITY_MIN`) are
// imported from the ONE home the probe instruments share (`@orb/tooling/floor`), for the reason that
// module's own header states: two instruments must not disagree about what is behind a glyph. The only
// thing here is the screenshot→raw-pixels plumbing snap keeps private to its own op.
//
// IT MUST NOT READ INK FROM `getComputedStyle().color` ALONE. The backdrop is read through the SAME
// dimming group, so an `opacity:.6` caption would measure at its UNDIMMED ratio — axe's own blind spot. The
// planted control is a locked cell, which goes red if the composite is lost.

import { wcagContrastRatio } from "@orb/kit/theme-derivation";
import { ringBackdropOfRegion } from "@orb/tooling/floor/instrument/pixel-backdrop";
import type { Rgb } from "@orb/tooling/floor/instrument/wcag";
import { compositeForeground, FOREGROUND_OPACITY_EPS, MEASURABLE_OPACITY_MIN } from "@orb/tooling/floor/instrument/wcag";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

/** The drawn marks inside the target, as rectangles of its clip: an icon is foreground, and the backdrop is read where it is not. */
function markRects(
  target: Locator,
  origin: { readonly x: number; readonly y: number },
): Promise<readonly { left: number; top: number; width: number; height: number }[]> {
  return target.locator("svg").evaluateAll(
    (marks, from) =>
      marks.map((mark) => {
        const rect = mark.getBoundingClientRect();
        return { left: Math.floor(rect.left - from.x), top: Math.floor(rect.top - from.y), width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
      }),
    origin,
  );
}

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

interface TextContrastSubjectReceipt extends PixelContrastReceipt {
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

const auditSequences = new WeakMap<Page, number>();

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
    //    the first three channels reports a `/70` ink as if it were opaque. With that
    //    channel dropped, two inks of authored alpha 1.0 and 0.7 read as the SAME colour.
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
 *  median stays on the surface that occupies most of the box (a form of mode-sample that needs no binning). */
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

/** A sub-rectangle of the target's box, as fractions of its own width/height (0..1, `x0 < x1`). */
interface PixelSurfaceRegion {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface PixelSurfaceOptions {
  /** Sample only part of the box. A COMPOSITE control's own fill can be mostly covered by a child —
   *  a Switch TRACK is 48px wide with an 18px thumb parked in it, and the whole-box median can return
   *  the child's colour rather than the track's (a thumb covering most of the root's pixels makes the
   *  median silently do so). Name the strip the parent actually paints
   *  (for the switch: the end the thumb is NOT parked at). */
  readonly region?: PixelSurfaceRegion;
}

/**
 * The composited SURFACE colour of one element — what an alpha fill actually resolves to on screen.
 *
 * The companion to {@link pixelContrast}, and it exists for the same reason at one remove: an ownership
 * axis expressed as two alphas of one token (`bg-x/40` vs `bg-x/15`) is a decision taken in ALPHA space,
 * and `getComputedStyle` hands back the alpha, never the pixel. A "quieter step of the same fill" can
 * composite to 1.001:1 against the pane behind it. REFUSES rather
 * than fabricating, on the same terms as `pixelContrast`.
 */
export async function pixelSurface(page: Page, target: Locator, options: PixelSurfaceOptions = {}): Promise<PixelSurfaceReceipt> {
  const { data, info } = await regionPixels(page, target, options, "pixelSurface");
  const rgb = medianRgb(data, info.channels);
  return { rgb, describe: show(rgb) };
}

/** The widest per-channel range across every pixel of the target's region: near zero where one smooth fill is all
 *  that paints, large where a glyph or an edge shows through. Same refusals as {@link pixelSurface}. */
export async function pixelSpread(page: Page, target: Locator, options: PixelSurfaceOptions = {}): Promise<number> {
  const { data, info } = await regionPixels(page, target, options, "pixelSpread");
  let spread = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    let low = 255;
    let high = 0;
    for (let i = channel; i < data.length; i += info.channels) {
      const value = data[i] ?? 0;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    spread = Math.max(spread, high - low);
  }
  return spread;
}

async function regionPixels(
  page: Page,
  target: Locator,
  options: PixelSurfaceOptions,
  caller: string,
): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error(`${caller}: the target has no box (not rendered)`);
  }
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error(`${caller}: the page has no viewport size`);
  }
  const region = options.region ?? { x0: 0, x1: 1, y0: 0, y1: 1 };
  const x = Math.max(0, Math.floor(box.x + box.width * region.x0));
  const y = Math.max(0, Math.floor(box.y + box.height * region.y0));
  const width = Math.min(Math.ceil(box.width * (region.x1 - region.x0)), viewport.width - x);
  const height = Math.min(Math.ceil(box.height * (region.y1 - region.y0)), viewport.height - y);
  if (width < 1 || height < 1) {
    throw new Error(`${caller}: the target box is empty or off-screen (${JSON.stringify(box)}, region ${JSON.stringify(region)})`);
  }
  const shot = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  return await rawPixels(shot);
}

/**
 * The pixel-sampled contrast of one element's text against what is actually painted behind it.
 *
 * REFUSES rather than fabricating: an element with no box, a box entirely outside the viewport, or a
 * screenshot/decode failure throws — "I could not measure" is never a passing number.
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
  const marks = await markRects(target, { x, y });
  const shot = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  const { data, info } = await rawPixels(shot);
  const backdrop = ringBackdropOfRegion(data, info.width, info.channels, { left: 0, top: 0, width: info.width, height: info.height, marks });
  if (raw.opacity < MEASURABLE_OPACITY_MIN) {
    throw new Error(
      `pixelContrast: the target paints at α${raw.opacity.toFixed(2)} — below the measurable floor, so a ratio would be arithmetic, not evidence`,
    );
  }
  // THE ANCESTOR-OPACITY COMPOSITE (the blind spot that lets axe score a 3.5:1 caption
  // 100/100). `getComputedStyle().color` reports the AUTHORED ink whatever `opacity` an ancestor group
  // paints it at, and the perimeter ring reads the backdrop through that same group — so a dimmed glyph
  // measured naively comes out at its UNDIMMED ratio and a real WCAG failure reads clean. What the eye
  // reads is the composite; snap and design-audit both composite here, and this uses their function.
  const dimmed = raw.opacity < FOREGROUND_OPACITY_EPS;
  const ink = dimmed ? compositeForeground(raw.color, backdrop, raw.opacity) : raw.color;
  const dimNote = dimmed ? ` · dimmed α${raw.opacity.toFixed(2)}` : "";
  return { ratio: wcagContrastRatio(ink, backdrop), ink, backdrop, describe: `ink ${show(ink)} on backdrop ${show(backdrop)}${dimNote}` };
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
  const sequence = (auditSequences.get(page) ?? 0) + 1;
  auditSequences.set(page, sequence);
  const marker = `data-orb-contrast-owner-${String(sequence)}`;
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
        owner.setAttribute(auditMarker, ownerId);
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
      const target = page.locator(`[${marker}="${subject.owner}"]`);
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
      element.removeAttribute(auditMarker);
      for (const owner of element.querySelectorAll(`[${auditMarker}]`)) {
        owner.removeAttribute(auditMarker);
      }
    }, marker);
  }
}

export interface PixelMarkReceipt {
  /** WCAG ratio of the mark's painted colour against the fill it sits on. */
  readonly ratio: number;
  readonly mark: Rgb;
  readonly fill: Rgb;
  readonly describe: string;
}

/** Channel distance under which a pixel counts as the fill itself, so antialiasing at a mark's edge is not read as the mark. */
const FILL_TOLERANCE = 24;

/** Pixels this close to a field's edge are antialiased against whatever lies behind it, not the fill. */
const FIELD_EDGE_MARGIN_PX = 2;

interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const inRect = (rect: PixelRect, px: number, py: number): boolean =>
  px >= rect.left && px < rect.left + rect.width && py >= rect.top && py < rect.top + rect.height;

const inEllipse = (width: number, height: number, px: number, py: number): boolean =>
  ((px + 0.5 - width / 2) / (width / 2 - FIELD_EDGE_MARGIN_PX)) ** 2 + ((py + 0.5 - height / 2) / (height / 2 - FIELD_EDGE_MARGIN_PX)) ** 2 <= 1;

/** The pixels of a shot, as colours, split into those inside the mark's rect and those in the field's inscribed ellipse outside it. */
function splitPixels(data: Buffer, info: { width: number; height: number; channels: number }, mark: PixelRect): { marks: Rgb[]; fills: Rgb[] } {
  const marks: Rgb[] = [];
  const fills: Rgb[] = [];
  for (let py = 0; py < info.height; py += 1) {
    for (let px = 0; px < info.width; px += 1) {
      const offset = (py * info.width + px) * info.channels;
      const rgb = { r: data[offset] ?? 0, g: data[offset + 1] ?? 0, b: data[offset + 2] ?? 0 };
      if (inRect(mark, px, py)) {
        marks.push(rgb);
      } else if (inEllipse(info.width, info.height, px, py)) {
        fills.push(rgb);
      }
    }
  }
  return { marks, fills };
}

/** The most common colour among the pixels that differ from the fill. */
function modalColour(pixels: readonly Rgb[], fill: Rgb): Rgb | undefined {
  const votes = new Map<string, { rgb: Rgb; count: number }>();
  for (const rgb of pixels) {
    if (Math.max(Math.abs(rgb.r - fill.r), Math.abs(rgb.g - fill.g), Math.abs(rgb.b - fill.b)) > FILL_TOLERANCE) {
      const key = show(rgb);
      votes.set(key, { rgb, count: (votes.get(key)?.count ?? 0) + 1 });
    }
  }
  return [...votes.values()].sort((a, b) => b.count - a.count)[0]?.rgb;
}

/**
 * The contrast of a mark against the fill it is drawn on, read from the framebuffer's own pixels: a lock glyph inside a
 * switch thumb. The mark's colour is the most common pixel inside its box that differs from the fill, and the fill is the
 * median of the field's inscribed ellipse outside the mark's box.
 *
 * WHY NOT {@link pixelContrast}: its backdrop is the perimeter ring of the mark's own box, and a glyph that reaches its box
 * edges puts its strokes in that ring, so the "backdrop" drifts toward the ink and the ratio reads low. This reads the fill
 * where the mark is not.
 *
 * REFUSES rather than fabricating: a missing box, or a mark with no pixel apart from the fill, throws.
 */
export async function pixelMarkContrast(page: Page, mark: Locator, field: Locator): Promise<PixelMarkReceipt> {
  const [markBox, fieldBox] = [await mark.boundingBox(), await field.boundingBox()];
  if (markBox === null || fieldBox === null) {
    throw new Error("pixelMarkContrast: the mark or its field has no box (not rendered)");
  }
  const x = Math.max(0, Math.floor(fieldBox.x));
  const y = Math.max(0, Math.floor(fieldBox.y));
  const shot = await page.screenshot({ clip: { x, y, width: Math.ceil(fieldBox.width), height: Math.ceil(fieldBox.height) }, animations: "disabled" });
  const { data, info } = await rawPixels(shot);
  const { marks, fills } = splitPixels(data, info, { left: markBox.x - x, top: markBox.y - y, width: markBox.width, height: markBox.height });
  const fill = medianRgb(Buffer.from(fills.flatMap(({ r, g, b }) => [r, g, b])), 3);
  const painted = modalColour(marks, fill);
  if (painted === undefined) {
    throw new Error(`pixelMarkContrast: no pixel inside the mark differs from the fill ${show(fill)}; the mark is not painted`);
  }
  return { ratio: wcagContrastRatio(painted, fill), mark: painted, fill, describe: `mark ${show(painted)} on fill ${show(fill)}` };
}

/**
 * The contrast of text drawn inside a filled box (pseudo-element initials in an avatar), read from the framebuffer: the fill is
 * the median pixel of the box's inscribed ellipse and the ink is the pixel furthest from it inside that ellipse. Both are the composited colours on screen, so a dimming
 * ancestor is already in them; it does not need {@link pixelContrast}'s ancestor-opacity composite, which would apply the dim
 * to a backdrop the framebuffer already dimmed. The furthest pixel is the glyph's best-covered one, so the ratio is a floor.
 */
export async function pixelFilledTextContrast(page: Page, target: Locator): Promise<PixelMarkReceipt> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("pixelFilledTextContrast: the target has no box (not rendered)");
  }
  const shot = await page.screenshot({
    clip: { x: Math.max(0, Math.floor(box.x)), y: Math.max(0, Math.floor(box.y)), width: Math.ceil(box.width), height: Math.ceil(box.height) },
    animations: "disabled",
  });
  const { data, info } = await rawPixels(shot);
  // Only the inscribed ellipse: a round field's corners are the plate behind it, and the furthest pixel would be one of them.
  const inside: Rgb[] = [];
  for (let py = 0; py < info.height; py += 1) {
    for (let px = 0; px < info.width; px += 1) {
      const offset = (py * info.width + px) * info.channels;
      if (inEllipse(info.width, info.height, px, py)) {
        inside.push({ r: data[offset] ?? 0, g: data[offset + 1] ?? 0, b: data[offset + 2] ?? 0 });
      }
    }
  }
  const fill = medianRgb(Buffer.from(inside.flatMap(({ r, g, b }) => [r, g, b])), 3);
  let ink = fill;
  let best = 1;
  for (const pixel of inside) {
    const ratio = wcagContrastRatio(pixel, fill);
    if (ratio > best) {
      best = ratio;
      ink = pixel;
    }
  }
  return { ratio: best, mark: ink, fill, describe: `ink ${show(ink)} on fill ${show(fill)}` };
}
