// Contrast + text-over-art + gray-on-color + the ON/OFF weight ORDERING — WCAG 2.x math over resolved
// backdrops. Pure; every threshold cited. Provenance/attribution: lib/collect.ts header.

import type { InactiveKind, Rgb } from "@orb/tooling/_shared/wcag";
import {
  compositeForeground,
  contrastRatio,
  FOREGROUND_OPACITY_EPS,
  INACTIVE_ADVISORY_MAX_RATIO,
  isContrastExempt,
  isLargeText,
  LARGE_MIN_RATIO,
  MEASURABLE_OPACITY_MIN,
  NORMAL_MIN_RATIO,
  relativeLuminance,
  remainsOperable,
  rgbChroma,
} from "@orb/tooling/_shared/wcag";
import type { Finding, PopulationAccounting, RulePopulationAccounting } from "../contract/findings.ts";
import type { DesignAuditRuleId } from "../contract/rules.ts";
import type { Backdrop, ContrastInput, QuietStateInput } from "../contract/samples.ts";
import { settledPopulationAccounting } from "./population.ts";
import { OPAQUE_STOP_MIN_ALPHA } from "./ramp.ts";

/** Why `aria-disabled` earns a sharper note than `:disabled`: it stays focusable and announced. */
const ARIA_OPERABLE_NOTE = " — and `aria-disabled` stays FOCUSABLE and announced, so a keyboard user can land on a control they cannot see";

function indeterminateFinding(selector: string, value: string, message: string): Finding {
  return { rule: "text-over-art", severity: "P1", selector, value, message, origin: "orbweaver" };
}

/** How ONE text sample was disposed of by the reading-surface triple (contrast · text-over-art ·
 *  inactive-control-legibility). This is the triple's ONE branch home: `checkContrast` is a thin
 *  projection of it and `colorTextPopulations` reads the SAME value, so a decline can never be silent in
 *  one and counted in the other. Before #987 this function declined in five places by `return null` and
 *  published no denominator, so a clean colour family could equally mean "300 texts judged, all pass" or
 *  "300 censused, 280 declined" — on the rule the whole apparatus exists for. */
type ContrastOutcome =
  | { readonly kind: "dimmed" }
  | { readonly kind: "unresolvedBackdrop" }
  | { readonly kind: "maskedForeground" }
  | { readonly kind: "inactive"; readonly unmeasurable: "imageIndeterminate" | "translucentBackdrop" | null; readonly finding: Finding | null }
  | { readonly kind: "image"; readonly finding: Finding }
  | { readonly kind: "gradient"; readonly finding: Finding | null }
  | { readonly kind: "flat"; readonly finding: Finding | null };

/** Contrast + text-over-art legibility — same math over a different backdrop shape.
 *  `image-indeterminate`/failing `gradient` report as "text-over-art" (P0/P1); a failing flat
 *  background reports as "contrast" at P1. */
export function checkContrast(input: ContrastInput): Finding | null {
  const outcome = contrastOutcome(input);
  return outcome.kind === "dimmed" || outcome.kind === "unresolvedBackdrop" || outcome.kind === "maskedForeground" ? null : outcome.finding;
}

