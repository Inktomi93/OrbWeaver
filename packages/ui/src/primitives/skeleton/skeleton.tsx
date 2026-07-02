import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { skeletonVariants } from "./variants";

export interface SkeletonProps
  extends ComponentProps<"div">,
    VariantProps<typeof skeletonVariants> {}

/**
 * Skeleton — a muted, `animate-pulse` loading placeholder. The caller owns the box: size it via
 * `className` (`<Skeleton className="h-control-md w-full" />`). Design prefers skeletons over
 * spinners for layout loading (ui-package-design §6.1). Decorative by default (`aria-hidden`).
 *
 * Usage: `<Skeleton variant="circle" className="size-control-md" />` for an avatar placeholder.
 */
export function Skeleton({ className, variant, ...props }: SkeletonProps): ReactElement {
  return (
    <div aria-hidden={true} className={cn(skeletonVariants({ variant }), className)} {...props} />
  );
}
