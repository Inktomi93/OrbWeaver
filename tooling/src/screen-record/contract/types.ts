// The run shapes of screen-record (`pnpm record`): the step tape, parsed args, the recording +
// render-job results. Split from the pre-move record.ts (P3 of #393).
import type { Viewport } from "@orb/tooling/_shared/argv";
import type { ProbeSession } from "@orb/tooling/_shared/browser-contract";

export type Step =
  | { readonly kind: "click" | "jsclick" | "hover"; readonly selector: string }
  | { readonly kind: "fill"; readonly selector: string; readonly value: string }
  | { readonly kind: "wheel"; readonly selector: string; readonly dy: number }
  | { readonly kind: "pause"; readonly ms: number };

export interface Args {
  /** `--help`/`-h` (HELP_FLAGS, `_shared/instrument-argv.ts`): print `RECORD_HELP` and exit 0 — before
   *  this family, `--help` was an unknown flag and exited 3 (design §1 P5, §4.3). */
  help: boolean;
  route: string;
  base: string;
  /** True once `--base` was passed explicitly — a `--session` attach without it falls back to the
   *  session's own bound URL instead of `DEFAULT_BASE` (#1289, design §3.6 "sibling instruments inherit
   *  the binding from the session"); an explicit `--base` still overrides (#1285's composing rule). */
  baseExplicit: boolean;
  isolated: boolean;
  ref: string | null;
  dirty: boolean;
  fresh: boolean;
  stageShortSha: string | null;
  out: string;
  json: boolean;
  viewport: Viewport;
  device: string | null;
  colorScheme: "light" | "dark" | null;
  reducedMotion: boolean;
  settleMs: number;
  /** Non-null: dump one full-res PNG per step at dispatch+offset ms. */
  framesOffsetMs: number | null;
  steps: Step[];
  /** `--session <name>` (#1285, WHERE_FLAGS `_shared/instrument-argv.ts`): attach to a live snap
   *  session's browser instead of launching a fresh one — null = launch (today's behaviour, unchanged).
   *  A record attach opens its OWN new context on the session browser (recordVideo can only be set at
   *  `newContext()` time), never the session's live page — see `_shared/browser.ts` `attachProbeSession`. */
  session: string | null;
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
