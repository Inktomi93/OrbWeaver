// The run shapes of cpu-profile (`pnpm perf-meter`): the step tape, parsed args, the in-page meter
// buckets, and the per-step report row. Split from the pre-move perf-meter.ts (P3 of #393).
import type { AppearancePatch } from "@orb/tooling/_shared/appearance";
import type { Viewport } from "@orb/tooling/_shared/argv";
import type { NavMethod } from "@orb/tooling/_shared/nav";
import type { ThemeRequest } from "@orb/tooling/_shared/theme";

export type Step =
  | { readonly kind: "click" | "jsclick" | "hover"; readonly selector: string }
  | { readonly kind: "fill"; readonly selector: string; readonly value: string }
  | { readonly kind: "wheel"; readonly selector: string; readonly dy: number }
  | {
      readonly kind: "wheelburst";
      readonly selector: string;
      readonly dy: number;
      readonly count: number;
    }
  | { readonly kind: "nav"; readonly method: NavMethod; readonly target: string }
  | { readonly kind: "pause"; readonly ms: number };

export interface Args {
  route: string;
  base: string;
  out: string;
  viewport: Viewport;
  settleMs: number;
  cycles: number;
  cpuProfile: boolean;
  steps: Step[];
  /** `--appearance`/`--appearance-preset`/`--full-motion`: the app-SETTING shim (_shared/appearance.ts). The
   *  browser-level `reducedMotion:false` below is only the OS media query; an INP/LoAF number taken while
   *  the app's own reduce-motion setting is on describes a surface with its transitions removed. */
  appearance: AppearancePatch | null;
  /** `--theme <name|id|none>`: the ACTIVE THEME this run pretends is selected, shimmed over the same
   *  `settings.getUserSettings` response (never written — _shared/theme.ts). null = the account's own theme. */
  theme: ThemeRequest | null;
  /** CLI misuse collected without side effects; any entry means exit 2 before a browser boots. */
  errors: string[];
}

/** \`dur\` is the LoAF frame duration (or the raw \`longtask\` duration on the fallback path);
 *  \`blockingDuration\`/\`worstScript\` are LoAF-only attribution, null on the \`longtask\` fallback. */
export interface LongTask {
  readonly t: number;
  readonly dur: number;
  readonly blockingDuration: number | null;
  readonly worstScript: string | null;
}
export interface PerfEvent {
  readonly t: number;
  readonly type: string;
  readonly inputDelay: number;
  readonly processing: number;
  readonly dur: number;
}
interface Shift {
  readonly t: number;
  readonly value: number;
}
interface RafGap {
  readonly t: number;
  readonly gap: number;
}
interface StepMark {
  readonly idx: number;
  readonly label: string;
  readonly t: number;
}

export interface MeterData {
  readonly longTasks: LongTask[];
  readonly events: PerfEvent[];
  readonly shifts: Shift[];
  readonly rafGaps: RafGap[];
  readonly stepMarks: StepMark[];
}

export interface MeterWindow {
  __perfMeter: MeterData & { markStep: (i: number, l: string) => void };
}

export interface StepReport {
  readonly idx: number;
  readonly label: string;
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
  readonly longTaskWorstMs: number;
  readonly worstBlockingMs: number | null;
  readonly worstScript: string | null;
  readonly clickDurMs: number | null;
  readonly clickInputDelayMs: number | null;
  readonly worstRafGapMs: number;
  readonly shiftScore: number;
}
