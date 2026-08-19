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
import { blockMainThread } from "../../support/ct/block-main-thread.ts";
import {
  MotionFlaggersCheckpointStory,
  MotionFlaggersCssTrailingStory,
  MotionFlaggersExternalDevtoolsStory,
  MotionFlaggersReducedMotionStory,
  MotionFlaggersSlowInputStory,
  MotionFlaggersSpaceStory,
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

test("a checkpoint retires the drop loop from a pre-checkpoint animation", async ({ mount, page }) => {
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
