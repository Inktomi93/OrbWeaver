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
 * A11y convention: because each Skeleton is `aria-hidden`, the loading STATE is invisible to
 * assistive tech unless the CALLER announces it. Wrap the loading region in a container that carries
 * `aria-busy={true}` (and, for content that will be read on arrival, an `aria-live="polite"` region)
 * so a screen reader hears "busy" while skeletons show and the real content once it swaps in:
 * `<div aria-busy={isLoading}>{isLoading ? <Skeleton … /> : <RealContent />}</div>`.
 *
 * Usage: `<Skeleton variant="circle" className="size-control-md" />` for an avatar placeholder.
 */
export function Skeleton({ className, variant, ...props }: SkeletonProps): ReactElement {
  return (
    <div aria-hidden={true} className={cn(skeletonVariants({ variant }), className)} {...props} />
  );
}
