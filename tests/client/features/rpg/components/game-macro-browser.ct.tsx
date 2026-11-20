// The game console's macro browser lists the macros the game's turn would resolve, each naming its source: this
// game's own with no link, the active preset's as a link to that preset's editor, and a plugin's as a link to that
// plugin's editor. The same catalog feeds the editor's completion rows, which print the source too. Reads come
// from a real corpus root with a live plugin guest.
import { spawn } from "node:child_process";
import { macroSourceLabel, presetNamesPlane } from "@orb/client/lib";
import { userMacroSchema } from "@orb/contracts/preset";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { makePromptConfig } from "@orb/testkit/iso";
import { createCorpusHarness, installMacroGuest, seedRpgGame } from "@orb/testkit/node/composed";
import { USER_MACRO_TEMPLATE_NAME } from "#client/components/shared-control-names.ts";
import { PRESET_EDITOR_NAME } from "#client/features/preset/lib/preset-names.ts";
import { RPG_HOST_ADVANCED_LABEL, RPG_MACRO_BROWSER_LABEL } from "#client/features/rpg/lib/rpg-names.ts";
import type { RpgContextTabBesidePresetsStory, RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const PRESETS_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabBesidePresetsStory";
const PLUGIN_NAME = "Omen Deck";
const PLUGIN_MACRO = "omen";
const GAME_MACRO = "scene_tone";
const PRESET_MACRO = "house_rule";

test("the browser names each macro's source, links the preset's and the plugin's, and a completion row prints the same source", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const preset = await caller.preset.create({
    name: "Host mood preset",
    kind: "custom",
    config: makePromptConfig({ userMacros: [userMacroSchema.parse({ name: PRESET_MACRO, body: "Be kind." })] }),
  });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  await installMacroGuest(root, principal, { slug: "omen-deck", name: PLUGIN_NAME }, [{ name: PLUGIN_MACRO, description: "Draws an omen." }]);
  const listed = (await caller.plugin.listMacros()).find((row) => row.pluginName === PLUGIN_NAME);
  const pluginMacroName = listed?.name ?? "";
  expect(pluginMacroName).not.toBe("");
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "freeform" });
  await caller.rpg.updateConfig({ chatId, patch: { userMacros: [userMacroSchema.parse({ name: GAME_MACRO, description: "The scene tone.", body: "wry" })] } });
  expect((await caller.rpg.getConfigView({ chatId })).presetMacroNames).toContain(PRESET_MACRO);
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "chat.getChat",
      "chat.listMessages",
      "rpg.getGame",
      "rpg.getTrackerView",
      "rpg.getConfigView",
      "rpg.updateConfig",
      "preset.list",
      "plugin.listMacros",
    ]),
  );
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.game" });

  await page.getByRole("button", { name: RPG_HOST_ADVANCED_LABEL, exact: true }).click();
  await page.getByRole("button", { name: RPG_MACRO_BROWSER_LABEL, exact: true }).click();
  const rows = page.locator('[data-slot="rpg-game-macros"]');
  const rowOf = (name: string): ReturnType<typeof rows.locator> => rows.locator("div", { has: page.locator("code", { hasText: `{{${name}}}` }) }).last();

  // The plugin's macro links to the plugin's editor by its display name.
  await expect(rowOf(pluginMacroName).getByRole("button", { name: `Plugin: ${PLUGIN_NAME}`, exact: true })).toBeVisible();
  // This game's own macro names itself and has no link: the console it sits in is its editor.
  await expect(rowOf(GAME_MACRO).getByText("This game", { exact: true })).toBeVisible();
  await expect(rowOf(GAME_MACRO).getByRole("button", { name: "This game", exact: true })).toHaveCount(0);
  // The preset's macro is known by name only, but the host's default preset is known by id, so its source links there.
  await expect(rowOf(PRESET_MACRO).getByRole("button", { name: macroSourceLabel(presetNamesPlane([PRESET_MACRO], preset.id)), exact: true })).toBeVisible();

  // Completion rows carry the same source label, on the editor that opens from this game's own macro.
  await page.getByRole("button", { name: `{{${GAME_MACRO}}}`, exact: true }).click();
  await page.getByRole("textbox", { name: USER_MACRO_TEMPLATE_NAME }).fill(`{{${pluginMacroName.slice(0, -2)}`);
  const option = page.locator('[data-slot="macro-textarea-option"]', { hasText: `{{${pluginMacroName}}}` });
  await expect(option.locator('[data-slot="macro-textarea-option-source"]')).toHaveText(`Plugin: ${PLUGIN_NAME}`);
});

test("the browser's preset link opens the editor of the preset it names", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const preset = await caller.preset.create({
    name: "Host mood preset",
    kind: "custom",
    config: makePromptConfig({ userMacros: [userMacroSchema.parse({ name: PRESET_MACRO, body: "Be kind." })] }),
  });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "freeform" });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "chat.getChat",
      "chat.listMessages",
      "rpg.getGame",
      "rpg.getTrackerView",
      "rpg.getConfigView",
      "preset.list",
      "preset.get",
      "preset.resolveEffective",
      "connection.resolveChatCapability",
      "connection.providersAvailable",
      "connection.list",
      "plugin.listMacros",
    ]),
  );
  await mount<typeof RpgContextTabBesidePresetsStory>(PRESETS_STORY, { chatId, tab: "rpg.game" });

  await page.getByRole("button", { name: RPG_HOST_ADVANCED_LABEL, exact: true }).click();
  await page.getByRole("button", { name: RPG_MACRO_BROWSER_LABEL, exact: true }).click();
  const editor = page.getByRole("region", { name: PRESET_EDITOR_NAME, exact: true });
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: macroSourceLabel(presetNamesPlane([PRESET_MACRO], preset.id)), exact: true }).click();

  await expect(editor.getByRole("heading", { name: "Host mood preset", exact: true })).toBeVisible();
});
