import type { ReactElement } from "react";
import { cn } from "#lib";

export interface TypingDotsProps {
  /** Accessible name for the pending state — the caller supplies domain copy (e.g. "Generating a reply…"). */
  readonly label: string;
  readonly className?: string | undefined;
}

// The pending "typing" affordance shown before a stream's first token (the ghost row's pre-first-token
// window; a calmer sibling of `StreamShimmer`). Three muted dots pulse via the `orb-typing-dot`
// @keyframes utility in `styles/globals.css` — a Tailwind transition can't express a looping pulse.
// Reduced motion is handled ENTIRELY by that file's unlayered `animation-*: 0.01ms !important` floor
// (OS @media + `[data-reduced-motion]`): the dots freeze at their resting (non-zero) opacity, still
// visible and static. `aria-label` is required — `role="status"` computes its name from the author.
// The dots themselves are decorative (`aria-hidden`); the container carries the announced name.
export function TypingDots({ label, className }: TypingDotsProps): ReactElement {
  return (
    <span role="status" aria-label={label} data-slot="typing-dots" className={cn("inline-flex items-center gap-field py-field", className)}>
      <span aria-hidden="true" className="orb-typing-dot size-1 rounded-full bg-muted-foreground" />
      <span aria-hidden="true" className="orb-typing-dot size-1 rounded-full bg-muted-foreground" />
      <span aria-hidden="true" className="orb-typing-dot size-1 rounded-full bg-muted-foreground" />
    </span>
  );
}
