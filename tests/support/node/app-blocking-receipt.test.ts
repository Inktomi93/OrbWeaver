import { expect, test } from "../fixtures.ts";
import type { AppBlockingFrameTiming, AppBlockingReceipt } from "../iso/app-blocking-receipt.ts";
import { matchAppBlockingFrame } from "../iso/app-blocking-receipt.ts";

const rawFrame: AppBlockingFrameTiming = { startTime: 100.4, duration: 180.2, blockingDuration: 90.6, styleAndLayoutStart: 280.4 };
const retained: AppBlockingFrameTiming = { startTime: 100, duration: 180, blockingDuration: 91, styleAndLayoutStart: 280 };
const receipt: AppBlockingReceipt = {
  checkpoint: 110,
  clicks: [{ startTime: 120, trusted: true }],
  begins: [140.2],
  ends: [260.3],
  rawFrames: [rawFrame],
};

test("joins raw execution to exact retained rounding even when the frame began before input", () => {
  expect(matchAppBlockingFrame(receipt, [retained], true)).toEqual({ rawFrame, retainedIndex: 0 });
  const synthetic = { ...receipt, clicks: [{ startTime: 120, trusted: false }] };
  expect(matchAppBlockingFrame(synthetic, [retained], false)).toEqual({ rawFrame, retainedIndex: 0 });
  expect(matchAppBlockingFrame(synthetic, [retained], true)).toBe("expected exactly one current click with the required trust");
  expect(matchAppBlockingFrame(receipt, [retained], false)).toBe("expected exactly one current click with the required trust");
});

test("refuses absent, stale or ambiguous input before considering an otherwise valid frame", () => {
  for (const changed of [
    { checkpoint: null },
    { checkpoint: 121 },
    { clicks: [] },
    { clicks: [receipt.clicks[0], receipt.clicks[0]].filter((click) => click !== undefined) },
  ]) {
    expect(matchAppBlockingFrame({ ...receipt, ...changed }, [retained], true)).toBe("expected exactly one current click with the required trust");
  }
});

test("refuses missing, incomplete, stale and ambiguous callback spans despite a native blocking frame", () => {
  for (const changed of [{ begins: [], ends: [] }, { begins: [] }, { ends: [] }, { begins: [119] }, { begins: [140.2, 141] }, { ends: [260.3, 261] }]) {
    expect(matchAppBlockingFrame({ ...receipt, ...changed }, [retained], true)).toBe("expected exactly one complete current callback span");
  }
});

test("cannot borrow an unrelated task's blocking when the measured callback does not exceed 100ms", () => {
  for (const end of [140.2, 240.2, 139]) {
    expect(matchAppBlockingFrame({ ...receipt, ends: [end] }, [retained], true)).toBe("insufficient callback-local blocking");
  }
  expect(matchAppBlockingFrame({ ...receipt, ends: [240.3] }, [retained], true)).toEqual({ rawFrame, retainedIndex: 0 });
});

test("requires one native blocking frame containing the whole span, not old or partly overlapping evidence", () => {
  for (const rawFrames of [
    [],
    [{ ...rawFrame, startTime: 0, duration: 130 }],
    [{ ...rawFrame, startTime: 141 }],
    [{ ...rawFrame, duration: 150 }],
    [{ ...rawFrame, blockingDuration: 50 }],
    [rawFrame, rawFrame],
  ]) {
    expect(matchAppBlockingFrame({ ...receipt, rawFrames }, [retained], true)).toBe("expected exactly one native frame containing the complete callback span");
  }
});

test("requires a unique retained match in every rounded producer field", () => {
  for (const frames of [
    [],
    [retained, retained],
    [{ ...retained, startTime: 101 }],
    [{ ...retained, duration: 181 }],
    [{ ...retained, blockingDuration: 90 }],
    [{ ...retained, styleAndLayoutStart: 281 }],
  ]) {
    expect(matchAppBlockingFrame(receipt, frames, true)).toBe("expected exactly one retained match for the native frame");
  }
  expect(matchAppBlockingFrame(receipt, [{ ...retained, startTime: 1 }, retained], true)).toEqual({ rawFrame, retainedIndex: 1 });
});
