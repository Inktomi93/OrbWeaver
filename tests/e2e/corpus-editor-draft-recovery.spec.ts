// The character editor keeps a crash-survival draft: an edit whose save fails is restored after a reload and then saves.

import { createCharacterSchema } from "@orb/contracts/character";
import { slugifyHandle } from "@orb/kit/slug";
import { abortProcedure } from "@orb/testkit/node/helpers";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_SEARCH_NAME } from "#client/components/shared-control-names.ts";
import { CHARACTER_EDITOR_NAME, CHARACTER_HERO_NAME_FIELD_NAME, CHARACTER_LIBRARY_NAME } from "#client/features/character/lib/character-names.ts";
import { AUTOSAVE_RESUME_NAME, AUTOSAVE_SAVE_FAILED_TEXT, AUTOSAVE_SAVED_TEXT } from "#client/forms/editor/autosave-status-names.ts";
import { ownerActor } from "./support/actors.ts";
import { charactersRailButton, waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";

/** Open the library row stored as `name`; the editor then shows `shown`, which differs when a draft was restored. */
async function openCharacter(page: Page, name: string, shown = name): Promise<Locator> {
  await charactersRailButton(page).click();
  const list = page.locator('.shell-panel[data-panel-side="list"]');
  await list.getByRole("textbox", { name: CHARACTER_SEARCH_NAME, exact: true }).fill(name);
  await list.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true }).getByRole("button", { name, exact: true }).click();
  const form = page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true });
  await expect(form.getByRole("textbox", { name: CHARACTER_HERO_NAME_FIELD_NAME, exact: true })).toHaveValue(shown);
  return form;
}

test.describe("committed corpus editor drafts", () => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");

  test("a character edit whose save failed is restored after a reload and then saved", { tag: "@smoke" }, async ({ page, baseURL }, info) => {
    const host = ownerActor(baseURL ?? "");
    const name = `Draft recovery ${info.project.name} ${String(info.workerIndex)}`;
    const edited = `${name} edited`;
    const character = await host.trpc.character.create.mutate({
      input: createCharacterSchema.parse({
        handle: slugifyHandle(name),
        name,
        description: "A disposable draft-recovery subject.",
        greetings: [{ text: "Hello." }],
      }),
    });
    const lift = await abortProcedure(page, "character.update");
    try {
      await page.goto("/");
      await waitForAppReady(page);
      const form = await openCharacter(page, name);
      await form.getByRole("textbox", { name: CHARACTER_HERO_NAME_FIELD_NAME, exact: true }).fill(edited);
      await expect(form.locator('[data-slot="autosave-status"]')).toContainText(AUTOSAVE_SAVE_FAILED_TEXT);
      expect((await host.trpc.character.get.query({ characterId: character.id })).name).toBe(name);

      // The reload still refuses the write, so only the draft can bring the edit back.
      await page.reload();
      await waitForAppReady(page);
      const restored = await openCharacter(page, name, edited);
      expect((await host.trpc.character.get.query({ characterId: character.id })).name).toBe(name);

      // A restored draft is not on the server, so the editor offers to resume saving instead of reading "Saved".
      const status = restored.locator('[data-slot="autosave-status"]');
      await lift();
      await status.getByRole("button", { name: AUTOSAVE_RESUME_NAME, exact: true }).click();
      await expect.poll(async () => (await host.trpc.character.get.query({ characterId: character.id })).name).toBe(edited);
      await expect(status).toHaveText(AUTOSAVE_SAVED_TEXT);
    } finally {
      await lift();
      await host.trpc.character.remove.mutate({ characterId: character.id });
    }
  });
});
