// Band — the client-shared BAND anatomy: one ghost `size="sm"` control that NAMES a region, optionally
// discloses it, and optionally states its census. The ONE home for the shape three surfaces were drawing
// by hand (#1723).
//
// ── WHY THIS EXISTS (#1723, and the defect that proved it) ───────────────────────────────────────────
// `docs/design/mocks/config-collections/DESIGN.md` §3.1 ratified ONE band: "Two band kinds do NOT exist;
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
  /** Where the census sits. `trailing` is DESIGN.md §3.1's ratified answer and the default — in a ~290px
   *  LIST door the count claims the remainder while the label truncates. `label` exists for a band spanning
   *  a full CONTENT pane, where a figure parked several hundred px from the name it counts stops reading as
   *  its count. */
  readonly censusAlign?: "trailing" | "label";
  /** State marks — `Badge`s, never a voice (the #1214-2 ruling: a state drawn in a NAME's register is read
   *  as a second name of equal rank). They ride INSIDE the control, so they are part of its name. */
  readonly marks?: ReactNode;
}

/** The chassis. `w-full`, NOT `flex-1` — see the header; this class string is the #978 F1 fix's one home. */
const BAND_CHASSIS = "min-w-0 w-full justify-start gap-tight px-tight";

const CHEVRON_GLYPH = { reserved: ChevronRight, closed: ChevronRight, open: ChevronDown } as const;

/** One band: `[chevron] [glyph] Label … count marks`. */
export function Band({ label, chevron, icon, count, censusAlign = "trailing", marks, className, ...rest }: BandProps): ReactElement {
  return (
    <Button className={className === undefined ? BAND_CHASSIS : `${BAND_CHASSIS} ${className}`} intent="ghost" size="sm" type="button" {...rest}>
      {/* `Icon` is a SEALED sizing wrapper with a closed prop list — it takes no `data-slot`, which is why
          the two glyphs are addressed positionally (the config CTs already read them as `svg` nth(0)/nth(1)
          for the gutter-column measurement, and that ordering is part of this anatomy). */}
      <Icon {...(chevron === "reserved" ? { className: "invisible" } : {})} icon={CHEVRON_GLYPH[chevron]} size="sm" />
      {icon === undefined ? null : <Icon icon={icon} size="sm" />}
      <Text as="span" className="truncate" data-slot="band-label" voice="interactiveKicker">
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
