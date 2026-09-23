// capability/sources/curated/anthropic — the table pins over the Claude cells on the DIRECT wire, folded exactly
// as `resolve-task.ts` folds an `anthropic` row (curated rows → `synthesizeCapability`, no OR advertisement).
// The SDK's own capability table is the direct wire's truth (`@ai-sdk/anthropic/dist/index.js:5943-5963` —
// it strips before sending), and A8 was measured live (`req_011CfEBkabcoxXWyouHdYDxY`: fable + thinking disabled
// → 400). A6: the structured-output VEHICLE is `resolveVehicle` (role-clients.ts) — `auto` picks the enforcing
// `response-format` iff `output.structured === true`, else the forced tool Fable rejects; the input to that
// decision is what these cells must state.
//
// #2575: Opus 5.5 is its own row (mandatory thinking — under the opus-5 row alone a reasoning-off intent sent
// `thinking: disabled`, a 400 there), and the three models that 400 a forced
// `tool_choice` (Fable 5.1, Mythos 5.1, Opus 5.5) keep a deployment-forced structured call on `response-format`.

import type { Principal } from "@orb/contracts/identity";
import type { AgentSdkModel, GenerationCapability, ModelCatalogEntry, ProviderId } from "@orb/contracts/inference";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { StructuredOutputVehicle } from "@orb/contracts/role-clients";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import type { Mirror } from "../../../../../packages/inference/src/catalog/mirror.ts";
import { fetchOpenRouterCatalog } from "../../../../../packages/inference/src/catalog/openrouter.ts";
import type { ProviderExecutor } from "../../../../../packages/inference/src/contract/backend.ts";
import type { StructuredRequest } from "../../../../../packages/inference/src/contract/roles.ts";
import type { EndpointModel } from "../../../../../packages/inference/src/contract/runtime.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
import { createProviderRegistry } from "../../../../../packages/inference/src/registry/providers.ts";
import type { ResolverContext } from "../../../../../packages/inference/src/resolve/resolve-task.ts";
import { createRoleClientsFor } from "../../../../../packages/inference/src/roles/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { wireSchema } from "../../../../support/wire-ready.ts";
import { openRouterCatalogFetch } from "../../../_openrouter-catalog.ts";
import { fakeConnection, fakeDeps, newUserId } from "../../../_support.ts";

const DIRECT = { providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" } as const;

const FABLE_IDS = [
  { providerId: "anthropic", model: "claude-fable-5-1" },
  { providerId: "anthropic", model: "claude-fable-5" },
  { providerId: "openrouter", model: "anthropic/claude-fable-5-1" },
] as const;

function emptyMirror<T>(): Mirror<T> {
  return {
    get: () => null,
    warm: () => Promise.resolve({ ok: false, reason: "tests/inference: an empty mirror has nothing to warm" }),
    seed: () => undefined,
    invalidate: () => undefined,
  };
}

function fixedMirror<T>(value: T): Mirror<T> {
  return {
    get: () => value,
    warm: () => Promise.resolve({ ok: true, value }),
    seed: () => undefined,
    invalidate: () => undefined,
  };
}

function capturingExecutor(calls: StructuredRequest[]): ProviderExecutor {
  const unexpected = <T>(): Promise<T> => Promise.reject(new Error("unexpected non-structured provider call"));
  return {
    runChatTurn: unexpected,
    runAgentTurn: unexpected,
    embed: unexpected,
    rerank: unexpected,
    imageEmbed: unexpected,
    summarize: unexpected,
    structured: (request): Promise<SummarizeResult> => {
      calls.push(request);
      return Promise.resolve({ items: [], model: request.connection.model });
    },
    generateImage: unexpected,
  };
}

async function selectedStructuredVehicle(
  providerId: string,
  model: string,
  deployment: StructuredOutputVehicle = "auto",
  catalog: readonly ModelCatalogEntry[] | null = null,
): Promise<string | undefined> {
  const deps = { ...fakeDeps(), structuredOutputVehicle: (): StructuredOutputVehicle => deployment };
  const ownerId = newUserId();
  const connection = fakeConnection({ ownerId, providerId, model, allowBackground: true });
  deps.stores.connections.rows.set(connection.id, connection);
  deps.stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "summarize", connectionId: connection.id });

  const ctx: ResolverContext = {
    deps,
    registry: await createProviderRegistry(deps.providerStore),
    openRouterCatalog: catalog === null ? emptyMirror<ModelCatalogEntry[]>() : fixedMirror([...catalog]),
    endpointModels: () => emptyMirror<EndpointModel[]>(),
    agentSdkCatalog: emptyMirror<AgentSdkModel[]>(),
    warmOpenRouter: () => Promise.resolve(),
    warmEndpoint: () => Promise.resolve(),
    warmAgentSdk: () => Promise.resolve(),
  };
  const principal: Principal = { userId: ownerId, role: "owner", handle: castId<Handle>("owner"), externalId: null, via: "fallback" };
  const calls: StructuredRequest[] = [];
  const clients = createRoleClientsFor({ deps, ctx, executor: capturingExecutor(calls) })(principal);
  await clients.structured([{ systemPrompt: "Return the payload.", userPrompt: "One row." }], {
    responseFormat: { name: "row", schema: wireSchema({ type: "object", properties: {}, additionalProperties: false }) },
  });
  expect(calls, `${providerId} · ${model}`).toHaveLength(1);
  return calls[0]?.responseFormat.vehicle;
}

