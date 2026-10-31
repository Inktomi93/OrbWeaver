// The boot veil's exit is gated on the readiness attribute the app stamps on <html>, never on a timer alone: it stays
// up while the app is not ready, holds a minimum beat when readiness is quick, never shows over an app that is
// already ready, treats a degraded ready as ready, and under reduced motion waits only for readiness.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { APP_READY_ATTR } from "#client/lib/app-ready-attribute.ts";
import type { BootVeilStory } from "./_boot-veil-stories.tsx";

const STORY = "tests/client/features/app-shell/components/_boot-veil-stories/BootVeilStory";
const VEIL = '[data-slot="weave-veil"]';
const WEAVE_CANVAS = '[data-slot="web-weave-canvas"]';
const FRAMES_AFTER_READY = 5;
// An absence asserted once, not retried: a veil that mounted and left after its beat would pass a retrying count.
const ONE_CHECK_MS = 1;
// The veil's own stamp while it dissolves.
const ENDING_ATTR = "data-ending";

const stamp = (page: Page, value: string): Promise<void> =>
  page.evaluate(([attr, to]) => document.documentElement.setAttribute(attr, to), [APP_READY_ATTR, value] as const);

/** Wait a number of real browser frames: an event condition, not a wall-clock timeout. */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const step = (): void => {
          seen += 1;
          if (seen >= count) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

test("the veil stays up and weaving until the app is ready, then dissolves and unmounts", async ({ mount, page }) => {
  await mount<typeof BootVeilStory>(STORY, {});
  await expect(page.locator(VEIL)).toBeVisible();
  await expect(page.locator('[data-slot="web-weave"]')).toHaveAttribute("data-weave-state", "weaving");
  await waitFrames(page, FRAMES_AFTER_READY);
  await expect(page.locator(VEIL)).toHaveCount(1);

  await stamp(page, "");
  await expect(page.locator(VEIL)).toHaveCount(0);
});

test("a boot that is ready at once still holds the veil for its minimum beat before it dissolves", async ({ mount, page }) => {
  await mount<typeof BootVeilStory>(STORY, {});
  await stamp(page, "");
  await waitFrames(page, FRAMES_AFTER_READY);
  // Still held, not yet leaving: the beat the veil owes a quick boot has not played out.
  await expect(page.locator(`${VEIL}:not([${ENDING_ATTR}])`)).toHaveCount(1, { timeout: ONE_CHECK_MS });
  await expect(page.locator(VEIL)).toHaveCount(0);
});

test("an app that is ready before the veil mounts gets no veil at all", async ({ mount, page }) => {
  // The document element may not exist when the init script runs, so the stamp lands once the document is parsed.
  await page.addInitScript((attr) => {
    document.addEventListener("DOMContentLoaded", () => document.documentElement.setAttribute(attr, ""));
  }, APP_READY_ATTR);
  await mount<typeof BootVeilStory>(STORY, {});
  // The setup reached its premise: the app was already ready when the veil mounted.
  await expect(page.locator("html")).toHaveAttribute(APP_READY_ATTR, "");
  // Counted at once and a few frames on: a veil that mounted and dissolved after its beat would pass a retrying count.
  await expect(page.locator(VEIL)).toHaveCount(0, { timeout: ONE_CHECK_MS });
  await waitFrames(page, FRAMES_AFTER_READY);
  await expect(page.locator(VEIL)).toHaveCount(0, { timeout: ONE_CHECK_MS });
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: ONE_CHECK_MS });
});

test("a degraded ready opens the gate like any other value: presence means stop waiting", async ({ mount, page }) => {
  await mount<typeof BootVeilStory>(STORY, {});
  await expect(page.locator(VEIL)).toBeVisible();
  await stamp(page, "degraded");
  await expect(page.locator(VEIL)).toHaveCount(0);
});

test("under reduced motion the weave is one still frame while the app is not ready", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount<typeof BootVeilStory>(STORY, {});
  const canvas = page.locator(WEAVE_CANVAS);
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  await waitFrames(page, 30);
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  await expect(page.locator(VEIL)).toHaveCount(1);
});

test("under reduced motion the veil leaves on ready with no minimum beat", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount<typeof BootVeilStory>(STORY, {});
  // Ready lands straight after mount, well inside the beat a full-motion veil would hold.
  await stamp(page, "");
  await expect(page.locator("html")).toHaveAttribute(APP_READY_ATTR, "");
  await waitFrames(page, FRAMES_AFTER_READY);
  await expect(page.locator(VEIL)).toHaveCount(0, { timeout: ONE_CHECK_MS });
});