function contrastOutcome(input: ContrastInput): ContrastOutcome {
  // A MASKED FOREGROUND IS UNRESOLVED, NEVER FLAT (#1078, orb-ui audit F6). `mask-image`
  // (`.scroll-fade-x`/`.scroll-fade-y`) fades the PAINTED alpha toward transparent at a live scroll
  // offset — `color`/`foregroundOpacity` still report the full-strength authored value, so resolving
  // this sample as if it were opaque would be a fabricated ratio, and pixel-sampling it would measure
  // whatever scroll position happened to be live when the walk ran, not a stable fact. WITHHELD, checked
  // before every other branch so a masked sample can never fall through to a flat/gradient/image verdict.
  if (input.foregroundMasked === true) {
    return { kind: "maskedForeground" };
  }
  const large = isLargeText(input.fontSizePx, input.fontWeight);
  const minRatio = large ? LARGE_MIN_RATIO : NORMAL_MIN_RATIO;
  const opacity = input.foregroundOpacity ?? 1;
  // Ancestor opacity dims the FOREGROUND: the glyph is a blend of `color` and whatever is behind it.
  // Measuring the authored color is a false PASS the eye can see through (issue #188 — two live lines
  // read 3.68:1 at α0.60 while this check reported nothing). The BACKDROP half needs no adjustment: the
  // walker resolves it from the ancestor chain, which is what shows through.
  // NO VERDICT below the measurable-opacity floor (#466): at that alpha the composite is the backdrop
  // whatever the authored color is, so the ratio is arithmetic, not evidence. Measured live: a home run
  // caught mid boot-animation filed two P1s reading `1.00:1 · dimmed α0.00` against the weave veil and
  // the brand wordmark — text that paints nothing at that instant. `isVisible` already drops EXACTLY
  // zero; this closes the mid-fade window it cannot see.
  if (opacity < MEASURABLE_OPACITY_MIN) {
    return { kind: "dimmed" };
  }
  const dimmed = opacity < FOREGROUND_OPACITY_EPS;
  const dimNote = dimmed ? ` · dimmed α${opacity.toFixed(2)}` : "";
  const dimmedMessage = dimmed
    ? ` — the glyphs are painted at ${opacity.toFixed(2)} opacity by an ancestor group, so what the eye reads is the composite, not the authored color`
    : "";
  const seenColor = (over: Rgb): Rgb => (dimmed ? compositeForeground(input.color, over, opacity) : input.color);

  // NO VERDICT (issue #218): the runner either pixel-samples this into a `flat` sample before we run, or
  // refuses it out loud in its own report. A ratio against `fallback` is exactly the fiction that put 28
  // false P1s on one transcript, and "text over an art layer" is not a defect claim either — the pixels
  // may be perfectly legible.
  const backdrop = input.backdrop;
  if (backdrop.kind === "unresolved") {
    return { kind: "unresolvedBackdrop" };
  }

  if (isContrastExempt(input.inactive ?? "none")) {
    return inactiveOutcome(input, backdrop, seenColor, dimNote);
  }

  if (backdrop.kind === "image-indeterminate") {
    return {
      kind: "image",
      finding: indeterminateFinding(
        input.selector,
        "backdrop is a background-image — contrast indeterminate",
        "text sits over an image with no flat/gradient color to check against — verify legibility manually (the #1 defect class: text bled unreadable over a picture)",
      ),
    };
  }

  if (backdrop.kind === "gradient") {
    const translucent = backdrop.stops.some((stop) => (stop.a ?? 1) < OPAQUE_STOP_MIN_ALPHA);
    if (translucent) {
      return {
        kind: "gradient",
        finding: indeterminateFinding(
          input.selector,
          "gradient backdrop has translucent stops — contrast indeterminate",
          "text sits over a gradient with translucent color stops — what composites underneath is unknown, so a worst-stop ratio would be a fake number; verify legibility manually",
        ),
      };
    }
    const ratios = backdrop.stops.map((stop) => contrastRatio(seenColor(stop), stop));
    const worst = Math.min(...ratios);
    if (worst < minRatio) {
      return {
        kind: "gradient",
        finding: {
          rule: "text-over-art",
          severity: "P0",
          selector: input.selector,
          value: `${worst.toFixed(2)}:1 worst-stop (need ${minRatio}:1)${dimNote}`,
          message: "text over a gradient backdrop fails contrast against at least one color stop — the 'text bled unreadable over the picture' defect",
          origin: "orbweaver",
        },
      };
    }
    return { kind: "gradient", finding: null };
  }

  return {
    kind: "flat",
    finding: flatBackdropFinding({ input, ratio: contrastRatio(seenColor(backdrop.color), backdrop.color), minRatio, large, dimNote, dimmedMessage }),
  };
}

