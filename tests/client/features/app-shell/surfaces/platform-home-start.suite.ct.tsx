// Home has one primary start control in every state: above the fold at the desktop and phone sizes, the same door every New chat opens. With
// rooms it sits in the masthead; with none the empty room tile owns it. It holds at 200% text. While the chat list read is pending the
// control is drawn nowhere and the masthead keeps its row, so the control appears once, in its settled place, and nothing below moves.

import { BLANK_CHAT_NAME, START_NEW_CHAT_NAME } from "@orb/client/lib";
import { enlargedTextFindings as findings, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, holdServed, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, createFirstBootHarness } from "@orb/testkit/node/composed";
import { CHAT_COMPOSER_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const TEXT_200 = 2;
const RECENTS_TILE = '[data-home-tile="chat.recents"]';
const EMPTY_STATE = '[data-slot="empty-state-root"]';
const SKELETON = '[data-slot="skeleton"]';
const HOME_GRID = "[data-home-grid]";

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
      await expect(page.locator(RECENTS_TILE).getByRole("button", { name: START_NEW_CHAT_NAME, exact: true })).toHaveCount(0);
      await start.click();
      await page.getByRole("dialog").getByRole("button", { name: BLANK_CHAT_NAME, exact: true }).click();
      await expect(page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true })).toBeVisible();
    });

    test("an account with no rooms has the one start control, and its empty room tile owns it", async ({ corpus, corpusViewer, mount, page }) => {
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
      const start = page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true });
      await expect(start).toHaveCount(1);
      await expect(recents.locator(EMPTY_STATE).getByRole("button", { name: START_NEW_CHAT_NAME, exact: true })).toHaveCount(1);
      await expect(start).toBeInViewport({ ratio: 1 });
    });

    test("an account with no rooms never sees the start control in the masthead while its chat list read is held", async ({
      corpus,
      corpusViewer,
      mount,
      page,
    }) => {
      await using root = await createFirstBootHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const read = holdServed();
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, corpusViewer.userId),
        ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
        ...serveCorpusProcedures(caller, ["chat.listChats"], () => read),
      });
      await seedShellState(page, { activeSection: "home" });
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      await read.requested;
      const recents = page.locator(RECENTS_TILE);
      const start = page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true });
      // Positive control: the read is still held, so the room tile shows its loading box.
      await expect(recents.locator(SKELETON).first()).toBeVisible();
      await expect(start).toHaveCount(0);
      const held = await page.locator(HOME_GRID).boundingBox();

      read.release();

      await expect(recents.locator(EMPTY_STATE).getByRole("button", { name: START_NEW_CHAT_NAME, exact: true })).toBeVisible();
      await expect(start).toHaveCount(1);
      expect(held).not.toBeNull();
      const settled = await page.locator(HOME_GRID).boundingBox();
      expect(settled?.y).toBe(held?.y);
    });

    test("an account with rooms gets the masthead start control once its held chat list read lands", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const read = holdServed();
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
        ...serveCorpusProcedures(caller, ["chat.listChats"], () => read),
      });
      await seedShellState(page, { activeSection: "home" });
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      await read.requested;
      const recents = page.locator(RECENTS_TILE);
      const start = page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true });
      // Positive control: the read is still held, so the room tile shows its loading box.
      await expect(recents.locator(SKELETON).first()).toBeVisible();
      await expect(start).toHaveCount(0);

      read.release();

      await expect(start).toBeVisible();
      await expect(recents.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true })).toHaveCount(0);
    });

    test("a chat list read that fails leaves the start control in the masthead", async ({ corpus, corpusViewer, mount, page }) => {
      await using root = await createFirstBootHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const read = holdServed();
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, corpusViewer.userId),
        ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
        ...serveCorpusProcedures(caller, ["chat.listChats"], () => read),
      });
      await seedShellState(page, { activeSection: "home" });
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      await read.requested;
      const start = page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true });
      // Positive control: the read is still held, so the room tile shows its loading box.
      await expect(page.locator(RECENTS_TILE).locator(SKELETON).first()).toBeVisible();
      await expect(start).toHaveCount(0);

      read.fail();

      await expect(start).toBeVisible();
      await expect(page.locator(RECENTS_TILE).getByRole("button", { name: START_NEW_CHAT_NAME, exact: true })).toHaveCount(0);
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
      await expect.poll(() => findings(page.locator("main.shell-content"))).toEqual([]);
      await expect(start).toBeInViewport({ ratio: 1 });
    });
  });
}
