// THE EDGE ARM's browser half (#1346): resolve a subject's border facts, shoot it WITH A MARGIN, decode it,
// and hand the pixels to lib/contrast-edge.ts. The pure math and the reasoning behind measuring per SIDE
// live in that lib's header; this file owns the facts read, the geometry and the printed outcome.
//
// WHY A PADDED CLIP, same as the fill arm: the NEIGHBOUR is outside the box, so a clip of the box alone
// cannot see the thing the boundary has to be distinguishable from.
//
// WHY A FUNCTION-FORM `evaluate` rather than this file's sibling script strings: the read needs the ELEMENT
// the locator matched (the same argument ops/overflow.ts makes at length), and the DOM surface it touches
// is declared locally because the tooling program is `types: ["node"]` on purpose.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { Viewport } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Rgb } from "../../_shared/wcag.ts";
import { UI_COMPONENT_MIN_RATIO } from "../../_shared/wcag.ts";
import type {
  ContrastBox,
  ContrastCapture,
  ContrastEdgeFacts,
  ContrastEdgeGeometry,
  ContrastEdgeReading,
  ContrastEdgeSideReading,
} from "../contract/contrast.ts";
import { CONTRAST_EDGE_SIDES } from "../contract/contrast.ts";
import { readEdgeChannels } from "../lib/contrast-edge.ts";
import { terminalEvidence } from "../lib/contrast-verdict.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --contrast-edge <selector>");

/** How much surround to shoot around the box, in CSS pixels — the fill arm's number, for the same reason:
 *  enough for a modal band past a rounded corner without leaving a parent that hugs the control. */
const SURROUND_PAD_PX = 4;
/** Edge pixels that belong to neither side: a border-radius/anti-aliased boundary blends the two. */
const FEATHER_PX = 1;
const PERCENT = 100;

/** `r,g,b` — the spelling a reviewer pastes into the token vault. */
function show({ r, g, b }: Rgb): string {
  return `${String(r)},${String(g)},${String(b)}`;
}

// The DOM slice the in-page read touches, declared locally (tooling is a node-lib program).
interface EdgeStyle {
  readonly borderTopWidth: string;
  readonly borderRightWidth: string;
  readonly borderBottomWidth: string;
  readonly borderLeftWidth: string;
  readonly borderTopColor: string;
  readonly borderRightColor: string;
  readonly borderBottomColor: string;
  readonly borderLeftColor: string;
  readonly borderTopStyle: string;
  readonly borderRightStyle: string;
  readonly borderBottomStyle: string;
  readonly borderLeftStyle: string;
  readonly borderTopLeftRadius: string;
  readonly borderTopRightRadius: string;
  readonly borderBottomRightRadius: string;
  readonly borderBottomLeftRadius: string;
}
interface EdgeElement {
  readonly getBoundingClientRect: () => { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}
interface EdgeGlobals {
  readonly getComputedStyle: (element: EdgeElement) => EdgeStyle;
}

/** The in-page half. Self-contained by contract — Playwright serializes it into the browser, so it may not
 *  close over anything at module scope. Reached by tests through `measureEdgeContrast`, which is the door
 *  the arm itself uses; a second exported entry would be a second way to call it. */
function readEdgeFacts(element: unknown): Omit<ContrastEdgeFacts, "matchIndex" | "total"> {
  const el = element as EdgeElement;
  const { getComputedStyle } = globalThis as unknown as EdgeGlobals;
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const px = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  // A `border-style: none` side reports a WIDTH of 0 in every browser, but `hidden` does not always — read
  // both, so an author's `border: hidden` is never measured as ink.
  const width = (value: string, borderStyle: string): number => (borderStyle === "none" || borderStyle === "hidden" ? 0 : px(value));
  return {
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    borders: {
      top: { widthPx: width(style.borderTopWidth, style.borderTopStyle), color: style.borderTopColor, style: style.borderTopStyle },
      right: { widthPx: width(style.borderRightWidth, style.borderRightStyle), color: style.borderRightColor, style: style.borderRightStyle },
      bottom: { widthPx: width(style.borderBottomWidth, style.borderBottomStyle), color: style.borderBottomColor, style: style.borderBottomStyle },
      left: { widthPx: width(style.borderLeftWidth, style.borderLeftStyle), color: style.borderLeftColor, style: style.borderLeftStyle },
    },
    radii: {
      tl: px(style.borderTopLeftRadius),
      tr: px(style.borderTopRightRadius),
      br: px(style.borderBottomRightRadius),
      bl: px(style.borderBottomLeftRadius),
    },
  };
}

interface Clip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The padded shot, clamped into the viewport. Null when the box has no area on screen — the caller refuses
 *  rather than sampling somewhere else (the #211 posture). */
function padClip(box: ContrastBox, viewport: Viewport): Clip | null {
  const x = Math.max(0, Math.floor(box.x) - SURROUND_PAD_PX);
  const y = Math.max(0, Math.floor(box.y) - SURROUND_PAD_PX);
  const width = Math.min(Math.ceil(box.width) + 2 * SURROUND_PAD_PX, viewport.width - x);
  const height = Math.min(Math.ceil(box.height) + 2 * SURROUND_PAD_PX, viewport.height - y);
  return width < 1 || height < 1 ? null : { x, y, width, height };
}

/** The FIRST match that is rendered and in the viewport, with its index — the same choice the ink and fill
 *  arms make, and for the same reason: a verdict on a match nobody can see is not a verdict (#211). */
async function pickEdgeSubject(page: Page, selector: string): Promise<{ readonly facts: ContrastEdgeFacts } | { readonly refusal: string }> {
  const locator = page.locator(selector);
  const total = await locator.count();
  if (total === 0) {
    return { refusal: "NOT FOUND" };
  }
  const viewport = page.viewportSize();
  for (let index = 0; index < total; index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible())) {
      continue;
    }
    const facts = await candidate.evaluate(readEdgeFacts);
    const onScreen =
      viewport === null ||
      (facts.box.width > 0 && facts.box.height > 0 && facts.box.x < viewport.width && facts.box.y < viewport.height && facts.box.x + facts.box.width > 0);
    if (onScreen) {
      return { facts: { ...facts, matchIndex: index, total } };
    }
  }
  return { refusal: `OFF-SCREEN  ${String(total)} match(es), none rendered in the viewport — NO VERDICT (scroll it into view, or target the visible match)` };
}

