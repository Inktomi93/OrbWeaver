// @subject packages/server/src/domain/chat/engine/engine.ts
// Saved capabilities and owned media cause real funnel warnings, never fabricated ChatResult events. A drop of a
// control the model does not state stays off the room (D68); a drop of one it states is announced.
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { CapabilityOverride } from "@orb/contracts/inference";
import { DEFAULT_SAMPLER_KEYS, WARNING_CODE } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { ID_PREFIX } from "@orb/kit/ids";
import type { JsonObject } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, makeAssetBytes } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { SETTINGS_ADJUSTED_CODE } from "#contracts/chat/bus.ts";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const REPLY = "The actual text-only reply.";
const STORED_TOP_K = 42;

function response(): Response {
  return coreSse([coreFrame({ choices: [{ delta: { content: REPLY } }] }), terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })]);
}

type DeclaredGeneration = NonNullable<CapabilityOverride["generation"]>;

/** Bind the room's chat role to a custom endpoint whose saved declaration states `generation`. */
async function bindDeclared(h: ChatRoot, generation: DeclaredGeneration): Promise<void> {
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 }, ...generation }, features: { detectServer: false } },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
}

async function bindTextOnly(h: ChatRoot): Promise<void> {
  await bindDeclared(h, { sampling: { temperature: undefined } });
}

function roomEvents(h: ChatRoot, stack: DisposableStack): ChatBusEvent[] {
  const events: ChatBusEvent[] = [];
  stack.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  return events;
}

/** The native request bodies the turns sent, in order. */
async function sentBodies(h: ChatRoot): Promise<JsonObject[]> {
  const requests = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  return await Promise.all(
    requests.map(async (request) => {
      const body = jsonValueSchema.parse(JSON.parse(await request.clone().text()));
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("the actual turn sent no native request object");
      }
      return body;
    }),
  );
}

test("a saved text-only model drops the actual owned input image exactly once and retains its user canon", async () => {
  await using h = await coreHttpRoom([response]);
  await bindTextOnly(h);
  const asset = await h.root.app.assets.store({
    principal: h.owner,
    kind: "attachment",
    mime: "image/png",
    bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)),
  });
  using subscription = new DisposableStack();
  const events = roomEvents(h, subscription);
  const outcome = await h.root.services.chat.send({
    principal: h.owner,
    chatId: h.chatId,
    content: "Inspect this owned picture.",
    attachmentAssetIds: [asset.assetId],
  });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant")).toMatchObject([{ content: REPLY }]);
  expect(outcome.messages.find((message) => message.role === "user")?.content).toContain(`asset:${asset.assetId}`);
  expect(events.filter((event) => event.type === "warning" && event.code === "image_dropped")).toHaveLength(1);
  const requests = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(requests).toHaveLength(1);
  const body = await requests[0]?.clone().text();
  expect(body).not.toContain('"image_url"');
  expect(body).not.toContain("data:image/");
});

test("a dropped knob the model does not state stays off the room, while a dropped one it states is announced", async () => {
  await using h = await coreHttpRoom([response]);
  // Temperature is not stated at all; effort is stated with one level, so a different level is a stated drop.
  await bindDeclared(h, { sampling: { temperature: undefined }, reasoning: { mode: "effort", enabled: true, effortLevels: ["low"] } });
  using subscription = new DisposableStack();
  const events = roomEvents(h, subscription);
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { temperature: 0.9, effort: "high" } });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: REPLY }]);
  const adjusted = events.filter((event) => event.type === "warning" && event.code === SETTINGS_ADJUSTED_CODE);
  expect(adjusted.filter((event) => event.adjustment === WARNING_CODE.effortDropped)).toHaveLength(1);
  expect(adjusted.filter((event) => event.adjustment === WARNING_CODE.samplingKnobDropped)).toEqual([]);
  const [body] = await sentBodies(h);
  expect(body?.["temperature"]).toBeUndefined();
});

test("a preset's stored sampler stays unsent and unannounced on a model without it, and rides once the chat moves to one with it", async () => {
  await using h = await coreHttpRoom([response, response]);
  const preset = await h.caller.preset.create({
    name: "Stored top-k",
    kind: "custom",
    config: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, topK: STORED_TOP_K } }),
  });
  await h.caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  using subscription = new DisposableStack();
  const events = roomEvents(h, subscription);

  await bindDeclared(h, { sampling: { temperature: { min: 0, max: 2 } } });
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);
  await bindDeclared(h, { sampling: { topK: { min: 0, max: 200 } } });
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);

  const [withoutTopK, withTopK] = await sentBodies(h);
  expect(withoutTopK?.[DEFAULT_SAMPLER_KEYS.topK]).toBeUndefined();
  expect(withTopK?.[DEFAULT_SAMPLER_KEYS.topK]).toBe(STORED_TOP_K);
  expect(
    events.filter((event) => event.type === "warning" && event.code === SETTINGS_ADJUSTED_CODE && event.adjustment === WARNING_CODE.samplingKnobDropped),
  ).toEqual([]);
  expect((await h.caller.preset.get({ id: preset.id })).config.params.topK).toBe(STORED_TOP_K);
});

// The room's bus carries the closed cause of a banned-phrase drop and never a phrase: the phrases are the host's own text.
test("a banned phrase a row cannot check reaches the room with its cause and without the phrase", async () => {
  const phrase = "her spine";
  await using h = await coreHttpRoom([response]);
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    // The row spells vLLM's phrase ban and names no tokenize endpoint, so no phrase can be checked.
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, sampling: { bannedStrings: true } },
      features: { detectServer: false, bannedStrings: "vllm-bad-words" },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  using subscription = new DisposableStack();
  const events = roomEvents(h, subscription);
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { bannedStrings: [phrase] } })).aborted).toBe(false);
  const dropped = events.filter(
    (event) =>
      event.type === "warning" &&
      event.code === SETTINGS_ADJUSTED_CODE &&
      event.adjustment === WARNING_CODE.samplingKnobDropped &&
      event.knob === "bannedStrings",
  );
  expect(dropped).toMatchObject([{ cause: "tokenizer" }]);
  expect(JSON.stringify(dropped)).not.toContain(phrase);
});
