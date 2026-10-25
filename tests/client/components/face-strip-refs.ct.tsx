import { expect, test } from "@playwright/test";
import type { FaceStripRefsStory } from "./_face-strip-stories.tsx";

test("the fold remeasures renamed and removed face refs while keeping the selection visible", async ({ mount, page }) => {
  await mount<typeof FaceStripRefsStory>("tests/client/components/_face-strip-stories/FaceStripRefsStory");
  await page.getByRole("button", { name: "Open Gamma", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("gamma");
  await page.getByRole("button", { name: "Toggle width", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Gamma", exact: true })).toBeVisible();
  await expect(page.locator("[data-face-overflow]")).toBeVisible();
  await page.getByRole("button", { name: "Rename last face", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Renamed Gamma", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Gamma", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove last face", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Renamed Gamma", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Alpha", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Toggle width", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Beta", exact: true })).toBeVisible();
  await expect(page.locator("[data-face-overflow]")).toHaveCount(0);
});
