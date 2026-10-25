// The composer never runs wider than the content column it sits under; the chat-width dial still narrows both.
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { RoomTracksStory } from "./_platform-room-stories.tsx";

const STORY = "tests/support/browser/_platform-room-stories/RoomTracksStory";
const ULTRAWIDE = { width: 3440, height: 1440 } as const;
// The dial's shipped default expression at 50% of the viewport, and a narrow value below the reading measure.
const DIAL_DEFAULT = "clamp(46.625rem, 50dvw, 100dvw)";
const DIAL_NARROW = "40rem";

test.use({ viewport: ULTRAWIDE });

async function widths(page: Page): Promise<{ readonly column: number; readonly composer: number }> {
  const column = await page.getByRole("region", { name: "content column", exact: true }).evaluate((el) => el.getBoundingClientRect().width);
  const composer = await page.getByRole("region", { name: "composer", exact: true }).evaluate((el) => el.getBoundingClientRect().width);
  return { column, composer };
}

test("at 3440 the composer is no wider than the content column", async ({ mount, page }) => {
  await mount<typeof RoomTracksStory>(STORY, { dial: DIAL_DEFAULT });
  const { column, composer } = await widths(page);
  expect(column).toBeGreaterThan(0);
  expect(composer).toBeLessThanOrEqual(column + 1);
  expect(composer).toBeGreaterThan(column / 2);
});

test("a dial narrower than the reading measure still narrows the composer", async ({ mount, page }) => {
  await mount<typeof RoomTracksStory>(STORY, { dial: DIAL_NARROW });
  const { composer } = await widths(page);
  const narrow = await page.evaluate((rem) => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * rem, Number.parseFloat(DIAL_NARROW));
  expect(composer).toBeCloseTo(narrow, 0);
});
