// Resolved-connection fixtures; reusable capability defaults live in the ISO builder home.

import type { ResolvedSecret } from "@orb/contracts/credentials";
import type { CachePolicy, Capability, GenerationCapability, ResolvedCacheConnectionView, ResolvedConnectionView, Task } from "@orb/contracts/inference";
import { builtinProvider, foldFeatures, requirementMet, SHIPPED_PROMPT_CACHE, taskDef } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";
import type { ModelId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId, createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "../../iso/ids.ts";
import { makeCapability, makeGenerationCapability } from "../../iso/inference-capability.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

export { makeCapability, makeGenerationCapability } from "../../iso/inference-capability.ts";

const viewIds = createIdSource(createSeededIds().next);

/** The default keyless endpoint provider a test connection resolves through. */
export const TEST_PROVIDER_ID = "custom-openai";
export const TEST_BASE_URL = "http://127.0.0.1:8703/v1";
export const TEST_OWNER_ID: UserId = castId<UserId>("user_test_owner");
/**
 * The connection id every fake `roleClients` bundle resolves to.
 *
 * THIS IS A PURE CONST AND IT SEEDS NOTHING — deliberately. Any harness that drives the REAL embeddings write
 * path must ALSO seed the `user_connections` row this points at: `embed_generations.connection_id` FKs it
 * (`packages/server/src/domain/embeddings/substrate/generation.ts`), so without the row the generation insert
 * fails the FK and the suite goes red — or worse, quietly green where the caller records a partial failure as
 * data. The seeder is `seedVectorConnection` in `tests/legacy/server/domain/embeddings/_support.ts` (embeddings owns
 * the write path); `tests/legacy/server/domain/embeddings/_support.ts` `seedUser` already calls it for you.
 *
 * The seeder is NOT here because this module is imported by BROWSER-world CT stories
 * (`tests/legacy/client/features/preset/**`, `tests/legacy/client/features/config/**`) — a `@orb/db` import would drag the
 * node-only db package into the CT bundle.
 */
export const TEST_CONNECTION_ID: UserConnectionId = castId<UserConnectionId>("user_connection_test0001");

export interface MakeResolvedOverrides<T extends Task> extends Partial<Omit<Resolved<T>, "task" | "capability" | "providerId" | "credential">> {
  readonly task?: T | undefined;
  /** A built-in registry id (the row is looked up; the brand is applied here). */
  readonly providerId?: string | undefined;
  /** The chat-shaped capability (a shorthand for `capability: { kind: "generation", generation }`). */
  readonly generation?: Partial<GenerationCapability> | undefined;
  readonly capability?: Capability | undefined;
}

function resolvedFields(overrides: MakeResolvedOverrides<Task> = {}): Omit<Resolved, "credential"> {
  const task = overrides.task ?? "chat";
  const providerId = overrides.providerId ?? TEST_PROVIDER_ID;
  const provider = overrides.provider ?? builtinProvider(providerId);
  if (provider === undefined) {
    throw new Error(`makeResolved: no built-in provider "${providerId}"`);
  }
  const capability = overrides.capability ?? makeCapability(makeGenerationCapability(overrides.generation));
  const { generation: _generation, capability: _capability, task: _task, providerId: _providerId, ...rest } = overrides;
  return {
    task,
    ownerId: TEST_OWNER_ID,
    connectionId: TEST_CONNECTION_ID,
    providerId: provider.id,
    wire: provider.wire,
    api: provider.apis[0] ?? null,
    model: castId<ModelId>("test-model"),
    capability,
    requirement: requirementMet(capability, taskDef(task).requires),
    provider,
    baseUrl: provider.baseUrl ?? (provider.auth === "endpoint" ? TEST_BASE_URL : null),
    features: foldFeatures(provider.features, undefined),
    extras: null,
    transport: null,
    allowBackground: false,
    promptCache: SHIPPED_PROMPT_CACHE,
    factsModel: rest.model ?? castId<ModelId>("test-model"),
    ...rest,
  };
}

/** A resolved connection consumes authority produced by the caller's credential owner. */
export function makeResolved(overrides: MakeResolvedOverrides<"chat"> & { readonly credential: ResolvedSecret }): Resolved<"chat">;
export function makeResolved<T extends Task>(overrides: MakeResolvedOverrides<T> & { readonly task: T; readonly credential: ResolvedSecret }): Resolved<T>;
export function makeResolved(overrides: MakeResolvedOverrides<Task> & { readonly credential: ResolvedSecret }): Resolved {
  const { credential, ...fields } = overrides;
  return { ...resolvedFields(fields), credential };
}

/** A credential-free snapshot; an explicit connection id links it to another supplied fixture. */
export function makeResolvedView(overrides: Partial<ResolvedConnectionView> = {}): ResolvedConnectionView {
  const { task, providerId, wire, api, model, capability, requirement } = resolvedFields();
  return { task, connectionId: viewIds.typeId(ID_PREFIX.userConnection), providerId, wire, api, model, capability, requirement, ...overrides };
}

/** The internal cache read port extends the unchanged public view fixture. */
export function makeResolvedCacheView(overrides: Partial<ResolvedCacheConnectionView> = {}): ResolvedCacheConnectionView {
  const { cacheContext, ...base } = overrides;
  const view = makeResolvedView(base);
  return {
    ...view,
    cacheContext: cacheContext ?? {
      wire: view.wire,
      dialect: view.wire === "openai-compat" ? "openai-compatible" : null,
      factsModel: view.model,
      promptSettings: SHIPPED_PROMPT_CACHE,
      responseReplaySupported: false,
      configuredReplay: {},
      configuredRetention: { owned: false, value: null },
    },
  };
}

/** Neutral applied-control fixture; no provider hit or upstream disable is fabricated. */
export function makeCachePolicy(overrides: Partial<CachePolicy> = {}): CachePolicy {
  return {
    prefix: { action: "none", format: null, ttl: null, cacheSystem: false, historyDepth: null, preservesBlockEnds: false },
    implicit: { supported: null, disableApplied: false, minimumRetentionSeconds: null, refreshOnHit: null, retention: null },
    replay: { supported: false, enabled: false, ttlSeconds: null, refresh: false, provenance: "default" },
    ...overrides,
  };
}

/** The `connection.capabilities` wire view: a generation capability that is its own baseline, no warnings,
 *  the neutral cache policy and the chat task. */
export function makeConnectionCapabilityView(overrides: Partial<TrpcWireOutput<"connection.capabilities">> = {}): TrpcWireOutput<"connection.capabilities"> {
  const capability = makeCapability();
  return {
    cache: makeCachePolicy(),
    cacheWarnings: [],
    cacheContext: makeResolvedCacheView().cacheContext,
    capability,
    baseline: capability,
    warnings: [],
    tasks: ["chat"],
    ...overrides,
  };
}
