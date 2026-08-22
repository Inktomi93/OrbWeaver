// CDP performance trace -> Percent Dropped Frames. PipelineReporter begin events carry the frame's
// lifecycle under `args.frame_reporter`; the fraction whose nested report is dropped and affects
// smoothness is the ground-truth "smooth?" number no in-page API exposes. Pure over trace events.
import type { CalibratedFrames, FrameTotals, TraceEvent } from "../contract/types.ts";

const PCT = 100;

/** `dropped/total` as a percentage, or NULL when the population is empty — `0%` over zero frames is a
 *  smoothness claim nothing observed (#409). The caller decides what an absent population means;
 *  lib/evidence.ts turns an absent RAW one into EXIT.toolError. */
function pctOf(dropped: number, total: number): number | null {
  return total === 0 ? null : Number(((dropped / total) * PCT).toFixed(2));
}

export function droppedFramePct(events: readonly TraceEvent[]): FrameTotals {
  const frames = events.filter((event) => event.name === "PipelineReporter" && event.args?.frame_reporter !== undefined);
  const dropped = frames.filter(
    (event) => event.args?.frame_reporter?.state === "STATE_DROPPED" && event.args.frame_reporter.affects_smoothness === true,
  ).length;
  const total = frames.length;
  return { total, dropped, pct: pctOf(dropped, total) };
}

interface PairedFrame {
  readonly begin: TraceEvent;
  readonly start: number;
  readonly end: number;
}
interface TraceRange {
  readonly start: number;
  readonly confirmed: number;
  readonly end: number;
}

const SELECT_TRACE_MARK = /^orb:select-entrance:(\d+):(start|confirmed|end)$/u;

function traceId(event: TraceEvent): string | undefined {
  const local = event.id2?.local;
  return local === undefined || event.pid === undefined || event.tid === undefined ? undefined : `${event.pid}:${event.tid}:${local}`;
}

function pairedPipelineFrames(events: readonly TraceEvent[]): PairedFrame[] {
  const begins = new Map<string, TraceEvent>();
  const pairs: PairedFrame[] = [];
  for (const event of events) {
    if (event.name !== "PipelineReporter" || event.ts === undefined) {
      continue;
    }
    const id = traceId(event);
    if (id === undefined) {
      continue;
    }
    if (event.ph === "b" && event.args?.frame_reporter !== undefined) {
      begins.set(id, event);
      continue;
    }
    if (event.ph !== "e") {
      continue;
    }
    const begin = begins.get(id);
    if (begin?.ts !== undefined && event.ts >= begin.ts) {
      pairs.push({ begin, start: begin.ts, end: event.ts });
      begins.delete(id);
    }
  }
  return pairs;
}

function selectEntranceRanges(events: readonly TraceEvent[]): TraceRange[] {
  const phases = new Map<number, Partial<Record<"start" | "confirmed" | "end", number>>>();
  for (const event of events) {
    if (event.ph !== "I" || event.ts === undefined || event.cat?.split(",").includes("blink.user_timing") !== true) {
      continue;
    }
    const match = event.name?.match(SELECT_TRACE_MARK);
    if (match === null || match === undefined) {
      continue;
    }
    const id = Number(match[1]);
    const phase = match[2] as "start" | "confirmed" | "end";
    const record = phases.get(id) ?? {};
    record[phase] = event.ts;
    phases.set(id, record);
  }
  return [...phases.values()].flatMap((range) => {
    const { start, confirmed, end } = range;
    return start !== undefined && confirmed !== undefined && end !== undefined && start <= confirmed && confirmed <= end ? [{ start, confirmed, end }] : [];
  });
}

function frameIsDropped(event: TraceEvent): boolean {
  return event.args?.frame_reporter?.state === "STATE_DROPPED" && event.args.frame_reporter.affects_smoothness === true;
}

function totalsForFrames(frames: readonly TraceEvent[]): FrameTotals {
  const dropped = frames.filter(frameIsDropped).length;
  const total = frames.length;
  return { total, dropped, pct: pctOf(dropped, total) };
}

/** Preserve #389's raw nested-payload read, then remove only complete PipelineReporter intervals that
 * overlap a complete start→confirmed→end mark set emitted by the sealed Select observer. Missing marks,
 * non-Select marks, unpaired frames, and all work outside that causal range remain ordinary inputs. */
export function calibratedDroppedFramePct(events: readonly TraceEvent[]): CalibratedFrames {
  const raw = droppedFramePct(events);
  const ranges = selectEntranceRanges(events);
  const classifiedFrames = new Set(
    pairedPipelineFrames(events)
      .filter((frame) => ranges.some((range) => frame.start <= range.end && frame.end >= range.start))
      .map((frame) => frame.begin),
  );
  const rawFrames = events.filter((event) => event.name === "PipelineReporter" && event.args?.frame_reporter !== undefined);
  const classified = [...classifiedFrames];
  const classifiedDropped = classified.filter(frameIsDropped).length;
  return {
    raw,
    classified: { total: classified.length, dropped: classifiedDropped },
    budgeted: totalsForFrames(rawFrames.filter((frame) => !classifiedFrames.has(frame))),
  };
}
