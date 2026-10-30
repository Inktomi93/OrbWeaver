// @subject packages/client/src/forms/editor/create-autosave-entity-form.tsx
// The shared autosave session's display status, read through the production character editor: a fresh load reads
// Saved, and a draft restored over a refused save reads as unsaved with the way to resume.
import { characterDetailSchema } from "@orb/contracts/character";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { CharacterDraftStatusStory } from "./_draft-status-stories.tsx";

const STORY = "tests/client/features/character/components/_draft-status-stories/CharacterDraftStatusStory";
const EDITOR_READS = [
  "sessions.me",
  "settings.getUserSettings",
  "character.get",
  "preset.get",
  "chat.listChats",
  "regex.listForCharacter",
  "tag.listPendingSuggestions",
] as const;

test("a restored draft reads as unsaved with a way to resume, and a fresh load reads Saved", async ({ corpus, mount, page }) => {
  const first = corpus.reads["character.list"][0]?.output.items[0];
  if (first === undefined) {
    throw new Error("Committed character library must include a card");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const characterId = characterDetailSchema.shape.id.parse(first.id);
  const stored = (await caller.character.get({ characterId })).name;
  const edited = `${stored} edited`;
  let failSaves = true;
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, EDITOR_READS),
    ...serveCorpusProcedures(caller, ["character.update"], () => (failSaves ? trpcError() : undefined)),
  });
  const component = await mount<typeof CharacterDraftStatusStory>(STORY, { characterId });
  const form = page.getByRole("form", { name: "Edit character", exact: true });
  const status = form.locator('[data-slot="autosave-status"]');
  const name = form.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toHaveValue(stored);
  await expect(status).toHaveText("Saved");

  await name.fill(edited);
  await expect(status).toContainText("Save failed");

  await component.update({ characterId, mounted: false });
  await component.update({ characterId });
  await expect(name).toHaveValue(edited);
  await expect(status).toContainText("Restored draft");
  await expect(status).not.toHaveText("Saved");
  failSaves = false;
  await status.getByRole("button", { name: "Resume saving", exact: true }).click();
  await expect(status).toHaveText("Saved");
  expect((await caller.character.get({ characterId })).name).toBe(edited);
});
