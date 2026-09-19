// The TYPE-HIERARCHY INVERSION lens (`caveat-outweighed`, #652) — a bounding alert sentence set smaller
// than the thing it bounds. Pure. Split out of checks-typography.ts (#1027) for the reason
// checks-font-census.ts was split out before it: everything left there judges ONE text element against a
// ramp floor, while this rule is a CROSS-SAMPLE fold that reads the whole family to find a same-block
// partner — a different subject, its own population, and a doc block that dominated the host file.
// Provenance/attribution: lib/collect.ts header.
import type { CandidateDisposition, Finding } from "../contract/findings.ts";
import type { TextStyleInput } from "../contract/samples.ts";

// ── TYPE-HIERARCHY INVERSION: a caveat outweighed by what it bounds (#652) ───────────────────────────
//
// THE DEFECT. On the plugin consent screen the raw egress hostnames rendered at 15px, regular weight,
// full foreground — the loudest thing on the surface — while *"These exact hostnames, and nothing else."*,
// the sentence that makes the list an EXHAUSTIVE guarantee and therefore the whole reason it can be
// trusted, rendered at 10.5px muted: the smallest text on the screen. Verified preset-invariant across
// four appearance arms, so it is a range property, not a point measurement. The same file carried a
// second instance — "This plugin asks for N permissions this version of Orbweaver doesn't recognise" at
// 10.5px with no destructive treatment. The class is not cosmetic: a sentence whose whole job is to BOUND
// what the loud thing beside it means, set smaller than the thing it bounds, inverts the reading order of
// a security argument.
//
// WHY THIS IS NOT `flat-type-hierarchy`. That rule asks whether a PAGE has enough distinct steps. This
// one asks whether the steps are assigned to the right content — a page can have a perfect ramp and still
// hand its loudest step to a machine readout and its quietest to the guarantee.
//
// THE HARD PART, STATED HONESTLY. Semantic importance is NOT computable from the DOM, and plenty of good
// design renders a datum larger than its label. A rule that fires on every label/value pair is a wall,
// and a wall trains readers to skip the output (#644). So this rule never guesses: it reads the app's OWN
// AUTHORED CLAIMS about intent, and fires only where the author has said, in the markup, that the small
// thing is a bounding statement.
//
// THE FRAMING WAS CHOSEN BY MEASUREMENT, NOT BY TASTE. The issue offered two candidate anchors — the
// app's own `voice` axis, or the platform's ARIA roles. The voice arm was BUILT FIRST and REFUSED on its
// band: anchored on `data-voice="gloss"` it fired 21 times across 18 live surfaces (8 on
// config:connections alone, 6 on the chat context tab), and reading them showed why — a gloss sentence
// under a heading, an accordion trigger, or a `stat-figure-value` is the RATIFIED caption pattern, not an
// inversion. A caption under a big number is what a caption is for. That rule was a wall, and a wall
// trains readers to skip the output (#644), so the anchor was narrowed to the one authored claim that
// admits no such reading.
//
// THE ANCHOR IS THE ALERT ROLE. `role=alert|alertdialog|status` is the author saying, in the markup, "this
// sentence bounds what you are about to do". Nothing in a sane design renders an ALERT as the quietest
// text in its own block while a neighbour shouts — the caption defence does not apply, because an alert
// is not a caption. That is what makes this rule narrow enough to be worth reading.
//
// THE FOUR CONDITIONS, each a narrowing rather than a heuristic:
//   1. ANCHOR — the node is inside `role=alert|alertdialog|status`.
//   2. SENTENCE SHAPE — its own text is a full sentence (>= CAVEAT_MIN_CHARS, terminal punctuation), which
//      separates a bounding claim from a status fragment ("Saved", "3 of 8").
//   3. A LARGER PARTNER IN THE SAME BLOCK — a text node sharing an ancestor within four levels, at least
//      CAVEAT_STEP_RATIO larger. Same-block is the bound that stops this becoming "is anything on the page
//      bigger than this sentence".
//   4. THE PARTNER IS NEITHER A HEADING NOR A CHROME LABEL — a heading, `label`, `kicker`,
//      `interactiveKicker` or `credit` exists to NAME the thing beside it, and naming something larger
//      than the prose under it is the ratified pattern in every one of those cases.
//
// WHAT IT WILL NOT CATCH, deliberately and by construction — this list is the price of not being a wall:
//   • THE ROW'S OWN HEADLINE EXAMPLE. *"These exact hostnames, and nothing else."* carries no alert role:
//     it is an ordinary `gloss`, and the only thing separating it from a legitimate caption is that a
//     human knows it is a completeness GUARANTEE. That is not in the DOM. The second instance the row
//     names — the unrecognised-permissions sentence at `plugin-grant-list.tsx` — IS `role="alert"` and is
//     exactly what this rule fires on, which is why the class is still worth a rule.
//   • An inversion of COLOUR or WEIGHT at the same type step. This rule is size-anchored.
//   • A warning written with no role at all, at a call site that skipped both vocabularies.
//   • A partner more than four ancestor levels away.
//   • Anything outside this design system: the exclusions are bound to @orb/ui's voice axis on purpose.
/** Long enough to be a bounding SENTENCE rather than a qualifier fragment. */
const CAVEAT_MIN_CHARS = 28;
/** One ramp step, with room for rounding: micro 10.5 → label 13 is 1.238, body 15 is 1.43. */
const CAVEAT_STEP_RATIO = 1.15;
const SENTENCE_END_RE = /[.!?]["')\]]?$/u;
/** Voices whose JOB is to name the thing beside them — a label above its caption is the ratified pattern,
 *  not an inversion, and treating one as a "louder partner" fires on every settings row in the product. */
const CHROME_LABEL_VOICES: ReadonlySet<string> = new Set(["credit", "interactiveKicker", "kicker", "label"]);

/** Does this sample carry an AUTHORED claim that it bounds something? The `gloss` voice was tried here
 *  first and measured as a wall (21 findings / 18 surfaces — see the block comment); the alert role is
 *  the claim that survives, because an alert is never a caption. */
function isCaveatCarrier(input: TextStyleInput): boolean {
  return input.alertContext === true;
}

/** A bounding SENTENCE, not a qualifier fragment: length plus terminal punctuation on the element's OWN
 *  text. `directTextLen` is the length the walker measured; the shape test needs the text itself, which
 *  the sample family does not carry — so length is the proxy and the punctuation test rides `directText`
 *  when present. */
function isSentenceShaped(input: TextStyleInput): boolean {
  return input.directTextLen >= CAVEAT_MIN_CHARS && SENTENCE_END_RE.test(input.directText ?? "");
}

/** Two samples sit in one block when their ancestor-id paths intersect (four levels each, from the
 *  walker). Absent paths decline — comparing globally is the false-positive machine. */
function sharesBlock(a: TextStyleInput, b: TextStyleInput): boolean {
  const left = a.blockPath;
  const right = b.blockPath;
  if (left === undefined || right === undefined || left.length === 0 || right.length === 0) {
    return false;
  }
  const seen = new Set(left);
  return right.some((id) => seen.has(id));
}

/** The loudest same-block partner that outweighs this caveat, or null. */
function outweighingPartner(caveat: TextStyleInput, all: readonly TextStyleInput[]): TextStyleInput | null {
  let loudest: TextStyleInput | null = null;
  for (const other of all) {
    if (other === caveat || other.srOnly || other.codeContext || other.directTextLen === 0) {
      continue;
    }
    if (other.isHeading || CHROME_LABEL_VOICES.has(other.voice ?? "") || other.fontSizePx < caveat.fontSizePx * CAVEAT_STEP_RATIO) {
      continue;
    }
    if (sharesBlock(caveat, other) && (loudest === null || other.fontSizePx > loudest.fontSizePx)) {
      loudest = other;
    }
  }
  return loudest;
}

/** The verdict for one carrier against its loudest same-block partner; `null` partner is a clean pass. */
function caveatFinding(input: TextStyleInput, partner: TextStyleInput | null): Finding | null {
  if (partner === null) {
    return null;
  }
  return {
    rule: "caveat-outweighed",
    severity: "P2",
    selector: input.selector,
    value: `${input.fontSizePx}px alert under a ${partner.fontSizePx}px sibling`,
    message: `this alert sentence BOUNDS what ${partner.selector} means, and renders ${(partner.fontSizePx / input.fontSizePx).toFixed(2)}× smaller than it — the warning whispers while the thing it qualifies shouts; lift the alert a step (the \`prose\` modifier does exactly this) or quiet its partner`,
    origin: "orbweaver",
  };
}

/** The type-hierarchy-inversion lens (#652) — see the block comment above for the framing and its
 *  declared blind spots. A cross-sample fold, so it takes the whole family rather than one input. */
export function checkCaveatHierarchy(inputs: readonly TextStyleInput[]): Finding[] {
  const classify = classifyCaveatHierarchy(inputs);
  const findings: Finding[] = [];
  for (const input of inputs) {
    const disposition = classify(input);
    if (disposition.kind === "judged" && disposition.finding !== null) {
      findings.push(disposition.finding);
    }
  }
  return findings;
}

/** `caveat-outweighed`'s disposition. The census is EVERY text sample on the surface, and the rule's
 *  four narrowings (see the block comment above) are what make it narrow enough to read — but before
 *  this partition existed, "no alert sentence on this surface" and "no inversion among the alerts"
 *  printed identically, which is the exact false-clean the #987 apparatus exists to end. The three
 *  anchors are closed EXCLUSIONS: clipped text paints no pixels, a code/geometry glyph run is not
 *  governed by the ramp, and a sample carrying no authored bounding claim is outside this rule's
 *  population by the measurement that refused the `gloss` anchor as a wall. Having no outweighing
 *  partner is the rule ANSWERING "no" — a judged pass. */
export function classifyCaveatHierarchy(inputs: readonly TextStyleInput[]): (input: TextStyleInput) => CandidateDisposition {
  return (input: TextStyleInput): CandidateDisposition => {
    if (input.srOnly) {
      return { kind: "excluded", reason: "srOnly" };
    }
    if (input.codeContext) {
      return { kind: "excluded", reason: "codeContext" };
    }
    if (!isCaveatCarrier(input)) {
      return { kind: "excluded", reason: "noAuthoredCaveatClaim" };
    }
    if (!isSentenceShaped(input)) {
      return { kind: "excluded", reason: "notSentenceShaped" };
    }
    return { kind: "judged", finding: caveatFinding(input, outweighingPartner(input, inputs)) };
  };
}
