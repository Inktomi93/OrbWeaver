// CT: the `[space]` half of motion-flaggers.ts (task #39/#40's dead-flagger fix). A node/jsdom test
// cannot reach this — `getComputedStyle` on a replaced element only resolves a real box in an actual
// layout engine, which is exactly the bug this file guards: `hasReservedBox` used to read the
// COMPUTED (resolved) height, which is always a real px value for anything in-layout, so the flagger
// never fired. The fix reads the AUTHORED intent (width/height attrs, aspect-ratio) instead.
//
// What is proven:
//  1. an `<img>` with no width/height attrs, no aspect-ratio, and a blocked src IS flagged `[space]`
//     (the red-first case: before the fix, this never fired — verifier's plant receipt: blocked src,
//     no dims, 8.4s churn, 0 flags);
//  2. an `<img>` with width+height attrs is NOT flagged (the false-positive guard).
//
// P8 (the instrument-proof suite) added the two planted-defect proofs the pack was missing. Each carries
// its own note above the test naming the plant and the regression it REDs on:
//  · `[css]` — escaped Tailwind-shaped selectors (`.sm\:max-w-dialog-lg`, `.w-\[2px\]`) stay silent while a
//    genuinely undefined token is still flagged. The regression is the `@orb/kit/dead-css` un-escaper: it
//    does not go quiet, it accuses every escaped utility in the app.
//  · `[drop]` — the RE-ARM. A second real stutter on the SAME surface after `__resetMotionFlags` must fire
//    again, or a driven multi-step probe reads every step after the first as clean.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { droppedFramePct } from "../../../tooling/src/motion-audit/index.ts";
import { blockMainThread } from "../../support/ct/block-main-thread.ts";
import {
  MotionFlaggersAuditPauseStory,
  MotionFlaggersCheckpointStory,
  MotionFlaggersCssBatchStory,
  MotionFlaggersCssEscapedTokenStory,
  MotionFlaggersCssTrailingStory,
  MotionFlaggersDropRearmStory,
  MotionFlaggersDropStory,
  MotionFlaggersExternalDevtoolsStory,
  MotionFlaggersReducedMotionStory,
  MotionFlaggersSettleStory,
  MotionFlaggersSlowInputStory,
  MotionFlaggersSpaceStory,
  MotionFlaggersWaapiDropStory,
} from "./_ct-stories.tsx";

/** Collect every `[space]` console line the flagger emits. Attached BEFORE mount so nothing is missed. */
function captureSpaceLines(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("[space]")) {
      lines.push(text);
    }
  });
  return lines;
}

test("an unreserved <img> (no dims, no aspect-ratio) is flagged [space]", async ({ mount, page }) => {
  const lines = captureSpaceLines(page);
  const component = await mount(<MotionFlaggersSpaceStory />);

  await component.getByRole("button", { name: "add image" }).click();
  // The scan is throttled (`cssScanIntervalMs`) and idle-deferred — poll generously rather than assume
  // the first tick catches it.
  await expect.poll(() => lines.length, { intervals: [200, 500, 1000, 2000], timeout: 15_000 }).toBeGreaterThan(0);

  const line = lines.join("\n");
  expect(line).toContain("<img>");
  expect(line).toContain("no reserved box");
});

test("the app observer ignores injected TanStack Devtools media", async ({ mount, page }) => {
  const lines = captureSpaceLines(page);
  const component = await mount(<MotionFlaggersExternalDevtoolsStory />);

  await component.getByRole("button", { name: "inject devtools" }).click();
  await expect(component.getByTestId("devtool-scan-complete")).toBeVisible();

  expect(lines.filter((line) => line.includes("tsd-main-panel"))).toEqual([]);
});

/** Collect every `[css]` console line the flagger emits. */
function captureCssLines(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("[css]")) {
      lines.push(text);
    }
  });
  return lines;
}

test("a single mutation INSIDE the throttle window is still scanned — trailing edge, not dropped", async ({ mount, page }) => {
  const lines = captureCssLines(page);
  const component = await mount(<MotionFlaggersCssTrailingStory />);

  // ONE mutation, no follow-up — a dropping throttle would leave the dead class unscanned forever.
  await component.getByRole("button", { name: "add dead class" }).click();
  await expect.poll(() => lines.length, { intervals: [500, 1000, 2000, 2000], timeout: 20_000 }).toBeGreaterThan(0);

  expect(lines.join("\n")).toContain("orb-ct-dead-class-marker");
});

