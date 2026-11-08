// Deleting the crowned persona names, before the confirm, the persona the crown moves to.

import { ROW_DELETE_NAME } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { deleteMovesDefaultNote } from "#client/features/persona/lib/persona-copy.ts";
import type { PersonaActionGroupsStory } from "./_persona-action-groups-stories.tsx";

const STORY = "tests/client/features/persona/components/_persona-action-groups-stories/PersonaActionGroupsStory";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "persona.list",
  "persona.get",
  "persona.remove",
  "worldInfo.listBooks",
  "worldInfo.listForPersona",
  "persona.listConnectedCharacters",
  "preset.get",
  "plugin.listMacros",
] as const;

test("the crowned persona's delete confirm names the last-played persona the crown moves to", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const doomed = await caller.persona.create({ input: { name: "Doomed default witness", description: "Goes." } });
  const lastPlayed = await caller.persona.create({ input: { name: "Last played witness", description: "Stays." } });
  await caller.persona.create({ input: { name: "Newest witness", description: "Also stays." } });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { currentPersonaId: lastPlayed.id, defaultPersonaId: doomed.id } });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof PersonaActionGroupsStory>(STORY, { width: 1280, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: `Show details for ${doomed.name}`, exact: true }).click();
  await page.locator('[data-slot="persona-editor-footer"]').getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();

  await expect(page.getByRole("alertdialog", { name: "Delete this persona?", exact: true })).toContainText(deleteMovesDefaultNote(lastPlayed.name));
});

test("with the crowned persona also last played, the confirm names the persona the server then crowns", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const doomed = await caller.persona.create({ input: { name: "Doomed default witness", description: "Goes." } });
  await caller.persona.create({ input: { name: "Older witness", description: "Stays." } });
  await caller.persona.create({ input: { name: "Newest witness", description: "Also stays." } });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { currentPersonaId: doomed.id, defaultPersonaId: doomed.id } });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof PersonaActionGroupsStory>(STORY, { width: 1280, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: `Show details for ${doomed.name}`, exact: true }).click();
  await page.locator('[data-slot="persona-editor-footer"]').getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this persona?", exact: true });
  await expect(confirm).toContainText("Your default moves to");
  const promised = await confirm.textContent();
  await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();

  await expect
    .poll(async () => {
      const { config } = await caller.settings.getUserSettings();
      const crowned = (await caller.persona.list()).find((persona) => persona.id === config.seeds.defaultPersonaId);
      return crowned !== undefined && promised?.includes(deleteMovesDefaultNote(crowned.name));
    })
    .toBe(true);
});

test("a persona that is not the default says nothing about the crown", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const crowned = await caller.persona.create({ input: { name: "Crowned witness", description: "Keeps it." } });
  const other = await caller.persona.create({ input: { name: "Other witness", description: "Goes." } });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { currentPersonaId: crowned.id, defaultPersonaId: crowned.id } });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof PersonaActionGroupsStory>(STORY, { width: 1280, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: `Show details for ${other.name}`, exact: true }).click();
  await page.locator('[data-slot="persona-editor-footer"]').getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();

  const confirm = page.getByRole("alertdialog", { name: "Delete this persona?", exact: true });
  await expect(confirm).toBeVisible();
  await expect(confirm).not.toContainText(deleteMovesDefaultNote(crowned.name));
});
