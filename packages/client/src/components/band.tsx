// Band — the client-shared BAND anatomy: one ghost `size="sm"` control that NAMES a region, optionally
// discloses it, and optionally states its census. The ONE home for the shape three surfaces were drawing
// by hand (#1723).
//
// ── WHY THIS EXISTS (#1723, and the defect that proved it) ───────────────────────────────────────────
// The approved config-collections design ratified ONE band: "Two band kinds do NOT exist;
// the delta from a settings band is the chevron's visibility and `aria-expanded`." The tree had three
// copies of it — the settings band and the collection band in `features/config`, and `TemplateCluster` in
// `features/preset`, whose own header CALLED ITSELF a borrow of the config band anatomy and then did not
// follow it. The config side landed #978 F1 at both of its bands (`flex-1`'s `flex-basis: 0%` lands on the
// BLOCK axis inside a vertical `Stack` and defeats the sealed `h-control-sm`, so the control falls back to
// min-content); the preset copy kept `flex-1` and shipped the identical defect — measured 2026-09-05 at
// **16px against a resolved 32px fine / 44px coarse `--spacing-control-sm`, on all six cluster bands**,
// i.e. a tap target under every floor the config pin exists to hold. It was invisible to that pin because
// the pin sweeps `[data-slot="config-band"]` inside the LIST pane. A prose "this is a borrow" is a wish;
// this module is the enforcer, and the two consumers' CTs measure the same box against the same token.
//
// ── WHAT IS SEALED, AND WHY EACH PIECE ───────────────────────────────────────────────────────────────
//  · The CHASSIS: ghost `size="sm"` Button, `w-full` (never `flex-1` — #978 F1 above; every band's parent
//    is a vertical `Stack`, and the axis is the whole bug), `min-w-0` so the label can truncate,
//    `justify-start`, `gap-tight` joints, `px-tight` padding. The padding is the RATIFIED value: §3.1's
//    delta list is exhaustive and padding is not on it, so the preset copy's `px-field` was drift and is
//    gone (a 2px inline shift, stated rather than smuggled).
//  · The CHEVRON GUTTER is always drawn, painted or not (side-eye 2026-08-08 P3): dropping the glyph also
//    drops its 16px box and the joint, so a band without one would start its glyph 20px left of its
//    siblings and the column would become species-dependent — a ragged edge that reads as a rendering bug.
//    `reserved` is the SAME `Icon` at the SAME size, merely `invisible` (the box survives, the paint does
//    not), so the gutter cannot drift from the chevron it stands in for the way a re-spelled width would.
//  · The VOICE BUDGET (`features/config/components/config-list-group.tsx` owns its one home, and it is the
//    PANE's rather than per-species — #1714): a band is a control that names a region, so its label is
//    `interactiveKicker`; a census is a mono `datum`; STATE IS A `Badge`, never a voice — which is what
//    `marks` is for.
//
// ── THE "YOU ARE HERE" PAINT IS DERIVED FROM THE ARIA, NEVER A SECOND PROP (#1823) ───────────────────
// #1725 moved a collection's members out of the LIST, and with them went the only thing that marked where
// the reader was: a settings GROUP still gets a derived mark (its chevron rotates, its child section row
// wears the ruled rail), but a collection band has no chevron and no child rows, so all four library doors
// rendered byte-identical while one of them owned the whole CONTENT pane. Measured 2026-09-06 across every
// band on the surface: `bg rgba(0,0,0,0) · ::before none · ::after none`, the `aria-current="true"` one
// included. The ARIA landed at #1725; the paint did not.
//
// The fix is here rather than at a call site because `BandProps` `Omit`s `selection` (below) — no consumer
// could ask for a selected skin — and because a second band KIND is exactly what the mock design §3.1 forbids.
// So this is a STATE arm on the one band, and it takes NO new prop: the band already receives the
// `aria-current` that says it is the location, and the paint is that attribute mirrored onto the
// `data-selected` the ruled idiom keys on. One statement, one home, and a call site cannot get the two
// halves out of step by passing one and forgetting the other.
//
// The skin is `SELECTION_RAIL` — the OWNER-RATIFIED list-row idiom (#485: 2px left ember rail + a 10%
// primary tint), composed from `@orb/ui/lib` rather than re-spelled, because the E2 idiom collapse ("ring
// for a selected grid cell; left rail plus tint for a selected list row") is only true while every carrier
// paints the identical pair. A band is a row-shaped door in a list pane, so it takes the ROW reading.
//
// WHICH BANDS THIS PAINTS IS THE ARIA'S QUESTION, NOT THIS FILE'S, and the answer is already correct: a
// settings group WITH sections states no `aria-current` at all (its child section row carries the one
// "you are here" marker — two `aria-current` rows for one location was a landed a11y defect), so those
// thirteen bands are byte-identical to before. A collection band and a row-less settings LEAF both state
// it, and both are genuinely the location. Pinned in both directions in
// tests/client/features/config/components/config-list-collection-group.ct.tsx.
//
// ── WHAT A CALL SITE STILL DECIDES ───────────────────────────────────────────────────────────────────
// Everything that is genuinely per-surface: the chevron arm, the leading glyph, the census and where it
// sits, the marks, and every ARIA/`data-*`/`ref`/`onClick` attribute — those ride the Button's own props,
// so a consumer states `aria-expanded`/`aria-current`/`aria-controls`/`aria-label` itself. This component
// deliberately states NO aria of its own: the name-and-mark unglue rule (#1214-1 — the accessible-name
// computation concatenates adjacent INLINE nodes with nothing between, so "Appearance"+"Modified" announced
// as one token) is a fact about the caller's OWN marks, and a band that guessed a name would be a second,
// invisible home for the copy.

