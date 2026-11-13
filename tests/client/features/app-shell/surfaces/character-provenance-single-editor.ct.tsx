// @subject packages/client/src/features/character/components/character-facet-inspector.tsx
// With the Provenance facet drilled and the detail panel docked beside it, the editor holds the one input for the creator and for the
// card version. The detail panel reads the same draft back and offers no second input.

import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHARACTER_CARD_VERSION_FIELD_NAME, CHARACTER_CREATOR_FIELD_NAME } from "#client/features/character/lib/character-names.ts";
import type { AppShellCharacterStory } from "./_app-shell-stories.tsx";
import { routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const CONTEXT = '.shell-panel[data-panel-side="context"]';
const CONTENT = "main.shell-content";
const TYPED_CREATOR = "A. Lighthouse-Keeper";

test.use({ viewport: { width: 1600, height: 900 } });

test("the drilled Provenance facet has one input per field, and the detail panel reads the draft back", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [character] = (await caller.character.list({})).items;
  if (character === undefined) {
    throw new Error("The corpus has no character");
  }
  await routeRoom(page, corpus, caller);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "docked" } } });
  await mount<typeof AppShellCharacterStory>(`${SHELL_STORIES}/AppShellCharacterStory`, { characterId: character.id });

  await page
    .locator(CONTENT)
    .getByRole("button", { name: /Provenance/u })
    .click();
  const creator = page.getByRole("textbox", { name: CHARACTER_CREATOR_FIELD_NAME, exact: true });
  const version = page.getByRole("textbox", { name: CHARACTER_CARD_VERSION_FIELD_NAME, exact: true });
  const context = page.locator(CONTEXT);
  // Positive control: the detail panel is docked and shows the drilled facet's creator.
  await expect(context.getByText(CHARACTER_CREATOR_FIELD_NAME, { exact: true })).toBeVisible();
  await expect(page.locator(CONTENT).getByRole("textbox", { name: CHARACTER_CREATOR_FIELD_NAME, exact: true })).toBeVisible();

  await expect(creator).toHaveCount(1);
  await expect(version).toHaveCount(1);
  await expect(context.getByRole("textbox")).toHaveCount(0);

  await creator.fill(TYPED_CREATOR);
  await expect(context.getByText(TYPED_CREATOR, { exact: true })).toBeVisible();
});
