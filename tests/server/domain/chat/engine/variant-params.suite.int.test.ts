// @subject packages/server/src/domain/chat/engine/engine.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
} from "@orb/testkit/node/composed";

const PRESET_TEMPERATURE = 0.4;
const SEND_TOP_P = 0.9;
const PRESET_MAX_OUTPUT = 700;

test("the recorded params are the preset params folded with the per-send intent, per-send winning", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "Hi there",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner } = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(owner.userId);
  const preset = await caller.preset.create({
    name: "Recorded variant params",
    kind: "custom",
    config: makePromptConfig({
      params: { ...DEFAULT_PROMPT_CONFIG.params, temperature: PRESET_TEMPERATURE, topP: 0.5, maxOutputTokens: PRESET_MAX_OUTPUT },
    }),
  });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const card = await caller.character.create({ input: createCharacterSchema.parse({ handle: "variant-params", name: "Aria", description: "A bold knight." }) });
  const room = await caller.chat.startChat({ characterIds: [card.id], opening: "none" });

  const outcome = await root.services.chat.send({ principal: owner, chatId: room.chat.id, content: "Hello", intent: { topP: SEND_TOP_P } });
  expect(outcome.aborted).toBe(false);

  const assistant = outcome.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the actual turn did not return its assistant variant");
  }
  const wire = await root.services.chat.getVariantWire({ principal: owner, chatId: room.chat.id, variantId: assistant.selectedVariantId });
  expect(wire.params).toMatchObject({ temperature: PRESET_TEMPERATURE, topP: SEND_TOP_P, maxOutputTokens: PRESET_MAX_OUTPUT });
});
