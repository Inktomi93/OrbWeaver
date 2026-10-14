// Resolved-connection fixtures; reusable capability defaults live in the ISO builder home.

// @orb-waive-file no-test-fabrication(T): baselined when the gate widened to value casts; burn-down item 906.
import type { ResolvedSecret, ResolvedSecretKind } from "@orb/contracts/credentials";
import type { CachePolicy, Capability, GenerationCapability, ResolvedCacheConnectionView, ResolvedConnectionView, Task } from "@orb/contracts/inference";
import { builtinProvider, foldFeatures, requirementMet, SHIPPED_PROMPT_CACHE, taskDef } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";
import type { ModelId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { makeCapability, makeGenerationCapability } from "../../iso/inference-capability.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

export { makeCapability, makeGenerationCapability } from "../../iso/inference-capability.ts";

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

/** FABRICATION-OK brand cast — the ONE sanctioned place outside the domain mint; `ResolvedSecret` is
 *  brand-protected and unforgeable, so every builder routes its fully-typed input through this single cast. */
export function makeResolvedSecret(
  kind: ResolvedSecretKind = "none",
  secret: string | null = null,
  credentialId: UserCredentialId | null = null,
): ResolvedSecret {
  // @orb-waive no-test-fabrication(unknown): the ONE sanctioned brand cast (see the JSDoc above) — ResolvedSecret is unforgeable. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { kind, secret, credentialId } as unknown as ResolvedSecret;
}

/** A brand-protected KEYED `apiKey` secret (the hosted-row shape). */
export function makeApiKeySecret(
  secret = "sk-test",
  credentialId: UserCredentialId | null = castId<UserCredentialId>("user_credential_test0001"),
): ResolvedSecret {
  return makeResolvedSecret("apiKey", secret, credentialId);
}

export interface MakeResolvedOverrides<T extends Task> extends Partial<Omit<Resolved<T>, "task" | "capability" | "providerId">> {
  readonly task?: T | undefined;
  /** A built-in registry id (the row is looked up; the brand is applied here). */
  readonly providerId?: string | undefined;
  /** The chat-shaped capability (a shorthand for `capability: { kind: "generation", generation }`). */
  readonly generation?: Partial<GenerationCapability> | undefined;
  readonly capability?: Capability | undefined;
}

/** A server-side `Resolved<T>` (default task `chat`) over a built-in provider row; every axis overridable. */
export function makeResolved<T extends Task = "chat">(overrides: MakeResolvedOverrides<T> = {}): Resolved<T> {
  const task = (overrides.task ?? "chat") as T;
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
    credential: makeResolvedSecret(),
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

/** The `connection.resolveChatCapability` wire shape — the credential-free projection of `makeResolved`. */
export function makeResolvedView(overrides: Partial<ResolvedConnectionView> = {}): ResolvedConnectionView {
  const { task, connectionId, providerId, wire, api, model, capability, requirement } = makeResolved();
  return { task, connectionId, providerId, wire, api, model, capability, requirement, ...overrides };
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