function direct(model: string): GenerationCapability {
  const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...DIRECT }) });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

/** The ids the SDK table marks `rejectsSamplingParameters: true` (+ `supportsAdaptiveThinking`, `supportsXhighEffort`). */
const REJECTS_SAMPLING = ["claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5-1", "claude-fable-5", "claude-mythos-5", "claude-sonnet-5"];

test("B3 (direct): every SDK-table id states an EMPTY sampling set on the direct wire; a preset knob drops loudly", () => {
  for (const model of REJECTS_SAMPLING) {
    const gen = direct(model);
    // The `exclusive` pair is a RESTRICTION with no ranges — the stated set carries no knob at all.
    expect(gen.sampling.temperature, model).toBeUndefined();
    expect(gen.sampling.topP, model).toBeUndefined();
    expect(
      resolveChat({ temperature: 0.7 }, gen).warnings.map((w) => w.code),
      model,
    ).toContain("sampling_knob_dropped");
  }
});

test("opus-5 has a curated cell now: adaptive reasoning with the full effort ladder (it resolved as non-reasoning before 2026-09-20)", () => {
  const gen = direct("claude-opus-5");
  expect(gen.reasoning).toMatchObject({ mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] });
  expect(gen.reasoning.mandatory).toBeUndefined();
  expect(gen.context).toEqual({ window: 1_000_000 });
  // PLANTED CONTROL for the regex: `opus-5` must not swallow the 4.x opus ids (their cells differ).
  expect(direct("claude-opus-4-5-20251101").reasoning.mode).toBe("effort");
  expect(direct("claude-opus-4-8").reasoning.mode).toBe("adaptive");
});

test("A8: fable / mythos are MANDATORY — effort `none` or absent resolves enabled at the lowest level with reasoning_mandatory_clamp", () => {
  for (const model of ["claude-fable-5-1", "claude-fable-5", "claude-mythos-5"]) {
    const gen = direct(model);
    expect(gen.reasoning.mandatory, model).toBe(true);
    const off = resolveChat({ effort: "none" }, gen);
    expect(off.reasoning, model).toMatchObject({ mode: "adaptive", enabled: true, effort: "low" });
    expect(
      off.warnings.map((w) => [w.code, w.appliedEffort]),
      model,
    ).toEqual([["reasoning_mandatory_clamp", "low"]]);
    const unset = resolveChat({}, gen);
    expect(unset.reasoning.enabled, model).toBe(true);
    // An explicit level is honoured untouched.
    expect(resolveChat({ effort: "high" }, gen).reasoning, model).toMatchObject({ enabled: true, effort: "high" });
  }
  // PLANTED CONTROL: a non-mandatory adaptive cell still turns thinking OFF for effort `none`.
  expect(resolveChat({ effort: "none" }, direct("claude-opus-5")).reasoning.enabled).toBe(false);
});

