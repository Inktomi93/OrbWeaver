import type { ReactElement } from "react";
import { StreamShimmer } from "./shimmer";
import { useSmoothText } from "./use-smooth-text";

const STREAM_STATUSES = ["streaming", "done"] as const;
export type StreamStatus = (typeof STREAM_STATUSES)[number];

// No single "right" pace — 40 cps sits comfortably above typical reading speed (~15–25 cps) so the
// pacer rarely lags a fast source, while still smoothing bursty chunk delivery. Callers tune via `cps`.
const DEFAULT_CPS = 40;

export interface StreamTextProps {
  /** The accumulated target text — grows as tokens arrive; the full string once `status: "done"`. */
  readonly text: string;
  readonly status: StreamStatus;
  /** The pacer's trickle floor, chars/second. */
  readonly cps?: number;
  /** Accessible name for the pre-first-token shimmer. */
  readonly shimmerLabel?: string;
  readonly className?: string;
}

/**
 * The plain-text streaming display: the TTFT shimmer before any content, then `useSmoothText`'s
 * paced reveal once characters start arriving (ui-package-design §6.3.1). Domain-free — for a
 * markdown-rendered stream, use `useSmoothText` directly and feed its output into `@orb/ui/markdown`
 * instead (the pipeline is "tokens → useSmoothText → Streamdown"; this component is the
 * plain-text-only convenience wrapper, e.g. a reasoning/preview line).
 *
 * The shimmer shows exactly while streaming AND nothing has been REVEALED yet — not merely while
 * `text` is empty. A still-growing target whose first word has no trailing whitespace yet is held
 * back by the pacer's word-snap (never flash a fragment), so the shimmer correctly persists a beat
 * longer than "the first byte arrived."
 *
 * Usage: `<StreamText text={accumulated} status={isStreaming ? "streaming" : "done"} />`.
 */
export function StreamText({
  text,
  status,
  cps = DEFAULT_CPS,
  shimmerLabel = "Loading",
  className,
}: StreamTextProps): ReactElement {
  const paced = useSmoothText(text, { enabled: status === "streaming", cps });
  if (status === "streaming" && paced.length === 0) {
    return <StreamShimmer label={shimmerLabel} className={className} />;
  }
  return (
    <span data-slot="stream-text" className={className}>
      {paced}
    </span>
  );
}
