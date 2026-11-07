// The track's box lives in the client stylesheet, keyed on the stamp `Track` writes: a carrier that drops the stamp loses its whole box without a word.
// The track lands on the device-pixel grid at an odd remainder, and the transcript and the composer share one centre (integer-line-boxes.md Law 3).
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { TrackCarriersStory } from "./_chat-track-stories.tsx";

const STORY = "tests/client/features/chat/lib/_chat-track-stories/TrackCarriersStory";
const PANE = 893;
const DIAL = 768;

test.use({ viewport: { width: 1280, height: 800 } });

const edges = (locator: Locator): Promise<{ readonly start: number; readonly width: number }> =>
  locator.evaluate((element) => {
    const { left, width } = element.getBoundingClientRect();
    return { start: left, width };
  });

const slotted = (page: Page, slot: string): Locator => page.locator(`[data-slot="${slot}"]`);

const CARRIERS = [
  ["track-stack", "chat"],
  ["track-echo", "echo"],
  ["track-row", "composer"],
  ["track-container", "composer"],
  ["track-island", "composer"],
  ["option-strip", "composer"],
] as const;

test("every carrier hands the stamp to its element", async ({ mount, page }) => {
  await mount<typeof TrackCarriersStory>(STORY, { pane: `${PANE}px`, dial: `${DIAL}px` });
  for (const [slot, track] of CARRIERS) {
    await expect(slotted(page, slot), slot).toHaveAttribute("data-track", track);
  }
});

test("at an odd remainder the chat track starts on a whole pixel, with the end margin taking the odd one", async ({ mount, page }) => {
  await mount<typeof TrackCarriersStory>(STORY, { pane: `${PANE}px`, dial: `${DIAL}px` });
  const pane = await edges(slotted(page, "track-pane"));
  const track = await edges(slotted(page, "track-stack"));
  expect(pane.width).toBe(PANE);
  expect(track.width).toBe(DIAL);
  expect(track.start - pane.start).toBe(Math.floor((PANE - DIAL) / 2));
});

test("the transcript's track and the composer's share one centre, within the pixel the floor gives up", async ({ mount, page }) => {
  await mount<typeof TrackCarriersStory>(STORY, { pane: `${PANE}px`, dial: `${DIAL}px` });
  const chat = await edges(slotted(page, "track-stack"));
  const composer = await edges(slotted(page, "track-island"));
  expect(composer.width).toBeGreaterThan(0);
  expect(composer.width).toBeLessThanOrEqual(chat.width);
  expect(Math.abs(chat.start + chat.width / 2 - (composer.start + composer.width / 2))).toBeLessThanOrEqual(1);
});
