// @subject packages/client/src/features/preset/components/params-deck.tsx
// The Params deck renders a control only on a Chat model whose descriptor takes it (D68): the same stored preset
// shows Top-K and Reply pictures on a server that takes them, and neither on gpt-4o. A stored value the model does
// not take is kept through an edit of another knob, and shows again once the chat moves back to a model that takes it.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { PresetId, UserConnectionId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Page, PlaywrightTestArgs } from "@playwright/test";
import { PRESET_EDITOR_VIEW_LABELS } from "#client/features/preset/lib/preset-names.ts";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
const PROCEDURES = [
  "settings.getUserSettings",
  "sessions.me",
  "preset.get",
  "preset.list",
  "preset.update",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.list",
] as const;
const STORED_TOP_K = 42;
const EDITED_TEMPERATURE = 0.5;
const WIDTH = 1280;

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

test.use({ viewport: { width: WIDTH, height: 900 } });

/** Two real Chat connections: a local server whose saved declaration says it draws pictures (local servers take the
 *  full sampler set), and OpenAI's gpt-4o, whose curated row takes neither Top-K nor picture output. */
async function seedConnections(caller: Caller): Promise<{ readonly takes: UserConnectionId; readonly lacks: UserConnectionId }> {
  const local = await caller.connection.create({
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "witness-model",
    label: "Local server",
    declared: { kind: "generation", generation: { output: { modalities: ["text", "image"] } }, features: { detectServer: false } },
  });
  const credential = await caller.credentials.add({ provider: "openai", key: "synthetic-applies-key" });
  const hosted = await caller.connection.create({ providerId: "openai", credentialId: credential.id, baseUrl: null, model: "gpt-4o", label: "gpt-4o" });
  return { takes: local.id, lacks: hosted.id };
}

/** Bind the Chat role and read back the descriptor the deck will render from. */
async function bindChat(caller: Caller, connectionId: UserConnectionId): Promise<{ readonly topK: boolean; readonly pictures: boolean }> {
  await caller.connection.setBinding({ task: "chat", connectionId });
  const view = await caller.connection.resolveChatCapability();
  if (view.capability.kind !== "generation") {
    throw new Error("the Chat connection resolved no generation model");
  }
  const generation = view.capability.generation;
  return { topK: generation.sampling.topK !== undefined, pictures: generation.output.modalities.includes("image") };
}

async function openParams(page: Page, mount: PlaywrightTestArgs["mount"], presetId: PresetId): Promise<void> {
  await mount<typeof PresetActionGroupsStory>(STORY, { width: WIDTH, appearance: appearanceSettingsSchema.parse({}), subject: "editor", presetId });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
}

test("Top-K and Reply pictures render on a model that takes them and are absent on one that does not", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  const connections = await seedConnections(caller);
  const preset = await caller.preset.create({
    name: "Stored local samplers",
    kind: "generation",
    config: { ...DEFAULT_PROMPT_CONFIG, params: { topK: STORED_TOP_K } },
  });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));

  expect(await bindChat(caller, connections.takes)).toEqual({ topK: true, pictures: true });
  await openParams(page, mount, preset.id);
  await expect(page.getByRole("textbox", { name: "Top-K value", exact: true })).toHaveValue(String(STORED_TOP_K));
  await expect(page.getByRole("switch", { name: "Reply pictures", exact: true })).toBeVisible();

  expect(await bindChat(caller, connections.lacks)).toEqual({ topK: false, pictures: false });
  await openParams(page, mount, preset.id);
  await expect(page.getByRole("textbox", { name: "Temperature value", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Top-K value", exact: true })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Reply pictures", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Reasoning display", exact: true })).toHaveCount(0);
});

test("a stored knob the model does not take survives an edit of another knob and shows again on a model that takes it", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  const connections = await seedConnections(caller);
  const preset = await caller.preset.create({
    name: "Stored across models",
    kind: "generation",
    config: { ...DEFAULT_PROMPT_CONFIG, params: { topK: STORED_TOP_K } },
  });
  const calls = await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));

  expect(await bindChat(caller, connections.lacks)).toEqual({ topK: false, pictures: false });
  await openParams(page, mount, preset.id);
  await expect(page.getByRole("textbox", { name: "Top-K value", exact: true })).toHaveCount(0);
  const temperature = page.getByRole("textbox", { name: "Temperature value", exact: true });
  await temperature.fill(String(EDITED_TEMPERATURE));
  await temperature.press("Tab");
  await expect.poll(() => calls.count("preset.update")).toBeGreaterThan(0);
  await expect
    .poll(async () => (await caller.preset.get({ id: preset.id })).config.params)
    .toMatchObject({
      temperature: EDITED_TEMPERATURE,
      topK: STORED_TOP_K,
    });

  expect(await bindChat(caller, connections.takes)).toEqual({ topK: true, pictures: true });
  await openParams(page, mount, preset.id);
  await expect(page.getByRole("textbox", { name: "Top-K value", exact: true })).toHaveValue(String(STORED_TOP_K));
});
