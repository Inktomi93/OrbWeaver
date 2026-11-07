// @subject packages/ui/src/lib/hover-reveal.ts
// A button that reveals on hover still eases its press: the reveal's transition names the press property too.
import { HOVER_REVEAL } from "@orb/ui/lib";
import { expect, test } from "@playwright/test";
import type { PressTransitionStory } from "./_press-transition-stories.tsx";

const STORY = "tests/ui/primitives/button/_press-transition-stories/PressTransitionStory";

test("every reveal arm keeps the press scale in its transition", async ({ mount }) => {
  const component = await mount<typeof PressTransitionStory>(STORY);
  const transitioned = (name: string): Promise<string[]> =>
    component.getByRole("button", { name, exact: true }).evaluate((node) => getComputedStyle(node).transitionProperty.split(", "));
  // The control: an unrevealed button eases the press and nothing else.
  expect(await transitioned("Plain")).toContain("scale");
  for (const arm of Object.keys(HOVER_REVEAL)) {
    const properties = await transitioned(arm);
    expect(properties, arm).toContain("scale");
    expect(properties, arm).toContain("opacity");
  }
});
