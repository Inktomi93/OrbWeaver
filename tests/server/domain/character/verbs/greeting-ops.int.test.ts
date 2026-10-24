// @subject packages/server/src/domain/character/verbs/greeting-ops.ts
// @subject packages/server/src/domain/preset/verbs/optional-config.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { presets } from "@orb/db";
import type { UserConnectionId } from "@orb/kit/ids";
import { CharacterNotFoundError } from "@orb/server/domain/character";
import { makeGenerationCapability } from "@orb/testkit/iso";
import { test as base, expect } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { seedCharacter, withheldTable } from "@orb/testkit/node/composed";
import { principal, TEST_BASE_URL, TEST_PROVIDER_ID, terminalSseLine } from "@orb/testkit/node/helpers";

const test = base.extend<{ requests: Request[]; providerFetch: typeof fetch }>({
  requests: async ({}, use) => {
    await use([]);
  },
  providerFetch: async ({ requests }, use) => {
    await use((input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/models")) {
        return Promise.resolve(Response.json({ data: [] }));
      }
      if (request.url.endsWith("/chat/completions")) {
        requests.push(request);
      }
      const content = JSON.stringify({ choices: [{ delta: { content: "  Owned greeting.  " } }] });
      const body = `data: ${content}\n\n${terminalSseLine({ usage: { promptTokens: 8, completionTokens: 4 } })}\n\ndata: [DONE]\n\n`;
      return Promise.resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
    });
  },
});

/** The caller's own Utility connection, bound to the summarize task the greeting completion runs on. */
async function bindUtility(services: ServerTestHarness["services"], actor: Principal, model: string): Promise<UserConnectionId> {
  const { id: connectionId } = await services.connection.create({
    principal: actor,
    label: "Owned Utility",
    providerId: providerIdSchema.parse(TEST_PROVIDER_ID),
    credentialId: null,
    baseUrl: TEST_BASE_URL,
    model: modelIdSchema.parse(model),
    declared: { kind: "generation", generation: makeGenerationCapability({ sampling: { temperature: { min: 0, max: 2 } } }) },
    allowBackground: true,
  });
  await services.connection.setBinding({ principal: actor, task: "summarize", connectionId });
  return connectionId;
}

test("the real greeting gate precedes template/funding reads; each completion resolves the caller's live Utility binding and preset", async ({
  harness,
  services,
  requests,
}) => {
  const owner = await harness.actor();
  const stranger = await harness.actor();
  const actor = await principal(harness, owner.id);
  const neighbor = await principal(harness, stranger.id);
  const { view: card } = await seedCharacter(harness, {
    principal: actor,
    input: createCharacterSchema.parse({ handle: "greeter", name: "Greeter", description: "" }),
  });
  const connectionId = await bindUtility(services, actor, "owned-first");
  const preset = await services.preset.create({
    userId: owner.id,
    name: "Owned greeting",
    kind: "prompt",
    config: {
      ...DEFAULT_PROMPT_CONFIG,
      params: { temperature: 0.61 },
      guidedActions: { ...DEFAULT_GUIDED_ACTIONS, ["greeting_new"]: { ...DEFAULT_GUIDED_ACTIONS.greeting_new, prompt: "OWNED TEMPLATE {{char}} {{input}}" } },
    },
  });
  await services.settings.updateUserSettingsSection({
    principal: actor,
    input: { section: "seeds", patch: { defaultPresetId: preset.id, summarizePreset: { kind: "preset", presetId: preset.id } } },
  });
  await expect(services.character.generateGreeting({ principal: neighbor, characterId: card.id, steer: "private" })).rejects.toBeInstanceOf(
    CharacterNotFoundError,
  );
  expect(requests).toHaveLength(0);
  expect(await services.character.generateGreeting({ principal: actor, characterId: card.id, steer: "first" })).toEqual({
    text: "Owned greeting.",
    costUsd: null,
  });
  expect(await requests[0]?.json()).toMatchObject({
    model: "owned-first",
    temperature: 0.61,
    messages: [{ role: "system", content: `OWNED TEMPLATE ${card.name} first` }],
  });
  await services.connection.update({ principal: actor, connectionId, patch: { model: "owned-second" } });
  await services.preset.update({ userId: owner.id, id: preset.id, config: { ...preset.config, params: { temperature: 0.83 } } });
  await services.character.generateGreeting({ principal: actor, characterId: card.id, steer: "second" });
  expect(await requests[1]?.json()).toMatchObject({ model: "owned-second", temperature: 0.83 });
  expect(await services.character.getCard({ principal: actor, characterId: card.id })).toMatchObject({ greetings: card.greetings });
});

test("a foreign preset degrades to the shipped template, but a real preset database failure refuses before completion", async ({
  harness,
  db,
  services,
  requests,
}) => {
  const owner = await harness.actor();
  const stranger = await harness.actor();
  const actor = await principal(harness, owner.id);
  const { view: card } = await seedCharacter(harness, {
    principal: actor,
    input: createCharacterSchema.parse({ handle: "greeter", name: "Greeter", description: "" }),
  });
  await bindUtility(services, actor, "owned-fallback");
  const foreign = await services.preset.create({
    userId: stranger.id,
    name: "Foreign",
    kind: "prompt",
    config: {
      ...DEFAULT_PROMPT_CONFIG,
      guidedActions: { ...DEFAULT_GUIDED_ACTIONS, ["greeting_new"]: { ...DEFAULT_GUIDED_ACTIONS.greeting_new, prompt: "FOREIGN TEMPLATE {{char}}" } },
    },
  });
  const neighbor = await principal(harness, stranger.id);
  await services.settings.updateUserSettingsSection({ principal: neighbor, input: { section: "seeds", patch: { defaultPresetId: foreign.id } } });
  // The shipped template is what a caller with no default preset receives; a foreign default must degrade to it.
  await services.character.generateGreeting({ principal: actor, characterId: card.id, steer: "hi" });
  await services.settings.updateUserSettingsSection({ principal: actor, input: { section: "seeds", patch: { defaultPresetId: foreign.id } } });
  await services.character.generateGreeting({ principal: actor, characterId: card.id, steer: "hi" });
  const [shipped, degraded] = await Promise.all(requests.map((request) => request.clone().json()));
  expect(JSON.stringify(degraded)).not.toContain("FOREIGN TEMPLATE");
  expect(degraded).toEqual(shipped);
  requests.length = 0;
  const owned = await services.preset.create({ userId: owner.id, name: "Owned", kind: "prompt" });
  await services.settings.updateUserSettingsSection({ principal: actor, input: { section: "seeds", patch: { defaultPresetId: owned.id } } });
  await using _withheld = await withheldTable(db, presets);
  await expect(services.character.generateGreeting({ principal: neighbor, characterId: card.id, steer: "hi" })).rejects.toBeInstanceOf(CharacterNotFoundError);
  await expect(services.character.generateGreeting({ principal: actor, characterId: card.id, steer: "hi" })).rejects.toThrow(/presets/u);
  expect(requests).toHaveLength(0);
});
