// The PURE half of `--contrast`: colour parsing, the alpha composite, and the three refusals — every
// state where a ratio would be a number rather than evidence. Split out of ops/contrast.ts when the
// #466 exemption pushed that file past the tooling size cap; the browser half (the in-page fact script,
// pixel sampling) stays in ops/. The WCAG math is the fleet-shared kernel (_shared/wcag.ts).
import type { Rgb } from "../../_shared/wcag.ts";
import { MEASURABLE_OPACITY_MIN, UI_COMPONENT_MIN_RATIO as SHARED_UI_COMPONENT_MIN_RATIO } from "../../_shared/wcag.ts";
import type { ContrastEvidence, ContrastFacts, ContrastMeasured, ContrastOccluded, ContrastOffscreen, ContrastOutcome } from "../contract/contrast.ts";

export const BOLD_WEIGHT = 700;

/** The tags whose EMPTINESS is a contrast fact (#2429 item 2): a field with a value paints that value, a
 *  field without one paints its placeholder, and a field with neither paints no ink at all. The in-page
 *  script spells the same pair inline — it is a raw string evaluated in the browser and cannot import —
 *  so this constant is the Node-side half, not a second home for the rule. */
export const FIELD_TAGS: ReadonlySet<string> = new Set(["INPUT", "TEXTAREA"]);

/** WCAG 1.4.11's non-text boundary — RE-EXPORTED from the fleet kernel (`_shared/wcag.ts`), which owns it
 *  since #624 gave design-audit the same inactive-control vocabulary. Kept as a named export here so snap's
 *  own consumers keep their import path; the VALUE has exactly one home. */
export const UI_COMPONENT_MIN_RATIO = SHARED_UI_COMPONENT_MIN_RATIO;

/** Roles whose contrast is a two-STATE signal (the track's on/off colors), NOT track-vs-page — measuring
 *  the latter is meaningless and produced the 1.71:1 Switch false-FAIL. */
const CONTROL_TRACK_ROLES = new Set(["switch", "slider", "progressbar", "scrollbar"]);

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

/** The evidence row for every outcome that produced NO ratio — a refusal, an exemption, an instrument
 *  error. Pure, so it lives here rather than in the op: it is the shape's null state, and the two ops that
 *  mint it (ink and fill) must not spell it twice. */
export function terminalEvidence(
  selector: string,
  status: ContrastEvidence["status"],
  reason: string,
  facts?: { readonly total: number; readonly inViewport?: number; readonly matchIndex?: number },
): ContrastEvidence {
  return {
    selector,
    status,
    candidates: facts === undefined ? 0 : facts.total,
    inViewport: facts === undefined ? 0 : (facts.inViewport ?? 0),
    sampled: 0,
    matchIndex: facts?.matchIndex ?? null,
    method: null,
    ratio: null,
    requiredRatio: null,
    passed: null,
    foreground: null,
    backdrop: null,
    fillChannel: null,
    reason,
  };
}

/** IS THIS SUBJECT'S FOREGROUND ITS FILL RATHER THAN ITS INK (#1111)? A subject with no text and no `<svg>`
 *  paints only its own box: `getComputedStyle().color` there is an INHERITED value nothing on screen uses,
 *  and measuring it produced the defect — `[data-slot=switch-thumb]` read the same 16.26:1 before and after
 *  its fill changed, and both side-eye reports quoted it as the OFF-state loudness. Such a subject goes to
 *  the FILL arm (ops/contrast-fill.ts), which measures the pixels instead. Note the ORDER at the call site:
 *  the exemptions (inactive / control-track / below the opacity floor) are decided FIRST and unchanged —
 *  the fill arm re-answers WHICH foreground to measure, never WHETHER a subject is exempt.
 *
 *  AN EMPTY FIELD WITH A PLACEHOLDER IS NOT ONE OF THEM (#2429 item 2). It renders no `textContent` and
 *  carries no `<svg>`, so this predicate used to hand the composer to the fill arm — which measured the
 *  textarea's fill against the band around it and never judged the one thing a person reads in an empty
 *  composer. The in-page script already resolves `color` to the ::placeholder colour there; `placeholderInk`
 *  says so, and such a subject goes to the INK arm at the TEXT threshold. */
export function isFillSubject(facts: ContrastMeasured): boolean {
  return !(facts.hasText || facts.hasIconInk || facts.placeholderInk);
}

/** Does this subject render TEXT — its own, or the placeholder an empty field paints (#2429 item 2)? The
 *  threshold split: text is WCAG 1.4.3 (4.5:1, or 3:1 when large), a textless subject is the 1.4.11
 *  ui-component boundary (3:1). Placeholder ink is text and takes the text threshold. */
export function rendersText(facts: ContrastMeasured): boolean {
  return facts.hasText || facts.placeholderInk;
}

/** What the printed line calls this subject. `placeholder-ink` is its own word rather than plain `text`
 *  because the reader has to know WHICH pixels carried the verdict: the field is empty, so the ratio is
 *  about the prompt a person reads before typing, not about anything they typed. */
export function contrastSubjectLabel(facts: ContrastMeasured): string {
  if (!rendersText(facts)) {
    return "ui-component";
  }
  return facts.placeholderInk ? "placeholder-ink" : "text";
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
