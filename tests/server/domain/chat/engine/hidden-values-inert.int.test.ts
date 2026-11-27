// @subject packages/contracts/src/preset/index.ts
// A preset value whose control the model does not take leaves a turn exactly as if the value were unset (D68): the
// same wire body, the same room warnings and the same reply row. Every control kind is run on a model that takes
// none of them, and the three readers that once acted on a hidden value are run on the model that reached them.
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { CapabilityKnob, CapabilityOverride, GenerationCapability } from "@orb/contracts/inference";
import { statesKnob } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { forEachNonEmpty, makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";
import { imageRoom, nativeText } from "./inline-image-physical.ts";

const REPLY = "A reply.";
const HIDDEN_SEED = "HIDDEN-SEED-TEXT";

function response(): Response {
  return coreSse([coreFrame({ choices: [{ delta: { content: REPLY } }] }), terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })]);
}

type Declared = NonNullable<CapabilityOverride["generation"]>;

// A model that takes no control at all: no sampler, no reasoning, text out, no tools, no verbosity.
const BARE: Declared = { sampling: {}, reasoning: { mode: "none", enabled: false } };

// One stored value per control kind; a new kind fails `tsc` here until it has a case.
const HIDDEN: Readonly<Record<CapabilityKnob, UserIntent>> = {
  temperature: { temperature: 0.7 },
  topP: { topP: 0.9 },
  topK: { topK: 40 },
  minP: { minP: 0.1 },
  topA: { topA: 0.2 },
  frequencyPenalty: { frequencyPenalty: 0.5 },
  presencePenalty: { presencePenalty: 0.5 },
  repetitionPenalty: { repetitionPenalty: 1.1 },
  repetitionPenaltyRange: { repetitionPenaltyRange: 64 },
  typicalP: { typicalP: 0.9 },
  topNSigma: { topNSigma: 1 },
  xtcProbability: { xtcProbability: 0.5 },
  xtcThreshold: { xtcThreshold: 0.1 },
  dryMultiplier: { dryMultiplier: 0.8 },
  dryBase: { dryBase: 1.75 },
  dryAllowedLength: { dryAllowedLength: 2 },
  dryPenaltyLastN: { dryPenaltyLastN: 64 },
  mirostatMode: { mirostatMode: 2 },
  mirostatTau: { mirostatTau: 5 },
  mirostatEta: { mirostatEta: 0.1 },
  dynatempRange: { dynatempRange: 0.5 },
  dynatempExponent: { dynatempExponent: 1 },
  smoothingFactor: { smoothingFactor: 0.2 },
  smoothingCurve: { smoothingCurve: 1 },
  adaptiveTarget: { adaptiveTarget: 0.5 },
  adaptiveDecay: { adaptiveDecay: 0.9 },
  minKeep: { minKeep: 1 },
  seed: { seed: 7 },
  logitBias: { logitBias: { "123": -100 } },
  stop: { stop: ["STOPX"] },
  drySequenceBreakers: { drySequenceBreakers: ["\n"] },
  bannedStrings: { bannedStrings: ["BANX"] },
  banEos: { banEos: true },
  samplerOrder: { samplerOrder: ["topK", "temperature"] },
  slopList: { slopList: "HIDDEN-SLOP-LIST" },
  slopStrength: { slopStrength: 2 },
  quality: { quality: "deep" },
  reasoning: { effort: "none" },
  effort: { effort: "high" },
  thinkingBudgetTokens: { thinkingBudgetTokens: 1000 },
  thinkingDisplay: { thinkingDisplay: "summarized" },
  reasoningSeed: { reasoningSeed: HIDDEN_SEED },
  verbosity: { verbosity: "low" },
  replyMedia: { replyMedia: "text+image" },
  carryReasoning: { carryReasoning: "conversation" },
  parallelToolCalls: { advanced: { parallelToolCalls: false } },
  providerContextCompression: { providerContextCompression: true },
};

async function bind(h: ChatRoot, generation: Declared, features: Record<string, unknown> = {}): Promise<GenerationCapability> {
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, ...generation },
      features: { detectServer: false, ...features },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  return await chatCapability(h);
}

async function chatCapability(h: ChatRoot): Promise<GenerationCapability> {
  const view = await h.caller.connection.resolveChatCapability();
  if (view.capability.kind !== "generation") {
    throw new Error("the Chat connection resolved no generation model");
  }
  return view.capability.generation;
}

async function adoptPreset(h: ChatRoot, params: UserIntent): Promise<void> {
  const preset = await h.caller.preset.create({
    name: "Stored values",
    kind: "custom",
    config: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, ...params } }),
  });
  await h.caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
}

