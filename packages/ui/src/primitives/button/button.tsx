import type { ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { Button as BaseButton } from "@base-ui/react/button";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import type { ToneInkSelection } from "#lib";
import { GRADIENT_RING_PIGMENT, variantProps } from "#lib";
import type { ButtonVariant } from "./variants.ts";
import { BUTTON_DEFAULT_TONE, buttonTone, buttonVariants } from "./variants.ts";

/** Every Button prop EXCEPT the accessible-name requirement — the shape a wrapper seal extends. */
export interface ButtonBaseProps extends BaseButtonProps, VariantProps<typeof buttonVariants> {
  className?: string;
  /** Busy state: sets `aria-busy` and disables the button (a state, not a variant). */
  loading?: boolean;
}

type ButtonSize = NonNullable<ButtonBaseProps["size"]>;

/**
 * The size arms that are ICON-ONLY BY CONTRACT: a square glyph box with no room for a text run, so
 * nothing the caller nests inside can supply the accessible name (§13.10 N1 — with no visible text,
 * `aria-label` is the name). DERIVED from the tv() size axis with `Extract`, never re-spelled, so a new
 * `glyph-*` step joins the requirement the day it is added (the `.test-d` pins that each member still
 * resolves — a renamed arm would otherwise silently `Extract` to `never` and disarm the whole rule).
 *
 * `media` is deliberately NOT here: that arm is content-sized around a portrait/avatar child, whose own
 * `alt`/`Icon label` IS the name — requiring a second one would override the pixels, the exact N1
 * liability this rule exists to prevent.
 */
export type IconOnlyButtonSize = Extract<ButtonSize, "icon" | "icon-sm" | `glyph-${string}`>;

/** A button that carries its own name as an attribute — free to take ANY size, including the icon-only
 *  arms. Two members rather than one optional pair: `aria-label?: string | undefined` would be satisfied
 *  by omitting it, which is the hole this type exists to close (#1021). */
type NamedButtonProps = ButtonBaseProps & ({ "aria-label": string } | { "aria-labelledby": string });

/** Or the size leaves room for a text child, which names the button the way N1 prefers. A size the caller
 *  computes (`size={dense ? "icon" : "sm"}`) is NOT assignable here — a union that MIGHT be icon-only is
 *  treated as icon-only, so such a call site states its name. */
type TextButtonProps = ButtonBaseProps & { size?: Exclude<ButtonSize, IconOnlyButtonSize> };

/**
 * The D336 colour pair. An ink belongs to a fill-less style and excludes a non-neutral tone; `focal` belongs to the
 * solid style, the only one that draws the CTA lift. A computed style that names neither stays free to vary.
 */
type ButtonPaint = (
  | { ink?: never; focal?: never }
  | { variant?: "solid" | undefined; ink?: never; focal?: boolean | undefined }
  | { variant: Exclude<ButtonVariant, "solid">; focal?: never }
) &
  ToneInkSelection;

/**
 * ONE of the two: named by an attribute, or sized so a text child can name it. An icon-only `size` with
 * no `aria-label`/`aria-labelledby` matches neither and fails `tsc` — the compile-time half of §13.10 N1,
 * mirroring `OptionStrip`, which has required its `aria-label` since it landed. The runtime half
 * (`ui-audit`'s `checkAccessibleName`) still catches the shapes a type cannot see, e.g. an empty string.
 */
export type ButtonProps = (NamedButtonProps | TextButtonProps) & ButtonPaint;

export function Button(props: ButtonProps): ReactElement {
  const {
    className,
    variant = "solid",
    tone,
    ink,
    focal,
    size,
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
    loading = false,
    disabled = false,
    focusableWhenDisabled,
    ...rest
  } = props;
  const resolvedTone = tone ?? BUTTON_DEFAULT_TONE[variant];
  // A neutral ghost or link takes its host's ink (D336); an outline draws its own box in its tone's text role, and a
  // colour tone inks every fill-less style with that role.
  const resolvedInk = ink ?? ((variant === "ghost" || variant === "link") && resolvedTone === "neutral" ? "inherit" : undefined);
  // The selection rail keys its paint on `data-selected`, so the row's tone follows the same attribute.
  const selected = "data-selected" in props && props["data-selected"] !== undefined;
  const resolvedFocal = focal ?? (variant === "solid" && resolvedTone === "primary");
  // The className, the axis stamp and the D336 tone scope, from ONE selection object.
  const stamp = variantProps(
    buttonVariants,
    {
      variant,
      tone: resolvedTone,
      ink: resolvedInk,
      focal: resolvedFocal,
      size,
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
    },
    className,
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
      {...stamp}
      disabled={disabled || loading}
      // Loading is a transient busy state, not a real disablement — stay in the tab sequence for AT.
      focusableWhenDisabled={focusableWhenDisabled ?? loading}
      {...rest}
    />
  );
}