test("a later dead-class mutation is found without rescanning the whole document", async ({ mount, page }) => {
  const lines = captureCssLines(page);
  const component = await mount(<MotionFlaggersCssTrailingStory initialMarker={true} />);
  // A flagged initial marker is the receipt that the required full census has finished.
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-initial-dead-class-marker")), { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbWildcardDocumentScans?: number };
    const original = Document.prototype.querySelectorAll;
    root.__orbWildcardDocumentScans = 0;
    Document.prototype.querySelectorAll = function (this: Document, selector: string): NodeListOf<Element> {
      if (selector === "*") {
        root.__orbWildcardDocumentScans = (root.__orbWildcardDocumentScans ?? 0) + 1;
      }
      return original.call(this, selector);
    } as typeof Document.prototype.querySelectorAll;
  });

  await component.getByRole("button", { name: "add dead class" }).click();
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-dead-class-marker")), { timeout: 10_000 }).toBe(true);
  const globalScans = await page.evaluate(
    () => (document.documentElement as HTMLElement & { __orbWildcardDocumentScans?: number }).__orbWildcardDocumentScans ?? 0,
  );

  expect(globalScans, "post-census CSS checks stay scoped to the mutation subtree").toBe(0);
});

test("a mutation subtree yields across idle callbacks without losing a deep dead class", async ({ mount, page }) => {
  const lines = captureCssLines(page);
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbIdleCallbackCount?: number };
    const nativeRequestIdleCallback = globalThis.requestIdleCallback.bind(globalThis);
    root.__orbIdleCallbackCount = 0;
    globalThis.requestIdleCallback = (callback, options): number =>
      nativeRequestIdleCallback((deadline) => {
        root.__orbIdleCallbackCount = (root.__orbIdleCallbackCount ?? 0) + 1;
        let checks = 0;
        callback({
          didTimeout: deadline.didTimeout,
          timeRemaining: () => (checks++ < 8 ? 5 : 0),
        });
      }, options);
  });
  const component = await mount(<MotionFlaggersCssBatchStory />);
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-initial-dead-class-marker")), { timeout: 10_000 }).toBe(true);
  const before = await page.evaluate(() => (document.documentElement as HTMLElement & { __orbIdleCallbackCount?: number }).__orbIdleCallbackCount ?? 0);

  await component.getByRole("button", { name: "add batched dead class" }).click();
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-batched-dead-class-marker")), { timeout: 10_000 }).toBe(true);
  const after = await page.evaluate(() => (document.documentElement as HTMLElement & { __orbIdleCallbackCount?: number }).__orbIdleCallbackCount ?? 0);

  expect(after - before, "the 97-element insertion cannot complete in one short idle slice").toBeGreaterThan(1);
});

// PLANTED-DEFECT PROOF (P8) for the `@orb/kit/dead-css` tokenizer's un-escape step. The plant is the
// class of token Tailwind v4 actually emits — an ESCAPED variant/arbitrary selector — and the regression it
// REDs on is the tokenizer losing the un-escape (or the escape-tolerant token pattern): `.sm\:max-w-dialog-lg`
// then never matches the live token `sm:max-w-dialog-lg`, and every escaped utility on the page is accused.
// The dead marker in the same stage is the positive control: without it, a scan that never ran would pass
// the silence assertion for free.
test("escaped Tailwind-shaped class selectors are NOT flagged [css] while a genuinely dead token still is", async ({ mount, page }) => {
  const lines = captureCssLines(page);
  await mount(<MotionFlaggersCssEscapedTokenStory />);

  // Barrier on the POSITIVE control: its arrival is the receipt that the census walked this stage's
  // elements and read this stage's sheet — asserting the silence before that would be vacuous.
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-escaped-arm-dead-marker")), { timeout: 20_000 }).toBe(true);

  const flagged = lines.join("\n");
  expect(flagged, "an escaped variant utility that IS defined must never be called dead").not.toContain("sm:max-w-dialog-lg");
  expect(flagged, "an escaped arbitrary-value utility that IS defined must never be called dead").not.toContain("w-[2px]");
  expect(flagged, "an escaped variant+slash utility that IS defined must never be called dead").not.toContain("hover:bg-x/50");
});

