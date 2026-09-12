// The INTERACTIVE-CENSUS sample shapes: what the walker gathers about offered controls (tap targets,
// accessible names, action doors, silhouettes) and how much of that population it reached.
//
// SPLIT OUT of contract/samples.ts (#797): that file sat EXACTLY at the 450-line tooling cap, so it had
// no room for the truncated-extent fact these shapes needed. This is the §4.3 decomposition, by family —
// samples.ts re-exports every name below, so no importer moves and `contract/samples.ts` remains the one
// door onto the walker's sample vocabulary.

import type { InactiveKind, Rgb } from "@orb/tooling/_shared/wcag";
import type { Backdrop } from "./backdrop.ts";

// ── ARIA navigability ────────────────────────────────────────────────────────
export interface TapTargetInput {
  /** Per-walk identity used only to prove nested ownership; never serialized into a grouping key. */
  readonly targetId?: string;
  /** Interactive ancestor identities, nearest first. A failing ancestor owns the descendant's duplicate
   * target-size decision; a healthy ancestor does not suppress a failing child. */
  readonly ancestorTargetIds?: readonly string[];
  /** Author-declared target kind: tag, role/type, data-slot, and generic variant carriers. */
  readonly authoredTarget?: string;
  /** Position-free structural path to the nearest authored slot/role/landmark home. */
  readonly authoredHome?: string;
  readonly selector: string;
  readonly width: number;
  readonly height: number;
  /** The measurement is a LOWER BOUND, not a size (#797): the outward hit probe's ring was clipped by a
   *  viewport edge — where `elementFromPoint` answers `null`, which reads as "someone else owns this" —
   *  and no in-frame radius genuinely failed, so the control may own more than this. Set only where it can
   *  still change a verdict (under the 44px widest floor); `checkTapTarget` withholds rather than minting a
   *  sub-target finding from it. Optional: absent from the fixture sample sets that predate it. */
  readonly extentTruncated?: boolean;
  /** The control's own `data-target-floor` declaration, or null when it makes none (#1381).
   *
   *  A PRICED SUB-FLOOR IS A RULING, AND A RULING MUST BE RENDERED TO BE READ. The disclosure trigger in
   *  the transcript footer stays a 16px text line at FINE pointer by a recorded density decision, and
   *  carries the coarse 44px floor through a shared fragment — but that decision lived only in a source
   *  comment (`@orb-waive sub-floor-disclosure`, policy `sub-floor-disclosure`), which no DOM walker can see, so two
   *  independent cold audits of /chats filed the same P1 hours apart. `sub-floor-ok` is that ruling as a
   *  rendered fact; `checks-a11y.ts` honours it at fine pointer ONLY and counts it as
   *  `excluded(ruledSubFloor)`, never as a silent skip. Optional: absent from fixture sample sets that
   *  predate it, where it reads as "the control declared nothing". */
  readonly ruledTargetFloor?: string | null;
}

export interface AccessibleNameInput {
  readonly selector: string;
  readonly tag: string;
  readonly hasVisibleText: boolean;
  readonly ariaLabel: string | null;
  readonly ariaLabelledbyText: string | null;
  /** The text of every `<label>` the BROWSER associates with this control (`HTMLElement.labels` — both
   *  `for=` and wrapping), or null. REQUIRED rather than optional on purpose (#1009): a name SOURCE a
   *  fixture can silently omit is how this census came to miss the association HTML has always used. */
  readonly nativeLabelText: string | null;
  readonly title: string | null;
  readonly altText: string | null;
}

export interface LandmarkInput {
  readonly main: boolean;
}

export interface TabIndexInput {
  readonly selector: string;
  readonly tabIndex: number;
}

