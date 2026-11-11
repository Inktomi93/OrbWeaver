// @subject packages/client/src/lib/bug-report-bundle.ts
// The bug-report capture slices motion records, whose stamps are `performance.now()` offsets, by a window on the civil
// clock. Each offset is placed relative to the capture instant read on both clocks, so a page whose performance
// timeline has drifted from the civil clock still keeps exactly the records inside the window.

import { resolveEvidenceWindow } from "@orb/kit/evidence-window";
import { MS_PER_MINUTE } from "@orb/kit/time";
import { createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { sliceMotionEvidence } from "#client/lib/bug-report-bundle.ts";

type ShiftRecord = Parameters<typeof sliceMotionEvidence>[0]["motion"]["shifts"][number];

const WINDOW_MINUTES = 5;
// The page has run ten hours on its performance timeline; the civil clock is the injected one.
const PAGE_AGE_MS = 10 * 60 * MS_PER_MINUTE;
const CAPS = { shifts: 32, loafs: 64 };

const shiftAt = (startTime: number): ShiftRecord => ({ startTime, value: 0.1, hadRecentInput: false, agentNavigation: false, virtualized: false, sources: [] });

test("a motion record keeps or leaves the window by its age at capture, on the civil clock", () => {
  const clock = createFrozenClock();
  const instant = { at: clock.now(), offset: PAGE_AGE_MS };
  const recent = shiftAt(PAGE_AGE_MS - 2 * MS_PER_MINUTE);
  const stale = shiftAt(PAGE_AGE_MS - 30 * MS_PER_MINUTE);
  const window = resolveEvidenceWindow(instant.at, WINDOW_MINUTES);

  const slices = sliceMotionEvidence({ motion: { shifts: [stale, recent], loafs: [] }, window, instant, caps: CAPS });

  expect(slices["motion().shifts"].entries).toEqual([recent]);
  expect(slices["motion().shifts"].meta).toMatchObject({ source: "motion().shifts", held: 2, kept: 1, cap: CAPS.shifts });
  expect(slices["motion().loafs"].meta).toMatchObject({ source: "motion().loafs", held: 0, kept: 0, cap: CAPS.loafs });
});
