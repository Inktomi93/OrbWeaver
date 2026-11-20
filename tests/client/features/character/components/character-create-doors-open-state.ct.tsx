// The Characters New and Import doors say they open a dialog and whether it is open, from the dialog's own state, at a desktop
// and at a coarse phone. The shell, the list band, the phone topbar and the dialogs are the production ones over a first-boot root.
// @subject packages/client/src/components/form-dialog.tsx
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_IMPORT_NAME, CHARACTER_NEW_NAME } from "#client/features/character/lib/character-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { BAND_NEW_LABEL } from "#client/lib/list-band-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
// The band says the word where there is room, and the phone's icon names itself in full.
const NEW_DOOR = new RegExp(`^(?:${BAND_NEW_LABEL}|${CHARACTER_NEW_NAME})$`, "u");

const REGIMES = [
  { name: "desktop 1440px", viewport: { width: 1440, height: 900 }, coarse: false },
  { name: "phone 390px", viewport: { width: 390, height: 844 }, coarse: true },
] as const;

const DOORS = [
  { door: NEW_DOOR, dialog: CHARACTER_NEW_NAME },
  { door: CHARACTER_IMPORT_NAME, dialog: CHARACTER_IMPORT_NAME },
] as const;

/** The one painted door by its name. The open modal hides it from the accessibility tree, so hidden nodes count too. */
function paintedDoor(page: Page, name: string | RegExp): Locator {
  return page.getByRole("button", { name, exact: typeof name === "string", includeHidden: true }).filter({ visible: true });
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    test("each create door states that it opens a dialog, and whether that dialog is open, through every open and close", async ({ corpus, mount, page }) => {
      await using root = await createFirstBootHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeAuthConfig(page, corpus.auth.signedInConfig);
      await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
      await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
      await mount<typeof ShellAmbientStory>(STORY, {});

      for (const { door: doorName, dialog: dialogName } of DOORS) {
        const door = paintedDoor(page, doorName);
        await expect(door).toHaveCount(1);
        const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
        await expect(door).toHaveAttribute("aria-haspopup", "dialog");
        await expect(door).toHaveAttribute("aria-expanded", "false");

        // A press opens it, and Cancel closes it.
        await (regime.coarse ? door.tap() : door.click());
        await expect(dialog).toBeVisible();
        await expect(door).toHaveAttribute("aria-expanded", "true");
        await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(door).toHaveAttribute("aria-expanded", "false");
        await expect(door).toBeFocused();

        // The keyboard opens it, and Escape closes it.
        await door.focus();
        await page.keyboard.press("Enter");
        await expect(dialog).toBeVisible();
        await expect(door).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(door).toHaveAttribute("aria-expanded", "false");
      }
    });
  });
}
