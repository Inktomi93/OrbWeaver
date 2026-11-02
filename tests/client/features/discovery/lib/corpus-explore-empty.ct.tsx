// @subject packages/client/src/features/discovery/lib/corpus-overview-door.ts
// A phone's empty Corpus Explore: the door out of the empty finder (a library with no characters, the only library whose
// browse is empty) and the door in the CONTEXT sheet (characters and no digests) both reveal the understanding overview,
// hand focus to Content and close the sheets.

import { contextToggleLabel } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createFirstBootHarness, seedCharacter } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import { CORPUS_MODE_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const PHONE = { width: 390, height: 844 } as const;
const UNDERSTANDING_RUN = '[data-slot="understanding-pass-run"]';
const CHARACTER_HANDLES = ["ash", "birch", "cedar"] as const;

test.use({ hasTouch: true, viewport: PHONE });

/** A production root whose owner holds `handles` as characters and has never run a digest, served to the production shell. */
async function routeUndistilledLibrary(
  page: Parameters<typeof routeTrpc>[0],
  root: Awaited<ReturnType<typeof createFirstBootHarness>>,
  handles: readonly string[],
): Promise<void> {
  const owner = await root.principalFor(root.ownerId);
  for (const handle of handles) {
    await seedCharacter(root, { principal: owner, input: createCharacterSchema.parse({ handle, name: handle, description: "" }) });
  }
  const caller = await root.internalCallerFor(root.ownerId);
  // The subject's own claim, read through the production verb: the library holds exactly these characters and none is distilled.
  const catalog = await caller.discovery.catalog();
  expect([catalog.totalCharacters, catalog.totalDistilled]).toEqual([handles.length, 0]);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  await seedShellState(page, { activeSection: "corpus" });
}

test("the empty finder's door reveals the overview, takes focus into Content and closes the finder and the CONTEXT sheet", async ({ mount, page }) => {
  await using root = await createFirstBootHarness();
  await routeUndistilledLibrary(page, root, []);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const list = page.locator(LIST);
  const door = list.getByRole("button", { name: "Go to sorting", exact: true });
  await expect(door).toBeVisible();
  // Before the door the finder is the phone's screen: Content is inert behind it and holds no focus.
  await expect(list).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.locator(".shell-content")).toHaveAttribute("inert", "");
  await expect(page.getByRole("main")).not.toBeFocused();

  await door.click();

  await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "false");
  await expect(page.locator(".shell-content")).not.toHaveAttribute("inert");
  // The overview of a library with no characters is Content's own mode switch over the empty-library welcome.
  await expect(page.getByRole("main").getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();
});

test("the Archetypes door inside the open CONTEXT sheet closes it, reveals the overview and takes focus into Content", async ({ mount, page }) => {
  await using root = await createFirstBootHarness();
  await routeUndistilledLibrary(page, root, CHARACTER_HANDLES);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const context = page.locator(CONTEXT);
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await expect(context).toHaveAttribute("data-panel-mode", "overlay");
  await context.getByRole("tab", { name: "Archetypes", exact: true }).click();
  const door = context.getByRole("button", { name: "Show Explore overview", exact: true });
  await expect(door).toBeVisible();

  await door.click();

  await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "false");
  await expect(page.getByRole("main").locator(UNDERSTANDING_RUN)).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();
});