/** ONE retry on the SAME page (#1758) — see ops/contrast-fill.ts's twin for the full rationale: a
 *  `Page.captureScreenshot` protocol error under contention is frequently transient, and a persisting
 *  failure still surfaces loudly (as an instrument fault, never a border verdict). */
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

async function readEdge(page: Page, facts: ContrastEdgeFacts, viewport: Viewport): Promise<ContrastEdgeReading> {
  const clip = padClip(facts.box, viewport);
  if (clip === null) {
    return { kind: "refused", refusal: "the element box is empty or fully off-screen" };
  }
  const shot = await shootWithRetry(page, clip);
  if (!shot.ok) {
    // OWNED, not swallowed: the caught failure leaves as a DISCRIMINATED capture-failed reading the
    // caller prints as an INSTRUMENT ERROR and FAILS the run on. Nothing downstream can read it as a
    // border measurement.
    return { kind: "capture-failed", reason: shot.reason };
  }
  const buffer = shot.buffer;
  try {
    // `Promise.resolve` for the reason ops/contrast-pixels.ts states: biome's type service does not resolve
    // sharp's builder chain and reads the awaited value as non-thenable.
    const decoded = sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const { data, info } = await Promise.resolve(decoded);
    // The shot is in DEVICE pixels and the box is in CSS pixels; derive the ratio from the clip we asked
    // for rather than assuming 1 — a retina viewport would otherwise sample a quarter of the border.
    const scale = info.width / clip.width;
    const geometry: ContrastEdgeGeometry = {
      interior: {
        left: Math.round((facts.box.x - clip.x) * scale),
        top: Math.round((facts.box.y - clip.y) * scale),
        width: Math.round(facts.box.width * scale),
        height: Math.round(facts.box.height * scale),
      },
      radii: { tl: facts.radii.tl * scale, tr: facts.radii.tr * scale, br: facts.radii.br * scale, bl: facts.radii.bl * scale },
      feather: Math.max(1, Math.round(FEATHER_PX * scale)),
      borders: {
        top: Math.round(facts.borders.top.widthPx * scale),
        right: Math.round(facts.borders.right.widthPx * scale),
        bottom: Math.round(facts.borders.bottom.widthPx * scale),
        left: Math.round(facts.borders.left.widthPx * scale),
      },
      pad: Math.max(1, Math.round((SURROUND_PAD_PX - FEATHER_PX) * scale)),
    };
    return readEdgeChannels({ data, width: info.width, height: info.height, channels: info.channels }, geometry);
  } catch (error) {
    // Owned on the same terms as the screenshot arm above — a decode failure is the instrument's, never
    // the subject's.
    return { kind: "capture-failed", reason: `pixel decode failed: ${errorMessage(error)}` };
  }
}

