// support/factories/resolved-connection — typed builders for the resolved-connection value objects tests
// used to fabricate via `as unknown as X` (test-support-dry-punchlist §5, W1h). The point of these factories
// is the TYPED RETURN: a new required field on `GenerationCapability` / `Resolved` becomes a compile error
// HERE (one place) instead of silently passing every fabricated literal.
//
//   • makeGenerationCapability — parsed through the real `generationCapabilitySchema`, so a new required
//     schema key errors at the default literal below (not silently absent in 30 test files).
//   • makeCapability — the KIND union over a generation descriptor (what `Resolved.capability` carries).
//   • makeResolvedSecret — `ResolvedSecret` is BRAND-PROTECTED (contracts/credentials: the only legit producer
//     is the credentials domain's resolve factory), so it is UN-buildable without a cast. The cast is
//     encapsulated here ONCE; the typed input keeps the shape honest.
//   • makeResolved — a server-side `Resolved<T>` over a BUILT-IN provider row (default: `custom-openai`, the
//     open BYO endpoint, keyless — the closest thing to the retired keyless vLLM marker every chat harness
//     used to default to). `generation` is the convenience override for the chat-shaped capability.
//   • makeResolvedView — the credential-free `ResolvedConnectionView` (`connection.resolveChatCapability`).

import type { ResolvedSecret, ResolvedSecretKind } from "@orb/contracts/credentials";
import type { Capability, GenerationCapability, ResolvedConnectionView, Task } from "@orb/contracts/inference";
import { builtinProvider, foldFeatures, generationCapabilitySchema, requirementMet, taskDef } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";
import type { ModelId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

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
 * data. The seeder is `seedVectorConnection` in `tests/server/domain/embeddings/_support.ts` (embeddings owns
 * the write path); `tests/server/domain/embeddings/_support.ts` `seedUser` already calls it for you.
 *
 * The seeder is NOT here because this module is imported by BROWSER-world CT stories
 * (`tests/client/features/preset/**`, `tests/client/features/config/**`) — a `@orb/db` import would drag the
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

const DEFAULT_GENERATION: GenerationCapability = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  input: ["text"],
  output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] },
  context: { window: 200_000 },
};

/** A fully-valid `GenerationCapability`, parsed through the real schema so the return is provably in-shape
 *  and a new required schema field breaks the default literal above (the one-place error W1h buys). */
export function makeGenerationCapability(overrides: Partial<GenerationCapability> = {}): GenerationCapability {
  return generationCapabilitySchema.parse({ ...DEFAULT_GENERATION, ...overrides });
}

/** The kind union over a generation descriptor. */
export function makeCapability(generation: GenerationCapability = makeGenerationCapability()): Capability {
  return { kind: "generation", generation };
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
    factsModel: rest.model ?? castId<ModelId>("test-model"),
    ...rest,
  };
}

/** The `connection.resolveChatCapability` wire shape — the credential-free projection of `makeResolved`. */
export function makeResolvedView(overrides: Partial<ResolvedConnectionView> = {}): ResolvedConnectionView {
  const { task, connectionId, providerId, wire, api, model, capability, requirement } = makeResolved();
  return { task, connectionId, providerId, wire, api, model, capability, requirement, ...overrides };
}
