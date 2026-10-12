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
// 100ms `longFrameMs` budget, 200 write→read style pairs that force synchronous layout inside that same
// frame, and — the negative arm — a style WRITE with no read back, which is an ordinary long render.
//
// `[reflow]` IS A TWO-ARMED CLAIM AND BOTH ARMS ARE PINNED HERE (#432). It used to fire on
// `frame.styleAndLayoutStart > 0`, which is true of every frame that renders anything, so it accused
// ordinary renders of forced reflow (this file's third test is that exact shape, and it RED-ran against
// the pre-fix source with three false `[reflow]` lines over a checkpoint whose every frame reported
// `forcedStyleAndLayoutDuration: 0`). The honest signal is per-SCRIPT `forcedStyleAndLayoutDuration`, so
// the positive arm additionally asserts the printed cost, and the negative arm proves its own plant is
// the false-positive shape (ran style/layout, forced nothing) before its silence assertion counts.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { MotionFrameReflowStory } from "./_ct-stories.tsx";

/** The frame budget the tracer prints, from `MOTION_BUDGETS.longFrameMs` — asserted as the rendered
 *  console vocabulary, so a budget rename cannot leave this file green against a line nobody emits. */
const FRAME_BUDGET_LINE = "budget 100ms";

/** The measured cost `[reflow]` must print — a verdict without its number is not a file to open, and a
 *  frame-level "style/layout happened" phrasing is the claim #432 proved dishonest. */
const FORCED_COST_PATTERN = /forced synchronous style\/layout \d+ms inside that frame/;

interface MotionRead {
  readonly loafs: readonly {
    readonly duration: number;
    readonly blockingDuration: number;
    readonly styleAndLayoutStart: number;
    readonly scripts: readonly { readonly forcedStyleAndLayoutDuration: number }[];
  }[];
  readonly worstBlocking: number;
}

/** The forced-layout total of one published frame — the per-SCRIPT signal `[reflow]` is a claim about. */
function forcedTotal(loaf: MotionRead["loafs"][number]): number {
  return loaf.scripts.reduce((sum, script) => sum + script.forcedStyleAndLayoutDuration, 0);
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
  // @orb-waive no-test-fabrication(unknown): the probe slot MotionFrameReflowStory writes; declared and read in this spec alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return page.evaluate(() => (globalThis as unknown as { __motionRead: () => MotionRead }).__motionRead());
}

/** Poll the RING until it carries the evidence, then return that read.
 *
 *  The console channel and the in-page ring are fed by ONE observer but arrive on DIFFERENT clocks: a
 *  `[frame]` line is a console message Playwright receives out-of-process, while `motion.loafs` is state
 *  inside the page. Polling the channel and then reading the ring ONCE assumes the ring won that race —
 *  true on a quiet box, false under contention. Measured at loadavg ~4.5 (10 busy workers): the
 *  render-frame spec's own positive control ("the plant must produce a frame that RAN style/layout")
 *  read an empty ring and failed the test for lacking its own evidence. Failing safe is right; racing
 *  for it is not. Wait for the ring, then assert ON it. */
async function motionWhen(page: Page, ready: (motion: MotionRead) => boolean): Promise<MotionRead> {
  let last: MotionRead | undefined;
  await expect
    .poll(
      async () => {
        last = await readMotion(page);
        return ready(last);
      },
      { intervals: [50, 100, 200, 250], timeout: 15_000 },
    )
    .toBe(true);
  if (last === undefined) {
    throw new Error("motionWhen resolved without a ring read");
  }
  return last;
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
  const motion = await motionWhen(page, (read) => read.loafs.some((loaf) => loaf.blockingDuration > 0));
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
  expect(reflows.join("\n"), "the line must carry the measured forced-layout cost, not merely the verdict").toMatch(FORCED_COST_PATTERN);

  const motion = await motionWhen(page, (read) => read.loafs.some((loaf) => forcedTotal(loaf) > 0));
  expect(
    motion.loafs.some((loaf) => forcedTotal(loaf) > 0),
    "the reflow verdict must be backed by a ring entry whose SCRIPTS really forced synchronous layout",
  ).toBe(true);
});

// The negative arm of the same claim (#432). `[reflow]` used to gate on `frame.styleAndLayoutStart > 0`,
// which is true of every frame that renders anything — so the channel accused an ordinary render of a
// forced reflow (measured 8/8 with the accused script's own forcedStyleAndLayoutDuration at 0). The plant
// is that exact shape: a style write with no read back, blocked past the budget. The ring assertions are
// this test's positive control — they prove the plant really is "ran style/layout, forced nothing"
// before the silence assertion is allowed to mean anything.
test("an ordinary long RENDER frame is [frame]-flagged with NO [reflow] accusation", async ({ mount, page }) => {
  const frames = captureChannel(page, "[frame]");
  const reflows = captureChannel(page, "[reflow]");
  const component = await mount(<MotionFrameReflowStory />);

  // Mount-time frames are not this plant's evidence — checkpoint both floors before planting.
  await component.getByRole("button", { name: "reset frame evidence" }).click();
  await component.getByRole("button", { name: "plant render frame" }).click();
  await expect.poll(() => frames.length, { intervals: [50, 100, 200, 250], timeout: 15_000 }).toBeGreaterThan(0);

  const motion = await motionWhen(page, (read) => read.loafs.some((loaf) => loaf.styleAndLayoutStart > 0));
  const rendering = motion.loafs.filter((loaf) => loaf.styleAndLayoutStart > 0);
  expect(rendering.length, "the plant must produce a frame that RAN style/layout — otherwise it proves nothing").toBeGreaterThan(0);
  expect(
    rendering.every((loaf) => forcedTotal(loaf) === 0),
    "the plant must force NO synchronous layout — that asymmetry is the whole finding",
  ).toBe(true);

  expect(reflows, "a frame that merely rendered is not a forced reflow").toEqual([]);
});
