// The reduced-motion floor sits in the last cascade layer and still beats an inline animation (client-architecture-lockdown.md §4.5),
// and it keys on the resolved state: the app's `on` floors under a full-motion OS, its `off` beats a reduced-motion OS, and
// `system` or no attribute follows the OS query (packages/ui/src/styles/motion-floor.css).
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { MotionFloorStory } from "./_motion-floor-stories.tsx";

const STORY = "tests/ui/styles/_motion-floor-stories/MotionFloorStory";
// Chromium serialises the floor's 0.01ms as 1e-05s.
const FLOOR_DURATION = /^(?:0\.01ms|1e-05s)$/u;
const APP_ATTRIBUTE = "data-appearance-reduced-motion";
type AppMode = "system" | "on" | "off" | null;

async function setAppMode(page: Page, mode: AppMode): Promise<void> {
  await page.evaluate(
    ([name, value]) => {
      if (value === null) {
        document.documentElement.removeAttribute(name);
      } else {
        document.documentElement.setAttribute(name, value);
      }
    },
    [APP_ATTRIBUTE, mode] as const,
  );
}

// The gallery keeps one page per worker: a stray `off` would switch the floor off for every later test.
test.afterEach(async ({ page }) => {
  await setAppMode(page, null);
});

const CASES = [
  // [app mode, OS reduced motion, floored]
  [null, false, false],
  [null, true, true],
  ["system", false, false],
  ["system", true, true],
  ["on", false, true],
  ["on", true, true],
  ["off", false, false],
  ["off", true, false],
] as const;

for (const [mode, osReduced, floored] of CASES) {
  test(`app ${String(mode)} with OS reduce=${String(osReduced)} floors the inline animation: ${String(floored)}`, async ({ mount, page }) => {
    const component = await mount<typeof MotionFloorStory>(STORY, {});
    const subject = component.getByText("Inline animation", { exact: true });
    const isFloored = async (): Promise<boolean> => {
      const { duration, iterations } = await subject.evaluate((element) => {
        const style = getComputedStyle(element);
        return { duration: style.animationDuration, iterations: style.animationIterationCount };
      });
      return FLOOR_DURATION.test(duration) && iterations === "1";
    };
    await page.emulateMedia({ reducedMotion: osReduced ? "reduce" : "no-preference", colorScheme: "dark", contrast: "no-preference", forcedColors: "none" });
    await setAppMode(page, mode);
    await expect.poll(isFloored).toBe(floored);
  });
}