// ── Duplicate action doors — the RUNTIME half of issue #252 ─────────────────────────────────────────
// "New chat lives in three places." The STATIC gate (`duplicate-action-doors`, tooling/src/verify/gates) censuses
// tRPC call sites per rail section and is blind by construction to a REGISTRY-RENDERED action — one call site
// behind N rendered slots, which is precisely how the founding complaint escapes it (its three doors all
// call one shared state action). This lens is the other half: the same (role, accessible name) OFFERED more
// than once on one rendered plane. Neither arm subsumes the other — the static one catches one verb wearing
// N different labels, this one catches one label rendered N times from one verb.
//
// NOTHING IS HARDCODED. The key is the control's own computed name; no procedure or affordance is named here.
//
// THE FALSE-POSITIVE CLASS IS PER-DATUM REPETITION — twelve "Open" buttons in a chat list are twelve
// different chats, not twelve doors to one action — and the discriminator is STRUCTURAL PATH. Per-datum
// instances are rendered by ONE piece of code, so their paths from the root are IDENTICAL; genuinely
// separate homes (a hero CTA, a rail button, a topbar glyph) are reached by DIFFERENT paths. A twin-SIBLING
// count was tried first and refused with a receipt: keyed on tag+class it reads two bare wrapper divs as a
// list and swallowed every door on a three-door stage.
export interface ActionDoorInput {
  readonly selector: string;
  /** Explicit `role`, else the implicit role of the tag (`input:<type>` for inputs). */
  readonly role: string;
  /** The accessible name as a COMPARISON KEY: case-folded, whitespace-collapsed, trailing punctuation
   *  stripped. Never empty — an unnamed control is the `aria-name` rule's finding, not this one. */
  readonly name: string;
  /** The chain of `tag@data-slot.classes` signatures from this control up to `<body>`, POSITION-FREE.
   *  Two doors sharing a path are one component rendered per datum; two doors with different paths are two
   *  homes — EXCEPT inside a list, where the rows own the answer (see `listKey`). */
  readonly path: string;
  /** Per-run identity of the LIST CONTAINER this door lives in, or null for a door that is not inside a
   *  repeated list item (#851). Two doors in the same container but different `itemKey`s are one
   *  component rendered per datum however differently their rows are shaped — the path fingerprint alone
   *  read a conditional row wrapper as a second home and fired on every virtualized list at coarse
   *  pointer. */
  readonly listKey: string | null;
  /** Per-run identity of the LIST ITEM (the row) this door lives in, or null. Doors sharing an `itemKey`
   *  are inside ONE row and stay judged by `path`: one action offered twice in one card is a real door. */
  readonly itemKey: string | null;
  /** Per-run identity of the `role="toolbar"` this door lives in, or null (#1705). A toolbar cell is a VIEW
   *  SWITCH within one region, not a second door to the app-level action that shares its name — the ruling
   *  and its full rationale live on `checkDuplicateDoorPopulations` (lib/checks-quality.ts). REQUIRED, not
   *  optional, on the row-8 precedent in `ops/walker/RULE-AUTHORING.md`: an optional field lets a fixture
   *  (or a walker regression) omit the fact silently, which reads as "not in a toolbar" and re-opens the
   *  false positive with no tell. */
  readonly toolbarKey: string | null;
}

// ── Control silhouette (orbweaver; #430, from the side-eye #420 receipts) ────────────────────────────
// A track control's SHAPE is an affordance: a switch reads as a switch because the track is a lane long
// enough for the thumb to travel in. When the box collapses toward square the lane disappears and the
// control reads as a glyph — measured live at 48x44 (aspect 1.091), which a reviewer read as a crescent
// moon rather than a toggle (docs/history/reviews/side-eye/2026-08-22-switch-shape-and-glow-evidence.md).
//
// The walker censuses EVERY explicitly-roled visible element and hands the raw box over; which roles owe
// a directional silhouette is a Node-side decision (lib/checks-a11y.ts) so the two cannot drift — a role
// added to the verdict table needs no walker edit, which is the coupled site this shape exists to avoid.
export interface ControlAspectInput {
  readonly selector: string;
  /** The element's explicit `role` attribute, trimmed and case-folded. Explicit only: an implicit role is
   *  not a claim the author made about the control's silhouette. */
  readonly role: string;
  readonly width: number;
  readonly height: number;
  /** An animation or transition was RUNNING on this element when the box was read. A mid-flight box is a
   *  measurement of a moment, not of a design — the check declines rather than judging it (the same
   *  mid-transition trap that produced a retracted "widening does not restore travel" reading in #420). */
  readonly animating: boolean;
}

