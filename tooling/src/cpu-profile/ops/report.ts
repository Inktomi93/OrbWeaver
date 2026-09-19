// Bucket the meter's entries into per-step windows + print the table.
import { print } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { LongTask, MeterData, PerfEvent, StepReport } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --perf");

const LABEL_MAX = 70;
const IDX_PAD = 3;
const MS_PAD_4 = 4;
const MS_PAD_5 = 5;
const MS_PAD_6 = 6;
const SHIFT_DECIMALS = 4;
const MS_PAD_3 = 3;

/** Bucket long tasks / click events / rAF gaps / layout shifts into [mark.t, nextMark.t) windows. */
export function buildReports(data: MeterData): StepReport[] {
  const marks = data.stepMarks;
  const windowEnd = (i: number): number => {
    const next = marks[i + 1];
    return next === undefined ? Number.POSITIVE_INFINITY : next.t;
  };
  return marks.map((mk, i) => {
    const end = windowEnd(i);
    const inWin = <T extends { readonly t: number }>(xs: readonly T[]): T[] => xs.filter((x) => x.t >= mk.t && x.t < end);
    const lts = inWin(data.longTasks);
    const worstLt = lts.reduce<LongTask | null>((acc, x) => (acc === null || x.dur > acc.dur ? x : acc), null);
    const clicks = inWin(data.events).filter((e) => e.type === "click" || e.type === "pointerup");
    const worstClick = clicks.reduce<PerfEvent | null>((acc, c) => (acc === null || c.dur > acc.dur ? c : acc), null);
    const gaps = inWin(data.rafGaps);
    return {
      idx: mk.idx,
      label: mk.label,
      longTaskCount: lts.length,
      longTaskTotalMs: Math.round(lts.reduce((a, x) => a + x.dur, 0)),
      longTaskWorstMs: Math.round(lts.reduce((a, x) => Math.max(a, x.dur), 0)),
      worstBlockingMs: worstLt?.blockingDuration === null || worstLt?.blockingDuration === undefined ? null : Math.round(worstLt.blockingDuration),
      worstScript: worstLt?.worstScript ?? null,
      clickDurMs: worstClick === null ? null : Math.round(worstClick.dur),
      clickInputDelayMs: worstClick === null ? null : Math.round(worstClick.inputDelay),
      clickProcessingMs: worstClick === null ? null : Math.round(worstClick.processing),
      worstRafGapMs: Math.round(gaps.reduce((a, x) => Math.max(a, x.gap), 0)),
      shiftScore: Number(
        inWin(data.shifts)
          .reduce((a, x) => a + x.value, 0)
          .toFixed(SHIFT_DECIMALS),
      ),
    };
  });
}

/** THE SEMANTICS LINE, PRINTED EVERY RUN (#2439). The column used to be headed `script` and to carry a
 *  bare `fn`, which reads as "this function spent that time" — it is the opposite claim: LoAF attributes
 *  the task to the script that ENTERED it, and the cost printed beside it belongs to everything that entry
 *  synchronously drove. #2427 lost a profiling pass to exactly that read. The cell now carries its own
 *  `entry=` prefix so the token survives being quoted away from this legend, and the legend names the arm
 *  that DOES answer "which function is hot" — a separate `--cpu-profile` pass, separate because `--perf`
 *  refuses to combine with it (sampling overhead contaminates the interaction rates this table reports). */
export const PERF_ENTRY_LEGEND =
  "entry= is the LoAF task's ENTRY POINT script, NOT its self time: a handler that calls one setState owns the whole re-render it drove. For self time take a separate --cpu-profile pass.";

/** The table as lines, pure — `printTable` only writes them. Split so the entry-column semantics are
 *  assertable without capturing stdout (tests/tooling/cpu-profile/ops/report.test.ts). */
export function perfTableLines(reports: readonly StepReport[]): readonly string[] {
  const rows = reports.map((r) => {
    const lt = `${String(r.longTaskCount).padStart(2)} (${String(r.longTaskTotalMs).padStart(MS_PAD_4)}/${String(r.longTaskWorstMs).padStart(MS_PAD_4)})`;
    const blocking = r.worstBlockingMs === null ? "  —" : `${String(r.worstBlockingMs).padStart(MS_PAD_3)}ms`;
    const click =
      r.clickDurMs === null
        ? "      —          "
        : `${String(r.clickDurMs).padStart(MS_PAD_5)}/${String(r.clickInputDelayMs).padStart(MS_PAD_4)}/${String(r.clickProcessingMs).padStart(MS_PAD_4)}`;
    return [
      String(r.idx).padStart(IDX_PAD),
      lt,
      blocking,
      r.worstScript === null ? "—" : `entry=${r.worstScript}`,
      click,
      String(r.worstRafGapMs).padStart(MS_PAD_5),
      String(r.shiftScore).padStart(MS_PAD_6),
      r.label.slice(0, LABEL_MAX),
    ].join("  ");
  });
  return [PERF_ENTRY_LEGEND, "idx  longTasks(total/worst)  blocking  task-entry  click(dur/delay/work)  rafGap  shift  label", ...rows];
}

export function printTable(reports: readonly StepReport[]): void {
  for (const line of perfTableLines(reports)) {
    print(line);
  }
}
