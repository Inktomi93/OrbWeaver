// Compact bridge summary readers. They deliberately consume the same motion stores as the full handle;
// this file owns presentation-only aggregation while agent-bridge.ts retains the exhaustive registries and
// sole global installer required by the bridge lock.

import { motionFlags } from "./motion-flaggers.ts";
import { motionSnapshot } from "./motion-stats.ts";

/** Headline motion values for snap(); the full rings remain available through their dedicated readers. */
export function motionSummary(): {
  loafs: number;
  worstBlocking: number;
  cls: number;
  observedCls: number;
  nonVirtualizedCls: number;
  dirtyAnimationFlags: number;
} {
  const motion = motionSnapshot();
  return {
    loafs: motion.loafs.length,
    worstBlocking: motion.worstBlocking,
    cls: motion.cls,
    observedCls: motion.observedCls,
    nonVirtualizedCls: motion.nonVirtualizedCls,
    dirtyAnimationFlags: motionFlags().filter((flag) => flag.tag === "anim").length,
  };
}

/** Raised motion flags counted by channel for the bridge's one-call overview. */
export function flagCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const flag of motionFlags()) {
    counts[flag.tag] = (counts[flag.tag] ?? 0) + 1;
  }
  return counts;
}
