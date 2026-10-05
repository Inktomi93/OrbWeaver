import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ModelId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { makeCapability, makeGenerationCapability, makeResolvedView } from "../../../../support/factories/resolved-connection.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ALL_AVAILABLE, connectionRow } from "../../credentials/_connection-fixtures.ts";
import { PresetConnectionTruthStory } from "./_connection-truth-stories.tsx";

test("Utility view leaves the named Chat editor and its sampling target unchanged", async ({ mount, page }) => {
  const chat = makeResolvedView({
    model: castId<ModelId>("chat-model"),
    capability: makeCapability(makeGenerationCapability({ sampling: { temperature: { min: 0, max: 2 } } })),
  });
  const utility = makeResolvedView({ connectionId: mintTypeId(ID_PREFIX.userConnection), model: castId<ModelId>("utility-model") });
  const preset = {
    id: mintTypeId(ID_PREFIX.preset),
    name: "Launch preset",
    kind: "custom" as const,
    isSystemDefault: false,
    forkedFrom: null,
    config: DEFAULT_PROMPT_CONFIG,
    schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
    configUnreadable: null,
    createdAt: 0,
    updatedAt: 0,
  };
  const trpc = await routeTrpc(page, {
    "preset.get": preset,
    "preset.list": [
      { id: preset.id, name: preset.name, kind: preset.kind, isSystemDefault: false, forkedFrom: null, configUnreadable: null, createdAt: 0, updatedAt: 0 },
    ],
    "settings.getUserSettings": {
      userId: "user_ct_preset",
      config: DEFAULT_USER_SETTINGS,
      schemaVersion: DEFAULT_USER_SETTINGS.schemaVersion,
      configUnreadable: null,
      updatedAt: 0,
    },
    "connection.list": [
      connectionRow({ id: chat.connectionId, model: chat.model, label: "Chat connection" }),
      connectionRow({ id: utility.connectionId, model: utility.model, label: "Utility connection" }),
    ],
    "connection.providersAvailable": ALL_AVAILABLE,
    "connection.resolveChatCapability": (input) => (input?.target?.kind === "role" && input.target.task === "summarize" ? utility : chat),
    "preset.resolveEffective": (input) => ({
      presetId: preset.id,
      model: input.target?.kind === "role" && input.target.task === "summarize" ? utility.model : chat.model,
      knobs: {},
      stale: [],
      qualityMapping: null,
    }),
    "connection.tokenizeWords": { available: true, words: [] },
    "regex.listScripts": [],
    "regex.listForPreset": [],
  });
  const component = await mount(<PresetConnectionTruthStory presetId={preset.id} />);
  await expect(component.getByRole("combobox", { name: "Quality", exact: true })).toBeVisible();
  await component.getByRole("combobox", { name: "Connection to describe", exact: true }).click();
  await page.getByRole("option", { name: "Utility model role", exact: true }).click();
  await expect(component.locator('[data-slot="capability-in-view"]')).toContainText("utility-model");
  await expect(component.locator('[data-slot="preset-editor-connection"]')).toContainText("Editing for Chat role · Chat connection");
  await expect(component.locator('[data-slot="preset-editor-connection"]')).toContainText("changes only the readout");
  await expect(component.getByRole("slider", { name: "Temperature", exact: true })).toBeVisible();
  await expect(component.getByRole("slider", { name: "Temperature", exact: true })).toHaveAttribute("max", "2");
  await expect(component.getByText("that is why Params shows none", { exact: false })).toHaveCount(0);
  await expect(component.getByText("This connection honors no sampling knobs.", { exact: true })).toBeVisible();
  await expect.poll(() => trpc.count("connection.setBinding")).toBe(0);
  await expect.poll(() => trpc.count("settings.updateUserSettingsSection")).toBe(0);
  await test.info().attach("connection-truth", { body: await component.screenshot(), contentType: "image/png" });
  await test.info().attach("connection-truth-aria", { body: Buffer.from(await component.ariaSnapshot()), contentType: "text/plain" });
  await component.getByRole("tab", { name: "Prompt", exact: true }).click();
  await expect(component.locator('[data-slot="prompt-cache-warning"]')).toHaveCount(0);
  await test.info().attach("fresh-prompt-rack", { body: await component.screenshot(), contentType: "image/png" });
});
