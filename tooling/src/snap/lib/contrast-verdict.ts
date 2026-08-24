// The PURE half of `--contrast`: colour parsing, the alpha composite, and the three refusals — every
// state where a ratio would be a number rather than evidence. Split out of ops/contrast.ts when the
// #466 exemption pushed that file past the tooling size cap; the browser half (the in-page fact script,
// pixel sampling) stays in ops/. The WCAG math is the fleet-shared kernel (_shared/wcag.ts).
import type { Rgb } from "../../_shared/wcag.ts";
import { MEASURABLE_OPACITY_MIN, UI_COMPONENT_MIN_RATIO as SHARED_UI_COMPONENT_MIN_RATIO } from "../../_shared/wcag.ts";
import type { ContrastFacts, ContrastMeasured, ContrastOccluded, ContrastOffscreen } from "../contract/contrast.ts";
import type { ContrastOutcome } from "../contract/types.ts";

export const BOLD_WEIGHT = 700;

/** WCAG 1.4.11's non-text boundary — RE-EXPORTED from the fleet kernel (`_shared/wcag.ts`), which owns it
 *  since #624 gave design-audit the same inactive-control vocabulary. Kept as a named export here so snap's
 *  own consumers keep their import path; the VALUE has exactly one home. */
export const UI_COMPONENT_MIN_RATIO = SHARED_UI_COMPONENT_MIN_RATIO;

/** Roles whose contrast is a two-STATE signal (the track's on/off colors), NOT track-vs-page — measuring
 *  the latter is meaningless and produced the 1.71:1 Switch false-FAIL. */
const CONTROL_TRACK_ROLES = new Set(["switch", "slider", "progressbar", "scrollbar"]);

/** Below this accumulated ancestor opacity, composite the (dimmed) foreground over the backdrop before
 *  measuring. Just under 1 so sub-pixel float noise (0.999…) never triggers a pointless composite. */
export const FOREGROUND_OPACITY_EPS = 0.999;

// buildContrastScript's toRgbString ALWAYS emits this exact "rgb(r, g, b)" shape (it composites to a
// canvas pixel and reads the bytes back itself, sidestepping getComputedStyle's oklch() passthrough) —
// so this is the only shape parseRgbString ever needs to handle.
const RGB_STRING_RE = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/u;

export function parseRgbString(s: string): Rgb | null {
  const m = RGB_STRING_RE.exec(s);
  // Each group is `(\d+)`, so a match always carries three NON-EMPTY captures — presence is the
  // whole condition (the old truthiness also excluded a `""` this pattern cannot produce).
  if (m?.[1] === undefined || m[2] === undefined || m[3] === undefined) {
    return null;
  }
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

/** Alpha-composite a foreground rgb at `opacity` over the backdrop (source-over) — the visible color of
 *  a glyph painted inside an `opacity<1` group. opacity 1 is a no-op; opacity 0 is the pure backdrop. */
export function compositeForeground(fg: Rgb, bg: Rgb, opacity: number): Rgb {
  const mix = (f: number, b: number): number => Math.round(opacity * f + (1 - opacity) * b);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

/** A verdict is refused, not guessed, when the pixels measured would not be the target's (#211): the two
 *  retracted P0s of 2026-08-16 were verdicts on a node scrolled out of the transcript, and #211's were
 *  verdicts on the topbar painted over the target. */
export function refuseContrastVerdict(selector: string, facts: ContrastOffscreen | ContrastOccluded): ContrastOutcome {
  if ("offscreen" in facts) {
    return {
      line: `CONTRAST ${selector}: OFF-SCREEN  ${facts.total} match(es), none rendered in the viewport — NO VERDICT (scroll it into view, or target the visible match)`,
      failed: true,
    };
  }
  const by = facts.occluder === null ? "" : `, behind ${facts.occluder}`;
  return {
    line: `CONTRAST ${selector}: OCCLUDED  ${facts.inViewport} in-viewport match(es) of ${facts.total}, all painted over${by} — NO VERDICT (measuring one samples the occluder's pixels; scroll it clear, dismiss the chrome, or target the visible match)`,
    failed: true,
  };
}

export function isContrastMeasured(facts: NonNullable<ContrastFacts>): facts is ContrastMeasured {
  return !("offscreen" in facts || "occluded" in facts);
}

/** The three states where a ratio would be a number rather than evidence. Each SKIPS out loud with its
 *  reason — a wrong verdict trains reviewers to ignore the instrument, which costs more than silence. */
export function contrastExemption(selector: string, facts: ContrastMeasured): ContrastOutcome | null {
  // WCAG contrast criteria exempt inactive controls, and their dimming is deliberate.
  if (facts.inactive) {
    return { line: `CONTRAST ${selector}: SKIPPED  inactive control (WCAG contrast exemption)`, failed: false };
  }
  // Control-track roles: text-vs-page contrast is meaningless here — the two STATES are the signal, and
  // WCAG 1.4.11 governs the state boundary (a separate measurement). Skipping beats the bogus 1.71:1
  // text-math FAIL reviewers had to learn to ignore.
  if (CONTROL_TRACK_ROLES.has(facts.role)) {
    return {
      line: `CONTRAST ${selector}: SKIPPED  ${facts.role} track — two-state control; text-vs-page contrast N/A (WCAG 1.4.11 boundary unmeasured here)`,
      failed: false,
    };
  }
  // Below the measurable-opacity floor (#466) the composite IS the backdrop whatever the authored colour
  // is, so any ratio is arithmetic rather than evidence — it can only come out ~1.00:1. A verdict that
  // cannot come out any other way is not a measurement, and the remedy a reviewer needs to hear is the
  // opacity, never the colour. (Measured: design-audit filed exactly this shape as two P1s at α0.00 on a
  // home run caught mid boot-animation.)
  if (facts.foregroundOpacity < MEASURABLE_OPACITY_MIN) {
    return {
      line: `CONTRAST ${selector}: SKIPPED  effectively invisible (α${facts.foregroundOpacity.toFixed(2)}) — nothing is painted to measure; if this is not a mid-animation frame, the defect is the opacity, not the colour`,
      failed: false,
    };
  }
  return null;
}
