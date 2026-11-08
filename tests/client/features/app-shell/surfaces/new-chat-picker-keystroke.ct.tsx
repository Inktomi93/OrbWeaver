// The first character typed into New chat's search brings the picker's footer ("Showing N of M", Clear search) into the command box. The box and the
// dialog around it keep their size and place: the footer takes room from the list and never adds to the box.
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellModalStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const SERVED = [
  "sessions.me",
  "chat.listChats",
  "chat.countChats",
  "character.list",
  "rosterPreset.list",
  "databank.listGlobal",
  "worldInfo.listBooks",
  "settings.getUserSettings",
  "settings.listThemes",
  "settings.getTheme",
  "notifications.markAllRead",
  "plugin.list",
  "plugin.listSurfaces",
] as const;

const SUBPIXEL_PX = 1;
const COMMAND_ROOT = '[data-slot="command-root"]';
const FONT_SCALE = channelName("fontScale");
const SEARCH_TERM = "a";

const CELLS = [
  { name: "1440x900 at 100%", width: 1440, height: 900, factor: 1 },
  { name: "390x844 at 100%", width: 390, height: 844, factor: 1 },
  { name: "1440x900 at 150%", width: 1440, height: 900, factor: 1.5 },
  // Enlarged text on common screens, where the cap still leaves the list two to four rows after the footer.
  { name: "1280x800 at 150%", width: 1280, height: 800, factor: 1.5 },
  { name: "1440x900 at 175%", width: 1440, height: 900, factor: 1.75 },
  { name: "375x667 at 150%", width: 375, height: 667, factor: 1.5 },
  { name: "320x568 at 125%", width: 320, height: 568, factor: 1.25 },
] as const;

interface Frame {
  readonly dialog: { readonly top: number; readonly height: number };
  readonly box: number;
}

for (const cell of CELLS) {
  test.describe(`New chat's first keystroke at ${cell.name}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.width < 500, isMobile: cell.width < 500 });

    test("moves neither the dialog nor the picker box", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellModalStory>(`${SHELL_STORIES}/AppShellModalStory`, { modalId: "newChat" });
      const dialog = page.getByRole("dialog");
      await setRootFontScale(page, FONT_SCALE, cell.factor);
      await expect(dialog.getByRole("option").first()).toBeVisible();
      const frame = async (): Promise<Frame> => {
        const popup = await dialog.boundingBox();
        const box = await dialog.locator(COMMAND_ROOT).boundingBox();
        return { dialog: { top: popup?.y ?? Number.NaN, height: popup?.height ?? Number.NaN }, box: box?.height ?? Number.NaN };
      };
      const before = await frame();
      await dialog.getByRole("combobox").fill(SEARCH_TERM);
      await expect(dialog.getByRole("button", { name: "Clear search", exact: true })).toBeVisible();
      const after = await frame();
      expect(Math.abs(after.box - before.box), `the picker box went ${String(before.box)}px to ${String(after.box)}px`).toBeLessThanOrEqual(SUBPIXEL_PX);
      expect(
        Math.abs(after.dialog.height - before.dialog.height),
        `the dialog went ${String(before.dialog.height)}px to ${String(after.dialog.height)}px`,
      ).toBeLessThanOrEqual(SUBPIXEL_PX);
      expect(
        Math.abs(after.dialog.top - before.dialog.top),
        `the dialog top went ${String(before.dialog.top)}px to ${String(after.dialog.top)}px`,
      ).toBeLessThanOrEqual(SUBPIXEL_PX);
    });
  });
}
