// @subject packages/client/src/features/chat/components/macro-slice-detail.tsx
// The host's Preview diagnostics say which user macros the next turn registers and which lost their name, each with
// its source: a game macro shadowing the active preset's macro is the collision only the turn can decide. The slice
// comes from a real previewAssembly read on a corpus root with a live plugin guest.

import { spawn } from "node:child_process";
import { createCharacterSchema } from "@orb/contracts/character";
import { userMacroSchema } from "@orb/contracts/preset";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { makePromptConfig } from "@orb/testkit/iso";
import { createCorpusHarness, installMacroGuest, seedRpgGame } from "@orb/testkit/node/composed";
import type { AssemblyPreviewTabStory } from "./_assembly-preview-stories.tsx";

const STORY = "tests/client/features/chat/components/_assembly-preview-stories/AssemblyPreviewTabStory";
const PLUGIN_NAME = "Omen Deck";
const SHARED_NAME = "mood";

test("the diagnostics list the turn's registered macros by source and the preset macro a game macro shadowed", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const preset = await caller.preset.create({
    name: "Host mood preset",
    kind: "custom",
    config: makePromptConfig({ userMacros: [userMacroSchema.parse({ name: SHARED_NAME, description: "The preset's tone.", body: "calm" })] }),
  });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  await installMacroGuest(root, principal, { slug: "omen-deck", name: PLUGIN_NAME }, [{ name: "omen", description: "Draws an omen." }]);
  const pluginMacro = (await caller.plugin.listMacros()).find((row) => row.pluginName === PLUGIN_NAME)?.name ?? "";
  expect(pluginMacro).not.toBe("");
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "preview-keeper", name: "Keeper", description: "A keeper." }),
  });
  const chatId = (await caller.chat.startChat({ characterIds: [character.id], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "freeform" });
  await caller.rpg.updateConfig({
    chatId,
    patch: { userMacros: [userMacroSchema.parse({ name: SHARED_NAME, description: "The game's tone.", body: "wry" })] },
  });
  const { trace } = await caller.chat.previewAssembly({ chatId, timeZone: UTC_TIME_ZONE });
  expect(trace.macros?.rejected).toHaveLength(1);
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "chat.getChat",
      "chat.listMessages",
      "chat.previewAssembly",
      "chat.getShapeTrace",
      "plugin.listMacros",
    ]),
  );
  await mount<typeof AssemblyPreviewTabStory>(STORY, { chatId });

  await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
  const rejected = page.locator('[data-slot="macro-rejected"]');
  await expect(rejected).toHaveCount(1);
  await expect(rejected.getByText(`{{${SHARED_NAME}}}`, { exact: true })).toBeVisible();
  await expect(rejected.getByText("Preset", { exact: true })).toBeVisible();
  const registered = page.locator('[data-slot="macro-registered"]');
  await expect(registered.filter({ hasText: `{{${SHARED_NAME}}}` }).getByText("Game", { exact: true })).toBeVisible();
  await expect(registered.filter({ hasText: `{{${pluginMacro}}}` }).getByText(`Plugin: ${PLUGIN_NAME}`, { exact: true })).toBeVisible();
  // A preview never runs the plugin's guest, so its macros are named without a value: the live name and the hyphen alias.
  await expect(page.locator('[data-slot="macro-registered"][data-deferred]')).toHaveCount(2);
});
