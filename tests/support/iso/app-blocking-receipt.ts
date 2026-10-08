// The planted callback must explain one native LoAF and its exact retained-ring record.
// Keep this contract DOM-free: the browser produces the receipt and Node judges it.

export const APP_BLOCKING_MARKS = {
  checkpoint: "orb:app-blocking:checkpoint",
  click: "orb:app-blocking:click",
  begin: "orb:app-blocking:begin",
  end: "orb:app-blocking:end",
} as const;

export interface AppBlockingFrameTiming {
  readonly startTime: number;
  readonly duration: number;
  readonly blockingDuration: number;
  readonly styleAndLayoutStart: number;
}

export interface AppBlockingReceipt {
  readonly checkpoint: number | null;
  readonly clicks: readonly { readonly startTime: number; readonly trusted: boolean }[];
  readonly begins: readonly number[];
  readonly ends: readonly number[];
  readonly rawFrames: readonly AppBlockingFrameTiming[];
}

export interface AppBlockingMatch {
  readonly rawFrame: AppBlockingFrameTiming;
  readonly retainedIndex: number;
}

const ORDINARY_BLOCKING_BUDGET_MS = 50;
const LOAF_NONBLOCKING_MS = 50;

/** Match execution, native observation and retention without requiring optional script attribution. */
export function matchAppBlockingFrame(receipt: AppBlockingReceipt, retained: readonly AppBlockingFrameTiming[], trusted: boolean): AppBlockingMatch | string {
  const { checkpoint, clicks, begins, ends, rawFrames } = receipt;
  const click = clicks[0];
  if (checkpoint === null || clicks.length !== 1 || click === undefined || click.trusted !== trusted || click.startTime < checkpoint) {
    return "expected exactly one current click with the required trust";
  }
  const begin = begins[0];
  const end = ends[0];
  if (begins.length !== 1 || ends.length !== 1 || begin === undefined || end === undefined || begin < click.startTime) {
    return "expected exactly one complete current callback span";
  }
  if (end - begin <= ORDINARY_BLOCKING_BUDGET_MS + LOAF_NONBLOCKING_MS) {
    return "insufficient callback-local blocking";
  }
  const candidates = rawFrames.filter(
    (frame) => frame.startTime <= begin && frame.startTime + frame.duration >= end && frame.blockingDuration > ORDINARY_BLOCKING_BUDGET_MS,
  );
  const rawFrame = candidates[0];
  if (candidates.length !== 1 || rawFrame === undefined) {
    return "expected exactly one native frame containing the complete callback span";
  }
  // These are the producer's four rounding operations, not a tolerance around a nearby frame.
  const retainedIndices = retained.flatMap((frame, index) =>
    frame.startTime === Math.round(rawFrame.startTime) &&
    frame.duration === Math.round(rawFrame.duration) &&
    frame.blockingDuration === Math.round(rawFrame.blockingDuration) &&
    frame.styleAndLayoutStart === Math.round(rawFrame.styleAndLayoutStart)
      ? [index]
      : [],
  );
  const retainedIndex = retainedIndices[0];
  if (retainedIndices.length !== 1 || retainedIndex === undefined) {
    return "expected exactly one retained match for the native frame";
  }
  return { rawFrame, retainedIndex };
}
