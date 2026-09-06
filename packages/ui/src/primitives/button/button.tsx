import type { ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { Button as BaseButton } from "@base-ui/react/button";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { buttonVariants } from "./variants.ts";

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
 * ONE of the two: named by an attribute, or sized so a text child can name it. An icon-only `size` with
 * no `aria-label`/`aria-labelledby` matches neither and fails `tsc` — the compile-time half of §13.10 N1,
 * mirroring `OptionStrip`, which has required its `aria-label` since it landed. The runtime half
 * (`ui-audit`'s `checkAccessibleName`) still catches the shapes a type cannot see, e.g. an empty string.
 */
export type ButtonProps = NamedButtonProps | TextButtonProps;

export function Button(props: ButtonProps): ReactElement {
  const { className, intent, size, shape, selection, loading = false, disabled = false, focusableWhenDisabled, ...rest } = props;
  // The className AND the `data-intent`/`data-size` axis stamp, from ONE selection object (#1080).
  const stamp = variantProps(buttonVariants, { intent, size, shape, selection }, className);
  return (
    <BaseButton
      data-slot="button"
      // The gradient-border accent ring keys off this attr, painting on the primary CTA only — read off
      // the RESOLVED arm (the stamp above), never the raw prop (#1242). `intent` DEFAULTS to `primary` in
      // the recipe, so `intent === "primary"` left every bare `<Button>` painting the primary fill with no
      // ring: nine live call sites, the shared form submit chrome among them, were a primary that did not
      // look like one. The stamp is the same `defaultVariants` lookup that picked the classes, so paint
      // and ring cannot disagree about which arm rendered.
      data-cta={stamp["data-intent"] === "primary" ? "" : undefined}
      aria-busy={loading ? true : undefined}
      {...stamp}
      disabled={disabled || loading}
      // Loading is a transient busy state, not a real disablement — stay in the tab sequence for AT.
      focusableWhenDisabled={focusableWhenDisabled ?? loading}
      {...rest}
    />
  );
}
