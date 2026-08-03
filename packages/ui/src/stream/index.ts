/**
 * `@orb/ui/stream` — the domain-free streaming-text seal (ui-package-design §6.3.1): the smooth-text
 * pacer (`useSmoothText`) + the pending affordances (`StreamShimmer` TTFT skeleton, `TypingDots`
 * pre-first-token pulse), composed into a plain-text display (`StreamText`). Pure string-math + CSS, no
 * external lib. Lives at `src/stream/`, a top-level sibling of `primitives/` (matching
 * `markdown/`/`diff/`/`content/` — ui-package-design §2's tree).
 */

export type { StreamShimmerProps } from "./shimmer.tsx";
export { StreamShimmer } from "./shimmer.tsx";
export { snapToGraphemeBoundary, snapToWordBoundary } from "./snap.ts";
export type { StreamStatus, StreamTextProps } from "./stream-text.tsx";
export { StreamText } from "./stream-text.tsx";
export type { TypingDotsProps } from "./typing-dots.tsx";
export { TypingDots } from "./typing-dots.tsx";
export type { UseSmoothTextOptions } from "./use-smooth-text.ts";
export { useSmoothText } from "./use-smooth-text.ts";
