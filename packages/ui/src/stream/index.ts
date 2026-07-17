/**
 * `@orb/ui/stream` — the domain-free streaming-text seal (ui-package-design §6.3.1): the smooth-text
 * pacer (`useSmoothText`) + the pending affordances (`StreamShimmer` TTFT skeleton, `TypingDots`
 * pre-first-token pulse), composed into a plain-text display (`StreamText`). Pure string-math + CSS, no
 * external lib. Lives at `src/stream/`, a top-level sibling of `primitives/` (matching
 * `markdown/`/`diff/`/`content/` — ui-package-design §2's tree).
 */

export type { StreamShimmerProps } from "./shimmer";
export { StreamShimmer } from "./shimmer";
export { snapToGraphemeBoundary, snapToWordBoundary } from "./snap";
export type { StreamStatus, StreamTextProps } from "./stream-text";
export { StreamText } from "./stream-text";
export type { TypingDotsProps } from "./typing-dots";
export { TypingDots } from "./typing-dots";
export type { UseSmoothTextOptions } from "./use-smooth-text";
export { useSmoothText } from "./use-smooth-text";
