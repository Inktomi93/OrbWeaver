import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { swatchVariants } from "./variants.ts";

export interface SwatchProps extends ComponentProps<"span">, VariantProps<typeof swatchVariants> {}

/**
 * Swatch — a decorative mark that is its colour: a palette sample, a presence dot, a pane in a preview of the shell.
 * It is `aria-hidden` by default; the fact it marks belongs in visible or announced text beside it. `className` sizes
 * and places it and never paints it.
 *
 * Usage: `<Swatch fill="success" shape="pill" className="block-(--size-dot) inline-(--size-dot)" />`
 */
export function Swatch({ className, fill, shape, edge, ...props }: SwatchProps): ReactElement {
  return <span aria-hidden={true} data-slot="swatch" {...props} className={cn(swatchVariants({ fill, shape, edge }), className)} />;
}
