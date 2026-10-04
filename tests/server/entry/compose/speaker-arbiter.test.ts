// entry/compose/chat — `speakerArbiterFor`, Smart's Utility arbiter gate, over the REAL resolver and role
// clients: the bound row's resolved capability decides whether the arbiter exists at all, and the structured call
// it hands back rides the vehicle the structured plan picks. Each route is stated with the connection's `declared`
// capability (or a curated row), and the executor only captures the request it would send.

import type { Principal } from "@orb/contracts/identity";
import type { AgentSdkModel, DeclaredCapability, ModelCatalogEntry } from "@orb/contracts/inference";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { Mirror } from "../../../../packages/inference/src/catalog/mirror.ts";
import type { ProviderExecutor } from "../../../../packages/inference/src/contract/backend.ts";
import type { StructuredRequest } from "../../../../packages/inference/src/contract/roles.ts";
import type { DetectedServer, EndpointModel } from "../../../../packages/inference/src/contract/runtime.ts";
import { createProviderRegistry } from "../../../../packages/inference/src/registry/providers.ts";
import type { ResolverContext } from "../../../../packages/inference/src/resolve/resolve-task.ts";
import { createRoleClientsFor } from "../../../../packages/inference/src/roles/role-clients.ts";
import { planStructuredFor } from "../../../../packages/inference/src/structured/plan.ts";
import { speakerArbiterFor } from "../../../../packages/server/src/entry/compose/chat.ts";
import { fakeConnection, fakeDeps, newUserId } from "../../../inference/_support.ts";
import { makeResolved } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { wireSchema } from "../../../support/wire-ready.ts";

const LOCAL_BASE_URL = "http://127.0.0.1:1/v1";

function emptyMirror<T>(): Mirror<T> {
  return {
    get: () => null,
    hydrate: () => Promise.resolve(null),
    warm: () => Promise.resolve({ ok: false, reason: "speaker-arbiter test: an empty mirror has nothing to warm" }),
    seed: () => undefined,
    amend: () => Promise.resolve(),
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

/** The arbiter the gate hands back for a Utility row bound to `providerId · model`, and the requests its call sent. */
async function arbiterFor(
  providerId: string,
  model: string,
  declared: DeclaredCapability | null,
): Promise<{ readonly arbiter: Awaited<ReturnType<typeof speakerArbiterFor>>; readonly calls: StructuredRequest[] }> {
  const deps = fakeDeps();
  const ownerId = newUserId();
  const connection = fakeConnection({
    ownerId,
    providerId,
    model,
    allowBackground: true,
    declared,
    ...(providerId === "custom-openai" ? { baseUrl: LOCAL_BASE_URL } : {}),
  });
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
    detectedServer: () => emptyMirror<DetectedServer>(),
    warmDetect: () => Promise.resolve(true),
  };
  const principal: Principal = { userId: ownerId, role: "owner", handle: castId<Handle>("owner"), externalId: null, via: "fallback" };
  const calls: StructuredRequest[] = [];
  const arbiter = await speakerArbiterFor(createRoleClientsFor({ deps, ctx, executor: capturingExecutor(calls) })(principal));
  await arbiter?.structured([{ systemPrompt: "Pick.", userPrompt: "Who?" }], {
    responseFormat: { name: "speaker_pick", schema: wireSchema({ type: "object", properties: {}, additionalProperties: false }) },
  });
  return { arbiter, calls };
}

/** The vehicle the structured plan picks for one captured call on its own resolved row. */
function plannedVehicle(call: StructuredRequest): string | undefined {
  const plan = planStructuredFor(call.connection, { formats: [call.responseFormat] });
  return plan.ok ? plan.responseFormat?.vehicle : undefined;
}

/** A local row whose model states the facts under test; server detection is off so nothing is probed. */
const local = (generation: NonNullable<DeclaredCapability["generation"]>): DeclaredCapability => ({ features: { detectServer: false }, generation });

describe("speakerArbiterFor — Smart's Utility arbiter gate", () => {
  test("no structured output but a named forced tool: the arbiter exists and the plan rides the forced tool", async () => {
    const { arbiter, calls } = await arbiterFor("custom-openai", "qwen-local", local({ output: { structured: false }, tools: { parallel: true } }));
    expect(arbiter).not.toBeNull();
    expect(calls.map(plannedVehicle)).toEqual(["forced-tool"]);
  });

  test("Claude 5.5 (structured output, no named tool choice): the arbiter rides response-format", async () => {
    const { arbiter, calls } = await arbiterFor("anthropic", "claude-sonnet-5-5", null);
    expect(arbiter?.contextTokens).toBeGreaterThan(0);
    expect(calls.map(plannedVehicle)).toEqual(["response-format"]);
  });

  test("a model that takes tools but cannot be forced onto one is offered the one tool; with no tools at all there is no arbiter", async () => {
    const noNamedTool = await arbiterFor(
      "custom-openai",
      "qwen-local",
      local({ output: { structured: false }, tools: { parallel: true, namedChoice: false } }),
    );
    expect(noNamedTool.arbiter).not.toBeNull();
    expect(noNamedTool.calls.map(plannedVehicle)).toEqual(["offered-tool"]);
    // A model that takes no tools[] at all and states no structured output carries no payload: the round degrades.
    const noTools = await arbiterFor("custom-openai", "qwen-local", local({ output: { structured: false }, tools: null }));
    expect(noTools.arbiter).toBeNull();
    expect(noTools.calls).toHaveLength(0);
  });

  test("the arbiter carries the bound model's context window", async () => {
    const { arbiter } = await arbiterFor("custom-openai", "qwen-local", local({ output: { structured: true }, context: { window: 4096 } }));
    expect(arbiter?.contextTokens).toBe(4096);
  });

  // 0565: on a route whose window the request sets, the arbiter's call sends the Utility preset's Max context, so the
  // window it budgets against is that one; a route that sends no window keeps the model's own.
  test("the arbiter reads the Utility preset's window where the route sets one, and the model's own elsewhere", async () => {
    const roles = (settable: boolean): Parameters<typeof speakerArbiterFor>[0] => ({
      resolved: () =>
        Promise.resolve(
          makeResolved({
            task: "structured",
            generation: {
              output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] },
              context: { window: 4096, ...(settable ? { settable: { max: 32_768 } } : {}) },
            },
          }),
        ),
      structured: () => Promise.resolve({ items: [], model: "test-model" }),
    });
    expect((await speakerArbiterFor(roles(true), 16_384))?.contextTokens).toBe(16_384);
    expect((await speakerArbiterFor(roles(false), 16_384))?.contextTokens).toBe(4096);
  });
});
