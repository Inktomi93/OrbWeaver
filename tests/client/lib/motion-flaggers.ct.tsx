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

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { MotionFlaggersCssTrailingStory, MotionFlaggersSpaceStory } from "./_ct-stories.tsx";

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
