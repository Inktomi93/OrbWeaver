// A persona name cleared in the editor shows its own validation error and holds the write; the saved name stands.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { absenceWindow, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PERSONA_NAME_REQUIRED, personaDetailsToggleName } from "#client/features/persona/lib/persona-copy.ts";
import { DEFAULT_DEBOUNCE_MS } from "#client/forms/entity-form-base.ts";
import type { PersonaActionGroupsStory } from "./_persona-action-groups-stories.tsx";

// A write the cleared name armed would fire one debounce after the edit; this holds past two of them.
const HELD_PAST_DEBOUNCE_MS = DEFAULT_DEBOUNCE_MS * 3;
const STORY = "tests/client/features/persona/components/_persona-action-groups-stories/PersonaActionGroupsStory";

test("clearing the name shows the required error and the saved name stands", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const appearance = appearanceSettingsSchema.parse({});
  const persona = await caller.persona.create({ input: { name: "Required name witness", description: "Holds still." } });
  const calls = await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "persona.list",
      "persona.get",
      "worldInfo.listBooks",
      "worldInfo.listForPersona",
      "persona.listConnectedCharacters",
      "preset.get",
      "plugin.listMacros",
      "persona.update",
    ]),
  );
  await mount<typeof PersonaActionGroupsStory>(STORY, { width: 1280, appearance });
  await page.getByRole("button", { name: personaDetailsToggleName(persona.name, false), exact: true }).focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("group", { name: `Edit ${persona.name}`, exact: true });
  const name = editor.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("");
  await name.blur();
  await expect(editor.getByText(PERSONA_NAME_REQUIRED, { exact: true })).toBeVisible();
  await absenceWindow(page, HELD_PAST_DEBOUNCE_MS);
  expect(calls.count("persona.update")).toBe(0);
  expect((await caller.persona.get({ personaId: persona.id })).name).toBe(persona.name);
});