import type { ButtonBaseProps } from "@orb/ui/button";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { ChevronDown, ChevronRight, Icon } from "@orb/ui/icons";
import { SELECTION_RAIL } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

/**
 * The band's props. Its two AXES ride inline here rather than as exported aliases:
 * `packages/client/src/components/` is not a type home (`no-inline-types` — the homes are `contracts`/`kit`/`db`/`ui` and the
 * client's own `data`/`forms`/`state`/`lib`), and a purely presentational axis of one composite has nothing
 * to say in `state` or `lib`. A consumer that needs to NAME an arm derives it — `BandProps["chevron"]` —
 * which is the §5.5 "one importable union, never re-spelled" shape with the union's one home right here.
 */
export interface BandProps extends Omit<ButtonBaseProps, "children" | "intent" | "shape" | "selection" | "size"> {
  /** The region's name — the band's visible label and, absent an `aria-label`, its accessible name. */
  readonly label: string;
  /** The chevron gutter's three arms. `reserved` keeps the BOX and drops the paint — a band with nothing to
   *  unfold still holds the column (side-eye 2026-08-08 P3); it is not the same thing as `closed`, which is
   *  a real, operable disclosure that happens to be shut. A band whose region may turn out to be EMPTY
   *  (a settings group contributing no sections is a nav leaf, not a disclosure) picks `reserved` and states
   *  no `aria-expanded` — the two halves are one statement and a call site owes both. */
  readonly chevron: "reserved" | "closed" | "open";
  /** The region's own glyph, in the column after the chevron gutter. Omitted where the region has none
   *  (a preset template cluster is named, not iconified). */
  readonly icon?: LucideIcon;
  /** A live census. `undefined` draws NOTHING — a band never fabricates a `0`, because "the number has not
   *  landed" and "there are none" are different facts and only the owning surface can tell them apart. */
  readonly count?: number;
  /** Where the census sits. `trailing` is the mock design §3.1's ratified answer and the default — in a ~290px
   *  LIST door the count claims the remainder while the label truncates. `label` exists for a band spanning
   *  a full CONTENT pane, where a figure parked several hundred px from the name it counts stops reading as
   *  its count. */
  readonly censusAlign?: "trailing" | "label";
  /** State marks — `Badge`s, never a voice (the #1214-2 ruling: a state drawn in a NAME's register is read
   *  as a second name of equal rank). They ride INSIDE the control, so they are part of its name. */
  readonly marks?: ReactNode;
}

