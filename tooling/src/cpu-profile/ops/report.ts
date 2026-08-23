// Bucket the meter's entries into per-step windows + print the table.
import { print } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { LongTask, MeterData, PerfEvent, StepReport } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm perf-meter");

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
      worstRafGapMs: Math.round(gaps.reduce((a, x) => Math.max(a, x.gap), 0)),
      shiftScore: Number(
        inWin(data.shifts)
          .reduce((a, x) => a + x.value, 0)
          .toFixed(SHIFT_DECIMALS),
      ),
    };
  });
}

export function printTable(reports: readonly StepReport[]): void {
  print("idx  longTasks(total/worst)  blocking  script  click(dur/delay)  rafGap  shift  label");
  for (const r of reports) {
    const lt = `${String(r.longTaskCount).padStart(2)} (${String(r.longTaskTotalMs).padStart(MS_PAD_4)}/${String(r.longTaskWorstMs).padStart(MS_PAD_4)})`;
    const blocking = r.worstBlockingMs === null ? "  —" : `${String(r.worstBlockingMs).padStart(MS_PAD_3)}ms`;
    const click = r.clickDurMs === null ? "      —     " : `${String(r.clickDurMs).padStart(MS_PAD_5)}/${String(r.clickInputDelayMs).padStart(MS_PAD_4)}`;
    print(
      [
        String(r.idx).padStart(IDX_PAD),
        lt,
        blocking,
        r.worstScript ?? "—",
        click,
        String(r.worstRafGapMs).padStart(MS_PAD_5),
        String(r.shiftScore).padStart(MS_PAD_6),
        r.label.slice(0, LABEL_MAX),
      ].join("  "),
    );
  }
}
