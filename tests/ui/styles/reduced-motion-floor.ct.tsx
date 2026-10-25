// The reduced-motion floor sits in the last cascade layer and still beats an inline animation (client-architecture-lockdown.md §4.5),
// and it keys on the resolved state: the app's `on` floors under a full-motion OS, its `off` beats a reduced-motion OS, and
// `system` or no attribute follows the OS query (packages/ui/src/styles/motion-floor.css).
import type { OsPreferenceMode } from "@orb/contracts/settings/appearance";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { APP_REDUCED_MOTION_ATTRIBUTE, resolveReducedMotion } from "../../../packages/ui/src/lib/reduced-motion-now.ts";
import type { MotionFloorStory } from "./_motion-floor-stories.tsx";

const STORY = "tests/ui/styles/_motion-floor-stories/MotionFloorStory";
// Chromium serialises the floor's 0.01ms as 1e-05s.
const FLOOR_DURATION = /^(?:0\.01ms|1e-05s)$/u;
// No attribute follows the OS, as `system` does.
type AppMode = OsPreferenceMode | null;

async function setAppMode(page: Page, mode: AppMode): Promise<void> {
  await page.evaluate(
    ([name, value]) => {
      if (value === null) {
        document.documentElement.removeAttribute(name);
      } else {
        document.documentElement.setAttribute(name, value);
      }
    },
    [APP_REDUCED_MOTION_ATTRIBUTE, mode] as const,
  );
}

// The gallery keeps one page per worker: a stray `off` would switch the floor off for every later test.
test.afterEach(async ({ page }) => {
  await setAppMode(page, null);
});

const MODES = [null, "system", "on", "off"] as const satisfies readonly AppMode[];

// The CSS floor and the JS reader (`resolveReducedMotion`) state one rule; each case takes the JS answer as its expectation.
const CASES = MODES.flatMap((mode) =>
  [false, true].map((osReduced) => [mode, osReduced, resolveReducedMotion({ getAttribute: () => mode }, osReduced)] as const),
);

test("the matrix reaches both outcomes, so an agreeing pair of constants cannot pass it", () => {
  expect(new Set(CASES.map(([, , floored]) => floored))).toEqual(new Set([false, true]));
});

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
