import type { ReactElement } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Loader2/Icon fine (the icon-story.tsx precedent).
import { Icon, Loader2 } from "#primitives/icons";
import { spinnerVariants } from "./variants";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Accessible name announced by `role="status"` — required (a spinner is a live status). */
  label: string;
  className?: string;
}

/** Inline, spinning loading indicator for inline/button-busy states; design prefers skeletons for layout loading. */
export function Spinner({ size = "md", label, className }: SpinnerProps): ReactElement {
  const slots = spinnerVariants();
  return (
    <span data-slot="spinner" className={slots.root({ className })} role="status">
      <Icon icon={Loader2} size={size} className={slots.icon()} />
      <span className={slots.label()}>{label}</span>
    </span>
  );
}
