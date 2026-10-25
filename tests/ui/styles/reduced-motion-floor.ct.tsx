// The reduced-motion floor sits in the last cascade layer and still beats an inline animation (client-architecture-lockdown.md §4.5),
// under both of its arms: the OS query and the root attribute a user preference sets (packages/ui/src/styles/motion-floor.css).
import { expect, test } from "@playwright/test";
import type { MotionFloorStory } from "./_motion-floor-stories.tsx";

const STORY = "tests/ui/styles/_motion-floor-stories/MotionFloorStory";
// Chromium serialises the floor's 0.01ms as 1e-05s.
const FLOORED = { duration: expect.stringMatching(/^(?:0\.01ms|1e-05s)$/u), iterations: "1" };
const ROOT_FLAG = ["data-reduced-motion", "true"] as const;

test("the floor beats an inline animation under the OS query and under the root attribute", async ({ mount, page }) => {
  const component = await mount<typeof MotionFloorStory>(STORY, {});
  const subject = component.getByText("Inline animation", { exact: true });
  const read = (): Promise<{ duration: string; iterations: string }> =>
    subject.evaluate((element) => {
      const style = getComputedStyle(element);
      return { duration: style.animationDuration, iterations: style.animationIterationCount };
    });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await read()).not.toEqual(FLOORED);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(read).toEqual(FLOORED);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(read).not.toEqual(FLOORED);
  await page.evaluate(([name, flag]) => {
    document.documentElement.setAttribute(name, flag);
  }, ROOT_FLAG);
  await expect.poll(read).toEqual(FLOORED);
});
