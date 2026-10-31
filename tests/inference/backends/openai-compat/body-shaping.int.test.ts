// The outbound body of an openai-compat chat turn, read at the provider edge: the user's own body (extras,
// includeBody, excludeBody) is the last word, and every computed key leaves a key they settled alone.
// @subject packages/inference/src/backends/openai-compat/body.ts
import { connectionExtrasSchema, isBeltOwnedBodyKey } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { ChatEvent, ChatHistoryMessage } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";
import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { openAiServer } from "@orb/testkit/node/helpers";
import { createRuntimeRoot, generationCapability, wireConnection } from "../../roles/runtime.fixtures.ts";

type Connection = Parameters<typeof wireConnection<"chat">>[1];

const USER_LINE: ChatHistoryMessage = { role: "user", content: [{ type: "text", text: "Hello." }] };
const ASSISTANT_OPENING: ChatHistoryMessage = { role: "assistant", content: [{ type: "text", text: "Once upon a" }] };

interface Sent {
  readonly body: RecordedRequest["body"];
  readonly events: readonly ChatEvent[];
}

/** One chat turn against a scripted openai-compatible endpoint; what the endpoint received and what the turn reported. */
async function send(
  row: Omit<Connection, "task" | "model" | "providerId"> & { readonly providerId?: string },
  options: { readonly params?: UserIntent; readonly history?: readonly ChatHistoryMessage[] } = {},
): Promise<Sent> {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openAiServer(recorded, () => ({})) });
  const connection = await wireConnection(root, { ...row, task: "chat", providerId: row.providerId ?? "custom-openai", model: "shaping-model" });
  const turn = await root.app.runtime.executor.runChatTurn({
    api: "chat-completions",
    connection,
    params: options.params ?? {},
    systemPrompt: { static: "You are a fixture.", dynamic: "" },
    history: options.history ?? [USER_LINE],
  });
  const [first] = recorded;
  if (first === undefined) {
    throw new Error("the turn reached no endpoint");
  }
  return { body: first.body, events: turn.events };
}

function ignoredKeys(events: readonly ChatEvent[]): string[] {
  return events.flatMap((event) => (event.kind === "warning" && event.code === "custom_parameters_ignored" ? [String(event.key)] : []));
}

function warningCodes(events: readonly ChatEvent[]): string[] {
  return events.flatMap((event) => (event.kind === "warning" ? [event.code] : []));
}

const NO_THINKING_SWITCH = generationCapability({ reasoning: { mode: "none", enabled: false } });
const EFFORT = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });

test("the connection's own body beats the preset knob and a computed key, a belt-owned key is dropped by name, and a fresh key rides", async () => {
  const belt = ["model", "stream", "messages"] as const;
  for (const key of belt) {
    expect(isBeltOwnedBodyKey(key)).toBe(true);
  }
  const preset = { temperature: 0.7 };
  const control = await send({ capability: NO_THINKING_SWITCH }, { params: preset });
  expect(control.body["temperature"]).toBe(0.7);

  const sent = await send(
    { capability: NO_THINKING_SWITCH, extras: { model: "evil", stream: false, messages: [], temperature: 1.2, ["mirostat_tau"]: 5 } },
    { params: preset },
  );

  expect(sent.body["temperature"]).toBe(1.2);
  expect(sent.body["mirostat_tau"]).toBe(5);
  expect(sent.body["model"]).toBe(control.body["model"]);
  expect(sent.body["stream"]).toBe(true);
  expect(sent.body["messages"]).toEqual(control.body["messages"]);
  expect(ignoredKeys(sent.events).toSorted()).toEqual([...belt].toSorted());
  expect(ignoredKeys(control.events)).toEqual([]);
});

test("the OpenRouter transport takes only the keys it models off the connection's extras and names every other one it drops", async () => {
  const sent = await send({
    providerId: "openrouter",
    capability: NO_THINKING_SWITCH,
    extras: { provider: { order: ["Anthropic"] }, ["chat_template_kwargs"]: { ["enable_thinking"]: false }, ["mirostat_tau"]: 5 },
  });

  expect(ignoredKeys(sent.events).toSorted()).toEqual(["chat_template_kwargs", "mirostat_tau"]);
  expect(sent.body).not.toHaveProperty("chat_template_kwargs");
  expect(sent.body).not.toHaveProperty("mirostat_tau");
  expect(sent.body["provider"]).toMatchObject({ order: ["Anthropic"] });
});

