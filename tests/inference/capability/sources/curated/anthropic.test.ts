// capability/sources/curated/anthropic — the table pins over the Claude cells on the DIRECT wire, folded exactly
// as `resolve-task.ts` folds an `anthropic` row (curated rows → `synthesizeCapability`, no OR advertisement).
// The SDK's own capability table is the direct wire's truth (`@ai-sdk/anthropic/dist/index.js:5943-5963` —
// it strips before sending), and A8 was measured live (`req_011CfEBkabcoxXWyouHdYDxY`: fable + thinking disabled
// → 400). A6: the structured-output VEHICLE is `resolveVehicle` (role-clients.ts) — `auto` picks the enforcing
// `response-format` iff `output.structured === true`, else the forced tool Fable rejects; the input to that
// decision is what these cells must state.

import type { Principal } from "@orb/contracts/identity";
import type { AgentSdkModel, GenerationCapability, ModelCatalogEntry, ProviderId } from "@orb/contracts/inference";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import type { EndpointModel } from "../../../../../packages/inference/src/catalog/endpoint.ts";
import type { Mirror } from "../../../../../packages/inference/src/catalog/mirror.ts";
import type { ProviderExecutor } from "../../../../../packages/inference/src/contract/backend.ts";
import type { StructuredRequest } from "../../../../../packages/inference/src/contract/roles.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
import { createProviderRegistry } from "../../../../../packages/inference/src/registry/providers.ts";
import type { ResolverContext } from "../../../../../packages/inference/src/resolve/resolve-task.ts";
import { createRoleClientsFor } from "../../../../../packages/inference/src/roles/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { wireSchema } from "../../../../support/wire-ready.ts";
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
    warm: () => Promise.resolve(null),
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

async function selectedStructuredVehicle(providerId: string, model: string): Promise<string | undefined> {
  const deps = fakeDeps();
  const ownerId = newUserId();
  const connection = fakeConnection({ ownerId, providerId, model, allowBackground: true });
  deps.stores.connections.rows.set(connection.id, connection);
  deps.stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "summarize", connectionId: connection.id });

  const ctx: ResolverContext = {
    deps,
    registry: await createProviderRegistry(deps.providerStore),
    openRouterCatalog: emptyMirror<ModelCatalogEntry[]>(),
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
  expect(gen.context).toMatchObject({ window: 200_000, supports1M: true });
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
