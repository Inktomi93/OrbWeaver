// entry/compose/chat — `speakerArbiterFor`, Smart's Utility arbiter gate, over the REAL resolver and role
// clients: the bound row's resolved capability decides whether the arbiter exists at all, and the structured call
// it hands back rides the vehicle `rc.structured` picks. Each route is stated with the connection's `declared`
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
import { speakerArbiterFor } from "../../../../packages/server/src/entry/compose/chat.ts";
import { fakeConnection, fakeDeps, newUserId } from "../../../inference/_support.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { wireSchema } from "../../../support/wire-ready.ts";

const LOCAL_BASE_URL = "http://127.0.0.1:1/v1";

function emptyMirror<T>(): Mirror<T> {
  return {
    get: () => null,
    warm: () => Promise.resolve({ ok: false, reason: "speaker-arbiter test: an empty mirror has nothing to warm" }),
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

/** A local row whose model states the facts under test; server detection is off so nothing is probed. */
const local = (generation: NonNullable<DeclaredCapability["generation"]>): DeclaredCapability => ({ features: { detectServer: false }, generation });

describe("speakerArbiterFor — Smart's Utility arbiter gate", () => {
  test("no structured output but a named forced tool: the arbiter exists and rides the forced-tool vehicle", async () => {
    const { arbiter, calls } = await arbiterFor("custom-openai", "qwen-local", local({ output: { structured: false }, tools: { parallel: true } }));
    expect(arbiter).not.toBeNull();
    expect(calls.map((c) => c.responseFormat.vehicle)).toEqual(["forced-tool"]);
  });

  test("Claude 5.5 (structured output, no named tool choice): the arbiter rides response-format", async () => {
    const { arbiter, calls } = await arbiterFor("anthropic", "claude-sonnet-5-5", null);
    expect(arbiter?.contextTokens).toBeGreaterThan(0);
    expect(calls.map((c) => c.responseFormat.vehicle)).toEqual(["response-format"]);
  });

  test("neither vehicle: no arbiter, so the round degrades to natural with the warning", async () => {
    const noNamedTool = await arbiterFor(
      "custom-openai",
      "qwen-local",
      local({ output: { structured: false }, tools: { parallel: true, namedChoice: false } }),
    );
    expect(noNamedTool.arbiter).toBeNull();
    expect(noNamedTool.calls).toHaveLength(0);
    // A model that takes no tools[] at all cannot be forced onto one, whatever `namedChoice` defaults to.
    const noTools = await arbiterFor("custom-openai", "qwen-local", local({ output: { structured: false }, tools: null }));
    expect(noTools.arbiter).toBeNull();
  });

  test("the arbiter carries the bound model's context window", async () => {
    const { arbiter } = await arbiterFor("custom-openai", "qwen-local", local({ output: { structured: true }, context: { window: 4096 } }));
    expect(arbiter?.contextTokens).toBe(4096);
  });
});
