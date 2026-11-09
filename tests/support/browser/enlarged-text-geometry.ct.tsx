// @subject tests/support/browser/enlarged-text-geometry.ts
// The cover probe's planted cases: a control under the boot veil is read once the veil has left, and a control under a standing panel still fails.
import { expect, test } from "@playwright/test";
import { enlargedTextFindings } from "./enlarged-text-geometry.ts";
import type { SurfaceVeilCoverStory } from "./surface-design-fixtures.tsx";

const STORY = "tests/support/browser/surface-design-fixtures/SurfaceVeilCoverStory";
const VEIL = '[data-slot="weave-veil"]';

test("the probe waits for the boot veil to leave instead of reading the control it covers", async ({ mount, page }) => {
  await mount<typeof SurfaceVeilCoverStory>(STORY, { cover: "veil" });
  await expect(page.locator(VEIL)).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
  await expect(page.locator(VEIL)).toHaveCount(0);
});

test("the probe still fails a control a standing panel covers", async ({ mount, page }) => {
  await mount<typeof SurfaceVeilCoverStory>(STORY, { cover: "panel" });
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([expect.stringMatching(/^button "Retry" \[.*\] is covered at its centre by div /u)]);
});