function roomWarnings(h: ChatRoot, stack: DisposableStack): ChatBusEvent[] {
  const events: ChatBusEvent[] = [];
  stack.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId && event.type === "warning") {
        events.push(event);
      }
    }),
  );
  return events;
}

async function sentBodies(h: ChatRoot): Promise<JsonValue[]> {
  const requests = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  return await Promise.all(requests.map(async (request) => jsonValueSchema.parse(JSON.parse(await request.clone().text()))));
}

// Each run boots its own root, so row ids differ between two runs; every other field must match.
function withoutIds(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(withoutIds);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, field]) => (key === "id" || key.endsWith("Id") ? [] : [[key, withoutIds(field)]])));
  }
  return value;
}

/** What a turn leaves behind: the bodies sent, the room's warnings and the stored rows, ids aside. */
async function traceOf(h: ChatRoot, warnings: readonly ChatBusEvent[]): Promise<JsonValue> {
  const rows = await h.caller.chat.listMessages({ chatId: h.chatId });
  return withoutIds(jsonValueSchema.parse(JSON.parse(JSON.stringify({ bodies: await sentBodies(h), warnings, rows }))));
}

async function bareRun(params: UserIntent, knob: CapabilityKnob): Promise<JsonValue> {
  await using h = await coreHttpRoom([response]);
  // The premise: the model really takes no such control, so the editor hides it.
  expect(statesKnob(await bind(h, BARE), knob)).toBe(false);
  await adoptPreset(h, params);
  using stack = new DisposableStack();
  const warnings = roomWarnings(h, stack);
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);
  return await traceOf(h, warnings);
}

function isControl(key: string): key is CapabilityKnob {
  return Object.hasOwn(HIDDEN, key);
}

forEachNonEmpty(Object.keys(HIDDEN).filter(isControl), "hidden control kinds", (knob) => {
  test(`a hidden ${knob} leaves the turn as if it were unset`, async () => {
    expect(await bareRun(HIDDEN[knob], knob)).toEqual(await bareRun({}, knob));
  });
});

const MANDATORY: Declared = { reasoning: { mode: "effort", enabled: true, mandatory: true, effortLevels: ["low", "high"] } };

async function mandatoryRun(params: UserIntent): Promise<JsonValue> {
  await using h = await coreHttpRoom([response]);
  expect(statesKnob(await bind(h, MANDATORY, { effortSpelling: "reasoning_effort" }), "reasoning")).toBe(false);
  await adoptPreset(h, params);
  using stack = new DisposableStack();
  const warnings = roomWarnings(h, stack);
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);
  return await traceOf(h, warnings);
}

test("a hidden reasoning-off on a model that must reason is not clamped, sent or announced", async () => {
  expect(await mandatoryRun({ effort: "none" })).toEqual(await mandatoryRun({}));
});

// A prefix-flag continue route on a model that cannot reason: the route carries a seed, the model has none to seed.
const SEED_ROUTE: Declared = { reasoning: { mode: "none", enabled: false }, turns: { assistantPrefill: true } };

async function seedRun(params: UserIntent): Promise<JsonValue> {
  await using h = await coreHttpRoom([response, response]);
  expect(statesKnob(await bind(h, SEED_ROUTE, { prefill: "prefix-flag" }), "reasoningSeed")).toBe(false);
  await adoptPreset(h, params);
  using stack = new DisposableStack();
  const warnings = roomWarnings(h, stack);
  const first = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  const reply = first.messages.find((message) => message.role === "assistant");
  if (reply === undefined) {
    throw new Error("the first turn wrote no reply");
  }
  expect((await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: reply.id })).aborted).toBe(false);
  return await traceOf(h, warnings);
}

test("a hidden reasoning seed does not ride a continue to a model that cannot reason", async () => {
  const hidden = await seedRun({ reasoningSeed: HIDDEN_SEED });
  expect(JSON.stringify(hidden)).not.toContain(HIDDEN_SEED);
  expect(hidden).toEqual(await seedRun({}));
});

async function googleRun(params: UserIntent): Promise<JsonValue> {
  await using room = await imageRoom([[nativeText("Native reply.")]]);
  const h = room.h;
  expect(statesKnob(await chatCapability(h), "parallelToolCalls")).toBe(false);
  await adoptPreset(h, params);
  using stack = new DisposableStack();
  const warnings = roomWarnings(h, stack);
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);
  return await traceOf(h, warnings);
}

test("a hidden parallel-tools-off on the Google wire tells the room nothing", async () => {
  expect(await googleRun({ advanced: { parallelToolCalls: false } })).toEqual(await googleRun({}));
});