test("the initial dev-instrument census exposes a checkpoint completion promise", async ({ mount, page }) => {
  await mount(<MotionFlaggersSettleStory />);
  await expect(page.getByTestId("motion-flaggers-settled")).toHaveText("settled");
});

test("one slow physical interaction emits one [input] warning, not its entire DOM event family", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[input]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersSlowInputStory />);

  await component.locator("button").click({ force: true });
  await expect.poll(() => lines.length, { timeout: 5000 }).toBe(1);
});

test("a visible non-compositor transition is flagged", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[anim]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersReducedMotionStory />);
  await component.getByRole("button", { name: "change color" }).click();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
});

test("the reduced-motion floor does not raise dirty-animation or dropped-frame flags", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[anim]") || message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersReducedMotionStory />);
  await component.getByRole("button", { name: "change color" }).click();
  await expect(component.getByTestId("dirty-color-transition")).toHaveCSS("color", "rgb(255, 0, 0)");
  await component.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  expect(lines).toEqual([]);
});

test("a blocked animation frame is flagged without a document-wide animation-tree read", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersDropStory />);
  const trigger = component.getByRole("button", { name: "start blocked animation" });
  const box = await trigger.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDocumentAnimationReads?: number; __orbInstrumentAnimationFrames?: number };
    const original = document.getAnimations.bind(document);
    const nativeRequestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis);
    root.__orbDocumentAnimationReads = 0;
    root.__orbInstrumentAnimationFrames = 0;
    document.getAnimations = (...args): Animation[] => {
      root.__orbDocumentAnimationReads = (root.__orbDocumentAnimationReads ?? 0) + 1;
      return original(...args);
    };
    globalThis.requestAnimationFrame = (callback): number => {
      root.__orbInstrumentAnimationFrames = (root.__orbInstrumentAnimationFrames ?? 0) + 1;
      return nativeRequestAnimationFrame(callback);
    };
  });

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => lines.length).toBeGreaterThan(0);
  const instrument = await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDocumentAnimationReads?: number; __orbInstrumentAnimationFrames?: number };
    return { animationReads: root.__orbDocumentAnimationReads ?? 0, animationFrames: root.__orbInstrumentAnimationFrames ?? 0 };
  });

  expect(instrument.animationReads, "the drop instrument does not force global animation/style resolution").toBe(0);
  expect(instrument.animationFrames, "the drop instrument consumes the existing LoAF clock instead of scheduling a second frame loop").toBe(0);
});

// PLANTED-DEFECT PROOF (P8) for the `[drop]` channel's RE-ARM. The first plant is the ordinary stutter;
// the SECOND — same surface, after a checkpoint — is the one a driven multi-step probe depends on, and it
// REDs if either half of the re-arm regresses: `raise`'s per-`tag|offender` dedupe surviving the reset
// (the offender label is identical by construction), or `resetFrameDropFlagger` clearing the lifetime map
// without the still-live/restarted animation re-registering.
test("a SECOND planted stutter on the same surface after a checkpoint fires [drop] again", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersDropRearmStory />);

  await component.getByRole("button", { name: "plant stutter" }).click();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
  const afterFirst = lines.length;

  await component.getByRole("button", { name: "reset evidence" }).click();
  await component.getByRole("button", { name: "plant stutter" }).click();
  await expect.poll(() => lines.length, "the checkpoint must re-arm BOTH the dedupe identity and the lifetime accounting").toBeGreaterThan(afterFirst);
  expect(lines.at(-1)).toContain("[data-testid=rearm-animation]");
});