test("A6: every SDK-table id (and the 4.5 generation) states output.structured — the vehicle input that keeps Fable off the forced tool", () => {
  for (const model of [...REJECTS_SAMPLING, "claude-opus-4-5-20251101", "claude-haiku-4-5"]) {
    expect(direct(model).output.structured, model).toBe(true);
  }
});

test("A6: every supported Fable id sends an auto structured call through response-format, never forced-tool", async () => {
  for (const { providerId, model } of FABLE_IDS) {
    await expect(selectedStructuredVehicle(providerId, model), `${providerId} · ${model}`).resolves.toBe("response-format");
  }
});

test("sonnet 4.5 / 4.6 keep the shared sonnet reasoning cell without the sonnet-5 empty-sampling row (the SDK table accepts sampling there)", () => {
  const rows46 = curatedRows({ model: "claude-sonnet-4-6", ...DIRECT });
  expect(rows46.some((row) => row.match?.model === "^(anthropic/)?claude[-/].*sonnet-5")).toBe(false);
  expect(curatedRows({ model: "claude-sonnet-5", ...DIRECT }).some((row) => row.match?.model === "^(anthropic/)?claude[-/].*sonnet-5")).toBe(true);
  expect(direct("claude-sonnet-4-6").reasoning.mode).toBe("effort");
});

/** The ids Anthropic documents as rejecting a forced `tool_choice` (`any` / `tool` → 400 `tool_choice: type "tool"
 *  and "any" are not supported for this model`, on Messages, Batches and count_tokens). Fable 5 and Opus 5 accept it. */
const REJECTS_FORCED_TOOL = [
  { providerId: "anthropic", model: "claude-fable-5-1" },
  { providerId: "anthropic", model: "claude-mythos-5-1" },
  { providerId: "anthropic", model: "claude-opus-5-5" },
] as const;

test("#2575: Opus 5.5 is MANDATORY — reasoning off resolves enabled at the lowest level, and the unset default is the house `high`", () => {
  const gen = direct("claude-opus-5-5");
  expect(gen.reasoning).toMatchObject({ mode: "adaptive", enabled: true, mandatory: true });
  const off = resolveChat({ effort: "none" }, gen);
  expect(off.reasoning).toMatchObject({ enabled: true, effort: "low" });
  expect(off.warnings.map((w) => [w.code, w.appliedEffort])).toEqual([["reasoning_mandatory_clamp", "low"]]);
  // No explicit effort and no quality ⇒ the house default, with no clamp to report.
  const unset = resolveChat({}, gen);
  expect(unset.reasoning).toMatchObject({ enabled: true, effort: "high" });
  expect(unset.warnings).toEqual([]);
  // The opus-5 facts it shares still reach it (the 5.5 row refines, never replaces).
  expect(gen.sampling.temperature).toBeUndefined();
  expect(gen.context).toEqual({ window: 1_000_000 });
  // PLANTED CONTROL: Opus 5 itself stays switchable — effort `none` still turns thinking OFF there.
  expect(resolveChat({ effort: "none" }, direct("claude-opus-5")).reasoning.enabled).toBe(false);
});

const AGENT_SDK_ROUTE = { providerId: castId<ProviderId>("claude-sub"), wire: "agent-sdk", api: "agent-sdk" } as const;

