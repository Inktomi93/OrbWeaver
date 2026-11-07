import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { REFINERY_HAND_EDIT_EMPTY_SCOPE, REFINERY_HAND_EDIT_NAME } from "#client/features/refinery/lib/refinery-names.ts";
import type { RefineryRemainingActionsStory } from "./_remaining-action-groups-stories.tsx";

const STORY = "tests/client/features/refinery/components/_remaining-action-groups-stories/RefineryRemainingActionsStory";

test("each scoped slot's empty-this-field checkbox is named for its slot and toggles from its label", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "hand-edit-names",
      name: "Hand edit names",
      description: "A tall ranger.",
      greetings: [{ text: "Well met." }, { text: "Hail." }],
    }),
  });
  const session = await caller.refinery.startSession({ characterId: card.id });
  await caller.refinery.updateSession({ sessionId: session.id, patch: { selection: { fields: ["description", "greetings"] } } });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "refinery.getSession",
      "refinery.listRuns",
      "refinery.preflight",
      "character.get",
      "character.list",
      "refinery.listSessions",
    ]),
  );
  await mount<typeof RefineryRemainingActionsStory>(STORY, {
    sessionId: session.id,
    plane: "content",
    width: 960,
    appearance: appearanceSettingsSchema.parse({}),
  });
  await page.getByRole("button", { name: REFINERY_HAND_EDIT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(3);
  for (const slot of ["Description", "Greeting 1", "Greeting 2"]) {
    await expect(dialog.getByRole("checkbox", { name: `Empty ${slot}`, exact: true })).toBeVisible();
  }
  const first = dialog.getByRole("checkbox", { name: "Empty Description", exact: true });
  await expect(first).not.toBeChecked();
  await dialog.getByText("Empty Description", { exact: true }).click();
  await expect(first).toBeChecked();
});

test("a hand-edit with nothing in scope says why it has no fields", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "hand-edit-empty", name: "Hand edit empty", description: "A tall ranger." }),
  });
  const session = await caller.refinery.startSession({ characterId: card.id });
  await caller.refinery.updateSession({ sessionId: session.id, patch: { selection: { fields: [] } } });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "refinery.getSession",
      "refinery.listRuns",
      "refinery.preflight",
      "character.get",
      "character.list",
      "refinery.listSessions",
    ]),
  );
  await mount<typeof RefineryRemainingActionsStory>(STORY, {
    sessionId: session.id,
    plane: "content",
    width: 960,
    appearance: appearanceSettingsSchema.parse({}),
  });
  await page.getByRole("button", { name: REFINERY_HAND_EDIT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(REFINERY_HAND_EDIT_EMPTY_SCOPE, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});