// ── Form-control boundary (border-contrast, WCAG 1.4.11 — #1361/#1315) ──────────────────────────────
// The DECLARED boundary of a form control and the paint it is declared against. `sides` carries only the
// sides that actually paint (a `none`/`hidden` style or a zero width is not a declared boundary), so an
// EMPTY array is the closed `noDeclaredBorder` exclusion rather than a silent pass — the control made no
// boundary claim. `surround` is `resolveBackdropUnder`'s answer, which is the paint OUTSIDE the control's
// box; the control's own fill is the inside of the boundary and is not what 1.4.11 compares against here.
/** THE SIDE AXIS, once. The walker interpolates this tuple into its census loop and the shape below
 *  derives its member from it, so the four spellings cannot drift apart across the page boundary
 *  (`no-inline-union-redecl` is the enforcer). */
export const BORDER_CONTRAST_SIDES = ["top", "right", "bottom", "left"] as const;
type BorderContrastSideName = (typeof BORDER_CONTRAST_SIDES)[number];

export interface BorderContrastSide {
  readonly side: BorderContrastSideName;
  readonly widthPx: number;
  readonly style: string;
  /** null when the authored colour did not survive the canvas probe — a WITHHELD side, never a pass. */
  readonly color: Rgb | null;
}

export interface BorderContrastInput {
  readonly selector: string;
  readonly tag: string;
  /** The explicit `role`, or null for a native control whose tag carries the role implicitly. */
  readonly role: string | null;
  /** WCAG 1.4.11 exempts an inactive component; the fleet-shared classifier decides which spelling. */
  readonly inactiveKind: InactiveKind;
  readonly sides: readonly BorderContrastSide[];
  readonly surround: Backdrop;
}

// ── Census reach — the interactive census's own denominator (#653) ───────────────────────────────────
// "nothing found" and "nothing looked at" must never render identically. The tap-target, action-door and
// silhouette families are PAINT/OFFERED-class (`document.elementFromPoint` only answers inside the
// viewport — see the class table in ops/walker/census-interactive.ts), and they used to drop every
// control that was merely not scrolled to: on the chat "This chat" tab at 430x932, ~20 sized controls sat
// at top 1073..2374 inside an inner scroller and the run still printed `findings=0`.
//
// The walker now SCROLLS each offered control into view, measures it under the real arm, and restores
// every scroller. These counters are what makes the remainder legible — a reader of the RESULT line is
// entitled to know how many controls the census could not reach, exactly as `census=` states how many
// nodes it saw.
export interface CensusReachInput {
  /** Visible, non-plumbing, non-aria-hidden interactive controls the sweep considered. */
  readonly offered: number;
  /** Already painted when the walk reached them. */
  readonly onScreen: number;
  /** Brought into the viewport by the reveal sweep and measured there. */
  readonly revealed: number;
  /** How many `scrollIntoView` calls that took — bounded by `revealBudget`. */
  readonly revealScrolls: number;
  /** Still outside the viewport AFTER a reveal attempt: an off-canvas panel, a fixed layer parked past
   *  the edge, or a control the budget ran out on. These are the ones no rule judged. */
  readonly skippedOffViewport: number;
  /** On screen, but without room for the ±22px hit-probe ring — scrolled to CENTRE so the extent could be
   *  measured for real rather than read off the border box (#797). */
  readonly recentred: number;
  /** Measured with an INCOMPLETE probe ring even after that re-centre (a fixed control clipped by a
   *  viewport edge), and low enough that the missing radii could still change the verdict. Their extent is
   *  published as a lower bound and their target-size verdict is WITHHELD — never fabricated from the
   *  border box, which is the #797 lie: an 18×18 P1 on a control owning a full 44×44 ring. */
  readonly frameTruncated: number;
  /** Scroll positions put back before the later segments read geometry. */
  readonly scrollersRestored: number;
  readonly revealBudget: number;
  /** The budget ran out — the sweep is INCOMPLETE and `skippedOffViewport` is a floor, not a total. */
  readonly budgetExhausted: boolean;
}
