// Copy-surface quality: text overflow, TEXT TRUNCATED TO NOTHING (#816), repeated container text,
// clipped positioned children, edge-flush scroller cards, uncaught page errors, and the two
// PLACEMENT-COLLISION arms — a display headline overhanging an opaque card, and an `inline` element whose
// padding leaks off its line (#816 arms ii and iii; their walker is ops/walker/census-occlusion.ts). Pure.
// Provenance: lib/collect.ts header. Duplicate action doors (the runtime half of issue #252) moved to
// ./checks-duplicate-door.ts (#1720) once its allowance mechanism pushed this file over the size cap.
import type { Finding } from "../contract/findings.ts";
import { PAGE_SUBJECT_SELECTOR } from "../contract/findings.ts";
import type { ClippedOverflowInput, EdgeFlushInput, EmptyStateInput, RepeatedTextInput, TextOverflowInput, TruncatedTextInput } from "../contract/samples.ts";
import type { HeadlineOverhangInput, InlinePaddingLeakInput } from "../contract/samples-occlusion.ts";
import type { TierDriftInput } from "../contract/samples-populations.ts";

/** TWO LAYERS ON ONE SET OF PIXELS (#816 arm ii). The walker has already proven the whole shape — an
 *  opaque bordered card, a display-scale line whose CENTRE is outside it, an overlap of at most half the
 *  line's width, and both in the same paint layer — so this is a pass-through with the reader's message
 *  on it.
 *
 *  P2 and not P1: the headline usually still paints on top and stays readable, so nothing is lost the way
 *  `truncated-to-nothing` loses a label. It is the positioned arm of `clipped-overflow`'s class — a
 *  composition smell that says the placement was never composed — and it carries the same severity. */
export function checkHeadlineOverhang(input: HeadlineOverhangInput): Finding {
  return {
    rule: "headline-overhang",
    severity: "P2",
    selector: input.selector,
    value: `${input.overlapPx}px of ${input.widthPx}px overlaps ${input.cardSelector} ("${input.text}")`,
    message: `a ${input.fontSizePx}px display line sits mostly outside ${input.cardSelector} while its edge clips into it — the line and the card were placed onto the same pixels rather than composed, so the overlap moves with every width. Give the headline its own row, or let it start inside the card. VIEWPORT-BOUND: both rects are read at the scroll position of the walk, so this arm answers for the measured viewport only`,
    origin: "impeccable",
  };
}

/** PADDING THAT RESERVES NOTHING (#816 arm iii). `display: inline` does not grow its line for vertical
 *  padding, so an opaque inline fill with block-scale padding paints OUTSIDE its own line and lands on
 *  the lines above and below. Every other rule here is blind to it: the element's contrast, geometry and
 *  hit test are all correct, and the victim is whatever happens to be on the neighbouring lines.
 *
 *  P1, the `truncated-to-nothing` bar: an opaque box painted over adjacent copy destroys reading, and
 *  in our closed world the cause is a variant misapplication — a `tv()` slot handed a block's padding —
 *  which means the fix is one authored decision and the blast radius is every render of that slot. */
export function checkInlinePaddingLeak(input: InlinePaddingLeakInput): Finding {
  const onto = input.ontoSelector === "" ? "" : ` onto ${input.ontoSelector}`;
  return {
    rule: "inline-padding-leak",
    severity: "P1",
    selector: input.selector,
    value: `${input.paintedHeightPx}px painted over a ${input.lineHeightPx}px line (${input.paddingPx}px vertical padding)`,
    message: `this element is \`display: inline\` with an opaque background and ${input.paddingPx}px of vertical padding — inline padding reserves NO vertical space, so the fill paints ${input.paintedHeightPx}px past its own line${onto} instead of enclosing its text. Almost always a variant misapplication: a slot receiving padding authored for a block. Give it \`inline-block\`/\`inline-flex\` if the padded box is wanted, or take the block padding off the inline slot`,
    origin: "impeccable",
  };
}

/** TRUNCATED WITH NOTHING TO SHOW FOR IT (#825). The walker has already excluded every truncation that
 *  paints an ellipsis or carries the full value in a title/aria-label, so this finding is only ever about
 *  text the reader can neither read nor recover — the message names the three exits it has. */
export function checkTextOverflow(input: TextOverflowInput): Finding {
  return {
    rule: "text-overflow",
    severity: "P1",
    selector: input.selector,
    value: `${input.spillPx}px spill (${input.mode})`,
    message: `text overflows its ${input.mode === "block" ? "box" : "container"} by ${input.spillPx}px with no scroll affordance — wrap, truncate with a full-value affordance, or widen the container`,
    origin: "impeccable",
  };
}

