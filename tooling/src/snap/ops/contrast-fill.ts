// THE FILL ARM's browser half (#1111): shoot a fill-only subject WITH A MARGIN, decode it, and hand the
// pixels to lib/contrast-fill.ts. The pure math, and the reasoning behind measuring a CHANNEL rather than
// a colour, live in that lib's header; this file owns only the geometry and the printed outcome.
//
// WHY A PADDED CLIP. `resolveContrastBackdrop` clips the element's box EXACTLY and reads its perimeter
// ring — sound for text (glyphs sit in the interior, so the ring is backdrop) and exactly wrong here: on a
// fill-only element that ring IS the fill, and the arm would measure the subject against itself. The
// margin is what makes the surround visible at all.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { Viewport } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Rgb } from "../../_shared/wcag.ts";
import { UI_COMPONENT_MIN_RATIO } from "../../_shared/wcag.ts";
import type { ContrastCapture, ContrastFillReading, ContrastMeasured } from "../contract/contrast.ts";
import { readFillChannels } from "../lib/contrast-fill.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** How much surround to shoot around the box, in CSS pixels. Four is enough for the band's median to
 *  survive a rounded corner and a 1px border while staying inside a parent that hugs the control. */
const SURROUND_PAD_PX = 4;

/** Edge pixels that belong to neither side, in CSS pixels: a border-radius/anti-aliased edge blends fill
 *  and surround, and a blended pixel is evidence for neither. */
const FEATHER_PX = 1;

const PERCENT = 100;

/** `r,g,b` — the spelling a reviewer pastes into the token vault. */
function show({ r, g, b }: Rgb): string {
  return `${String(r)},${String(g)},${String(b)}`;
}

