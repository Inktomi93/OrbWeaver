import type { ReactElement } from "react";
import { cn } from "#lib";
import { Skeleton } from "#primitives/skeleton";

export interface StreamShimmerProps {
  /** Accessible name for the busy state — the caller supplies domain copy (e.g. "Generating a reply…"). */
  readonly label: string;
  readonly className?: string | undefined;
}

// TTFT affordance shown before a stream's first character arrives. `aria-label` is required —
// `role="status"`'s accessible name is "name from author," not computed from content.
export function StreamShimmer({ label, className }: StreamShimmerProps): ReactElement {
  return (
    <span
      role="status"
      aria-label={label}
      data-slot="stream-shimmer"
      className={cn("flex w-full flex-col gap-field", className)}
    >
      <Skeleton variant="text" className="h-block w-full" />
      <Skeleton variant="text" className="h-block" />
    </span>
  );
}
