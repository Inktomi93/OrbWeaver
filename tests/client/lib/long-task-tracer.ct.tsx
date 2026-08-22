// CT: the `[frame]`/`[reflow]` channels of `long-task-tracer.ts` — the P8 planted-defect proofs for the
// half of the sensor pack that had NO browser-tier coverage at all. `[input]` is proven in
// `motion-flaggers.ct.tsx` (MotionFlaggersSlowInputStory); this file is its two frame siblings, and a node
// test cannot reach any of them: there is no `long-animation-frame` entry type, no forced synchronous
// layout, and no rendering-update cycle outside a real engine.
//
// WHY THIS FILE EXISTS NOW AND NOT BEFORE (the P7 coupling): the tracer used to install its OWN
// `long-animation-frame` PerformanceObserver. It no longer does — `motion-stats.ts` installs the app's one
// LoAF observer and publishes each entry through `subscribeLongAnimationFrames`, and the tracer subscribes.
// So `installLongTaskTracer()` ALONE is now permanently silent on frames, which is precisely the regression
// class these pins exist to catch: MotionFrameReflowStory installs BOTH, and a broken publish/subscribe
// seam takes every assertion below red.
//
// The plants are REAL, not synthesized PerformanceObserver entries: a synchronous script block over the
// 100ms `longFrameMs` budget, and 200 write→read style pairs that force synchronous layout inside that same
// frame. `[reflow]` is the diagnosis half — it fires only when the frame ALSO ran style/layout
// (`styleAndLayoutStart` > 0), which is what turns "260ms blocking" into a file to open.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { MotionFrameReflowStory } from "./_ct-stories.tsx";

/** The frame budget the tracer prints, from `MOTION_BUDGETS.longFrameMs` — asserted as the rendered
 *  console vocabulary, so a budget rename cannot leave this file green against a line nobody emits. */
const FRAME_BUDGET_LINE = "budget 100ms";

interface MotionRead {
  readonly loafs: readonly {
    readonly duration: number;
    readonly blockingDuration: number;
    readonly styleAndLayoutStart: number;
  }[];
  readonly worstBlocking: number;
}

/** Collect one channel's console lines. Attached BEFORE mount so the install-time frames are not missed. */
function captureChannel(page: Page, tag: string): string[] {
  const lines: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes(tag)) {
      lines.push(text);
    }
  });
  return lines;
}

/** Reads the snapshot the STORY published — never a re-import, which would resolve a second module
 *  instance whose ring is always empty (the MotionShiftFlaggerStory law). */
function readMotion(page: Page): Promise<MotionRead> {
  // FABRICATION-OK: the probe slot MotionFrameReflowStory writes; declared and read in this spec alone.
  return page.evaluate(() => (globalThis as unknown as { __motionRead: () => MotionRead }).__motionRead());
}

test("a planted long frame is [frame]-flagged AND lands in the one shared LoAF ring", async ({ mount, page }) => {
  const frames = captureChannel(page, "[frame]");
  const component = await mount(<MotionFrameReflowStory />);

  await component.getByRole("button", { name: "plant long frame" }).click();
  await expect.poll(() => frames.length, { intervals: [50, 100, 200, 250], timeout: 15_000 }).toBeGreaterThan(0);

  const line = frames.join("\n");
  expect(line, "the line must name the crossed budget, not merely a duration").toContain(FRAME_BUDGET_LINE);
  expect(line).toContain("blocking");

  // The ring half of the same P7 seam: the tracer's subscription and motion-stats' own ring are fed by ONE
  // observer, so a frame the console reported must also be readable through `__orb.motion()`.
  const motion = await readMotion(page);
  expect(
    motion.loafs.some((loaf) => loaf.blockingDuration > 0),
    "the published frame must also be in the LoAF ring",
  ).toBe(true);
  expect(motion.worstBlocking).toBeGreaterThan(0);
});

test("a planted forced reflow adds the [reflow] diagnosis to its [frame] line", async ({ mount, page }) => {
  const frames = captureChannel(page, "[frame]");
  const reflows = captureChannel(page, "[reflow]");
  const component = await mount(<MotionFrameReflowStory />);

  await component.getByRole("button", { name: "plant forced reflow" }).click();
  await expect.poll(() => reflows.length, { intervals: [50, 100, 200, 250], timeout: 15_000 }).toBeGreaterThan(0);

  expect(frames.length, "[reflow] is a diagnosis ON a long frame — it can never arrive alone").toBeGreaterThan(0);
  expect(reflows.join("\n")).toContain("style/layout ran inside that frame");

  const motion = await readMotion(page);
  expect(
    motion.loafs.some((loaf) => loaf.styleAndLayoutStart > 0),
    "the reflow verdict must be backed by a ring entry that really ran style/layout",
  ).toBe(true);
});
