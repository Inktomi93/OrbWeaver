import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { themePreviewPaneVariants } from "./preview-pane-variants.ts";

type ThemePreviewPaneProps = ComponentProps<"div"> &
  VariantProps<typeof themePreviewPaneVariants> & { readonly fill: NonNullable<VariantProps<typeof themePreviewPaneVariants>["fill"]> };

/**
 * A pane in a preview of the app's shell or palette, filled as the surface it stands for. It stamps the neutral D336
 * scope, because the fill is a shell surface and not a tone. An island pane takes the card slot, so `tiers.css` resolves
 * its inset and radius from the surface's tier; a row or inset pane is its own box at every tier.
 */
export function ThemePreviewPane({ fill, shape, padding, lifted, className, ...rest }: ThemePreviewPaneProps): ReactElement {
  const slot = shape === undefined || shape === "island" ? { "data-slot": "card-root" } : { "data-slot": "theme-preview-pane" };
  return (
    <div
      {...rest}
      {...variantProps(themePreviewPaneVariants, { fill, shape, padding, lifted }, className, "neutral")}
      data-padding={padding === "none" ? "none" : undefined}
      {...slot}
    />
  );
}