test("a prototype-pollution key in the connection's body never lands on the wire, at any depth", async () => {
  const poisoned = connectionExtrasSchema.parse(JSON.parse('{"__proto__": {"polluted": true}, "nested": {"constructor": {"prototype": {"x": 1}}, "ok": 1}}'));
  const sent = await send({ capability: NO_THINKING_SWITCH, extras: poisoned });

  const nested = sent.body["nested"];
  expect(nested).toEqual({ ok: 1 });
  expect(Object.hasOwn(sent.body, "__proto__")).toBe(false);
  expect(Object.hasOwn(new Object(nested), "constructor")).toBe(false);
  expect(Object.hasOwn(sent.body, "polluted")).toBe(false);
});

test("includeBody replaces a modelled field and an extra whole, and excludeBody still drops a key the overrides set", async () => {
  const sent = await send(
    {
      capability: NO_THINKING_SWITCH,
      extras: { ["top_k"]: 40 },
      transport: { includeBody: { temperature: 0.1, ["top_k"]: 10, stop: { replaced: true }, seed: 7 }, excludeBody: ["seed"] },
    },
    { params: { temperature: 0.7, stop: ["</s>"] } },
  );

  expect(sent.body["temperature"]).toBe(0.1);
  expect(sent.body["top_k"]).toBe(10);
  expect(sent.body["stop"]).toEqual({ replaced: true });
  expect(sent.body).not.toHaveProperty("seed");
});

test("the output cap keeps the row's word, and a cap the user's body states stands over the rename", async () => {
  const declaredFeatures = { outputCapField: "max_completion_tokens" } as const;
  const params = { maxOutputTokens: 512 };
  const renamed = await send({ capability: NO_THINKING_SWITCH, declaredFeatures }, { params });
  expect(renamed.body["max_completion_tokens"]).toBe(512);
  expect(renamed.body).not.toHaveProperty("max_tokens");

  const fromExtras = await send({ capability: NO_THINKING_SWITCH, declaredFeatures, extras: { ["max_completion_tokens"]: 4096 } }, { params });
  expect(fromExtras.body["max_completion_tokens"]).toBe(4096);
  expect(fromExtras.body).not.toHaveProperty("max_tokens");

  const fromInclude = await send({ capability: NO_THINKING_SWITCH, declaredFeatures, transport: { includeBody: { ["max_tokens"]: 50 } } }, { params });
  expect(fromInclude.body["max_tokens"]).toBe(50);
  expect(fromInclude.body).not.toHaveProperty("max_completion_tokens");

  const excluded = await send({ capability: NO_THINKING_SWITCH, declaredFeatures, transport: { excludeBody: ["max_completion_tokens"] } }, { params });
  expect(excluded.body).not.toHaveProperty("max_completion_tokens");
  expect(excluded.body).not.toHaveProperty("max_tokens");
});

test("a reasoning-off turn tells the template not to think and zeroes the budget, and the user's own thinking switch outranks both", async () => {
  const off = { effort: "none" } satisfies UserIntent;
  const control = await send({ providerId: "vllm", capability: EFFORT }, { params: off });
  expect(control.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: false });
  expect(control.body["thinking_token_budget"]).toBe(0);

  const keepsTheirKwargs = await send(
    { providerId: "vllm", capability: EFFORT, extras: { ["chat_template_kwargs"]: { ["custom_flag"]: "x" } } },
    { params: off },
  );
  expect(keepsTheirKwargs.body["chat_template_kwargs"]).toMatchObject({ ["custom_flag"]: "x", ["enable_thinking"]: false });

  const theirsOn = await send({ providerId: "vllm", capability: EFFORT, extras: { ["chat_template_kwargs"]: { ["enable_thinking"]: true } } }, { params: off });
  expect(theirsOn.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: true });
  expect(theirsOn.body).not.toHaveProperty("thinking_token_budget");

  const excluded = await send({ providerId: "vllm", capability: EFFORT, transport: { excludeBody: ["chat_template_kwargs"] } }, { params: off });
  expect(excluded.body).not.toHaveProperty("chat_template_kwargs");
  expect(excluded.body).not.toHaveProperty("thinking_token_budget");

  const theirBudget = await send({ providerId: "vllm", capability: EFFORT, extras: { ["thinking_token_budget"]: 256 } }, { params: off });
  expect(theirBudget.body["thinking_token_budget"]).toBe(256);
});

