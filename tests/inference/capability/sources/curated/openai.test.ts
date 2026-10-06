import type { GenerationCapability, ProviderId } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { castId } from "@orb/kit/ids";
import { runOpenAiCompatChatTurn } from "../../../../../packages/inference/src/backends/openai-compat/chat.ts";
import { detectModelFamily } from "../../../../../packages/inference/src/capability/families.ts";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import type { OpenAiCompatChatRequest } from "../../../../../packages/inference/src/contract/chat.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { wireSchema } from "../../../../support/wire-ready.ts";
import { fakeResolved, memoryTokenLexicon } from "../../../_support.ts";
import type { RecordedRequest } from "../../../backends/_hosted-support.ts";
import { openAiTextStream, scriptedSseFetch } from "../../../backends/_hosted-support.ts";

function openaiRows(model: string): ReturnType<typeof curatedRows> {
  return curatedRows({
    model,
    providerId: castId<ProviderId>(model.startsWith("openai/") ? "openrouter" : "openai"),
    wire: "openai-compat",
    api: "chat-completions",
  });
}

function generation(model: string): GenerationCapability {
  const out = synthesizeCapability("generation", detectModelFamily(model), { curated: openaiRows(model) });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

test("native GPT-6 Sol and Luna tool calls require an explicit reasoning off, without narrowing OpenRouter", () => {
  for (const model of ["gpt-6-sol", "gpt-6-luna"]) {
    expect(generation(model).tools, model).toMatchObject({ parallel: true, requiresReasoningOff: true });
    expect(generation(`openai/${model}`).tools, model).not.toHaveProperty("requiresReasoningOff");
  }
  expect(generation("gpt-5.2").tools).not.toHaveProperty("requiresReasoningOff");
});

test("native GPT-6.1 Sol keeps mandatory reasoning and native schemas but offers no Chat Completions tools", () => {
  const native = generation("gpt-6.1-sol");
  expect(native.tools).toBeUndefined();
  expect(native.output.structured).toBe(true);
  expect(native.reasoning).toMatchObject({ mode: "effort", enabled: true, mandatory: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] });
  expect(resolveChat({ effort: "none" }, native).reasoning).toMatchObject({ enabled: true, effort: "low" });
  expect(generation("openai/gpt-6.1-sol").tools).toMatchObject({ parallel: true });
});

function nativeToolRequest(model: string, params: UserIntent): OpenAiCompatChatRequest {
  return {
    api: "chat-completions",
    connection: fakeResolved({ task: "chat", providerId: "openai", model, capability: { kind: "generation", generation: generation(model) } }),
    params,
    systemPrompt: { static: "Check the weather.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Check Paris." }] }],
    tools: [{ name: "weather", description: "Read weather.", parameters: { type: "object", properties: {} } }],
  };
}

test("native GPT-6 tool restrictions refuse before SDK fetch; none still reaches the installed SDK with tools", async () => {
  const noop = (): void => undefined;
  const invoke = (request: OpenAiCompatChatRequest, requests: RecordedRequest[]): ReturnType<typeof runOpenAiCompatChatTurn> =>
    runOpenAiCompatChatTurn(request, {
      now: () => 1,
      log: { debug: noop, info: noop, warn: noop, error: noop },
      transport: { fetch: scriptedSseFetch([openAiTextStream("READY")], requests), app: { name: "tool-condition-test", url: "http://localhost:0" } },
      tokens: memoryTokenLexicon(),
    });
  for (const model of ["gpt-6-sol", "gpt-6-luna"]) {
    for (const params of [{}, { effort: "medium" }] satisfies UserIntent[]) {
      for (const terminalToolsAttached of [false, true]) {
        const recorded: RecordedRequest[] = [];
        await expect(invoke({ ...nativeToolRequest(model, params), terminalToolsAttached }, recorded)).rejects.toMatchObject({
          kind: "invalid",
          retryable: false,
          violations: [{ kind: "no-vehicle", cause: "tools-with-reasoning" }],
        });
        expect(recorded).toEqual([]);
      }
    }
    const recorded: RecordedRequest[] = [];
    await invoke(nativeToolRequest(model, { effort: "none" }), recorded);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.body).toMatchObject({ reasoning_effort: "none", tools: [{ function: { name: "weather" } }] });
    const schemaRequest = nativeToolRequest(model, { effort: "medium" });
    await invoke(
      {
        ...schemaRequest,
        tools: undefined,
        responseFormat: { name: "weather", schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }) },
      },
      recorded,
    );
    expect(recorded[1]?.body).toMatchObject({ reasoning_effort: "medium", response_format: { type: "json_schema" } });
    expect(recorded[1]?.body).not.toHaveProperty("tools");
  }
  const recorded: RecordedRequest[] = [];
  await expect(invoke(nativeToolRequest("gpt-6.1-sol", { effort: "low" }), recorded)).rejects.toMatchObject({
    kind: "invalid",
    retryable: false,
    violations: [{ kind: "no-vehicle", cause: "tools-unsupported" }],
  });
  expect(recorded).toEqual([]);
  await invoke({ ...nativeToolRequest("gpt-6.1-sol", { effort: "none" }), tools: undefined }, recorded);
  expect(recorded[0]?.body).toMatchObject({ reasoning_effort: "low" });
});

