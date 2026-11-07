import type { ReactElement } from "react";
import { FIELD_STACK } from "#lib";
import { Skeleton } from "#primitives/skeleton";

export interface StreamShimmerProps {
  /** Accessible name for the busy state — the caller supplies domain copy (e.g. "Generating a reply…"). */
  readonly label: string;
}

// TTFT affordance shown before a stream's first character arrives. `aria-label` is required —
// `role="status"`'s accessible name is "name from author," not computed from content.
export function StreamShimmer({ label }: StreamShimmerProps): ReactElement {
  return (
    <span role="status" aria-label={label} data-slot="stream-shimmer" className={`${FIELD_STACK} inline-full`}>
      <Skeleton variant="text" className="block-block inline-full" />
      <Skeleton variant="text" className="block-block" />
    </span>
  );
}