// Owner ruling: no effort set ⇒ adaptive thinking at `high` wherever the model supports adaptive thinking. The
// matrix measured the same preset sending thinking disabled on direct opus-5 and opus-4-8
// (req_011CfKgrsFJ9ypUKNm5nkoM3, req_011CfKhGDcJ7WwS7aovrVdrd), the mandatory clamp's `low` on direct fable
// (req_011CfKh2z379oimcJwSMD7tv) and `medium` on direct opus-5-5 (req_011CfKgwSXtiHfLLnEeLzaST).
test("no effort set ⇒ adaptive thinking at high on the direct and agent-sdk routes for every adaptive Claude id", () => {
  for (const model of ["claude-opus-5", "claude-opus-5-5", "claude-opus-4-8", "claude-fable-5", "claude-fable-5-1"]) {
    for (const route of [DIRECT, AGENT_SDK_ROUTE]) {
      const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...route }) });
      if (out.capability.kind !== "generation") {
        throw new Error("expected a generation capability");
      }
      const knobs = resolveChat({}, out.capability.generation);
      expect(knobs.reasoning, `${route.wire} ${model}`).toMatchObject({ mode: "adaptive", enabled: true, effort: "high" });
      expect(knobs.warnings, `${route.wire} ${model}`).toEqual([]);
    }
  }
});

test("#2575: a deployment-forced structured call on a forced-tool-rejecting model rides response-format instead", async () => {
  for (const { providerId, model } of REJECTS_FORCED_TOOL) {
    await expect(selectedStructuredVehicle(providerId, model, "forced-tool"), `${providerId} · ${model}`).resolves.toBe("response-format");
  }
  // PLANTED CONTROL: the models that ACCEPT a forced tool keep the deployment's explicit choice untouched.
  for (const model of ["claude-opus-5", "claude-fable-5", "claude-mythos-5"]) {
    await expect(selectedStructuredVehicle("anthropic", model, "forced-tool"), model).resolves.toBe("forced-tool");
  }
});

test("#2575: the forced-tool refusal holds on the OpenRouter route WITH a live-shaped catalog advertising tools", async () => {
  const catalog = await fetchOpenRouterCatalog({ fetch: openRouterCatalogFetch(), baseUrl: "https://openrouter.example/api/v1" });
  for (const model of ["anthropic/claude-fable-5.1", "anthropic/claude-fable-5.1:batch", "anthropic/claude-opus-5.5", "~anthropic/claude-fable-latest"]) {
    await expect(selectedStructuredVehicle("openrouter", model, "forced-tool", catalog), model).resolves.toBe("response-format");
  }
  // PLANTED CONTROL: Opus 5 on the same route keeps the deployment's forced tool.
  await expect(selectedStructuredVehicle("openrouter", "anthropic/claude-opus-5", "forced-tool", catalog)).resolves.toBe("forced-tool");
});

const OPENROUTER = { providerId: castId<ProviderId>("openrouter"), wire: "openai-compat", api: "chat-completions" } as const;

function viaOpenRouter(model: string): GenerationCapability {
  const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...OPENROUTER }) });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

// A continue by prefill sends the finished reply as a trailing assistant row, and the 4.5 Claude ids answer it
// with three tokens of nothing, so orb raised `empty_generation` on every continue: OpenRouter haiku-4.5 3/3
// (gen-1790136293-3HzFJAEZLWdWhVIMTuaj, gen-1790137541-jdHgdXhju27JwK4tK9XH, gen-1790137552-8L83X2LFGBxR3JUcK918),
// and on the same body OpenRouter opus-4.5 (gen-1790141538-eBRpWlikU1TqDrHB1EWH, gen-1790141540-B9bltq0wuWN94AjGl7VH)
// and direct haiku-4-5 (req_011CfKpkas4tLck9X6hodkK7, req_011CfKpkkjtZhF2cGfwxDHav). Without prefill, continue
// sends its own user cue and the model writes more.
test("no Claude route claims assistant prefill: a continue by prefill returns nothing on the 4.5 ids", () => {
  for (const model of ["anthropic/claude-haiku-4.5", "anthropic/claude-opus-4.5", "anthropic/claude-sonnet-5", "anthropic/claude-opus-5.5"]) {
    expect(viaOpenRouter(model).turns?.assistantPrefill, model).toBe(false);
  }
  for (const model of ["claude-haiku-4-5", "claude-opus-4-5-20251101"]) {
    expect(direct(model).turns?.assistantPrefill, model).toBe(false);
  }
});