test("documented earlier OpenAI chat models state implicit caching without modern controls or guessed thresholds", () => {
  for (const id of [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.1",
    "gpt-5.1-chat-latest",
    "gpt-5.2",
    "gpt-5.4",
    "gpt-5.5",
    "o1",
    "o3",
    "o3-mini",
    "o4-mini",
  ]) {
    for (const model of [id, `openai/${id}`]) {
      expect(generation(model).turns, model).toMatchObject({
        providerImplicitPromptCache: true,
        explicitPromptCache: false,
        disablesImplicitPromptCache: false,
      });
      expect(generation(model).turns?.promptCacheFormat, model).toBeUndefined();
      expect(generation(model).turns?.cacheMinTokens, model).toBeUndefined();
      expect(generation(model).turns?.cacheRetentionSeconds, model).toBeUndefined();
    }
  }
  for (const id of ["gpt-5-codex", "gpt-5.1-codex", "gpt-5.1-codex-max", "gpt-5.1-codex-mini", "gpt-5.5-pro"]) {
    expect(generation(id).turns?.providerImplicitPromptCache, id).toBeUndefined();
    expect(generation(id).turns?.promptCacheKey, id).toBeUndefined();
    expect(generation(id).turns?.promptCacheRetentions, id).toBeUndefined();
    expect(generation(`openai/${id}`).turns, id).toMatchObject({
      providerImplicitPromptCache: true,
      explicitPromptCache: false,
      disablesImplicitPromptCache: false,
    });
  }
  for (const model of ["gpt-4o-future", "gpt-5.5-2099-01-01", "openai/o3-high", "gpt-6-sol-2099-01-01", "openai/gpt-oss-120b"]) {
    expect(generation(model).turns?.providerImplicitPromptCache, model).toBeUndefined();
  }
  const custom = synthesizeCapability("generation", "openai", {
    curated: curatedRows({ model: "gpt-5.5", providerId: castId<ProviderId>("custom-openai"), wire: "openai-compat", api: "chat-completions" }),
  });
  expect(custom.capability.kind === "generation" ? custom.capability.generation.turns?.providerImplicitPromptCache : null).toBeUndefined();
});

test("explicit OpenAI caching facts apply only to documented native and OpenRouter routes", () => {
  for (const model of ["gpt-5.6-sol", "gpt-6-sol", "gpt-6.1-sol", "openai/gpt-5.6-sol"]) {
    expect(generation(model).turns, model).toMatchObject({
      promptCacheFormat: "openai-breakpoint",
      explicitPromptCache: true,
      cacheMinTokens: 1024,
      cacheRetentionSeconds: 1800,
      promptCacheDefaultEnabled: false,
    });
  }
  for (const model of ["gpt-5.5", "gpt-4.1", "openai/gpt-oss-120b"]) {
    expect(generation(model).turns?.promptCacheFormat, model).toBeUndefined();
  }
  const local = synthesizeCapability("generation", "openai", {
    curated: curatedRows({ model: "gpt-5.6-sol", providerId: castId<ProviderId>("custom-openai"), wire: "openai-compat", api: "chat-completions" }),
  });
  expect(local.capability.kind === "generation" ? local.capability.generation.turns?.promptCacheFormat : null).toBeUndefined();
});