interface Clip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The padded shot, clamped into the viewport. Returns `null` when the box itself has no area on screen —
 *  the caller refuses rather than sampling somewhere else (the #211 posture). */
function padClip(box: ContrastMeasured["box"], viewport: Viewport): Clip | null {
  const x = Math.max(0, Math.floor(box.x) - SURROUND_PAD_PX);
  const y = Math.max(0, Math.floor(box.y) - SURROUND_PAD_PX);
  const width = Math.min(Math.ceil(box.width) + 2 * SURROUND_PAD_PX, viewport.width - x);
  const height = Math.min(Math.ceil(box.height) + 2 * SURROUND_PAD_PX, viewport.height - y);
  return width < 1 || height < 1 ? null : { x, y, width, height };
}

/** ONE retry on the SAME page (#1758): a `Page.captureScreenshot` protocol error under contention is
 *  frequently transient — a lone attempt turned a passing fixture into a printed NO VERDICT for a reason
 *  that had nothing to do with the pixels being asked about. A capture that fails twice still surfaces
 *  loudly (never a silent green) — it just does so as an INSTRUMENT fault, not a fill-polarity verdict. */
const SHOT_ATTEMPTS = 2;

async function shootWithRetry(
  page: Page,
  clip: Clip,
): Promise<{ readonly ok: true; readonly buffer: Buffer } | { readonly ok: false; readonly reason: string }> {
  for (let attempt = 1; attempt <= SHOT_ATTEMPTS; attempt += 1) {
    // @orb-waive caught-failure-ownership(error): a mid-retry attempt is deliberately absorbed — the loop tries again; only the LAST attempt below owns the failure with a discriminated `ok: false` return. Ends if SHOT_ATTEMPTS drops to 1 (no retry left to absorb into).
    try {
      return { ok: true, buffer: await page.screenshot({ clip, animations: "disabled" }) };
    } catch (error) {
      // OWNED, not swallowed: the LAST attempt's failure leaves as a discriminated `ok: false` reading; an
      // earlier attempt's failure is absorbed on purpose (that is the whole retry) and the loop tries again.
      if (attempt === SHOT_ATTEMPTS) {
        return { ok: false, reason: `screenshot failed twice: ${errorMessage(error)}` };
      }
    }
  }
  throw new Error("unreachable: shootWithRetry's loop always returns by its last attempt");
}

async function readFill(page: Page, facts: ContrastMeasured, viewport: Viewport): Promise<ContrastFillReading> {
  const box = facts.box;
  const clip = padClip(box, viewport);
  if (clip === null) {
    return { kind: "refused", refusal: "the element box is empty or fully off-screen" };
  }
  const shot = await shootWithRetry(page, clip);
  if (!shot.ok) {
    // OWNED, not swallowed: the caught failure leaves as a DISCRIMINATED capture-failed reading carrying
    // its own message, and the only consumer prints it as an INSTRUMENT ERROR and FAILS the run. Nothing
    // downstream can read this as a fill-polarity measurement.
    return { kind: "capture-failed", reason: shot.reason };
  }
  const buffer = shot.buffer;
  try {
    // `Promise.resolve` for the reason ops/contrast-pixels.ts states: biome's type service does not
    // resolve sharp's builder chain and reads the awaited value as non-thenable.
    const decoded = sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const { data, info } = await Promise.resolve(decoded);
    // The shot is in DEVICE pixels; the box is in CSS pixels. Derive the ratio from the clip we asked for
    // rather than assuming 1 — a retina viewport would otherwise place the interior at a quarter of the box.
    const scale = info.width / clip.width;
    const interior = {
      left: Math.round((box.x - clip.x) * scale),
      top: Math.round((box.y - clip.y) * scale),
      width: Math.round(box.width * scale),
      height: Math.round(box.height * scale),
    };
    const radii = {
      tl: facts.radii.tl * scale,
      tr: facts.radii.tr * scale,
      br: facts.radii.br * scale,
      bl: facts.radii.bl * scale,
    };
    const geometry = { interior, radii, feather: Math.max(1, Math.round(FEATHER_PX * scale)) };
    return readFillChannels({ data, width: info.width, height: info.height, channels: info.channels }, geometry);
  } catch (error) {
    // Owned on the same terms as the screenshot arm above — a decode failure is the instrument's, never
    // the subject's.
    return { kind: "capture-failed", reason: `pixel decode failed: ${errorMessage(error)}` };
  }
}

/**
 * The verdict for a subject that paints no ink of its own: the loudest painted channel of its box against
 * the band around it, at WCAG 1.4.11's 3:1 non-text boundary — or a printed NO VERDICT.
 *
 * The refusal FAILS the run on purpose. An unmeasurable fill is the state that produced the defect this
 * arm closes: something has to be louder than a green line, or the next reviewer quotes the ink again.
 */
export async function measureFillContrast(page: Page, selector: string, facts: ContrastMeasured, viewport: Viewport): Promise<ContrastCapture> {
  const reading = await readFill(page, facts, viewport);
  const base = {
    selector,
    candidates: facts.total,
    inViewport: 1,
    matchIndex: facts.matchIndex,
    requiredRatio: UI_COMPONENT_MIN_RATIO,
  } as const;
  if (reading.kind === "capture-failed") {
    // #1758: an INSTRUMENT fault (the capture itself, retried once, still failed) — never folded into the
    // "undecodable" domain-refusal family below, so a reason-string pin on THAT family cannot red on a
    // transient CDP message that says nothing about the fixture's pixels.
    const line = `CONTRAST ${selector}: ${reading.reason}`;
    return {
      outcome: { line, failed: true },
      evidence: {
        ...base,
        status: "instrument-error",
        sampled: 0,
        method: null,
        ratio: null,
        requiredRatio: null,
        passed: null,
        foreground: null,
        backdrop: null,
        fillChannel: null,
        reason: line,
      },
    };
  }
  if (reading.kind === "refused") {
    const line = `CONTRAST ${selector}: NO VERDICT (fill-only, undecodable) — ${reading.refusal}`;
    return {
      outcome: { line, failed: true },
      evidence: {
        ...base,
        status: "refused",
        sampled: 0,
        method: null,
        ratio: null,
        requiredRatio: null,
        passed: null,
        foreground: null,
        backdrop: null,
        fillChannel: null,
        reason: line,
      },
    };
  }
  const passed = reading.ratio >= UI_COMPONENT_MIN_RATIO;
  const share = `${(reading.share * PERCENT).toFixed(0)}% of the box`;
  // The two COLOURS are printed, not just the ratio: a fill verdict a reviewer cannot take to the token
  // vault is the same unquotable number this arm replaced, and seeing them is how a wrong channel is
  // caught by eye (an anti-aliased edge winning would print a colour that is neither fill nor surround).
  const colours = `${show(reading.fill)} on ${show(reading.surround)} (${(reading.surroundShare * PERCENT).toFixed(0)}% of the band)`;
  const tail = `(fill-only · channel ${reading.channel} ${share} · ${colours} · need ${UI_COMPONENT_MIN_RATIO.toFixed(1)} · fill-sample)`;
  // #1385 item 3: a bare `FILL … FAIL` reads like a TEXT contrast verdict, and the question it does not
  // answer — the boundary, WCAG 1.4.11 — is the one an empty input's affordance actually rests on. The
  // fill arm cannot answer it (it samples the box, not each painted side), so it names the arm that can
  // rather than letting a reader assume the box verdict covered the border.
  const next = ` · next: pnpm snap --contrast-edge ${JSON.stringify(selector)} for the BORDER question (WCAG 1.4.11, per side)`;
  return {
    outcome: { line: `CONTRAST ${selector}: FILL ${reading.ratio.toFixed(2)}:1  ${passed ? "PASS" : "FAIL"}  ${tail}${next}`, failed: !passed },
    evidence: {
      ...base,
      status: "ok",
      sampled: 1,
      method: "fill-sample",
      ratio: reading.ratio,
      passed,
      foreground: reading.fill,
      backdrop: reading.surround,
      fillChannel: { kind: reading.channel, share: reading.share },
      reason: null,
    },
  };
}
