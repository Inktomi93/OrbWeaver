// Touch floor (UI-Density-Law): every interactive @orb/ui primitive answers a finger over at least the live
// `--spacing-touch-target` on both axes. Real coarse-pointer emulation (`hasTouch`) selects the 44px token; a fine pointer
// would measure the 28px one.
import { touchTargetFindings } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { InteractivePrimitivesStory, UndersizedTargetStory } from "./_touch-target-stories.tsx";

test.use({ hasTouch: true });

test("every interactive @orb/ui primitive reaches the coarse-pointer touch floor", async ({ mount, page }) => {
  await mount<typeof InteractivePrimitivesStory>("tests/client/features/app-shell/_touch-target-stories/InteractivePrimitivesStory", {});
  expect((await touchTargetFindings(page)).join("\n")).toBe("");
});

test("a planted undersized control is reported", async ({ mount, page }) => {
  await mount<typeof UndersizedTargetStory>("tests/client/features/app-shell/_touch-target-stories/UndersizedTargetStory", {});
  const findings = await touchTargetFindings(page);
  expect(findings).toHaveLength(1);
  const finding = findings[0];
  if (finding === undefined) {
    throw new Error("The undersized button was not reported");
  }
  const match = /^(\d+)x(\d+) under the (\d+)px floor: (.+)$/u.exec(finding);
  expect(match).not.toBeNull();
  if (match === null) {
    throw new Error(`The touch finding did not include its measured extent and live floor: ${finding}`);
  }
  const button = page.getByRole("button", { name: "Tiny", exact: true });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error("The planted undersized button has no rendered geometry");
  }
  expect(Math.round(box.width)).toBe(Number(match[1]));
  expect(Math.round(box.height)).toBe(Number(match[2]));
  expect(Number(match[1])).toBeLessThan(Number(match[3]));
  expect(Number(match[2])).toBeLessThan(Number(match[3]));
  expect(match[4]).toContain("button");
});