test("o3-mini and o4-mini clamp disabled reasoning before a request is built", () => {
  for (const model of ["o3-mini", "o4-mini-2025-04-16", "openai/o4-mini"]) {
    const capability = generation(model);
    expect(capability.reasoning, model).toMatchObject({
      mode: "effort",
      enabled: true,
      effortLevels: ["low", "medium", "high"],
      mandatory: true,
    });

    const resolved = resolveChat({ effort: "none" }, capability);
    expect(resolved.reasoning, model).toMatchObject({ mode: "effort", enabled: true, effort: "low" });
    expect(
      resolved.warnings.map((warning) => [warning.code, warning.appliedEffort]),
      model,
    ).toEqual([["reasoning_mandatory_clamp", "low"]]);
    expect(resolveChat({ effort: "high" }, capability).reasoning, model).toMatchObject({ enabled: true, effort: "high" });
  }

  // Controls: a model whose page lists `none`, and an id no row anchors.
  expect(generation("gpt-5.1").reasoning.mandatory).toBeUndefined();
  expect(generation("openai/o4-mini-preview").reasoning.mandatory).toBeUndefined();
});

// A non-reasoning GPT id must not inherit the reasoning ids' effort and verbosity: it would show a reasoning
// control and send knobs a model with no reasoning step does not take.
test("the non-reasoning GPT ids carry no reasoning and no verbosity; the reasoning ids keep their documented levels", () => {
  for (const model of ["gpt-4.1-mini", "gpt-4.1-mini-2025-04-14", "gpt-4.1", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini"]) {
    const capability = generation(model);
    expect(capability.reasoning, model).toEqual({ mode: "none", enabled: false });
    expect(capability.verbosity, model).toBeUndefined();
    const resolved = resolveChat({ effort: "high", verbosity: "low" }, capability);
    expect(resolved.reasoning, model).toMatchObject({ enabled: false });
    expect(resolved.verbosity, model).toBeUndefined();
  }

  for (const [model, effortLevels] of [
    ["gpt-5-mini", ["minimal", "low", "medium", "high"]],
    ["gpt-5.1", ["low", "medium", "high"]],
    ["gpt-5.4-mini", ["low", "medium", "high", "xhigh"]],
    ["gpt-5.6-terra", ["low", "medium", "high", "xhigh", "max"]],
    ["gpt-6-sol", ["low", "medium", "high", "xhigh", "max"]],
    ["o3", ["low", "medium", "high"]],
  ] as const) {
    const capability = generation(model);
    expect(capability.reasoning, model).toMatchObject({ mode: "effort", enabled: true, effortLevels });
    expect(resolveChat({ effort: "high" }, capability).reasoning, model).toMatchObject({ enabled: true, effort: "high" });
  }
  expect(generation("gpt-5-mini").verbosity).toEqual(["low", "medium", "high"]);
  expect(generation("o3").verbosity).toBeUndefined();

  // GPT-6 Astra alone 400s `none`, so its explicit off clamps up; its siblings take `none`.
  expect(generation("gpt-6-astra").reasoning).toMatchObject({ mandatory: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] });
  expect(generation("gpt-6-sol").reasoning.mandatory).toBeUndefined();
});

