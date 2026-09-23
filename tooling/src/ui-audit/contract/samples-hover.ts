// ui-audit sample shapes — the FORCED-STATE family (`hover-contrast`). Split from samples.ts because
// that file is at the tooling-size boundary, and because this family is the only one whose samples do
// NOT come out of the single COLLECT_SAMPLES_JS evaluation: a hover pair is unreadable from page JS
// (Chromium exposes no way for a page to force its own `:hover`), so ops/hover.ts drives
// `CSS.forcePseudoState` over CDP between two in-page passes. See that file's header for the bounded
// population argument and the measured cost. Since 2026-09-01 the same pass carries the SECOND state
// mechanism — Base UI `data-*` state attributes, forced IN PAGE (synchronous set/read/restore) — and
// the state-gated GLOW rows read while a subject is held; the
// candidate index space, the verify loop and this contract are shared by both mechanisms.
//
// WHY THE REST HALF RIDES ALONG. The rule is not "the hover pair fails WCAG" in isolation — it is "the
// hover pair fails WCAG *while the rest state passes*". An element that already fails at rest is owned
// by `contrast`, and filing it twice would make the hover row a duplicate of a row the reader already
// has. The check needs both states in one sample to make that call, so the census carries the rest
// facts it read at the same instant rather than trying to join against `RawSamples.texts` (whose rows
// are a DIFFERENT population — pixel-settled, aria-hidden-inclusive, and keyed only by selector).
import type { InactiveKind, Rgb } from "@orb/tooling/_shared/wcag";
// All three shapes come from the backdrop LEAF, never from samples.ts (the aggregator inline-imports
// THIS file's shapes, so importing the aggregator here was a no-circular red): the forced glow reads
// emit rows in the static glow census's OWN sample shapes so the checks stay unchanged.
import type { Backdrop, GlowShadowInput, RadialGlowInput } from "./backdrop.ts";
import type { RelationalCensusAccountingInput } from "./samples-populations.ts";

/** ONE text-bearing element measured in both states. `subjectSelector` names the element whose `:hover`
 *  was forced — usually the text's own element, but a `.card:hover .label` rule paints the LABEL while
 *  the CARD is the thing the pointer is over, and a finding that named only the label would send a
 *  reader looking for a hover rule that is not on it. */
export interface HoverContrastInput {
  readonly selector: string;
  readonly subjectSelector: string;
  /** Which state was forced. Absent/undefined = the `:hover` pseudo (the CDP mechanism); a string =
   *  the Base UI state ATTRIBUTE set on the subject (`data-highlighted`, …), with `stateAttrValue`
   *  carrying the exact-match value for the valued form (`[data-selected="true"]`, the cmdk shape) and
   *  null for bare presence. Optional so pre-2026-09-01 fixture bundles keep their hover reading. */
  readonly stateAttr?: string | null;
  readonly stateAttrValue?: string | null;
  readonly hoverColor: Rgb;
  readonly hoverBackdrop: Backdrop;
  readonly restColor: Rgb;
  readonly restBackdrop: Backdrop;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  /** Product of `opacity` over the element and its ancestors, read UNDER the forced state — a hover rule
   *  is perfectly capable of changing it, and the glyph the eye reads is the composite either way. */
  readonly foregroundOpacity: number;
  readonly inactive: InactiveKind;
  /** Does the PAINTED element's own computed `transition-property` name `color`, `background-color`, or
   *  `all` — and is the matching `transition-duration` non-zero. The forced read happens at t≈0, before
   *  a transition has advanced, so a candidate whose hover pair reads identical to rest for THIS reason
   *  is not proof the pointer produces no visible change — it is proof the read was too fast to see one.
   *  Split from the flat `noHoverChange` exclusion so that blind spot has its own denominator (#detector
   *  adaptation). */
  readonly transitionCoversPaint: boolean;
  readonly transitionDurationMs: number;
}

/** The forced-state pass's own denominator, assembled across its three phases (census · force · verify)
 *  and settled by lib/checks-hover.ts against the returned samples. `candidates` counts STATE QUESTIONS
 *  over the visible text-bearing population — one per element with no state paint at all (the
 *  `excluded(noHoverPaint)` claim, now true of BOTH mechanisms), one per (element × forced state) for
 *  everything else — so a row of `candidates=93 judged=11 excluded(noHoverPaint=82)` states plainly
 *  that 82 texts declare no state paint rather than implying they were checked and passed, and an
 *  element painted under both `:hover` and `[data-selected]` is honestly TWO questions. */
export interface HoverScanInput {
  readonly census: RelationalCensusAccountingInput;
  /** Stylesheets whose `cssRules` were readable, and those that threw (a cross-origin sheet). A scan that
   *  found no hover rules is only evidence when every sheet was readable. */
  readonly sheetsRead: number;
  readonly sheetsUnreadable: number;
  /** Rules declaring `color`/`background-color` under a `:hover` compound — the structural prefilter. */
  readonly hoverRules: number;
  /** Same prefilter, the ATTRIBUTE mechanism: rules declaring paint under a Base UI state attribute.
   *  Optional: absent in pre-2026-09-01 fixture bundles, where it reads as "not censused". */
  readonly attrRules?: number;
  /** Distinct (subject, attribute, value) states forced in page — the attribute mechanism's cost twin
   *  of `subjectsForced` (which stays CDP-only). Optional for the same fixture reason. */
  readonly attrSubjectsForced?: number;
  /** Selector fragments `querySelectorAll`/`closest` refused after `:hover` was stripped (a `:is(:hover)`
   *  collapsing to `:is()`). Counted so a silently narrowed population is visible. */
  readonly unparseableSelectors: number;
  /** Distinct elements whose `:hover` was forced — the CDP round-trip count this pass actually paid. */
  readonly subjectsForced: number;
  /** Candidates whose rest state did NOT read back identically after every force was released. A stuck
   *  `:hover` poisons every later sample in the run, so this is measured on the live page every run, not
   *  only in a fixture. */
  readonly notRestored: number;
}