/** The inactive arm. `unresolved` cannot reach here — `contrastOutcome` returns it above — so the
 *  parameter is the RESOLVED backdrop and the two remaining declines are named rather than silent:
 *  an image layer and a translucent stop each leave the advisory's ratio unmeasurable, which is a
 *  WITHHELD judgment for `inactive-control-legibility` (not an exclusion — the rule does apply here). */
function inactiveOutcome(
  input: ContrastInput,
  backdrop: Exclude<Backdrop, { readonly kind: "unresolved" }>,
  seenColor: (over: Rgb) => Rgb,
  dimNote: string,
): ContrastOutcome {
  if (backdrop.kind === "image-indeterminate") {
    return { kind: "inactive", unmeasurable: "imageIndeterminate", finding: null };
  }
  const backdrops = backdrop.kind === "flat" ? [backdrop.color] : backdrop.stops;
  if (backdrops.some((stop) => (stop.a ?? 1) < OPAQUE_STOP_MIN_ALPHA)) {
    return { kind: "inactive", unmeasurable: "translucentBackdrop", finding: null };
  }
  const worst = Math.min(...backdrops.map((over) => contrastRatio(seenColor(over), over)));
  return { kind: "inactive", unmeasurable: null, finding: inactiveAdvisory(input.selector, worst, input.inactive ?? "none", dimNote) };
}

interface FlatVerdict {
  readonly input: ContrastInput;
  readonly ratio: number;
  readonly minRatio: number;
  readonly large: boolean;
  readonly dimNote: string;
  readonly dimmedMessage: string;
}

/** The flat-background verdict; inactive controls were handled before every backdrop-specific verdict. */
function flatBackdropFinding(v: FlatVerdict): Finding | null {
  if (v.ratio >= v.minRatio) {
    return null;
  }
  // #624 — WCAG 1.4.3 EXEMPTS inactive user interface components, and `snap --contrast` has always honoured
  // that. This checker did not, so on the SAME element snap said `SKIPPED inactive control (WCAG contrast
  // exemption)` while design-audit filed a P1 at 2.64:1 — making every disabled control in the app a
  // standing false positive, which is how a reader learns to discount the tool's P1s wholesale.
  return {
    rule: "contrast",
    severity: "P1",
    selector: v.input.selector,
    value: `${v.ratio.toFixed(2)}:1 (need ${v.minRatio}:1)${v.dimNote}`,
    message: `text/background contrast is ${v.ratio.toFixed(2)}:1, below WCAG AA's ${v.minRatio}:1 floor for ${v.large ? "large" : "normal"} text${v.dimmedMessage}`,
    origin: "orbweaver",
  };
}

/** The nuance the exemption must NOT swallow: a dim disabled control is no longer a WCAG VIOLATION, but it
 *  is still a usability problem when the dimming is the only signal that the control exists at all. So the
 *  P1 contrast CLAIM is dropped and an advisory takes its place — but only below WCAG 1.4.11's own
 *  UI-component boundary (a CITED floor, not an invented one), so ordinary disabled styling stays silent
 *  instead of trading one wall of false P1s for a wall of false P3s.
 *
 *  `aria-disabled` is deliberately called out separately: unlike `:disabled` and `[inert]` it remains
 *  FOCUSABLE and ANNOUNCED, so a keyboard user can land on a control they cannot see. */
