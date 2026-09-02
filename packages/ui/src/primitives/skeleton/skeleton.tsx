import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { skeletonVariants } from "./variants.ts";

export interface SkeletonProps extends ComponentProps<"div">, VariantProps<typeof skeletonVariants> {}

// Decorative by default (aria-hidden). Because the loading state is invisible to assistive tech, wrap
// the loading region in a container carrying aria-busy so a screen reader hears "busy" while skeletons show.
export function Skeleton({ className, variant, ...props }: SkeletonProps): ReactElement {
  // The className AND the `data-variant` axis stamp, from ONE selection object (#1080).
  return <div data-slot="skeleton" aria-hidden={true} {...variantProps(skeletonVariants, { variant }, className)} {...props} />;
}
