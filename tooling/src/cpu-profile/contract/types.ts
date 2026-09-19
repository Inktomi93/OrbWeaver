// The run shapes of cpu-profile (Snap's `--perf`/`--cpu-profile` arms): the step tape, parsed args, the in-page meter
// buckets, and the per-step report row. Split from the pre-move perf-meter.ts (P3 of #393).
export const BOOT_TRACE_INSIGHTS = ["LCPBreakdown", "CLSCulprits", "NetworkDependencyTree", "ImageDelivery", "DocumentLatency", "ForcedReflow"] as const;

export type BootTraceInsightName = (typeof BOOT_TRACE_INSIGHTS)[number];

export interface BootTraceInsightReceipt {
  readonly state: "pass" | "fail" | "informative";
  readonly details: Readonly<Record<string, unknown>>;
}

export interface BootTraceReceipt {
  readonly eventCount: number;
  readonly navigationId: string;
  readonly url: string;
  readonly lcpMs: number;
  readonly rawTracePath: string;
  readonly insights: Readonly<Record<BootTraceInsightName, BootTraceInsightReceipt>>;
}

/** Raw bytes have been written. Completeness proves the CDP stop protocol, not successful analysis. */
export interface BootTraceRetention {
  readonly complete: boolean;
  readonly eventCount: number;
}

export interface BootTraceRetentionContext {
  readonly earlierFailures: readonly unknown[];
  readonly onRetained: ((retained: BootTraceRetention) => Promise<void>) | undefined;
}

/** \`dur\` is the LoAF frame duration (or the raw \`longtask\` duration on the fallback path);
 *  \`blockingDuration\`/\`worstScript\` are LoAF-only attribution, null on the \`longtask\` fallback.
 *
 *  \`worstScript\` IS AN ENTRY POINT, NOT A COST (#2439, and it misdirected #2427 the day it was filed).
 *  LoAF's \`scripts\` entries name the script that ENTERED the task — \`sourceFunctionName\`, else the
 *  \`invoker\` — and the duration they carry is the whole synchronous subtree that entry drove. A DOM
 *  handler that calls one setState therefore owns the entire re-render that follows, and reads here as
 *  "this file spent N ms" while its own self time is a rounding error (the lane that profiled
 *  \`row-roving.ts\` measured 6 of 43,269 samples). Printed as \`entry=\` for exactly that reason. SELF time
 *  is a different instrument: take a separate \`--cpu-profile\` pass, which \`--perf\` refuses to combine
 *  with because sampling overhead contaminates interaction rates (snap/ops/parse.ts). */
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
  /** The observer types that actually INSTALLED in the page (ops/meter.ts). An empty `longTasks` from a
   *  quiet page and one from an observer that never attached look identical; this is the difference
   *  (#409). Optional: a page carrying an OLDER injected meter (`--base` at an old sha) has no field,
   *  which reads as "unknown", never as "absent". */
  readonly installed?: readonly string[] | undefined;
}

export interface MeterWindow {
  /** OPTIONAL on purpose (#409): the meter rides an init script, and a page can outlive or replace
   *  it. A non-optional field here typed the apparatus gap out of existence — the read in ops/run.ts
   *  then looked like a dead check while the runtime hole stayed open. */
  __perfMeter?: MeterData & { markStep: (i: number, l: string) => void };
}

export interface StepReport {
  readonly idx: number;
  readonly label: string;
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
  readonly longTaskWorstMs: number;
  readonly worstBlockingMs: number | null;
  /** The worst long task's ENTRY POINT script, never its cost — see \`LongTask.worstScript\`. Rendered in
   *  the table as \`entry=<fn>\` so the token stays honest when a reader quotes it out of the table. */
  readonly worstScript: string | null;
  readonly clickDurMs: number | null;
  readonly clickInputDelayMs: number | null;
  readonly clickProcessingMs: number | null;
  readonly worstRafGapMs: number;
  readonly shiftScore: number;
}
