// THE FILL ARM's browser half (#1111): shoot a fill-only subject WITH A MARGIN, decode it, and hand the
// pixels to lib/contrast-fill.ts. The pure math, and the reasoning behind measuring a CHANNEL rather than
// a colour, live in that lib's header; this file owns only the geometry and the printed outcome.
//
// WHY A PADDED CLIP. `resolveContrastBackdrop` clips the element's box EXACTLY and reads its perimeter
// ring — sound for text (glyphs sit in the interior, so the ring is backdrop) and exactly wrong here: on a
// fill-only element that ring IS the fill, and the arm would measure the subject against itself. The
// margin is what makes the surround visible at all.
import { errorMessage } from "@orb/kit/error-message";
import { AA_NON_TEXT_RATIO } from "@orb/kit/theme-derivation";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { Viewport } from "../../floor/instrument/argv.ts";
import type { Rgb } from "../../floor/instrument/wcag.ts";
import type { ContrastCapture, ContrastFillReading, ContrastMeasured } from "../contract/contrast.ts";
import { readFillChannels } from "../lib/contrast-fill.ts";
import { FIELD_TAGS, terminalEvidence } from "../lib/contrast-verdict.ts";

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
    // a mid-retry attempt is replaced by the next attempt; the last attempt returns { ok: false, reason } from this catch, readFill maps it to capture-failed and measureFillContrast returns failed: true with status instrument-error. Ends if the last attempt stops returning ok: false.
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

/** #2429 item 2: a FIELD only reaches this arm when it is empty AND paints no placeholder (an empty field
 *  WITH one is ink, and routes to the ink arm instead). A bare `FILL … PASS` on a composer then reads as
 *  "the composer's contrast is fine", which is a claim about ink this arm never measured — so both the
 *  measured line and the undecodable refusal say out loud that there was no ink to judge. */
function emptyFieldNote(facts: Pick<ContrastMeasured, "tag">): string {
  if (!FIELD_TAGS.has(facts.tag)) {
    return "";
  }
  return " · NO INK TO JUDGE: this field is empty and paints no placeholder, so this is a verdict on its BOX, never on its text";
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

/** The facts a fill outcome reads: which match it measured, and its tag for the empty-field note. */
type FillSubject = Pick<ContrastMeasured, "matchIndex" | "tag" | "total">;
type FillOutcomes = {
  readonly [K in ContrastFillReading["kind"]]: (selector: string, facts: FillSubject, reading: Extract<ContrastFillReading, { kind: K }>) => ContrastCapture;
};

function fillTerminal(selector: string, facts: FillSubject, status: "instrument-error" | "refused", line: string): ContrastCapture {
  return {
    outcome: { line, failed: true },
    evidence: terminalEvidence(selector, status, line, { total: facts.total, inViewport: 1, matchIndex: facts.matchIndex }),
  };
}

const FILL_OUTCOMES: FillOutcomes = {
  // An instrument fault (the capture failed twice), never folded into the "undecodable" refusal family, so a reason pin
  // there cannot red on a transient CDP message.
  "capture-failed": (selector, facts, reading) => fillTerminal(selector, facts, "instrument-error", `CONTRAST ${selector}: ${reading.reason}`),
  // The refusal fails the run: an unmeasurable fill has to be louder than a green line.
  refused: (selector, facts, reading) =>
    fillTerminal(selector, facts, "refused", `CONTRAST ${selector}: NO VERDICT (fill-only, undecodable) — ${reading.refusal}${emptyFieldNote(facts)}`),
  measured: (selector, facts, reading) => {
    const passed = reading.ratio >= AA_NON_TEXT_RATIO;
    const share = `${(reading.share * PERCENT).toFixed(0)}% of the box`;
    // The two colours are printed, not just the ratio: a reviewer takes them to the token vault, and an
    // anti-aliased edge winning shows up as a colour that is neither fill nor surround.
    const colours = `${show(reading.fill)} on ${show(reading.surround)} (${(reading.surroundShare * PERCENT).toFixed(0)}% of the band)`;
    const tail = `(fill-only · channel ${reading.channel} ${share} · ${colours} · need ${AA_NON_TEXT_RATIO.toFixed(1)} · fill-sample)`;
    // The fill verdict samples the box, not each painted side, so it names the edge check for the WCAG 1.4.11 border question.
    const next = ` · next: pnpm snap --contrast-edge ${JSON.stringify(selector)} for the BORDER question (WCAG 1.4.11, per side)`;
    return {
      outcome: {
        line: `CONTRAST ${selector}: FILL ${reading.ratio.toFixed(2)}:1  ${passed ? "PASS" : "FAIL"}  ${tail}${emptyFieldNote(facts)}${next}`,
        failed: !passed,
      },
      evidence: {
        selector,
        candidates: facts.total,
        inViewport: 1,
        matchIndex: facts.matchIndex,
        requiredRatio: AA_NON_TEXT_RATIO,
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
  },
};

/** The printed outcome and evidence row for one fill reading, with no browser in the path. */
export function fillOutcome(selector: string, facts: FillSubject, reading: ContrastFillReading): ContrastCapture {
  // A mapped record cannot correlate `reading.kind` with its handler's parameter, so the lookup is widened once here.
  const outcome = FILL_OUTCOMES[reading.kind] as (selector: string, facts: FillSubject, reading: ContrastFillReading) => ContrastCapture;
  return outcome(selector, facts, reading);
}

/**
 * The verdict for a subject that paints no ink of its own: the loudest painted channel of its box against
 * the band around it, at WCAG 1.4.11's 3:1 non-text boundary — or a printed NO VERDICT.
 *
 * The refusal FAILS the run on purpose. An unmeasurable fill is the state that produced the defect this
 * arm closes: something has to be louder than a green line, or the next reviewer quotes the ink again.
 */
export async function measureFillContrast(page: Page, selector: string, facts: ContrastMeasured, viewport: Viewport): Promise<ContrastCapture> {
  return fillOutcome(selector, facts, await readFill(page, facts, viewport));
}
