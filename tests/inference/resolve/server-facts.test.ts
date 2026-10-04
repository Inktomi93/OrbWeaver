// What the local servers' advertised facts do to a resolved connection: each forced tool-choice form a server
// does not force goes out as `auto`, loudly (Ollama and KoboldCpp: both; llama.cpp: a named choice), while a
// hosted row keeps both; a server that continues a delivered assistant row states `turns.assistantPrefill` and
// leaves the other cells estimated; and a chat template refusing the conversation's roles is not retried and
// keeps the server's sentence. Servers are the rig's recordings.

import type { DeclaredCapability, GenerationCapability } from "@orb/contracts/inference";
import { createInferenceRuntime, ProviderError } from "@orb/inference";
import { runOpenAiCompatChatTurn } from "../../../packages/inference/src/backends/openai-compat/chat.ts";
import { applyServerToolChoice } from "../../../packages/inference/src/capability/floor.ts";
import { planStructuredFor } from "../../../packages/inference/src/structured/plan.ts";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeConnection, fakeDeps, fakeResolved, memoryStores, memoryTokenLexicon, newUserId } from "../_support.ts";
import { generationCapability } from "../backends/_hosted-support.ts";
import { localServerFetch, recordedAnswer, transcriptFetch } from "../catalog/_local-servers-fetch.ts";

const BASE_URL = "http://127.0.0.1:1/v1";
const KOBOLD_MODEL = "koboldcpp/qwen2.5-0.5b-instruct-q4_k_m";
const LLAMA_MODEL = "/models/qwen2.5-0.5b-instruct-q4_k_m.gguf";

async function resolvedFor(args: {
  readonly providerId: string;
  readonly model: string;
  readonly fetch: typeof fetch;
  readonly declared?: DeclaredCapability | null;
}): Promise<Awaited<ReturnType<Awaited<ReturnType<typeof createInferenceRuntime>>["resolve"]>>["resolved"]> {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: args.providerId, model: args.model, baseUrl: BASE_URL, declared: args.declared ?? null });
  stores.connections.rows.set(row.id, row);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: args.fetch }));
  return (await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id })).resolved;
}

function generationOf(resolved: { readonly capability: { readonly kind: string } }): GenerationCapability {
  const capability = resolved.capability as { readonly kind: string; readonly generation?: GenerationCapability };
  if (capability.generation === undefined) {
    throw new Error(`expected a generation capability, got ${capability.kind}`);
  }
  return capability.generation;
}

const WEATHER_TOOL = { name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: {} } };

/** What a `required` and a named choice go out as through the structured plan, and the downgrades it raised. */
function forced(generation: GenerationCapability): { readonly required: string; readonly named: string; readonly warnings: string[] } {
  const connection = fakeResolved({ task: "chat", providerId: "custom-openai", model: "test-model", capability: { kind: "generation", generation } });
  const plans = [{ mode: "required" as const }, { mode: "tool" as const, name: WEATHER_TOOL.name }].map((toolChoice) => {
    const plan = planStructuredFor(connection, { tools: [WEATHER_TOOL], toolChoice });
    if (!plan.ok) {
      throw new Error("the tool-only plan refused");
    }
    return plan;
  });
  const [required, named] = plans.map((plan) => plan.toolChoice?.mode ?? "none");
  return { required: required ?? "none", named: named ?? "none", warnings: plans.flatMap((plan) => plan.downgrades.map((warning) => warning.code)) };
}

test("Ollama: neither forced form reaches the model, so both go out as auto with the downgrade warning", async () => {
  const generation = generationOf(await resolvedFor({ providerId: "ollama", model: "qwen2.5:0.5b", fetch: localServerFetch("ollama") }));
  expect(generation.tools).toMatchObject({ parallel: false, requiredChoice: false, namedChoice: false });
  expect(forced(generation)).toEqual({ required: "auto", named: "auto", warnings: ["tool_choice_downgraded", "tool_choice_downgraded"] });
});

