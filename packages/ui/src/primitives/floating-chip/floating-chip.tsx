import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { floatingChipVariants } from "./variants.ts";

type FloatingChipProps = ComponentProps<"div"> & { readonly presence: NonNullable<VariantProps<typeof floatingChipVariants>["presence"]> };

/** A chip that floats over a room's content, shown or hidden by `presence`. It stamps the neutral D336 scope. */
export function FloatingChip({ presence, className, ...rest }: FloatingChipProps): ReactElement {
  return <div {...rest} {...variantProps(floatingChipVariants, { presence }, className, "neutral")} data-slot="floating-chip" />;
}
