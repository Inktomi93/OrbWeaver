// The character import dialog is a FormDialog that arrives on its title, so a keyboard user who opened it hears its name first. The
// shell, the list band and the dialog are the production ones over a first-boot root.
// @subject packages/client/src/components/form-dialog.tsx
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import { CHARACTER_IMPORT_NAME } from "#client/features/character/lib/character-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";

test.use({ viewport: { width: 1440, height: 1000 } });

test("opening the import dialog by keyboard lands focus on its title", async ({ corpus, mount, page }) => {
  await using root = await createFirstBootHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});

  const door = page.getByRole("button", { name: CHARACTER_IMPORT_NAME, exact: true });
  await door.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: CHARACTER_IMPORT_NAME, exact: true });
  await expect(dialog.getByRole("heading", { name: CHARACTER_IMPORT_NAME, exact: true })).toBeFocused();
});
