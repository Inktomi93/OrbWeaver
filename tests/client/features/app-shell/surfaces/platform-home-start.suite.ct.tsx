// Home has one primary start control: above the fold at the desktop and phone sizes, the same door every New chat opens, and no second one in
// the empty room tile. It holds at 200% text.

import { BLANK_CHAT_NAME, START_NEW_CHAT_NAME } from "@orb/client/lib";
import { enlargedTextFindings as findings, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, createFirstBootHarness } from "@orb/testkit/node/composed";
import { CHAT_COMPOSER_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const TEXT_200 = 2;
const RECENTS_TILE = '[data-home-tile="chat.recents"]';
const EMPTY_STATE = '[data-slot="empty-state-root"]';

for (const device of [
  { label: "desktop", width: 1440, height: 900, coarse: false },
  { label: "phone", width: 390, height: 844, coarse: true },
] as const) {
  test.describe(device.label, () => {
    test.use({ hasTouch: device.coarse, isMobile: device.coarse, viewport: { width: device.width, height: device.height } });

    test("one primary start control sits above the fold and starts a chat", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "chat.startChat"]),
      });
      await seedShellState(page, { activeSection: "home" });
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      const start = page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true });
      await expect(start).toHaveCount(1);
      await expect(start).toBeInViewport({ ratio: 1 });
      await expect(start).toHaveAttribute("data-cta", "");
      await start.click();
      await page.getByRole("dialog").getByRole("button", { name: BLANK_CHAT_NAME, exact: true }).click();
      await expect(page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true })).toBeVisible();
    });

    test("an account with no rooms has the one start control and no second one in its empty room tile", async ({ corpus, corpusViewer, mount, page }) => {
      await using root = await createFirstBootHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, corpusViewer.userId),
        ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
      });
      await seedShellState(page, { activeSection: "home" });
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      const recents = page.locator(RECENTS_TILE);
      await expect(recents.locator(EMPTY_STATE)).toHaveCount(1);
      await expect(recents.getByRole("button")).toHaveCount(0);
      const start = page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true });
      await expect(start).toHaveCount(1);
      await expect(start).toBeInViewport({ ratio: 1 });
    });

    test("the start control holds at 200% text", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
      });
      await seedShellState(page, { activeSection: "home" });
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      const start = page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true });
      await expect(start).toBeVisible();
      await setRootFontScale(page, channelName("fontScale"), TEXT_200);
      // The row that holds the control and the masthead: Home's whole scroller already scrolls sideways at 200% on a phone, which is not this control's.
      await expect.poll(() => findings(start.locator("xpath=.."))).toEqual([]);
      await expect(start).toBeInViewport({ ratio: 1 });
    });
  });
}