test("KoboldCpp: tools the user declares carry the server's refusal of both forms; a declared form still wins", async () => {
  const declared = await resolvedFor({
    providerId: "koboldcpp",
    model: KOBOLD_MODEL,
    fetch: transcriptFetch("kobold-chat"),
    declared: { generation: { tools: { parallel: true } } },
  });
  expect(forced(generationOf(declared))).toMatchObject({ required: "auto", named: "auto" });
  const insisted = await resolvedFor({
    providerId: "koboldcpp",
    model: KOBOLD_MODEL,
    fetch: transcriptFetch("kobold-chat"),
    declared: { generation: { tools: { parallel: true, requiredChoice: true } } },
  });
  expect(forced(generationOf(insisted))).toEqual({ required: "required", named: "auto", warnings: ["tool_choice_downgraded"] });
});

test("llama.cpp forces `required` and runs a named choice as auto, so only the named form is downgraded", async () => {
  const generation = generationOf(await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-chat") }));
  expect(generation.tools).toEqual({ parallel: true, silencesProse: true, namedChoice: false });
  expect(forced(generation)).toEqual({ required: "required", named: "auto", warnings: ["tool_choice_downgraded"] });
});

test("a hosted row states no server tool-choice fact: both forms ride as asked", () => {
  const hosted = generationCapability({ tools: { parallel: true } });
  expect(applyServerToolChoice(hosted, undefined)).toBe(hosted);
  if (hosted.kind !== "generation") {
    throw new Error("expected generation");
  }
  expect(forced(hosted.generation)).toEqual({ required: "required", named: "tool", warnings: [] });
});

test("a server that continues a delivered assistant row states assistantPrefill; the cells nobody measured stay estimated", async () => {
  const continues = generationOf(await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-chat") }));
  expect(continues.turns).toMatchObject({ assistantPrefill: true, roleHandlingFloor: "strict" });
  expect(continues.turnsEstimated).toEqual(["midConversationSystem", "historySystemRows", "roleHandlingFloor"]);
  const closes = generationOf(await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-noprefill") }));
  expect(closes.turns?.assistantPrefill).toBe(false);
  expect(closes.turnsEstimated).not.toContain("assistantPrefill");
});

test("the server's sampler defaults reach the capability per knob, under the row's spelling", async () => {
  const generation = generationOf(await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-chat") }));
  expect(generation.samplingDefaults).toMatchObject({ topK: 40, repetitionPenalty: 1, repetitionPenaltyRange: 64, mirostatMode: 0 });
  expect(generation.samplingDefaults?.temperature).toBeCloseTo(0.8);
});

test("a chat template that refuses the conversation's roles is mapped once, not retried, and keeps the server's sentence", async () => {
  const resolved = await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-stock") });
  // What the rig's llama.cpp answered when Qwen3.8's stock template met a system row after an assistant row.
  const refusal = recordedAnswer("llamacpp-stock", "POST", "/v1/chat/completions");
  expect(refusal.status).toBe(500);
  let calls = 0;
  const error = await runOpenAiCompatChatTurn(
    {
      api: "chat-completions",
      connection: { ...resolved, task: "chat" },
      params: { maxOutputTokens: 16 },
      systemPrompt: { static: "", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    },
    {
      now: () => 0,
      log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
      tokens: memoryTokenLexicon(),
      transport: {
        fetch: (): Promise<Response> => {
          calls += 1;
          return Promise.resolve(Response.json(refusal.body, { status: refusal.status }));
        },
        app: { name: "t", url: "http://localhost:0" },
      },
    },
  ).then(
    () => null,
    (err: unknown) => err,
  );
  // A bare 500 is a retryable server fault; this one is the conversation's shape, so it is not.
  expect(error).toBeInstanceOf(ProviderError);
  expect(error).toMatchObject({ kind: "invalid", retryable: false });
  expect((error as ProviderError).message).toContain("System message must be at the beginning");
  expect(calls).toBe(1);
  // The owner's served template on the 27B takes the same rows: a 200, nothing to map.
  expect(recordedAnswer("llamacpp-27b", "POST", "/v1/chat/completions").status).toBe(200);
});