/** TEXT ERASED, NOT SPILLED (#816). `text-overflow` says "more content than box"; this says "the box went
 *  to zero and the string is GONE" — a label that exists in the DOM, is read aloud by a screen reader, and
 *  is not on the screen at all. Measured live on the saved-casts picker at `--mobile`: a cast name at 0px
 *  rendered / 57px natural, beside an 11px twin, while the audit reported census 420 and zero findings.
 *
 *  P1 and not P2: on a phone this row could not say WHICH cast it was about. An identifying string the
 *  layout deleted is a broken surface, the same class as `clipped-overflow`'s in-flow arm. */
export function checkTruncatedText(input: TruncatedTextInput): Finding {
  return {
    rule: "truncated-to-nothing",
    severity: "P1",
    selector: input.selector,
    value: `${input.visiblePx}px of ${input.naturalPx}px shown ("${input.text}")`,
    message: `this text is laid out but painted at ~0px inside ${input.clipSelector} — it is in the DOM, in the accessibility tree, and invisible to the eye. A shrink-0 neighbour is taking the row's width: let the text keep a floor (flex-1 + min-w-0), let the row wrap, or move the neighbour to its own line`,
    origin: "orbweaver",
  };
}

export function checkRepeatedText(input: RepeatedTextInput): Finding {
  return {
    rule: "repeated-container-text",
    severity: "P3",
    selector: input.containerSelector,
    value: `"${input.text}" ×${input.count} in ${input.distinctSigs} distinct spots`,
    message:
      "the same literal text rendered 3+ times at structurally different positions inside one card — usually a status wired into every slot of a template; say it once where it matters",
    origin: "impeccable",
  };
}

/** The measured spill, or the honest absence of one on the zero-size positioned fallback. */
function clipSpillValue(input: ClippedOverflowInput): string {
  const where = input.side === null ? "" : ` ${input.side} by ${input.spillPx}px`;
  return `clips ${input.childSelector}${where}`;
}

export function checkClippedOverflow(input: ClippedOverflowInput): Finding {
  // A cut CONTROL is broken pixels a first-timer reads as a rendering bug (#439: "Blank chat" painted
  // as "nk chat" with its icon gone), so the in-flow arm is a P1. The positioned arm stays P2 — an
  // escape-needing tooltip/menu is a composition smell, not a mangled control.
  if (input.flow === "in-flow") {
    return {
      rule: "clipped-overflow",
      severity: "P1",
      selector: input.selector,
      value: clipSpillValue(input),
      message:
        "an in-flow control is painted OUTSIDE its overflow-hidden/clip container and cut — the row is wider than the box it sits in (a nowrap justify-end row spills LEFT, which scrollWidth cannot see). Let the row wrap, let the controls share the width (flex-1 + min-w-0), or shorten the label at narrow container widths",
      origin: "impeccable",
    };
  }
  return {
    rule: "clipped-overflow",
    severity: "P2",
    selector: input.selector,
    value: clipSpillValue(input),
    message:
      "an overflow-hidden/clip container is cutting a positioned child that needs to escape (tooltip/menu/badge) — portal it, use position:fixed, or let the overflow be visible (skill §3)",
    origin: "impeccable",
  };
}

export function checkEdgeFlush(input: EdgeFlushInput): Finding {
  return {
    rule: "edge-flush-cards",
    severity: "P3",
    selector: input.scrollerSelector,
    value: `${input.count} card(s) flush ${input.edge} (${input.gapPx}px gap, e.g. ${input.cardSelector})`,
    message:
      "cards sit flush against one scroller edge at rest while keeping a gutter on the other — the panel is sized wider than its clip box; keep a consistent inset on both sides",
    origin: "impeccable",
  };
}

// ── Uncaught page errors (impeccable `script-error`; runner-side capture) ─────
const SCRIPT_ERROR_MAX = 3;

const SCRIPT_ERROR_MSG_MAX = 160;

export function checkScriptErrors(pageErrors: readonly string[]): Finding[] {
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const raw of pageErrors) {
    const message = (raw.split(/\r?\n/u)[0] ?? "").trim().slice(0, SCRIPT_ERROR_MSG_MAX);
    if (message === "" || seen.has(message)) {
      continue;
    }
    seen.add(message);
    if (findings.length >= SCRIPT_ERROR_MAX) {
      break;
    }
    findings.push({
      rule: "script-error",
      severity: "P0",
      selector: PAGE_SUBJECT_SELECTOR,
      value: message,
      message:
        "a script threw an uncaught exception while the page loaded — broken JS silently kills interactions and can blank whole surfaces; fix this before judging anything else",
      origin: "impeccable",
    });
  }
  return findings;
}

