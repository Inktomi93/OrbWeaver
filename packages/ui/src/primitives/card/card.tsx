import type { ComponentProps, KeyboardEvent, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn, variantAttrs } from "#lib";
import { CARD_TONE, cardVariants } from "./variants.ts";

/** The card's own axes, shared by both element arms below. */
type CardOwnProps = VariantProps<typeof cardVariants> & {
  /** A Card that is also a named owner-CSS hook (`owner-css-surface.ts`) keeps that slot instead of `card-root`, and so
   *  stays out of the tier map: its radius and inset are the variant's own at every tier. */
  readonly ownSlot?: string;
};

/**
 * A card is a `div` unless the caller says otherwise. `as="button"` is the NATIVE arm — for the case where
 * the WHOLE island is the affordance (home's resume hero) — and it is a discriminated union rather than a
 * lone `as?: "div" | "button"` because the two elements do not take the same props: `type`/`disabled` and
 * the ref's element type are the button's alone, and a single prop bag would have to lie about one of them.
 * The `Text as` precedent (text.tsx) does not need this — `p`/`span`/`div` share one attribute set.
 */
export type CardProps =
  | (ComponentProps<"div"> & CardOwnProps & { readonly as?: "div" })
  | (ComponentProps<"button"> & CardOwnProps & { readonly as: "button" });

// A div is not natively operable — when the card ships the click affordance, mirror a button's
// Enter/Space activation by synthesizing the click the caller already wired to onClick. The `as="button"`
// arm needs none of this: the platform already does it, which is the whole reason that arm exists.
function activateOnKey(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}

// When `interactive`, the div gets keyboard operability (role="button" + tabIndex + Enter/Space
// activation) so the focus ring is not a lie; caller can override role/tabIndex/onKeyDown.
//
// …AND `as="button"` IS THE ARM THAT NEEDS NO MIRROR (side-eye rail-home P3-4, 2026-08-22). The synthesized
// pair above was verified working on home's hero (Enter AND Space both activate), so this is not a defect
// fix — it is the arm that makes the behaviour UNREGRESSABLE: a real `<button>` gets activation, the
// disabled semantics, form participation and the AT verdict from the platform, where the div arm gets them
// from three props any caller override can quietly break. The div arm stays: `interactive` is also used on
// islands that carry their own `role` (a listbox option, a grid cell), where a `<button>` would be wrong.
//
// Island padding is resolved from the surface's tier by tiers.css (D7), so `padding` has one arm, `none`: the
// island delegates its inset to its own content. `data-elevated`, `data-nested` and `data-padding` are the
// attributes the tiers.css rules key on; the variant's utility alone would lose to the tier rule inside a Surface.
export function Card(props: CardProps): ReactElement {
  const {
    className,
    layout,
    shape,
    elevated,
    interactive,
    nested,
    padding,
    tone,
    outline,
    glow,
    rail,
    artDecoration,
    shadow,
    holdsField,
    dropTarget,
    presence,
    spoiler,
    receded,
    focusable,
    ownSlot,
  } = props;
  const skin = cn(
    cardVariants({
      layout,
      shape,
      elevated,
      interactive,
      nested,
      padding,
      tone,
      outline,
      glow,
      rail,
      artDecoration,
      shadow,
      holdsField,
      dropTarget,
      presence,
      spoiler,
      receded,
      focusable,
    }),
    className,
  );
  const slot = ownSlot ?? "card-root";
  // The attributes the unlayered elevated-/nested-radius rules key on, plus the D336 tone scope: inside a Surface the tier rule
  // outranks any `rounded-*` utility the variant emits. `data-slot` is set after the caller's props on each arm, so a
  // stray `data-slot` cannot drop a card out of the tier map; only `ownSlot` does, on purpose.
  const marks = {
    "data-elevated": elevated === true ? "" : undefined,
    "data-nested": nested === true ? "" : undefined,
    "data-padding": padding === "none" ? "none" : undefined,
    "data-shape": shape === undefined || shape === "island" ? undefined : shape,
    ...variantAttrs(cardVariants, { tone }, CARD_TONE[tone ?? "neutral"]),
  } as const;
  if (props.as === "button") {
    const {
      as: _as,
      className: _className,
      layout: _layout,
      shape: _shape,
      elevated: _elevated,
      interactive: _interactive,
      nested: _nested,
      padding: _padding,
      tone: _tone,
      outline: _outline,
      glow: _glow,
      rail: _rail,
      artDecoration: _artDecoration,
      shadow: _shadow,
      holdsField: _holdsField,
      dropTarget: _dropTarget,
      presence: _presence,
      spoiler: _spoiler,
      receded: _receded,
      focusable: _focusable,
      ownSlot: _ownSlot,
      ...rest
    } = props;
    // `type="button"` BEFORE the spread, so a caller that genuinely needs a submit card can still say so —
    // and never after it, which would silently neuter one.
    //
    // `block text-start` is the UA RESET this arm owes, and it is not cosmetic taste: the browser ships a
    // button as `inline-block` with `text-align: center`, and Tailwind's preflight resets a button's font
    // and background but NOT either of those — so an un-reset button arm renders the same card's prose
    // centred, which is a silent visual regression the div arm never had. It is prepended (never appended),
    // so both the variant and the caller's own className still win the merge.
    return <button type="button" {...rest} className={cn("block text-start", skin)} {...marks} data-slot={slot} />;
  }
  const {
    as: _as,
    className: _className,
    layout: _layout,
    shape: _shape,
    elevated: _elevated,
    interactive: _interactive,
    nested: _nested,
    padding: _padding,
    tone: _tone,
    outline: _outline,
    glow: _glow,
    rail: _rail,
    artDecoration: _artDecoration,
    shadow: _shadow,
    holdsField: _holdsField,
    dropTarget: _dropTarget,
    presence: _presence,
    spoiler: _spoiler,
    receded: _receded,
    focusable: _focusable,
    ownSlot: _ownSlot,
    ...rest
  } = props;
  const a11y =
    interactive === true
      ? {
          role: rest.role ?? "button",
          tabIndex: rest.tabIndex ?? 0,
          onKeyDown: rest.onKeyDown ?? activateOnKey,
        }
      : undefined;
  return <div {...rest} {...a11y} className={skin} {...marks} data-slot={slot} />;
}
