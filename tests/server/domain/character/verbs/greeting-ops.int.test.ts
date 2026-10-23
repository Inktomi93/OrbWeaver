// @subject packages/server/src/domain/character/verbs/greeting-ops.ts
// @subject packages/server/src/domain/preset/verbs/optional-config.ts

import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { connectionBindings, userConnections } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { CharacterNotFoundError, createGreetingTemplate } from "@orb/server/domain/character";
import { createReadOptionalPresetConfig } from "@orb/server/domain/preset";
import { createReadDefaultPresetId } from "@orb/server/domain/settings";
import { makeGenerationCapability } from "@orb/testkit/iso";
import { test as base, expect } from "@orb/testkit/node";
import { seedCharacter, seedUser } from "@orb/testkit/node/composed";
import { principal, TEST_BASE_URL, TEST_PROVIDER_ID, terminalSseLine } from "@orb/testkit/node/helpers";
import { sql } from "drizzle-orm";

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

test("the real greeting gate precedes template/funding reads; each completion resolves the caller's live Utility binding and preset", async ({
  harness,
  db,
  services,
  clock,
  requests,
}) => {
  const owner = await seedUser(db);
  const stranger = await seedUser(db);
  const actor = await principal(harness, owner.id);
  const neighbor = await principal(harness, stranger.id);
  const card = await seedCharacter(db, { ownerId: owner.id });
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId: owner.id,
    label: "Owned Utility",
    providerId: providerIdSchema.parse(TEST_PROVIDER_ID),
    baseUrl: TEST_BASE_URL,
    model: modelIdSchema.parse("owned-first"),
    declared: { kind: "generation", generation: makeGenerationCapability({ sampling: { temperature: { min: 0, max: 2 } } }) },
    allowBackground: true,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  await db
    .insert(connectionBindings)
    .values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: owner.id, task: "summarize", connectionId });
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
  const owner = await seedUser(db);
  const stranger = await seedUser(db);
  const actor = await principal(harness, owner.id);
  const card = await seedCharacter(db, { ownerId: owner.id });
  const foreign = await services.preset.create({ userId: stranger.id, name: "Foreign", kind: "prompt" });
  const neighbor = await principal(harness, stranger.id);
  await services.settings.updateUserSettingsSection({ principal: neighbor, input: { section: "seeds", patch: { defaultPresetId: foreign.id } } });
  await services.settings.updateUserSettingsSection({ principal: actor, input: { section: "seeds", patch: { defaultPresetId: foreign.id } } });
  const template = createGreetingTemplate({
    readDefaultPresetId: createReadDefaultPresetId(services.settings),
    readPresetConfig: createReadOptionalPresetConfig((args) => services.preset.get(args)),
  });
  expect(await template({ caller: actor, kind: "greeting_new" })).toEqual({ template: DEFAULT_GUIDED_ACTIONS.greeting_new.prompt, prose: {} });
  expect(requests).toHaveLength(0);
  const owned = await services.preset.create({ userId: owner.id, name: "Owned", kind: "prompt" });
  await services.settings.updateUserSettingsSection({ principal: actor, input: { section: "seeds", patch: { defaultPresetId: owned.id } } });
  await db.run(sql`DROP TABLE presets`);
  await expect(services.character.generateGreeting({ principal: neighbor, characterId: card.id, steer: "hi" })).rejects.toBeInstanceOf(CharacterNotFoundError);
  await expect(services.character.generateGreeting({ principal: actor, characterId: card.id, steer: "hi" })).rejects.toThrow(/presets/u);
  expect(requests).toHaveLength(0);
});
