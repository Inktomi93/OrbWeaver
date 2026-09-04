// ZERO HYGIENE (#409) — perf-meter's half of the fleet rule in _shared/evidence.ts (read that first).
//
// This tool is a METER, not a gate: its verdict surface is the per-step table and `breach-steps`, and
// the exit reddens only when the interaction itself broke. That makes it MORE exposed to the zero lie,
// not less — `breach-steps=0 worst-longtask=0ms` over a run that bucketed nothing is indistinguishable
// from a run that metered a fast app. Both gaps below therefore refuse the report entirely.
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { z } from "zod";
import type { MeterData } from "../contract/types.ts";

const finite = z.number();
const meterDataSchema: z.ZodType<MeterData> = z.object({
  longTasks: z.array(z.object({ t: finite, dur: finite, blockingDuration: finite.nullable(), worstScript: z.string().nullable() })),
  events: z.array(z.object({ t: finite, type: z.string(), inputDelay: finite, processing: finite, dur: finite })),
  shifts: z.array(z.object({ t: finite, value: finite })),
  rafGaps: z.array(z.object({ t: finite, gap: finite })),
  stepMarks: z.array(z.object({ idx: z.number().int().nonnegative(), label: z.string(), t: finite })),
  installed: z.array(z.string()).optional(),
});

export function parseMeterData(value: unknown): MeterData | null {
  const parsed = meterDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The in-page meter is the apparatus: no `window.__perfMeter`, no numbers of any kind. */
export function meterApparatusGap(url: string): EvidenceGap {
  return {
    evidence: "the in-page meter (window.__perfMeter)",
    detail: `${url} answered with no meter object — the init script never ran, or the page replaced/deleted the global; every bucket below would be an unmeasured zero`,
  };
}

/** The evidence a report needs that this run may not have collected.
 *
 *  WHY an empty STEP population is a hard gap: every number perf-meter prints is bucketed into a
 *  [mark, nextMark) window, so a tape with no steps produces no window, and the RESULT line's
 *  `steps=0 breach-steps=0 worst-longtask=0ms` is arithmetic over an empty set — it reads exactly like
 *  a clean measurement of a fast app. The one exception is a completed `--boot-trace`: that arm owns a
 *  separately refused navigation/insight population, while the CPU profiler still starts AFTER settle.
 *
 *  WHY the observer census: each `observe()` in ops/meter.ts is wrapped in a catch that leaves its
 *  bucket empty. An empty `longTasks` from a smooth page and one from an observer that never attached
 *  are the same bytes — `installed` is the only thing that tells them apart. Absent field = an older
 *  injected meter, read as unknown rather than as absent. */
export function meterEvidenceGaps(data: MeterData, bootTraceMeasured = false): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  if (data.stepMarks.length === 0 && !bootTraceMeasured) {
    gaps.push({
      evidence: "the measurement window population",
      detail:
        "no step was dispatched, so nothing was bucketed — give the tape at least one step (--click/--hover/--wheel/--goto/…); a zero table here is an empty set, not a fast app",
    });
  }
  if (data.installed !== undefined && !data.installed.some((type) => type === "long-animation-frame" || type === "longtask")) {
    gaps.push({
      evidence: "the long-task observer",
      detail:
        "neither long-animation-frame nor longtask attached in this page, so the long-task buckets are structurally empty — every longtask/blocking column would be an unmeasured zero",
    });
  }
  return gaps;
}
