// @subject packages/ui/src/charts/stat-figure/stat-figure.tsx
// A figure with no value prints the shared empty-value glyph and a screen reader hears its name, not a bare dash.
import { NO_VALUE, NO_VALUE_NAME } from "@orb/kit/strings";
import { expect, test } from "@playwright/test";
import type { StatFigureNoValueStory } from "./_no-value-stories.tsx";

const STORY = "tests/ui/charts/stat-figure/_no-value-stories/StatFigureNoValueStory";

test("an empty figure prints the glyph under the empty-value name and a measured one stays plain text", async ({ mount, page }) => {
  await mount<typeof StatFigureNoValueStory>(STORY, {});
  const empty = page.getByRole("img", { name: NO_VALUE_NAME, exact: true });
  await expect(empty).toHaveCount(1);
  await expect(empty).toHaveText(NO_VALUE);
  // The control: the measured figure is on screen and carries no such name.
  await expect(page.getByText("1,204", { exact: true })).toBeVisible();
});

test("a chart's text table says the empty value by its name", async ({ mount, page }) => {
  await mount<typeof StatFigureNoValueStory>(STORY, {});
  await expect(page.getByRole("cell", { name: NO_VALUE_NAME, exact: true })).toHaveCount(1);
  await expect(page.getByRole("cell", { name: NO_VALUE, exact: true })).toHaveCount(0);
});