// ── the knob-audit rows, re-derived live (2026-09-23) ────────────────────────────────────────────────────
// Models API `GET /v1/models/{id}`: every current id states max_input_tokens 1,000,000, max_tokens 128,000 and
// adaptive thinking only (opus-5 req_011CfKrpkFiR5L4pT2WAm3oB … sonnet-5 req_011CfKrpqBszB95ktdqBoGas); haiku-4-5
// states 200,000 / 64,000, budget (`enabled`) thinking and no effort (req_011CfKrpqx2Hs1U4Rg1DZ9C6). The runtime
// behind the subscription reports the same 1M window (claude-opus-5 session d382e036-cf6b-4ce1-a4dc-69e94550e014).
const CURRENT_CLAUDE = ["claude-opus-5", "claude-opus-5-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5", "claude-fable-5-1", "claude-sonnet-5"];

// The agent-sdk runtime is spawned with `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` (`backends/agent-sdk/env.ts`), and with it
// the runtime reports a 200k window (claude-opus-5 session 00e4fcde-278d-4b8a-b81b-bd1d38275462,
// claude-sonnet-5 4080457f-12cb-43c4-8084-af4da34fe705; without the pin 1M: 9d89eb4f-05b1-4d1f-85c2-b8baafb194f5).
// The capability states what that route serves, so orb never trims history against a window the runtime refuses.
test("limits: every current Claude id states a 1M window (200k on the pinned agent-sdk runtime) and a 128k output cap", () => {
  for (const model of CURRENT_CLAUDE) {
    for (const [route, window] of [
      [DIRECT, 1_000_000],
      [AGENT_SDK_ROUTE, 200_000],
    ] as const) {
      const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...route }) });
      if (out.capability.kind !== "generation") {
        throw new Error("expected a generation capability");
      }
      expect(out.capability.generation.context, `${route.wire} ${model}`).toEqual({ window });
      expect(out.capability.generation.output.maxTokens.max, `${route.wire} ${model}`).toBe(128_000);
    }
  }
  const haiku = direct("claude-haiku-4-5");
  expect(haiku.context).toEqual({ window: 200_000 });
  expect(haiku.output.maxTokens.max).toBe(64_000);
});

test("sonnet-5 and opus-4-7 are adaptive: summarized display and the house default effort reach them", () => {
  for (const model of ["claude-sonnet-5", "claude-opus-4-7"]) {
    const knobs = resolveChat({}, direct(model));
    expect(knobs.reasoning, model).toMatchObject({ mode: "adaptive", enabled: true, effort: "high", display: "summarized" });
  }
  // PLANTED CONTROL: the older sonnet ids keep the effort mode the shared sonnet row states.
  expect(direct("claude-sonnet-4-6").reasoning.mode).toBe("effort");
});

// Direct opus-5 / opus-5-5: a 555-token cached prefix wrote the cache, a 504-token one did not
// (req_011CfKrvqD3Be1mTJTWssMeJ vs req_011CfKrudXJBP64sXedecYct; opus-5-5 req_011CfKrw9dKMDf2PWQv4YasA vs
// req_011CfKruzHTfrbWs8aMaoosm), so the floor is 512, not the family's 4096.
test("opus-5 and opus-5-5 cache from 512 tokens; opus-4-8 keeps its own 1024", () => {
  expect(direct("claude-opus-5").turns?.cacheMinTokens).toBe(512);
  expect(direct("claude-opus-5-5").turns?.cacheMinTokens).toBe(512);
  expect(direct("claude-opus-4-8").turns?.cacheMinTokens).toBe(1024);
});

// Direct haiku-4-5 with `thinking: {type: "enabled", budget_tokens: 1024}` → 200 with a thinking block
// (req_011CfKrzCmQjgUPfUvzv1MBC). It takes no effort, so it is off unless the caller turns it on.
test("haiku-4-5: budget thinking when asked, off by default, and never an effort word", () => {
  const haiku = direct("claude-haiku-4-5");
  expect(haiku.reasoning).toMatchObject({ mode: "budget", enabled: true, budgetRange: { min: 1024, max: 63_000 } });
  expect(resolveChat({}, haiku).reasoning.enabled).toBe(false);
  const asked = resolveChat({ effort: "high", thinkingBudgetTokens: 2048 }, haiku).reasoning;
  expect(asked).toMatchObject({ mode: "budget", enabled: true, budgetTokens: 2048 });
  expect(asked.effort).toBeUndefined();
});

