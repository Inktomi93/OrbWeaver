import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { SWATCH_FILL_PIGMENT, SWATCH_FILL_TONE, swatchVariants } from "./variants.ts";

export interface SwatchProps extends ComponentProps<"span">, VariantProps<typeof swatchVariants> {}

/**
 * Swatch — a decorative mark that is its colour: a palette sample, a presence dot, a pane in a preview of the shell.
 * It is `aria-hidden` by default; the fact it marks belongs in visible or announced text beside it. `className` places
 * it and never sizes or paints it.
 *
 * Usage: `<Swatch fill="success" shape="pill" size="dot" />`
 */
export function Swatch({ className, fill, shape, edge, size, grow, indeterminate, ...props }: SwatchProps): ReactElement {
  return (
    <span
      aria-hidden={true}
      data-pigment={SWATCH_FILL_PIGMENT[fill ?? "none"] ?? undefined}
      data-slot="swatch"
      data-tone={SWATCH_FILL_TONE[fill ?? "none"] ?? undefined}
      {...props}
      className={cn(swatchVariants({ fill, shape, edge, size, grow, indeterminate }), className)}
    />
  );
}
