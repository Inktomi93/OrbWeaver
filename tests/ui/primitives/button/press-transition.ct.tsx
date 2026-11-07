// @subject packages/ui/src/lib/hover-reveal.ts
// A button that reveals on hover still eases its press: the reveal's transition names the press property too.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { PressTransitionStory } from "./_press-transition-stories.tsx";

const STORY = "tests/ui/primitives/button/_press-transition-stories/PressTransitionStory";
const CONTROL = "Plain";

test("every reveal arm keeps the press scale in its transition", async ({ mount }) => {
  const component = await mount<typeof PressTransitionStory>(STORY);
  const transitioned = (button: Locator): Promise<string[]> => button.evaluate((node) => getComputedStyle(node).transitionProperty.split(", "));
  // The control: an unrevealed button eases the press and nothing else.
  expect(await transitioned(component.getByRole("button", { name: CONTROL, exact: true }))).toContain("scale");
  const arms = component.getByRole("button").filter({ hasNotText: CONTROL });
  // One button per arm; the story's tuple fails tsc when an arm is added without one.
  expect(await arms.count()).toBeGreaterThan(0);
  for (const arm of await arms.all()) {
    const name = await arm.textContent();
    const properties = await transitioned(arm);
    expect(properties, name ?? "").toContain("scale");
    expect(properties, name ?? "").toContain("opacity");
  }
});
