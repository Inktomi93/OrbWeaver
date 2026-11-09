// @subject packages/client/src/components/band.tsx
// A band's name must contain its visible label (WCAG 2.5.3). axe reads the DOM text of the band, so the label, the census and
// the mark have to be separate words there, not one welded token.
import { accessibilityScan } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { BandNameStory } from "./_band-name-stories.tsx";

const STORY = "tests/client/components/_band-name-stories/BandNameStory";
const BAND = { label: "Regex scripts", count: 6, mark: "Modified" } as const;
const LABEL_MISMATCH = "label-content-name-mismatch";

test("the band's name starts with its visible label, census and mark", async ({ mount, page }) => {
  const component = await mount<typeof BandNameStory>(STORY, BAND);
  const name = `${BAND.label} ${String(BAND.count)} ${BAND.mark}`;
  const band = component.getByRole("button", { name, exact: true });
  await expect(band).toBeVisible();
  const result = await accessibilityScan(page);
  expect(result.violations.find(({ id }) => id === LABEL_MISMATCH)?.nodes).toBeUndefined();
  const visible = await band.evaluate((button) => button.textContent);
  expect(visible.replace(/\s+/gu, " ").trim()).toBe(name);
});