function inactiveAdvisory(selector: string, ratio: number, kind: InactiveKind, dimNote: string): Finding | null {
  if (ratio >= INACTIVE_ADVISORY_MAX_RATIO) {
    return null;
  }
  const operableNote = remainsOperable(kind) ? ARIA_OPERABLE_NOTE : "";
  return {
    rule: "inactive-control-legibility",
    severity: "P3",
    selector,
    value: `${ratio.toFixed(2)}:1 (${kind}-disabled; WCAG contrast exempt)${dimNote}`,
    message:
      `an INACTIVE control's text is ${ratio.toFixed(2)}:1 — NOT a WCAG AA violation (1.4.3 exempts inactive ` +
      "components, which is why snap --contrast skips it), but it is below the 1.4.11 UI-component boundary " +
      `of ${INACTIVE_ADVISORY_MAX_RATIO}:1, so the control may not read as present at all${operableNote}`,
    origin: "orbweaver",
  };
}

// ── Gray text on a colored background (impeccable `gray-on-color`) ───────────
// Achromatic mid-luminance text over a chromatic backdrop reads washed out — the fix is a
// darker shade of the background's own hue (or a transparency of the text color), never gray.
const GRAY_TEXT_MAX_CHROMA = 20;

const COLORED_BG_MIN_CHROMA = 40;

const GRAY_TEXT_MIN_LUM = 0.05;

const GRAY_TEXT_MAX_LUM = 0.85;

/** `gray-on-color`'s own disposition — same ONE-branch-home posture as ContrastOutcome. Its three declines
 *  are NOT the same fact, and the source comment below reads as if they were ("same NO-VERDICT posture"):
 *  only `unresolved` is a MISSING measurement (the walker knows it cannot know, and there may well be an
 *  authored flat colour it failed to reach — WITHHELD). An IMAGE backdrop and a PIXEL-SAMPLED one are both
 *  positive measurements that PROVE this rule inapplicable — it asks about an authored background COLOUR
 *  and neither of those is one — so they are EXCLUDED. Filing them as withholdings would put every surface
 *  carrying a single picture into permanent NO VERDICT over a rule that structurally cannot apply there. */
type GrayOutcome =
  | { readonly kind: "withheld"; readonly reason: "unresolvedBackdrop" }
  | { readonly kind: "excluded"; readonly reason: "imageBackdrop" | "pixelSampled" }
  | { readonly kind: "judged"; readonly finding: Finding | null };

export function checkGrayOnColor(input: ContrastInput): Finding | null {
  const outcome = grayOnColorOutcome(input);
  return outcome.kind === "judged" ? outcome.finding : null;
}

function grayOnColorOutcome(input: ContrastInput): GrayOutcome {
  // Same NO-VERDICT posture as checkContrast: "gray on a chromatic surface" is a claim about a backdrop
  // color, and an unresolved backdrop has none the walker may assert.
  if (input.backdrop.kind === "image-indeterminate") {
    return { kind: "excluded", reason: "imageBackdrop" };
  }
  if (input.backdrop.kind === "unresolved") {
    return { kind: "withheld", reason: "unresolvedBackdrop" };
  }
  // A PIXEL-SAMPLED backdrop answers LUMINANCE, not authorship. This rule's whole remedy — "use a darker
  // shade of the background's own hue" — presumes an authored background color; run against the median of
  // a WALLPAPER PHOTO it minted five P2s about a photograph (measured on the chats surface, issue #218).
  // Contrast still judges those samples: a ratio is exactly what pixels can prove.
  if (input.backdropMethod === "pixel-sample") {
    return { kind: "excluded", reason: "pixelSampled" };
  }
  const textLum = relativeLuminance(input.color);
  const isGray = rgbChroma(input.color) < GRAY_TEXT_MAX_CHROMA && textLum > GRAY_TEXT_MIN_LUM && textLum < GRAY_TEXT_MAX_LUM;
  const stops = input.backdrop.kind === "flat" ? [input.backdrop.color] : input.backdrop.stops;
  // A chromatic text color or a non-chromatic backdrop is a JUDGED PASS, not an exclusion: those are the
  // facts the rule asks for and the answer is "no defect", exactly like a 7:1 contrast ratio.
  if (!isGray || stops.length === 0 || !stops.every((s) => rgbChroma(s) >= COLORED_BG_MIN_CHROMA && (s.a ?? 1) >= OPAQUE_STOP_MIN_ALPHA)) {
    return { kind: "judged", finding: null };
  }
  return {
    kind: "judged",
    finding: {
      rule: "gray-on-color",
      severity: "P2",
      selector: input.selector,
      value: `gray text (chroma<${GRAY_TEXT_MAX_CHROMA}) on chromatic bg (chroma≥${COLORED_BG_MIN_CHROMA})`,
      message:
        "gray text on a colored background looks washed out — use a darker shade of the background's own hue or a transparency of the text color, not neutral gray",
      origin: "impeccable",
    },
  };
}

