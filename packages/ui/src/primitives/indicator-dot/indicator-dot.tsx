import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { indicatorDotVariants } from "./variants.ts";

export interface IndicatorDotProps extends Omit<ComponentProps<"span">, "children">, VariantProps<typeof indicatorDotVariants> {}

/**
 * IndicatorDot — a childless circle meaning "something is here", with no number in it. Pass `aria-hidden` when the fact
 * it marks belongs to the host control's accessible name, or `role="img"` with an `aria-label` when the dot is the only
 * carrier. Its position belongs to the call site.
 */
export function IndicatorDot({ className, tone, variant, corner, ...props }: IndicatorDotProps): ReactElement {
  return <span data-slot="badge" {...props} {...variantProps(indicatorDotVariants, { tone, variant, corner }, className, tone ?? "neutral")} />;
}
