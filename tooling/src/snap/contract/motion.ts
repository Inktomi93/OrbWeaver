import type { TimingCapability } from "../../floor/host/timing-capability.ts";
import type { EvidenceGap } from "../../floor/verdict/evidence.ts";
import type { AuditData } from "../../motion-audit/index.ts";

/** One rAF reading of a snapshot's computed opacity, in ms since the transition's `ready`. */
export interface CrossfadeSample {
  readonly t: number;
  readonly opacity: number;
}

/** One `::view-transition-old(<name>)` or `-new(<name>)` snapshot and the fade its live animation declares. */
export interface CrossfadeTrack {
  readonly pseudo: string;
  readonly from: number;
  readonly to: number;
  readonly samples: readonly CrossfadeSample[];
}

export interface CrossfadeTransition {
  /** `unfinished`: still running when the window closed; `skipped`: it ended before any snapshot animated;
   *  `interrupted`: it ended mid-fade, superseded by a later transition or `skipTransition()`. */
  readonly outcome: "finished" | "skipped" | "interrupted" | "unfinished";
  readonly tracks: readonly CrossfadeTrack[];
}

export interface CrossfadeEvidence {
  /** False when the page has no `document.startViewTransition`: the channel could not look. */
  readonly supported: boolean;
  readonly transitions: readonly CrossfadeTransition[];
}

export interface MotionMeasurement {
  readonly data: AuditData | null;
  /** The window's view-transition snapshot samples; null when no window ran. */
  readonly crossfade: CrossfadeEvidence | null;
  readonly timing: TimingCapability;
  readonly gaps: readonly EvidenceGap[];
  readonly pass: boolean;
  readonly artifact: string | null;
  /** A loaded run still measures; only its timing thresholds become non-voting. */
  readonly loadSuspect: string | null;
}
