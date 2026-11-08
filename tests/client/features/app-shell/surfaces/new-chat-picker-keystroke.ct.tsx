// The first character typed into New chat's search brings the picker's footer ("Showing N of M", Clear search) into the command box. Where the dialog
// is roomy the box and the dialog around it keep their size and place: the footer takes room from the list and never adds to the box. Where it is
// not, the footer adds to the box. Either way the list keeps a whole touch row.
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
const LIST = "[cmdk-list]";
const FONT_SCALE = channelName("fontScale");
const SEARCH_TERM = "a";

const CELLS = [
  { name: "1440x900 at 100%", width: 1440, height: 900, factor: 1, holds: true },
  { name: "390x844 at 100%", width: 390, height: 844, factor: 1, holds: true },
  { name: "1440x900 at 150%", width: 1440, height: 900, factor: 1.5, holds: true },
  // Enlarged text on common screens, where the cap still leaves the list two to four rows after the footer.
  { name: "1280x800 at 150%", width: 1280, height: 800, factor: 1.5, holds: true },
  { name: "1440x900 at 175%", width: 1440, height: 900, factor: 1.75, holds: true },
  { name: "375x667 at 150%", width: 375, height: 667, factor: 1.5, holds: true },
  { name: "320x568 at 125%", width: 320, height: 568, factor: 1.25, holds: true },
  // A tall phone at 200% text: wide enough for the footer's one line, the cap holds; narrower, the footer wraps and a cap would squeeze the list.
  { name: "412x915 at 200%", width: 412, height: 915, factor: 2, holds: true },
  { name: "430x932 at 200%", width: 430, height: 932, factor: 2, holds: true },
  { name: "393x873 at 200%", width: 393, height: 873, factor: 2, holds: false },
  { name: "360x900 at 200%", width: 360, height: 900, factor: 2, holds: false },
  // A landscape phone at enlarged text scrolls the dialog as one sheet around a one-row list window, and the footer still keeps that row.
  { name: "844x390 at 200%", width: 844, height: 390, factor: 2, holds: false },
  { name: "844x390 at 300%", width: 844, height: 390, factor: 3, holds: false },
  { name: "568x320 at 200%", width: 568, height: 320, factor: 2, holds: false },
  { name: "568x320 at 300%", width: 568, height: 320, factor: 3, holds: false },
] as const;

interface Frame {
  readonly dialog: { readonly top: number; readonly height: number };
  readonly box: number;
  readonly list: number;
  readonly row: number;
}

for (const cell of CELLS) {
  test.describe(`New chat's first keystroke at ${cell.name}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.width < 500, isMobile: cell.width < 500 });

    test(
      cell.holds ? "moves neither the dialog nor the picker box, and keeps a whole row" : "keeps a whole row in the list",
      async ({ corpus, mount, page }) => {
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
          const row = await dialog.getByRole("option").first().boundingBox();
          const list = await dialog.locator(LIST).boundingBox();
          return {
            dialog: { top: popup?.y ?? Number.NaN, height: popup?.height ?? Number.NaN },
            box: box?.height ?? Number.NaN,
            list: list?.height ?? Number.NaN,
            row: row?.height ?? Number.NaN,
          };
        };
        const before = await frame();
        await dialog.getByRole("combobox").fill(SEARCH_TERM);
        await expect(dialog.getByRole("button", { name: "Clear search", exact: true })).toBeVisible();
        const after = await frame();
        expect(after.list, `the list went ${String(before.list)}px to ${String(after.list)}px under rows of ${String(after.row)}px`).toBeGreaterThanOrEqual(
          after.row,
        );
        // The list stays a window onto the matches: an unbounded list would run every match down the sheet and put Start past them.
        expect(after.list, `the list is ${String(after.list)}px tall on a ${String(cell.height)}px screen`).toBeLessThanOrEqual(cell.height);
        if (!cell.holds) {
          return;
        }
        expect(Math.abs(after.box - before.box), `the picker box went ${String(before.box)}px to ${String(after.box)}px`).toBeLessThanOrEqual(SUBPIXEL_PX);
        expect(
          Math.abs(after.dialog.height - before.dialog.height),
          `the dialog went ${String(before.dialog.height)}px to ${String(after.dialog.height)}px`,
        ).toBeLessThanOrEqual(SUBPIXEL_PX);
        expect(
          Math.abs(after.dialog.top - before.dialog.top),
          `the dialog top went ${String(before.dialog.top)}px to ${String(after.dialog.top)}px`,
        ).toBeLessThanOrEqual(SUBPIXEL_PX);
      },
    );
  });
}
