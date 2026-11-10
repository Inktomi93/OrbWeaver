// The first character typed into New chat's search brings the picker's footer ("Showing N of M", Clear search) into the command box. Where the dialog
// is roomy and the footer keeps one row, the box and the dialog around it keep their size and place: the footer takes room from the list and never
// adds to the box. A footer that wraps, or a dialog that is not roomy, adds to the box. Either way the list keeps a whole touch row, whatever the
// footer says.

import { createCharacterSchema } from "@orb/contracts/character";
import { LAYOUT_SUBPIXEL_PX, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedCharacter } from "@orb/testkit/node/composed";
import { CLEAR_SEARCH_NAME } from "#client/lib/search-empty-names.ts";
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

const COMMAND_ROOT = '[data-slot="command-root"]';
const LIST = "[cmdk-list]";
const FONT_SCALE = channelName("fontScale");
const SEARCH_TERM = "a";
const MIN_THREE_DIGIT_LIBRARY = 100;

interface Cell {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly factor: number;
  readonly holds: boolean;
  /** Characters seeded on top of the corpus library, so the footer's count reads three digits. */
  readonly extra?: number;
}

const CELLS: readonly Cell[] = [
  { name: "1440x900 at 100%", width: 1440, height: 900, factor: 1, holds: true },
  { name: "390x844 at 100%", width: 390, height: 844, factor: 1, holds: true },
  { name: "1440x900 at 150%", width: 1440, height: 900, factor: 1.5, holds: true },
  // Enlarged text on common screens, where the cap still leaves the list two to four rows after the footer.
  { name: "1280x800 at 150%", width: 1280, height: 800, factor: 1.5, holds: true },
  { name: "1440x900 at 175%", width: 1440, height: 900, factor: 1.75, holds: true },
  { name: "375x667 at 150%", width: 375, height: 667, factor: 1.5, holds: true },
  { name: "320x568 at 125%", width: 320, height: 568, factor: 1.25, holds: true },
  // At 200% text a footer keeps one row only in a dialog wide enough for its count beside Clear search: a tablet-width screen holds the box, and a
  // phone's footer wraps, so the box grows and the list keeps its window.
  { name: "600x1100 at 200%", width: 600, height: 1100, factor: 2, holds: true },
  { name: "460x915 at 200%", width: 460, height: 915, factor: 2, holds: false },
  { name: "412x915 at 200%", width: 412, height: 915, factor: 2, holds: false },
  { name: "430x932 at 200%", width: 430, height: 932, factor: 2, holds: false },
  { name: "393x873 at 200%", width: 393, height: 873, factor: 2, holds: false },
  { name: "360x900 at 200%", width: 360, height: 900, factor: 2, holds: false },
  // A landscape phone at enlarged text scrolls the dialog as one sheet around a one-row list window, and the footer still keeps that row.
  { name: "844x390 at 200%", width: 844, height: 390, factor: 2, holds: false },
  { name: "844x390 at 300%", width: 844, height: 390, factor: 3, holds: false },
  { name: "568x320 at 200%", width: 568, height: 320, factor: 2, holds: false },
  { name: "568x320 at 300%", width: 568, height: 320, factor: 3, holds: false },
  // A library past a hundred characters reads "Showing 100 of 108": the count's length is not what decides whether the list keeps its row. 480 is a
  // width where the shorter count still fits beside Clear search.
  { name: "480x915 at 200% with 108 characters", width: 480, height: 915, factor: 2, holds: false, extra: 70 },
  { name: "412x915 at 200% with 108 characters", width: 412, height: 915, factor: 2, holds: false, extra: 70 },
];

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
        const owner = await root.principalFor(root.ownerId);
        for (let index = 0; index < (cell.extra ?? 0); index += 1) {
          const handle = `keystroke-bulk-${String(index)}`;
          await seedCharacter(root, {
            principal: owner,
            input: createCharacterSchema.parse({ handle, name: `Bulk archivist ${String(index)}`, description: "" }),
          });
        }
        const caller = await root.internalCallerFor(root.ownerId);
        // The fixture reached the size the cell names: the footer's count is the server's own, three digits where the cell seeds extra characters.
        expect((await caller.character.list({ limit: 1 })).totalCount).toBeGreaterThanOrEqual(cell.extra === undefined ? 0 : MIN_THREE_DIGIT_LIBRARY);
        await routeShell(page, corpus, caller, SERVED);
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
        await expect(dialog.getByRole("button", { name: CLEAR_SEARCH_NAME, exact: true })).toBeVisible();
        const after = await frame();
        expect(after.list, `the list went ${String(before.list)}px to ${String(after.list)}px under rows of ${String(after.row)}px`).toBeGreaterThanOrEqual(
          after.row,
        );
        // The list stays a window onto the matches: an unbounded list would run every match down the sheet and put Start past them.
        expect(after.list, `the list is ${String(after.list)}px tall on a ${String(cell.height)}px screen`).toBeLessThanOrEqual(cell.height);
        if (!cell.holds) {
          return;
        }
        expect(Math.abs(after.box - before.box), `the picker box went ${String(before.box)}px to ${String(after.box)}px`).toBeLessThanOrEqual(
          LAYOUT_SUBPIXEL_PX,
        );
        expect(
          Math.abs(after.dialog.height - before.dialog.height),
          `the dialog went ${String(before.dialog.height)}px to ${String(after.dialog.height)}px`,
        ).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
        expect(
          Math.abs(after.dialog.top - before.dialog.top),
          `the dialog top went ${String(before.dialog.top)}px to ${String(after.dialog.top)}px`,
        ).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      },
    );
  });
}
