import type { ReactElement } from "react";
import { cn } from "#lib";
import { Skeleton } from "#primitives/skeleton";

export interface StreamShimmerProps {
  /** Accessible name for the busy state — the caller supplies domain copy (e.g. "Generating a reply…"). */
  readonly label: string;
  readonly className?: string | undefined;
}

/**
 * The TTFT (time-to-first-token) affordance — a pulsing placeholder shown before the first
 * character of a stream has arrived (ui-package-design §6.3.1 layer 3: "cheap, domain-agnostic; the
 * pre-first-token state"). Two `Skeleton` bars read as a line of text about to appear, composed from
 * the existing seal rather than hand-rolled (primitive contract R3 — never re-invent what a sibling
 * primitive already ships).
 *
 * `role="status"` + `aria-label={label}` announce the busy state to assistive tech (`status`'s
 * accessible name is "name from author," not computed from content — a visually-hidden child span
 * alone leaves it unnamed; verified live against the CT accessible-name assertion). The pulse itself
 * is decorative (`Skeleton` is `aria-hidden`) and is squashed by the global reduced-motion floor
 * (styles/globals.css forces `animation-duration: 0.01ms` under `prefers-reduced-motion: reduce`) —
 * no JS branch needed here, unlike the pacer.
 *
 * Usage: `<StreamShimmer label="Generating a reply…" />`.
 */
export function StreamShimmer({ label, className }: StreamShimmerProps): ReactElement {
  return (
    <span
      role="status"
      aria-label={label}
      data-slot="stream-shimmer"
      className={cn("flex flex-col gap-field", className)}
    >
      <Skeleton variant="text" className="h-block w-full" />
      <Skeleton variant="text" className="h-block" />
    </span>
  );
}
