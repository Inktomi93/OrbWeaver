import type { ReactElement } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Loader2/Icon fine (the icon-story.tsx precedent).
import { Icon, Loader2 } from "#primitives/icons";
import { spinner } from "./variants";

export interface SpinnerProps {
  // Inline union (not a named tuple): {sm,md,lg} is the ubiquitous control-size scale — a competing
  // `as const` tuple would false-collide with every other size union under the no-inline-union gate.
  // Passes straight to <Icon size> (icons/icon.tsx's `keyof typeof ICON_SIZES` is the same set).
  size?: "sm" | "md" | "lg";
  /** Accessible name announced by `role="status"` — required (a spinner is a live status). */
  label: string;
  className?: string;
}

/**
 * Spinner — an inline, spinning loading indicator: the lucide `Loader2` glyph (through the
 * `@orb/ui/icons` seal + the `<Icon>` size wrapper — no hand-rolled SVG) in a `role="status"` live
 * region with a visually-hidden label. For inline / button-busy states; design PREFERS skeletons for
 * layout loading (ui-package-design §6.1).
 *
 * Usage: `<Spinner size="sm" label="Saving…" />`.
 */
export function Spinner({ size = "md", label, className }: SpinnerProps): ReactElement {
  const slots = spinner();
  return (
    <span className={slots.root({ className })} role="status">
      <Icon icon={Loader2} size={size} className={slots.icon()} />
      <span className={slots.label()}>{label}</span>
    </span>
  );
}
