// The run shapes of screen-record (`pnpm record`): the step tape, parsed args, the recording +
// render-job results. Split from the pre-move record.ts (P3 of #393).
import type { Viewport } from "@orb/tooling/_shared/argv";
import type { ProbeSession } from "@orb/tooling/_shared/browser";

export type Step =
  | { readonly kind: "click" | "jsclick" | "hover"; readonly selector: string }
  | { readonly kind: "fill"; readonly selector: string; readonly value: string }
  | { readonly kind: "wheel"; readonly selector: string; readonly dy: number }
  | { readonly kind: "pause"; readonly ms: number };

export interface Args {
  route: string;
  base: string;
  out: string;
  viewport: Viewport;
  settleMs: number;
  /** Non-null: dump one full-res PNG per step at dispatch+offset ms. */
  framesOffsetMs: number | null;
  steps: Step[];
  /** CLI misuse collected without side effects; any entry means EXIT.misuse before a browser boots. */
  errors: string[];
}

export interface TimedLine {
  readonly t: number;
  readonly label: string;
}

export interface Recording {
  readonly videoPath: string | null;
  readonly stepTimeline: TimedLine[];
  readonly clickTimes: TimedLine[];
  readonly perfLines: TimedLine[];
  readonly failures: number;
  readonly pageErrors: number;
}

export interface StepRun {
  readonly session: ProbeSession;
  readonly t0: number;
  readonly stepTimeline: TimedLine[];
  readonly clickTimes: TimedLine[];
  clickIndex: number;
}

export interface RenderJob {
  readonly ffmpeg: string;
  readonly rec: Recording;
  readonly webm: string;
  readonly outDir: string;
  readonly opts: Args;
}

export interface Rendered {
  gif: string | null;
  strips: number;
  frames: number;
}
