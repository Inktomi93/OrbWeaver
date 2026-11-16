// A veiled frame loads wherever it sits: its host waits on the height its document reports, so a frame clipped far
// below a scroller's visible edge, as the newest row of a long transcript is when it commits, still loads, reports
// and draws. A lazily loaded veiled frame there never loads and strands its host's measurement.
// @subject packages/ui/src/content/sandbox-frame/sandbox-frame.tsx

import { expect } from "@orb/testkit/ct-corpus";
import type { FrameBelowScrollerFoldStory } from "./_frame-stories.tsx";
import { routeServedFrame, test } from "./_served-frame.ts";

const STORY = "tests/ui/content/sandbox-frame/_frame-stories/FrameBelowScrollerFoldStory";
const FRAME = '[data-slot="sandbox-frame"]';
// Far past any distance a browser loads a lazy frame ahead of a scroller's visible edge.
const SPACER_REM = 400;
const REPLY_HEIGHT_PX = 240;

test("a veiled reply frame far below a scroller's visible edge loads, reports its height and draws", async ({ mount, room, page }) => {
  const served = await room.serve(`<div style="block-size:${String(REPLY_HEIGHT_PX)}px">Reply</div>`);
  await routeServedFrame(page, served);
  const story = await mount<typeof FrameBelowScrollerFoldStory>(STORY, { src: served.url, title: "reply", spacerRem: SPACER_REM });
  const frame = story.locator(FRAME);
  // Positive control: the frame sits below what the scroller shows, which never moved.
  expect(await story.locator('[data-slot="story-scroller"]').evaluate((node) => node.scrollTop)).toBe(0);
  await expect(frame).toHaveAttribute("data-drawn", "");
  expect((await frame.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(REPLY_HEIGHT_PX);
  await expect(story.getByText("The reply is on its way.")).toHaveCount(0);
});