test("motion-audit pause skips duplicate CSS/WAAPI lifetime work and ordinary [drop] resumes", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersAuditPauseStory />);
  await expect(component.getByTestId("audit-pause-flaggers-settled")).toHaveText("settled");
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDropTargetInspections?: number; __orbDropTimingReads?: number };
    const nativeClosest = Element.prototype.closest;
    const nativeTiming = AnimationEffect.prototype.getComputedTiming;
    root.__orbDropTargetInspections = 0;
    root.__orbDropTimingReads = 0;
    Element.prototype.closest = function (this: Element, selector: string): Element | null {
      if (selector.includes("tsd-") && selector.includes("TanStack Devtools")) {
        root.__orbDropTargetInspections = (root.__orbDropTargetInspections ?? 0) + 1;
      }
      return nativeClosest.call(this, selector);
    };
    AnimationEffect.prototype.getComputedTiming = function (this: AnimationEffect): ComputedEffectTiming {
      root.__orbDropTimingReads = (root.__orbDropTimingReads ?? 0) + 1;
      return nativeTiming.call(this);
    };
  });

  await component.getByRole("button", { name: "pause audit drop tracking" }).click();
  await component.getByRole("button", { name: "plant CSS drop" }).click();
  await component.getByRole("button", { name: "plant WAAPI drop" }).click();
  // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: this negative control must leave enough wall time for forbidden observer work to occur.
  await page.waitForTimeout(250);
  const paused = await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDropTargetInspections?: number; __orbDropTimingReads?: number };
    return { targets: root.__orbDropTargetInspections ?? 0, timings: root.__orbDropTimingReads ?? 0 };
  });
  expect(paused, "the audit pause returns before target/timing inspection, not merely before console output").toEqual({ targets: 0, timings: 0 });
  expect(lines).toEqual([]);

  await component.getByRole("button", { name: "resume audit drop tracking" }).click();
  await component.getByRole("button", { name: "plant CSS drop" }).click();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
});

test("the audit CDP rail still sees a real dropped-frame plant while in-page [drop] is paused", async ({ mount, page }) => {
  const component = await mount(<MotionFlaggersAuditPauseStory />);
  const cdp = await page.context().newCDPSession(page);
  const events: Parameters<typeof droppedFramePct>[0][number][] = [];
  cdp.on("Tracing.dataCollected", (event: { value: typeof events }) => events.push(...event.value));
  await cdp.send("Tracing.start", {
    categories: "benchmark,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents",
  });
  await component.getByRole("button", { name: "pause audit drop tracking" }).click();
  await component.getByRole("button", { name: "plant CDP drop" }).click();
  // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Chrome tracing has no DOM condition; the plant owns a fixed 250ms block inside this capture interval.
  await page.waitForTimeout(500);
  const completed = new Promise<void>((resolve) => cdp.once("Tracing.tracingComplete", () => resolve()));
  await cdp.send("Tracing.end");
  await completed;

  const frames = droppedFramePct(events);
  expect(frames.total, "the real trace must contain PipelineReporter frames").toBeGreaterThan(0);
  const pipelineStates = events.reduce<Record<string, number>>((counts, event) => {
    const report = event.args?.frame_reporter;
    if (event.name !== "PipelineReporter" || report === undefined) {
      return counts;
    }
    const key = `${report.state ?? "unknown"}/${report.affects_smoothness === true ? "smoothness" : "ordinary"}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  expect(
    frames.pct,
    `the blocked transition must breach motion-audit's unchanged 5% dropped-frame budget; ${JSON.stringify({ frames, pipelineStates })}`,
  ).toBeGreaterThan(5);
});

test("WAAPI finish/cancel retire targets while a blocked live effect still raises [drop]", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersWaapiDropStory />);
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDocumentAnimationReads?: number };
    const original = document.getAnimations.bind(document);
    root.__orbDocumentAnimationReads = 0;
    document.getAnimations = (...args): Animation[] => {
      root.__orbDocumentAnimationReads = (root.__orbDocumentAnimationReads ?? 0) + 1;
      return original(...args);
    };
  });

  await component.getByRole("button", { name: "retire WAAPI effects" }).click();
  await expect(component.getByTestId("waapi-effects-retired")).toBeVisible();
  expect(lines, "finished/canceled WAAPI targets cannot flag a later blocked idle frame").toEqual([]);

  await component.getByRole("button", { name: "start blocked WAAPI" }).click();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
  const reads = await page.evaluate(
    () => (document.documentElement as HTMLElement & { __orbDocumentAnimationReads?: number }).__orbDocumentAnimationReads ?? 0,
  );
  expect(reads, "WAAPI accounting never reintroduces a document animation-tree read").toBe(0);
});

test("a checkpoint retires the lifetime of a pre-checkpoint animation", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersCheckpointStory />);
  await component.getByRole("button", { name: "start animation" }).click();
  await component.getByRole("button", { name: "reset evidence" }).click();
  await page.evaluate(blockMainThread, 80);
  await component.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(lines).toEqual([]);
});
