// A kicker band's trailing content sits after its rule, keeps the heading in the outline and wraps rather than crushing the rule.
import { expect, test } from "@playwright/test";
import type { SectionTrailingStory } from "./_section-trailing-stories.tsx";

const STORY = "tests/ui/layout/_section-trailing-stories/SectionTrailingStory";

test("the tally follows the rule on the band's own line, under one heading", async ({ mount }) => {
  const component = await mount<typeof SectionTrailingStory>(STORY);
  const band = component.locator('[data-probe="wide"]');
  const heading = band.getByRole("heading", { name: "Rewrite", exact: true, level: 3 });
  await expect(heading).toBeVisible();
  const rule = band.locator('[data-slot="separator"]');
  const tally = component.locator('[data-probe="wide-tally"]');
  const [headingBox, ruleBox, tallyBox] = await Promise.all([heading.boundingBox(), rule.boundingBox(), tally.boundingBox()]);
  if (headingBox === null || ruleBox === null || tallyBox === null) {
    throw new Error("The band's parts have no box");
  }
  expect(ruleBox.x).toBeGreaterThan(headingBox.x + headingBox.width - 1);
  expect(tallyBox.x).toBeGreaterThan(ruleBox.x + ruleBox.width - 1);
  expect(Math.abs(tallyBox.y + tallyBox.height / 2 - (headingBox.y + headingBox.height / 2))).toBeLessThan(headingBox.height);
});

test("a tally wider than the band takes the next line", async ({ mount }) => {
  const component = await mount<typeof SectionTrailingStory>(STORY);
  const tally = component.locator('[data-probe="narrow-tally"]');
  const band = tally.locator("xpath=..");
  const heading = band.getByRole("heading", { name: "Rewrite", exact: true });
  const [headingBox, tallyBox] = await Promise.all([heading.boundingBox(), tally.boundingBox()]);
  if (headingBox === null || tallyBox === null) {
    throw new Error("The band's parts have no box");
  }
  expect(tallyBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
});