const prefillCapability = (): ReturnType<typeof generationCapability> =>
  generationCapability({
    reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] },
    turns: { assistantPrefill: true, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: false },
  });

test("a delivered prefill sends the continue pair and turns thinking off for the server, unless the user's body decides the prefill", async () => {
  const prefill = prefillCapability();
  const history = [USER_LINE, ASSISTANT_OPENING];
  const params = { effort: "high" } satisfies UserIntent;

  const pair = await send({ providerId: "vllm", capability: prefill }, { params, history });
  expect(pair.body["continue_final_message"]).toBe(true);
  expect(pair.body["add_generation_prompt"]).toBe(false);
  expect(pair.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: false });
  expect(pair.body).not.toHaveProperty("reasoning_effort");
  expect(warningCodes(pair.events)).toContain("reasoning_dropped_for_prefill");

  const noPrefillTurn = await send({ providerId: "vllm", capability: prefill }, { params, history: [USER_LINE] });
  expect(noPrefillTurn.body).not.toHaveProperty("continue_final_message");
  expect(warningCodes(noPrefillTurn.events)).not.toContain("reasoning_dropped_for_prefill");

  const theirDecision = await send({ providerId: "vllm", capability: prefill, transport: { excludeBody: ["continue_final_message"] } }, { params, history });
  expect(theirDecision.body).not.toHaveProperty("continue_final_message");
  expect(theirDecision.body).not.toHaveProperty("add_generation_prompt");
  expect(warningCodes(theirDecision.events)).not.toContain("reasoning_dropped_for_prefill");
});

test("a messages array the user's body sets is theirs whole: the plan's prefill pair and interlock never touch it", async () => {
  const prefill = prefillCapability();
  const theirs = [{ role: "user", content: "Their own row." }];
  const params = { effort: "high" } satisfies UserIntent;
  const history = [USER_LINE, ASSISTANT_OPENING];

  const control = await send({ providerId: "vllm", capability: prefill }, { params, history });
  expect(control.body["continue_final_message"]).toBe(true);

  const owned = await send({ providerId: "vllm", capability: prefill, transport: { includeBody: { messages: theirs } } }, { params, history });
  expect(owned.body["messages"]).toEqual(theirs);
  expect(owned.body).not.toHaveProperty("continue_final_message");
  expect(owned.body).not.toHaveProperty("add_generation_prompt");
  expect(owned.body["reasoning_effort"]).toBe("high");
  expect(warningCodes(owned.events)).not.toContain("reasoning_dropped_for_prefill");
});

test("a reasoning-on turn tells the template to think, but never over an off the user's own body already set", async () => {
  const on = { effort: "high" } satisfies UserIntent;
  const thinks = await send({ providerId: "vllm", capability: EFFORT }, { params: on });
  expect(thinks.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: true });

  const theirOff = await send({ providerId: "vllm", capability: EFFORT, extras: { ["chat_template_kwargs"]: { ["enable_thinking"]: false } } }, { params: on });
  expect(theirOff.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: false });
});

test("an effort the row cannot spell is dropped with a warning, and one the user's body sets stays", async () => {
  const params = { effort: "high" } satisfies UserIntent;
  const dropped = await send({ capability: EFFORT }, { params });
  expect(dropped.body).not.toHaveProperty("reasoning_effort");
  expect(warningCodes(dropped.events)).toContain("effort_dropped");

  const theirs = await send({ capability: EFFORT, extras: { ["reasoning_effort"]: "low" } }, { params });
  expect(theirs.body["reasoning_effort"]).toBe("low");

  const spelled = await send({ providerId: "vllm", capability: EFFORT }, { params });
  expect(spelled.body["reasoning_effort"]).toBe("high");
});