// ── THE PAGE→NODE BRIDGE CONTRACT (ops/hover-walker.ts ⇄ ops/hover.ts) ────────────────────────────
// Both sides reference these shapes, so the boundary has a compiler again. It did not: the pass's
// first defect was `JSON.parse(raw) as number[]` over a list the page was filling with SELECTOR
// STRINGS, which made `Set<string>.has(number)` permanently false — the restoration-withholding branch
// was unreachable, a candidate read under a STUCK `:hover` was published as JUDGED and could file a
// P1 from a state no pointer produces, and the RESULT line still printed the correct `notRestored`
// count beside it. The accounting balanced; it balanced wrong, so no settle-time assertion could see
// it. A cast across the page boundary is exactly where this instrument has no compiler, so the Node
// side now VALIDATES these shapes at the seam instead of asserting them.

/** One candidate's REST facts, read in the census pass. Index-aligned with `HoverForcedReadRow.index`
 *  and with the indices `hoverVerify` returns — that alignment is the pass's whole join. */
export interface HoverCensusRestRow {
  readonly selector: string;
  readonly subjectSelector: string;
  /** null = the `:hover` mechanism; a string = the state attribute this candidate's question forces
   *  (with `stateAttrValue` as in `HoverContrastInput`). Required: only the live walker mints rows. */
  readonly stateAttr: string | null;
  readonly stateAttrValue: string | null;
  readonly restColor: Rgb;
  readonly restBackdrop: Backdrop;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly inactive: InactiveKind;
  /** See `HoverContrastInput.transitionCoversPaint` — read at REST, before the force, because that is the
   *  declaration governing the transition INTO the hover state the forced read races against. */
  readonly transitionCoversPaint: boolean;
  readonly transitionDurationMs: number;
}

/** One hover SUBJECT chain: `forced` are subject indices to hold in `:hover` (the subject plus every
 *  ancestor that is itself a hover subject); `members` are the candidate indices to read while held;
 *  `glows` counts the state-gated glow reads riding this force (a group with zero contrast members but
 *  a non-zero `glows` is still driven — skipping it would silently drop the glow arm). */
export interface HoverGroupRow {
  readonly forced: readonly number[];
  readonly members: readonly number[];
  readonly glows: number;
}

/** One ATTRIBUTE state group: the page holds `attr` (set to `value`, or `""` for bare presence) on its
 *  subject and reads members + glows in ONE synchronous task — no CDP leg, no subject index (the
 *  subject element never crosses the bridge; the page closes over it). */
export interface HoverAttrGroupRow {
  readonly attr: string;
  readonly value: string | null;
  readonly members: readonly number[];
  readonly glows: number;
}

/** One candidate re-read while its subject chain is held. `color` is null when the computed value did
 *  not parse — a withholding, never a fabricated colour. */
export interface HoverForcedReadRow {
  readonly index: number;
  readonly color: Rgb | null;
  readonly backdrop: Backdrop;
  readonly opacity: number;
}

/** What one group read returns: the contrast reads plus the glow rows the forced state ADDED over the
 *  rest snapshot (state-paint.ts `stateGlowRowsOf`), in the static glow census's own sample shapes. */
export interface HoverGroupReadResult {
  readonly reads: readonly HoverForcedReadRow[];
  readonly shadows: readonly GlowShadowInput[];
  readonly radials: readonly RadialGlowInput[];
}

// The attribute read additionally proves its SAME-TASK restore as a `restored` flag beside the group
// read; the microtask-delayed failure class (a listener re-arming the attribute) is caught by the
// pass-final verify instead — both checks exist because neither can see the other's failure mode. Since
// #1004 that flag is settled field-wise at the seam (ops/hover-validate.ts `attrRestored`), so the wire
// shape carries no separate TS name: a cast-only interface was the exact thing the seam discipline retired.

interface HoverCensusCounters {
  readonly textCandidates: number;
  readonly noHoverPaint: number;
  /** The subject already carries the forced state at rest — that paint is live and the REST families
   *  (`contrast` et al.) already judge it, so the pair is EXCLUDED, never re-forced. */
  readonly alreadyInState: number;
  /** WITHHELD classes — state paint the forcer refuses to fake a measurement for: a pseudo-ELEMENT
   *  paint target (resolveBackdrop reads ancestors only), a state test reachable only through a
   *  functional pseudo (the compiled Tailwind group-variant shape — the true subject is an unnamed
   *  ancestor), and a bare-attribute descendant pair with no rest-resolvable subject. */
  readonly pseudoElementPaint: number;
  readonly complexStateSelector: number;
  readonly unresolvableStateSubject: number;
  readonly unreadableColor: number;
  readonly overBudget: number;
  readonly sheetsRead: number;
  readonly sheetsUnreadable: number;
  readonly hoverRules: number;
  readonly attrRules: number;
  /** Rules gating `box-shadow`/`text-shadow`/a radial background behind either mechanism. */
  readonly glowRules: number;
  /** Glow pairs the census could not resolve to a forcible subject — printed by ops/hover.ts (the
   *  glow families carry no per-sample accounting channel to name them in). */
  readonly glowUnresolved: number;
  readonly unparseableSelectors: number;
  readonly subjects: number;
  readonly attrSubjects: number;
}

export interface HoverCensusResult {
  readonly rest: readonly HoverCensusRestRow[];
  readonly groups: readonly HoverGroupRow[];
  readonly attrGroups: readonly HoverAttrGroupRow[];
  readonly census: HoverCensusCounters;
}