// ── The reading-surface DENOMINATOR (#987) ───────────────────────────────────
// The colour family is the rule this apparatus exists for, and it was the last one publishing no
// population receipt: `no-verdict=` on the RESULT line counts only the PIXEL SAMPLER's refusals
// (occluded / off-screen / no box, ops/run.ts), never the checker's own declines. So a clean colour
// family could equally mean "300 texts judged, all pass" or "300 censused, 280 declined". These four
// rows close that: every text sample lands in exactly one bucket of exactly one reason, per rule.
//
// WITHHELD vs EXCLUDED here (the partition is per-RULE because the four rules ask different questions of
// the same sample): withheld = the rule APPLIES and the instrument could not judge it — a sub-measurable
// opacity (a glyph caught mid-fade paints nothing at that instant, so the ratio is arithmetic, not
// evidence) and an unresolved backdrop (the sampler refused it) leave the whole triple unjudged, and an
// image/translucent backdrop leaves the inactive advisory's ratio unmeasurable. Excluded = the measured
// facts PROVE the rule inapplicable: an inactive control is exempt from the AA minimum by WCAG 1.4.3, a
// flat backdrop is not art, an art backdrop is not the flat-contrast rule, an ACTIVE control is not the
// inactive advisory's subject, and an image or pixel-sampled backdrop is not an authored COLOUR, which is
// the only thing gray-on-color asks about.
//
// NOTE the one asymmetry a reader will look for: an `image-indeterminate` backdrop is NOT withheld from
// `text-over-art`. That path EMITS a P1 saying so, out loud, in the findings table — the instrument's
// inability is already the verdict, so counting it a second time as a missing judgment would both
// double-count it and turn every surface carrying one picture into a NO VERDICT run.
interface RuleTally {
  judged: number;
  affected: number;
  readonly withheld: Record<string, number>;
  readonly excluded: Record<string, number>;
}

function newTally(): RuleTally {
  return { judged: 0, affected: 0, withheld: {}, excluded: {} };
}

function count(reasons: Record<string, number>, reason: string): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

/** One judged candidate; `affected` counts the ones that produced a finding. */
function judge(tally: RuleTally, finding: Finding | null): void {
  tally.judged += 1;
  if (finding !== null) {
    tally.affected += 1;
  }
}

/** Every colour text rule emits one finding per affected sample — no grouping, no cap — so populations
 *  and emitted are `affected`. settledPopulationAccounting throws if the arithmetic does not close. */
function tallyRow(rule: DesignAuditRuleId, tally: RuleTally, candidates: number): RulePopulationAccounting {
  return settledPopulationAccounting(rule, {
    candidates,
    judged: tally.judged,
    affected: tally.affected,
    populations: tally.affected,
    emitted: tally.affected,
    withheld: tally.withheld,
    excluded: tally.excluded,
    collapsed: {},
  });
}

/** The three rules `checkContrast` can answer with, tallied from its ONE outcome so the buckets cannot
 *  drift from the branch that produced them. */
interface ReadingSurfaceTallies {
  readonly contrast: RuleTally;
  readonly overArt: RuleTally;
  readonly inactive: RuleTally;
}