// Every OpenAI id openrouter.ai/api/v1/models lists with `reasoning` in `supported_parameters`, snapshotted from the
// live catalog. A new reasoning variant (a -pro, -codex or -image id, a `:batch` twin) must keep its replay cell.
const OPENROUTER_REASONING_IDS = [
  "openai/gpt-5",
  "openai/gpt-5-image",
  "openai/gpt-5-image-mini",
  "openai/gpt-5-mini",
  "openai/gpt-5-mini:batch",
  "openai/gpt-5-nano",
  "openai/gpt-5-nano:batch",
  "openai/gpt-5-pro",
  "openai/gpt-5-pro:batch",
  "openai/gpt-5.1",
  "openai/gpt-5.1-codex",
  "openai/gpt-5.1-codex-max",
  "openai/gpt-5.1-codex-mini",
  "openai/gpt-5.1:batch",
  "openai/gpt-5.2",
  "openai/gpt-5.2-codex",
  "openai/gpt-5.2-pro",
  "openai/gpt-5.2-pro:batch",
  "openai/gpt-5.2:batch",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.4",
  "openai/gpt-5.4-image-2",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-mini:batch",
  "openai/gpt-5.4-nano",
  "openai/gpt-5.4-nano:batch",
  "openai/gpt-5.4-pro",
  "openai/gpt-5.4-pro:batch",
  "openai/gpt-5.4:batch",
  "openai/gpt-5.5",
  "openai/gpt-5.5-pro",
  "openai/gpt-5.5-pro:batch",
  "openai/gpt-5.5:batch",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.6-luna-pro",
  "openai/gpt-5.6-luna-pro:batch",
  "openai/gpt-5.6-luna:batch",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-sol-pro",
  "openai/gpt-5.6-sol-pro:batch",
  "openai/gpt-5.6-sol:batch",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-terra-pro",
  "openai/gpt-5.6-terra-pro:batch",
  "openai/gpt-5.6-terra:batch",
  "openai/gpt-5:batch",
  "openai/gpt-6-astra",
  "openai/gpt-6-astra-pro",
  "openai/gpt-6-astra-pro:batch",
  "openai/gpt-6-astra:batch",
  "openai/gpt-6-luna",
  "openai/gpt-6-luna-pro",
  "openai/gpt-6-luna-pro:batch",
  "openai/gpt-6-luna:batch",
  "openai/gpt-6-sol",
  "openai/gpt-6-sol-pro",
  "openai/gpt-6-sol-pro:batch",
  "openai/gpt-6-sol:batch",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-120b:batch",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-20b:batch",
  "openai/gpt-oss-safeguard-20b",
  "openai/o1",
  "openai/o1-pro",
  "openai/o3",
  "openai/o3-mini",
  "openai/o3-mini-high",
  "openai/o3-mini:batch",
  "openai/o3-pro",
  "openai/o3:batch",
  "openai/o4-mini",
  "openai/o4-mini-high",
  "openai/o4-mini:batch",
] as const;

// gpt-oss is open-weight and OpenRouter serves it from third-party hosts, not OpenAI's Responses API, so it has no
// encrypted reasoning to replay signed.
const OPEN_WEIGHT = /^openai\/gpt-oss/;

function cells(model: string): { readonly sampling: boolean; readonly replay: string | undefined } {
  const stated = openaiRows(model).findLast((row) => row.generation?.sampling !== undefined)?.generation?.sampling;
  return {
    sampling: stated !== undefined && Object.keys(stated).length === 0,
    replay: generation(model).reasoning.replay,
  };
}

// The stated-empty sampling set and signed replay belong to the reasoning ids alone. The kind floor already states
// no sampling, so the curated cell is read off the matched rows; replay is read off the synthesized capability.
test("every OpenAI reasoning id OpenRouter lists carries the empty sampling set and signed replay, gpt-oss aside", () => {
  for (const model of OPENROUTER_REASONING_IDS) {
    expect(cells(model), model).toEqual(OPEN_WEIGHT.test(model) ? { sampling: false, replay: undefined } : { sampling: true, replay: "signed" });
  }
  for (const model of ["gpt-6-astra", "gpt-6-astra-2026-09-22", "gpt-5.1-codex-max", "o3-pro"]) {
    expect(cells(model), model).toEqual({ sampling: true, replay: "signed" });
  }
});

// Measured on direct chat completions: these ids take temperature and top_p with reasoning_effort none and refuse
// them at every other effort; OpenRouter strips both at every effort; gpt-5 and gpt-5-mini refuse them outright.
test("direct OpenAI ids that take effort none send temperature and top_p only on an off turn", () => {
  const knobs = { temperature: 0.7, topP: 0.9 } as const;
  const dropped = (warnings: readonly { readonly code: string; readonly knob?: string | undefined }[]): readonly string[] =>
    warnings.filter((warning) => warning.code === "sampling_knob_dropped").map((warning) => warning.knob ?? "");
  for (const model of ["gpt-5.1", "gpt-5.2", "gpt-5.4-mini", "gpt-5.5", "gpt-5.5-2026-04-23", "gpt-6-sol"]) {
    const capability = generation(model);
    const off = resolveChat({ ...knobs, effort: "none" }, capability);
    expect(off.sampling, model).toEqual(knobs);
    expect(dropped(off.warnings), model).toEqual([]);
    // A side-generation item runs reasoning off, so a summary keeps the role preset's temperature.
    expect(resolveChat(knobs, capability, { posture: "side-gen" }).sampling, model).toEqual(knobs);
    for (const params of [{ ...knobs, effort: "low" }, knobs] as const) {
      const on = resolveChat(params, capability);
      expect(on.sampling, model).toEqual({});
      expect(dropped(on.warnings), model).toEqual(["temperature", "topP"]);
    }
  }
  for (const model of ["openai/gpt-5.1", "openai/gpt-5.2", "openai/gpt-5.5", "gpt-5", "gpt-5-mini", "openai/gpt-5-mini"]) {
    const resolved = resolveChat({ ...knobs, effort: "none" }, generation(model));
    expect(resolved.sampling, model).toEqual({});
    expect(dropped(resolved.warnings), model).toEqual(["temperature", "topP"]);
  }
});

