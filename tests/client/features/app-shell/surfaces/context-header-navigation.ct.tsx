// The production chat's resolved context tabs remain reachable without scrolling the header strip.
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const CONTEXT = '.shell-panel[data-panel-side="context"]';

for (const hasTouch of [false, true]) {
  test.describe(hasTouch ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch, viewport: { width: 1280, height: 900 } });

    test("overflow offers every resolved chat tab, preserves manual activation and keeps close reachable", async ({ corpus, mount, page }, testInfo) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const room = namedGroupRoom((await caller.chat.listChats({ limit: 100 })).items);
      await routeRoom(page, corpus, caller);
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "docked" } } });
      await mount<typeof AppShellRoomStory>(`${SHELL_STORIES}/AppShellRoomStory`, { chatId: room.id });
      const pane = page.locator(CONTEXT);
      const strip = pane.getByRole("tablist");
      const header = pane.locator('[data-slot="context-bracket-header"]');
      await expect(strip).toBeVisible();
      const labels = await strip.getByRole("tab").allTextContents();
      expect(labels.length).toBeGreaterThan(2);
      const choose = header.getByRole("button", { name: "All Chat tabs", exact: true });
      await header.screenshot({ path: testInfo.outputPath("narrow-header.png") });
      await expect(choose).toBeVisible();
      await choose.click();
      const options = page.getByRole("menuitemradio");
      await expect(options).toHaveText(labels);
      await expect(page.getByRole("menuitemradio", { checked: true })).toHaveCount(1);
      if (!hasTouch) {
        await page.screenshot({ path: testInfo.outputPath("open-narrow-menu.png"), animations: "disabled" });
      }
      const last = options.last();
      const target = (await last.textContent())?.trim() ?? "";
      await last.click();
      await expect(strip.getByRole("tab", { selected: true })).toHaveText(target);
      await expect(pane.getByRole("region", { name: target, exact: true })).toBeVisible();
      await expect(choose).toBeFocused();
      await choose.press("Enter");
      await expect(page.getByRole("menuitemradio", { checked: true })).toHaveText(target);
      await page.keyboard.press("Escape");
      await expect(choose).toBeFocused();

      const selected = strip.getByRole("tab", { selected: true });
      await selected.focus();
      await selected.press("ArrowLeft");
      await expect(selected).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Enter");
      await expect(strip.getByRole("tab", { selected: true })).not.toHaveText(target);
      await expect(pane.getByRole("tablist")).toHaveCount(1);
      const close = header.locator('[data-slot="context-bracket-dismiss"]');
      await expect(close).toBeVisible();
      const floor = await resolvedLength(page, "var(--size-touch-target)");
      const box = await choose.boundingBox();
      expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(floor);
      await page.setViewportSize({ width: 1920, height: 900 });
      await expect(header).toBeVisible();
      await header.screenshot({ path: testInfo.outputPath("wide-header.png") });
      await close.click();
      await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
    });
  });
}
