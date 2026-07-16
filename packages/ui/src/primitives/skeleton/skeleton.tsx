import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { skeletonVariants } from "./variants";

export interface SkeletonProps extends ComponentProps<"div">, VariantProps<typeof skeletonVariants> {}

// Decorative by default (aria-hidden). Because the loading state is invisible to assistive tech, wrap
// the loading region in a container carrying aria-busy so a screen reader hears "busy" while skeletons show.
export function Skeleton({ className, variant, ...props }: SkeletonProps): ReactElement {
  return <div data-slot="skeleton" aria-hidden={true} className={cn(skeletonVariants({ variant }), className)} {...props} />;
}
