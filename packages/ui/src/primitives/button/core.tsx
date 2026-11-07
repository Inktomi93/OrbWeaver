import type { ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { Button as BaseButton } from "@base-ui/react/button";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import type { ToneInkSelection, VariantStampProps } from "#lib";
import { cn, GRADIENT_RING_PIGMENT, variantProps } from "#lib";
import type { ButtonVariant } from "./variants.ts";
import { BUTTON_DEFAULT_TONE, buttonTone, buttonVariants } from "./variants.ts";

// The button family's one render: Button, GlyphButton, InlineAction and PictureButton differ only in their box, so the
// Base UI seal, the busy state, the D336 tone and focal resolution and the CTA ring live here once. Every member keeps
// `data-slot="button"`: the CTA ring and the busy ring in `styles/primitives.css` and owner CSS select the family by it.

type ButtonRecipe = VariantProps<typeof buttonVariants>;

/** The family's shared axes: every recipe axis but Button's own scale box. */
export interface ButtonCoreProps extends BaseButtonProps, Omit<ButtonRecipe, "size" | "square" | "wrap" | "stacked"> {
  className?: string;
  /** Busy state: sets `aria-busy` and disables the button (a state, not a variant). */
  loading?: boolean;
}

/**
 * The D336 colour pair. An ink belongs to a fill-less style and excludes a non-neutral tone; `focal` belongs to the
 * solid style, the only one that draws the CTA lift. A computed style that names neither stays free to vary.
 */
export type ButtonPaint = (
  | { ink?: never; focal?: never }
  | { variant?: "solid" | undefined; ink?: never; focal?: boolean | undefined }
  | { variant: Exclude<ButtonVariant, "solid">; focal?: never }
) &
  ToneInkSelection;

/** `stretch` owns the label's start and, for `line`, the full width, so a caller names neither beside it. */
export type ButtonStretch = { stretch?: undefined } | { stretch: "row"; justify?: undefined } | { stretch: "line"; justify?: undefined; width?: undefined };

interface ButtonCoreInput extends ButtonCoreProps {
  /** Button's scale box; a named component passes none. */
  readonly scale?: Pick<ButtonRecipe, "size" | "square" | "wrap" | "stacked"> | undefined;
  /** A named component's own box: its recipe's classes and axis stamp, merged after the shared recipe. */
  readonly box?: VariantStampProps | undefined;
}

/** A stretched button sets its label at the start, and a whole list line takes the full width: the arm owns both, so `justify` and `width` are the caller's only without it. */
function placed(stretch: ButtonRecipe["stretch"], justify: ButtonRecipe["justify"], width: ButtonRecipe["width"]): Pick<ButtonRecipe, "justify" | "width"> {
  if (stretch === undefined) {
    return { justify, width };
  }
  return { justify: "start", width: stretch === "line" ? "full" : width };
}

export function ButtonCore(props: ButtonCoreInput): ReactElement {
  const {
    className,
    variant,
    tone,
    ink,
    focal,
    scale,
    box,
    shape,
    cardCorners,
    selection,
    hiddenAt,
    reveal,
    touchFloor,
    underline,
    reserveEdge,
    confirming,
    quietDisabled,
    focusRing,
    stretch,
    width: calledWidth,
    cap,
    grow,
    floor,
    textAlign,
    inset,
    whitespace,
    push,
    self,
    minHeight,
    minWidth,
    explainsDisabled,
    justify: calledJustify,
    loading = false,
    disabled = false,
    focusableWhenDisabled,
    ...rest
  } = props;
  const resolvedTone = tone ?? (variant === undefined ? "neutral" : BUTTON_DEFAULT_TONE[variant]);
  // A neutral ghost or link takes its host's ink (D336); an outline draws its own box in its tone's text role, and a
  // colour tone inks every fill-less style with that role.
  const resolvedInk = ink ?? ((variant === "ghost" || variant === "link") && resolvedTone === "neutral" ? "inherit" : undefined);
  // The selection rail keys its paint on `data-selected`, so the row's tone follows the same attribute.
  const selected = "data-selected" in props && props["data-selected"] !== undefined;
  const resolvedFocal = focal ?? (variant === "solid" && resolvedTone === "primary");
  const { justify, width } = placed(stretch, calledJustify, calledWidth);
  // The className, the axis stamp and the D336 tone scope, from ONE selection object; the box lands after the shared
  // recipe and before the caller's class.
  const stamp = variantProps(
    buttonVariants,
    {
      variant,
      tone: resolvedTone,
      ink: resolvedInk,
      focal: resolvedFocal,
      size: scale?.size,
      square: scale?.square,
      wrap: scale?.wrap,
      stacked: scale?.stacked,
      shape,
      cardCorners,
      selection,
      hiddenAt,
      reveal,
      touchFloor,
      underline,
      reserveEdge,
      confirming,
      quietDisabled,
      focusRing,
      stretch,
      width,
      cap,
      grow,
      floor,
      textAlign,
      inset,
      whitespace,
      push,
      self,
      minHeight,
      minWidth,
      explainsDisabled,
      justify,
    },
    cn(box?.className, className),
    buttonTone(variant, resolvedTone, selection, selected),
  );
  return (
    <BaseButton
      data-slot="button"
      // The gradient-border accent ring keys off this attr, painting on the focal action only. It reads the RESOLVED
      // focal choice, the same value that picked the lift classes, so paint and ring cannot disagree.
      data-cta={resolvedFocal ? "" : undefined}
      data-pigment={resolvedFocal ? GRADIENT_RING_PIGMENT : undefined}
      aria-busy={loading ? true : undefined}
      {...box}
      {...stamp}
      disabled={disabled || loading}
      // Loading is a transient busy state, not a real disablement — stay in the tab sequence for AT.
      focusableWhenDisabled={focusableWhenDisabled ?? loading}
      {...rest}
    />
  );
}