/** The chassis. `w-full`, NOT `flex-1` — see the header; this class string is the #978 F1 fix's one home.
 *  `SELECTION_RAIL` rides EVERY band, current or not: its resting arm is a transparent 2px rail, so the
 *  glyph column is identical on all thirteen settings bands and all four collection bands and entering a
 *  library cannot shift its own label by 2px (the `ListRow` reservation, for the same reason). */
const BAND_CHASSIS = `min-w-0 w-full justify-start gap-tight px-tight ${SELECTION_RAIL}`;

const CHEVRON_GLYPH = { reserved: ChevronRight, closed: ChevronRight, open: ChevronDown } as const;

/** One band: `[chevron] [glyph] Label … count marks`. */
export function Band({ label, chevron, icon, count, censusAlign = "trailing", marks, className, ...rest }: BandProps): ReactElement {
  // The paint half of `aria-current` (see the header). `"true"` is the token BOTH band species state
  // (config-list-group.tsx's row-less leaf and config-list-collection-group.tsx's library door — the mock design
  // §3.1's owner-authorised amendment picked one token for the pane); `true` is accepted because React's
  // `aria-current` type admits the boolean and a caller writing it means the same thing. Every other value
  // in the ARIA union (`page`/`step`/`location`/…) would be a band claiming a kind this component does not
  // have, so it is deliberately NOT painted rather than silently treated as `"true"`.
  const current = rest["aria-current"] === "true" || rest["aria-current"] === true;
  return (
    <Button
      className={className === undefined ? BAND_CHASSIS : `${BAND_CHASSIS} ${className}`}
      data-selected={current ? "" : undefined}
      intent="ghost"
      size="sm"
      type="button"
      {...rest}
    >
      {/* `Icon` is a SEALED sizing wrapper with a closed prop list — it takes no `data-slot`, which is why
          the two glyphs are addressed positionally (the config CTs already read them as `svg` nth(0)/nth(1)
          for the gutter-column measurement, and that ordering is part of this anatomy). */}
      <Icon {...(chevron === "reserved" ? { className: "invisible" } : {})} icon={CHEVRON_GLYPH[chevron]} size="sm" />
      {icon === undefined ? null : <Icon icon={icon} size="sm" />}
      {/* A BAND IS NOT A SECOND KICKER (#1839 · side-eye 2026-09-06 F23, live for a third review running).
          This label wore `interactiveKicker` and the LIST's shelf headings wear `kicker`: 13px/600/CAPS
          against 10.5px/600/CAPS, same weight, same case, 2.5px apart, and the only difference between them
          was tracking. Two type registers that far apart in intent — a SHELF is a heading over doors, a BAND
          is a door — must not be that close in appearance, and the review named the cheapest honest fix: the
          shelf is the caps register, so the band leaves it. `label` is the voice for a NAME at the readable
          13px step, and being un-tracked and un-cased separates the two on THREE axes (case, weight, tracking)
          without inventing a size — the type scale is closed and this change spends nothing from it.
          #1106'S RULING SURVIVES; ITS INPUT LEFT. That fix gave `interactiveKicker` back its trailing tracking
          column because a tracked label inside a `truncate` box was clipping "Regex scripts" by 0.42px on the
          271px both-panels pane. The voice keeps it for its dozen other consumers; this band no longer has a
          trailing tracking column to reclaim, so the clip is gone by construction rather than by compensation. */}
      <Text as="span" className="truncate" data-slot="band-label" voice="label">
        {label}
      </Text>
      {count === undefined ? null : (
        <Text as="span" {...(censusAlign === "trailing" ? { className: "ms-auto" } : {})} data-slot="band-census" voice="datum">
          {count}
        </Text>
      )}
      {marks}
    </Button>
  );
}