/** One empty state is a pane telling you what to do. Two at once is two panes telling you DIFFERENT
 *  things — the Extensions case, where the list said "install a plugin" while the content said "pick one
 *  on the left" and there was nothing on the left to pick. */
const EMPTY_MAX_SIMULTANEOUS = 1;

/** TWO PANES, TWO STORIES (#978). Structural rather than semantic: the app has exactly one empty-state
 *  primitive, so the count of simultaneously-rendered roots IS the shape, and `empty-state-action` says
 *  whether each offers a door out.
 *
 *  The `actionless` half is the second finding in the same sample — an empty state that eats a pane and
 *  offers no action is a dead end, and the config surface had three of them costing 129px of the list. */
export function checkDoubleEmptyState(input: EmptyStateInput): Finding | null {
  if (input.rendered <= EMPTY_MAX_SIMULTANEOUS && input.actionless === 0) {
    return null;
  }
  const crowded = input.rendered > EMPTY_MAX_SIMULTANEOUS;
  return {
    rule: "double-empty-state",
    severity: "P2",
    selector: input.selector,
    value: `${String(input.rendered)} empty state(s) rendered at once, ${String(input.actionless)} with no action`,
    message: crowded
      ? "more than one pane of this surface is empty at the same time, so the panes give separate — and often contradictory — guidance: one says how to create the first item while the other tells you to pick one from a list that has none. When the list is empty the content pane should mirror the list's guidance, not point at it"
      : "an empty state offers no action — a pane that says there is nothing here and gives no door out is a dead end; every empty state owes its primary action",
    origin: "orbweaver",
  };
}

/** SUB-PIXEL TOLERANCE, not a threshold — this rule invents no legal-vs-illegal boundary (the SOURCE-side
 *  gates already prove the AUTHORED value is a token; this only proves the RESOLVED pixel matches it).
 *  Precedent: lib/ramp.ts's `LEADING_FLOOR_EPSILON` (0.005 on a leading ratio, justified by Chrome's
 *  truncated `getComputedStyle` string). A rem→px conversion off the live root font-size introduces the
 *  same class of float noise, so 0.5px covers it with margin while staying far under any real drift (the
 *  ramp's steps are \>=4px apart). Leading is compared on the 0-2 RATIO scale the tokens author in
 *  (census-tier.ts already normalizes both sides), so it needs its own, proportionally larger floor. */
const TIER_DRIFT_EPSILON_PX = 0.5;
const TIER_DRIFT_EPSILON_RATIO = 0.02;

/** DID THE RESOLVED PIXEL MATCH THE TIER MAP (packages/ui/src/styles/tiers.css)? The walker has already
 *  proven both halves of the question — the SANCTIONED custom-property value the surface's declared tier
 *  carries for this slot, and the PAINTED computed-style value that actually reached the screen — so this
 *  is the one place either an inline style beating the unlayered tier rule, or a broken
 *  `--orb-tier-*` chain silently falling back to a utility default, becomes visible. Neither failure mode
 *  is reachable from a source-side scan: the AUTHORED value in both cases can be a perfectly legal token,
 *  and the divergence only exists at resolved-pixel time. */
export function checkTierDrift(input: TierDriftInput): Finding | null {
  const epsilon = input.unit === "ratio" ? TIER_DRIFT_EPSILON_RATIO : TIER_DRIFT_EPSILON_PX;
  if (Math.abs(input.sanctionedValue - input.paintedValue) <= epsilon) {
    return null;
  }
  return {
    rule: "tier-drift",
    severity: "P2",
    selector: input.selector,
    value: `${input.property} painted "${input.paintedRaw}" vs tier "${input.tier}"'s ${input.varName}="${input.sanctionedRaw}" on [data-slot=${input.slot}]`,
    message: `this slot declares tier="${input.tier}" but its resolved ${input.property} does not match the tier map's ${input.varName} — an inline style or an off-tier utility is beating the unlayered tier rule (tiers.css is deliberately unlayered so it always wins), or the custom-property chain is broken and the slot silently fell back to its tier-less default. Resolve the ${input.property} to the tier map, or add the opt-in that is meant to outrank it`,
    origin: "orbweaver",
  };
}