test("the non-reasoning chat snapshots and pre-GPT-5 ids take neither cell", () => {
  for (const model of [
    "gpt-5-chat-latest",
    "openai/gpt-5-chat-latest",
    "openai/gpt-5.2-chat",
    "gpt-5.2-chat-latest",
    "openai/gpt-chat-latest",
    "gpt-4.1",
    "gpt-4o-mini",
  ]) {
    expect(cells(model), model).toEqual({ sampling: false, replay: undefined });
  }
});

// The hosted family sweep (scripts/probes/hosted-families/RESULTS.md, 2026-10-03): every measured OpenAI id took and
// obeyed a mid-history and a trailing system row and adjacent same-role rows, directly and through OpenRouter, and
// treated a trailing assistant row as history, restarting or continuing from call to call.
test("the swept OpenAI ids state their turn cells on every route; an unswept open-weight id states none", () => {
  for (const model of ["gpt-4.1", "gpt-4o-mini", "gpt-5-nano", "gpt-5.4-mini", "gpt-6-sol", "o3-mini", "openai/gpt-4.1", "openai/o4-mini"]) {
    const capability = generation(model);
    expect(capability.turns, model).toMatchObject({ assistantPrefill: false, midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "none" });
    expect(capability.turnsEstimated, model).toBeUndefined();
  }
  for (const model of ["openai/gpt-oss-120b", "gpt-5.3-codex"]) {
    expect(generation(model).turnsEstimated, model).toBeDefined();
  }
});

// The facts were measured on OpenAI and OpenRouter, so a local or Custom server serving an aliased id keeps the
// floor its own template earns, and an id or snapshot the sweep never reached states nothing.
test("the swept turn cells hold only on the routes and ids the sweep measured", () => {
  for (const providerId of ["llama-cpp", "vllm", "custom-openai"]) {
    const { capability } = synthesizeCapability("generation", "openai", {
      curated: curatedRows({ model: "gpt-4o", providerId: castId<ProviderId>(providerId), wire: "openai-compat", api: "chat-completions" }),
    });
    expect(capability.kind === "generation" ? capability.generation.turnsEstimated : undefined, providerId).toBeDefined();
  }
  for (const model of ["openai/o1", "gpt-4o-2024-08-06", "openai/gpt-4.1-2025-04-14"]) {
    expect(generation(model).turnsEstimated, model).toBeDefined();
  }
  expect(generation("o1").turnsEstimated).toBeUndefined();
});

test("a non-reasoning GPT id offers OpenAI's samplers, none of the extras OpenAI refuses by name", () => {
  for (const model of ["gpt-4.1", "gpt-4.1-nano", "gpt-4o", "openai/gpt-4o-mini"]) {
    expect(Object.keys(generation(model).sampling).toSorted(), model).toEqual([
      "frequencyPenalty",
      "logitBias",
      "presencePenalty",
      "seed",
      "stop",
      "temperature",
      "topP",
    ]);
  }
});

// Off reaches the wire as `reasoning_effort: "none"`, so a model whose page lists no `none` must read mandatory:
// its off then clamps to the lowest documented level instead of sending a word the model refuses.
test("a reasoning model whose documented efforts omit none is mandatory, and one that lists none is not", () => {
  for (const model of ["gpt-5", "gpt-5-mini", "gpt-5-nano-2025-08-07", "gpt-5.3-codex", "o1", "o3", "gpt-oss-120b", "gpt-6-astra"]) {
    expect(generation(model).reasoning.mandatory, model).toBe(true);
  }
  for (const model of ["gpt-5.1", "gpt-5.2", "gpt-5.4-mini", "gpt-5.5", "gpt-5.6-terra", "gpt-6-sol", "gpt-6-luna"]) {
    expect(generation(model).reasoning.mandatory, model).toBeUndefined();
  }
  expect(resolveChat({ effort: "none" }, generation("gpt-5")).reasoning).toMatchObject({ enabled: true, effort: "minimal" });
});
