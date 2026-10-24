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
  expect(findings[0]).toContain("Tiny");
});