function tallyReadingSurface(tallies: ReadingSurfaceTallies, outcome: ContrastOutcome): void {
  const { contrast, overArt, inactive } = tallies;
  switch (outcome.kind) {
    case "dimmed":
    case "unresolvedBackdrop":
    case "maskedForeground": {
      for (const tally of [contrast, overArt, inactive]) {
        count(tally.withheld, outcome.kind);
      }
      return;
    }
    case "inactive": {
      count(contrast.excluded, "inactiveExempt");
      count(overArt.excluded, "inactiveExempt");
      if (outcome.unmeasurable === null) {
        judge(inactive, outcome.finding);
        return;
      }
      count(inactive.withheld, outcome.unmeasurable);
      return;
    }
    case "image":
    case "gradient": {
      count(contrast.excluded, outcome.kind === "image" ? "imageBackdrop" : "gradientBackdrop");
      judge(overArt, outcome.finding);
      count(inactive.excluded, "activeControl");
      return;
    }
    case "flat": {
      judge(contrast, outcome.finding);
      count(overArt.excluded, "flatBackdrop");
      count(inactive.excluded, "activeControl");
      return;
    }
  }
}

/** The four text-sample colour rules' population accounting. Pure re-classification of the SAME sample
 *  list the collector judges: it changes no emission, it publishes the denominator behind one. */
export function colorTextPopulations(texts: readonly ContrastInput[]): PopulationAccounting {
  const tallies: ReadingSurfaceTallies = { contrast: newTally(), overArt: newTally(), inactive: newTally() };
  const { contrast, overArt, inactive } = tallies;
  const gray = newTally();
  for (const input of texts) {
    tallyReadingSurface(tallies, contrastOutcome(input));
    const grayOutcome = grayOnColorOutcome(input);
    if (grayOutcome.kind === "judged") {
      judge(gray, grayOutcome.finding);
    } else {
      count(grayOutcome.kind === "withheld" ? gray.withheld : gray.excluded, grayOutcome.reason);
    }
  }
  return {
    contrast: tallyRow("contrast", contrast, texts.length),
    "gray-on-color": tallyRow("gray-on-color", gray, texts.length),
    "inactive-control-legibility": tallyRow("inactive-control-legibility", inactive, texts.length),
    "text-over-art": tallyRow("text-over-art", overArt, texts.length),
  };
}

/** The OFF state may sit at most this far ABOVE the ON state before the ranking is backwards. Not zero:
 *  a hair of difference is palette noise, and the defect the config surface showed was 17.61:1 OFF
 *  against 7.65:1 ON — a 9.96 inversion, not a rounding one. */
const QUIET_MAX_INVERSION = 1.5;

/** THE QUIET STATE MUST BE THE QUIET ONE (#978). "17.61:1 OFF vs 7.65:1 ON is backwards" — the loudest
 *  object on the surface was a switch that was turned OFF, so the eye is pulled to the thing that is not
 *  happening.
 *
 *  An ORDERING check, not a threshold: neither contrast value is wrong on its own, and no per-element
 *  rule can express it. The pair comes from Base UI's own `data-checked` / `data-unchecked`, so it is the
 *  author's claim about which state is which, and the walker emits the sample only when BOTH sides were
 *  measurable — a one-sided read is silence rather than a fabricated comparison. */
export function checkQuietState(input: QuietStateInput): Finding | null {
  if (input.offContrast - input.onContrast <= QUIET_MAX_INVERSION) {
    return null;
  }
  return {
    rule: "quiet-state",
    severity: "P2",
    selector: input.selector,
    value: `OFF ${String(input.offContrast)}:1 vs ON ${String(input.onContrast)}:1`,
    message:
      "the OFF state is louder than the ON state, so the eye is pulled to the thing that is NOT happening and a pane of switches reads as noise. Invert the weights: OFF is a muted track against the page, ON carries the accent",
    origin: "orbweaver",
  };
}
