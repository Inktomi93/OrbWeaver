// CT: `usePrefersReducedMotion` (`@orb/ui/lib`) — the ONE matchMedia + useSyncExternalStore
// reduced-motion hook, extracted out of three identical forks (charts/chart.tsx,
// stream/use-smooth-text.ts, markdown/markdown.tsx — each still covers ITS OWN reduced-motion
// gating behavior via its own CT `page.emulateMedia`; this file proves the shared hook itself
// reflects `matchMedia` correctly, including a LIVE flip after mount, not just at mount time.
import { expect, test } from "@playwright/experimental-ct-react";
import { ReducedMotionProbe } from "./use-prefers-reduced-motion.fixtures";

test("defaults to false with no-preference", async ({ mount }) => {
  const component = await mount(<ReducedMotionProbe />);
  await expect(component).toHaveText("false");
});

test("reflects prefers-reduced-motion: reduce at mount", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(<ReducedMotionProbe />);
  await expect(component).toHaveText("true");
});

test("stays live: a mid-session preference flip updates the hook without remounting", async ({ mount, page }) => {
  const component = await mount(<ReducedMotionProbe />);
  await expect(component).toHaveText("false");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(component).toHaveText("true");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(component).toHaveText("false");
});