// Preserved thinking (Claude API model-migration notes): on fable-5-1 / mythos-5-1 / opus-5-5 a replayed thinking
// block over an edited prefix is refused for accounts created on or after 2026-08-31 unless the request asks the
// API to drop it. This key's account predates that (an edited-prefix replay returned 200: req_011CfKs6JMgTb3Y9up4Y1F3N);
// the `drop_block` request itself is accepted with the beta (req_011CfKs6a4VLio7HdQpBMWwz).
test("prefixBound: stated for opus-5-5 and the 5.1 point releases, not for the ids that allow an edited prefix", () => {
  for (const model of ["claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5-1"]) {
    expect(direct(model).reasoning.prefixBound, model).toBe(true);
  }
  for (const model of ["claude-opus-5", "claude-fable-5", "claude-opus-4-8"]) {
    expect(direct(model).reasoning.prefixBound, model).toBeUndefined();
  }
});

// ── The system-row facts and the message-handling floor, per route and model (SHAPING-MATRIX §5, §7) ─────────
// A system row stays a `system` row only where the model takes it in that slot: the tail
// (`midConversationSystem`) and mid-array (`historySystemRows`) are measured separately, and a model that takes
// either only in its legal slot floors at the model-only `slotted` level. Unmeasured ids keep the fail-closed
// family cell.

const AGENT_SDK = { providerId: castId<ProviderId>("claude-sub"), wire: "agent-sdk", api: "agent-sdk" } as const;

function turnsOn(route: typeof DIRECT | typeof OPENROUTER | typeof AGENT_SDK, model: string): readonly [boolean, boolean, string] {
  const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...route }) });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  const turns = out.capability.generation.turns;
  return [turns?.midConversationSystem === true, turns?.historySystemRows === true, turns?.roleHandlingFloor ?? "unset"];
}

test("the measured Claude ids take a system row at the tail and mid-array on the direct wire, and floor at slotted", () => {
  for (const model of ["claude-opus-5", "claude-opus-5-5", "claude-fable-5", "claude-fable-5-1", "claude-sonnet-5", "claude-opus-4-8"]) {
    expect(turnsOn(DIRECT, model), model).toStrictEqual([true, true, "slotted"]);
  }
});

test("haiku-4-5 400s any system row, and an unmeasured id stays fail-closed", () => {
  for (const model of ["claude-haiku-4-5", "claude-opus-4-7", "claude-sonnet-4-6", "claude-mythos-5", "claude-fable-5-2"]) {
    expect(turnsOn(DIRECT, model), model).toStrictEqual([false, false, "strict"]);
  }
});

test("OpenRouter matches the direct wire, except opus-5 takes no mid-array system row", () => {
  for (const model of [
    "anthropic/claude-opus-5.5",
    "anthropic/claude-fable-5",
    "anthropic/claude-fable-5.1",
    "anthropic/claude-sonnet-5",
    "anthropic/claude-opus-4.8",
  ]) {
    expect(turnsOn(OPENROUTER, model), model).toStrictEqual([true, true, "slotted"]);
  }
  expect(turnsOn(OPENROUTER, "anthropic/claude-opus-5")).toStrictEqual([true, false, "slotted"]);
  expect(turnsOn(OPENROUTER, "anthropic/claude-haiku-4.5")).toStrictEqual([false, false, "strict"]);
});

test("agent-sdk keeps opus-4-8's tail system row for the hook and nothing mid-array", () => {
  expect(turnsOn(AGENT_SDK, "claude-opus-4-8")).toStrictEqual([true, false, "slotted"]);
  expect(turnsOn(AGENT_SDK, "claude-sonnet-5")).toStrictEqual([false, false, "strict"]);
});