function sideLine(row: ContrastEdgeSideReading): string {
  if (row.kind === "skipped") {
    return `${row.side}: SKIPPED (${row.reason})`;
  }
  if (row.kind === "refused") {
    return `${row.side}: NO VERDICT (${row.reason})`;
  }
  const verdict = row.ratio >= UI_COMPONENT_MIN_RATIO ? "PASS" : "FAIL";
  return `${row.side}: ${row.ratio.toFixed(2)}:1 ${verdict} ${show(row.ink)} on ${show(row.neighbour)} (${(row.neighbourShare * PERCENT).toFixed(0)}% of the band)`;
}

/**
 * The WCAG 1.4.11 verdict for a subject's BORDER: each painted side's ink against the surface immediately
 * outside it, at 3:1. The WORST measured side carries the verdict — one indistinguishable side is a
 * violation whatever the other three do — and a side nobody could measure is a REFUSAL (exit 2 territory),
 * never a silent pass.
 */
export async function measureEdgeContrast(page: Page, selector: string, viewport: Viewport): Promise<ContrastCapture> {
  const subject = await pickEdgeSubject(page, selector);
  if ("refusal" in subject) {
    const line = `CONTRAST-EDGE ${selector}: ${subject.refusal}`;
    return { outcome: { line, failed: true }, evidence: terminalEvidence(selector, subject.refusal === "NOT FOUND" ? "instrument-error" : "refused", line) };
  }
  const facts = subject.facts;
  const base = { selector, candidates: facts.total, inViewport: 1, matchIndex: facts.matchIndex, requiredRatio: UI_COMPONENT_MIN_RATIO } as const;
  const reading = await readEdge(page, facts, viewport);
  if (reading.kind === "capture-failed") {
    // #1758: an INSTRUMENT fault, never folded into the "edge unmeasurable" domain-refusal family below —
    // a reason-string pin on THAT family cannot red on a transient CDP message.
    const line = `CONTRAST-EDGE ${selector}: ${reading.reason}`;
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
    const line = `CONTRAST-EDGE ${selector}: NO VERDICT (edge unmeasurable) — ${reading.refusal}`;
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
  const measured = reading.sides.filter((row): row is Extract<ContrastEdgeSideReading, { kind: "measured" }> => row.kind === "measured");
  const refusedSides = reading.sides.filter((row) => row.kind === "refused");
  const detail = CONTRAST_EDGE_SIDES.map((side) =>
    sideLine(reading.sides.find((row) => row.side === side) ?? { side, kind: "skipped", reason: "not read" }),
  ).join(" · ");
  if (measured.length === 0) {
    const line = `CONTRAST-EDGE ${selector}: NO VERDICT (no side could be measured) — ${detail}`;
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
  // The WORST side is the verdict: 1.4.11 asks whether the boundary is distinguishable, and a border that
  // vanishes along one edge is not, whatever the other three measure.
  const worst = measured.reduce((lowest, row) => (row.ratio < lowest.ratio ? row : lowest));
  const passed = worst.ratio >= UI_COMPONENT_MIN_RATIO && refusedSides.length === 0;
  const tail = `(border · worst side ${worst.side} · need ${UI_COMPONENT_MIN_RATIO.toFixed(1)} · edge-sample) — ${detail}`;
  return {
    outcome: { line: `CONTRAST-EDGE ${selector}: ${worst.ratio.toFixed(2)}:1  ${passed ? "PASS" : "FAIL"}  ${tail}`, failed: !passed },
    evidence: {
      ...base,
      status: "ok",
      sampled: measured.length,
      method: "edge-sample",
      ratio: worst.ratio,
      passed,
      foreground: worst.ink,
      backdrop: worst.neighbour,
      fillChannel: null,
      reason: refusedSides.length === 0 ? null : detail,
    },
  };
}
