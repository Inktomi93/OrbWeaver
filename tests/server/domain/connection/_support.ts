// Shared test harness for the connection domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Builds a real-db `ConnectionContext` with the injected determinism seam (frozen clock) and
// FAKE recording cross-feature/infra ops — the sanctioned "fake at the edges, inject at the root" doctrine
// (testing §3). connection is the SELECTION tier, so the fakes are its three injected seams:
//   • resolveCredential — returns a brand-protected credential by source (cast: the brand symbol is
//     unconstructable outside contracts, but tests are exempt from the id-cast grit; this is the edge fake).
//   • fetchOrCatalog    — returns the configured OR catalog (the live fetch is faked).
//   • loadUserSettings  — returns DEFAULT_USER_SETTINGS with a configurable `routing.roleDefaults`.

import type {
  AgentSdkModel,
  ChatSource,
  ModelCatalogEntry,
} from "../../../../packages/contracts/src/connection/index.ts";
import type {
  CustomOpenAiCredential,
  LocalLightCredential,
  MaxProSubCredential,
  OpenRouterCredential,
  ResolvedCredential,
  VllmCredential,
} from "../../../../packages/contracts/src/credentials/index.ts";
import type { Principal, UserRole } from "../../../../packages/contracts/src/identity/index.ts";
import type { UserSettings } from "../../../../packages/contracts/src/settings/index.ts";
import { DEFAULT_USER_SETTINGS } from "../../../../packages/contracts/src/settings/index.ts";
import type { Db } from "../../../../packages/db/src/client/index.ts";
import { DomainNoCredentialError } from "../../../../packages/kit/src/errors/index.ts";
import type { Handle, UserCredentialId, UserId } from "../../../../packages/kit/src/ids/index.ts";
import { castId } from "../../../../packages/kit/src/ids/index.ts";
import type { ConnectionContext } from "../../../../packages/server/src/domain/connection/context.ts";
import type { Clock } from "../../../support/clock.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";

type RoleDefaults = UserSettings["routing"]["roleDefaults"];

/** A brand-protected credential for a source (the edge fake — see file header). The brand symbol is
 *  unconstructable outside contracts, so the double-cast is the sanctioned test-only bridge. */
function fakeCredential(source: ChatSource): ResolvedCredential {
  switch (source) {
    case "vllm":
      return { source: "vllm", credentialId: null } as unknown as VllmCredential;
    case "local-light":
      return { source: "local-light", credentialId: null } as unknown as LocalLightCredential;
    case "openrouter":
      return {
        source: "openrouter",
        apiKey: "test-key",
        credentialId: null,
      } as unknown as OpenRouterCredential;
    case "max-pro-sub":
      return { source: "max-pro-sub", credentialId: null } as unknown as MaxProSubCredential;
    case "custom_openai":
      return {
        source: "custom_openai",
        baseUrl: "http://localhost:9999",
        apiKey: null,
        headers: null,
        credentialId: castId<UserCredentialId>("user_credential_test"),
      } as unknown as CustomOpenAiCredential;
    default:
      throw new Error(`fakeCredential: unhandled source ${String(source)}`);
  }
}

/** The harness: the ConnectionContext + recorders/controls for the injected fakes. */
export interface ConnHarness {
  readonly ctx: ConnectionContext;
  readonly clock: Clock;
  /** Set the `routing.roleDefaults` the faked `loadUserSettings` returns. */
  readonly setRoleDefaults: (roleDefaults: RoleDefaults) => void;
  /** Mark a source so the faked `resolveCredential` rejects with `DomainNoCredentialError` (the keyless /
   *  missing-key path — e.g. openrouter browse-without-key, or an unconfigured custom_openai). */
  readonly setNoCredentialSource: (source: ChatSource) => void;
  /** Set the OR catalog the faked `fetchOrCatalog` returns. */
  readonly setOrCatalog: (models: ModelCatalogEntry[]) => void;
  /** Set the agent-sdk daemon catalog the faked `fetchAgentSdkModels` returns. */
  readonly setAgentSdkCatalog: (models: AgentSdkModel[]) => void;
  /** Toggle the boot vLLM-availability fact the resolver reads (default `true`). `false` drives the
   *  no-GPU derive fallback (embed/rerank/imageEmbed vllm → local-light). */
  readonly setVllmAvailable: (available: boolean) => void;
  /** Every `source` the resolver asked `resolveCredential` for — proves the selection routed to it. */
  readonly credentialCalls: ChatSource[];
  /** Every request `testClaudeAuth` handed the faked `verifyClaudeAuth` diagnostic. */
  readonly verifyCalls: { readonly source: ChatSource; readonly model: string }[];
}

/** Build a ConnectionContext over a real db with the three injected ops faked + a frozen clock. */
export function makeConnHarness(db: Db): ConnHarness {
  const clock = createFrozenClock();
  let roleDefaults: RoleDefaults = DEFAULT_USER_SETTINGS.routing.roleDefaults;
  let orCatalog: ModelCatalogEntry[] = [];
  let agentSdkCatalog: AgentSdkModel[] = [];
  let vllmAvailable = true;
  const noCredentialSources = new Set<ChatSource>();
  const credentialCalls: ChatSource[] = [];
  const verifyCalls: { readonly source: ChatSource; readonly model: string }[] = [];

  const ctx: ConnectionContext = {
    db,
    now: clock.now,
    resolveCredential: ({ source }) => {
      credentialCalls.push(source);
      if (noCredentialSources.has(source)) {
        return Promise.reject(new DomainNoCredentialError(source));
      }
      return Promise.resolve(fakeCredential(source));
    },
    fetchOrCatalog: () => Promise.resolve([...orCatalog]),
    fetchAgentSdkModels: () => Promise.resolve([...agentSdkCatalog]),
    loadUserSettings: () =>
      Promise.resolve({ ...DEFAULT_USER_SETTINGS, routing: { roleDefaults } }),
    // apiKeySource: "none" signals host login active (contract/service.ts).
    verifyClaudeAuth: ({ credential, model }) => {
      verifyCalls.push({ source: credential.source, model });
      return Promise.resolve({
        source: "max-pro-sub" as const,
        ok: true,
        apiKeySource: "none",
        model,
        reply: "ok",
        costUsd: 0.0001,
      });
    },
    accountCredits: () => Promise.resolve({ total: 25, used: 7.5 }),
    generationCost: ({ generationId }) =>
      Promise.resolve({
        totalCost: 0.0123,
        tokensPrompt: generationId.length,
        tokensCompletion: 42,
      }),
    // The resolver reads this lazily per call, so a `setVllmAvailable(false)` before `resolveRole` lands.
    get vllmAvailable(): boolean {
      return vllmAvailable;
    },
    // Mirrors the compose `requireOwner`-over-`can` boolean; test code may spell the role (the
    // owner-role-split gate scans only packages/server/src).
    isOwner: (p) => p.role === "owner",
    // The local-light builtin trio the compose root injects from `backends/local-light` (the jina-clip-v2
    // embed/imageEmbed pair + the cross-encoder rerank) — the getModelsForSource local-light arm reads it.
    localLightDefaults: {
      embed: "jinaai/jina-clip-v2",
      imageEmbed: "jinaai/jina-clip-v2",
      rerank: "Xenova/ms-marco-MiniLM-L-6-v2",
    },
  };

  return {
    ctx,
    clock,
    setRoleDefaults: (rd: RoleDefaults): void => {
      roleDefaults = rd;
    },
    setNoCredentialSource: (source: ChatSource): void => {
      noCredentialSources.add(source);
    },
    setOrCatalog: (models: ModelCatalogEntry[]): void => {
      orCatalog = models;
    },
    setAgentSdkCatalog: (models: AgentSdkModel[]): void => {
      agentSdkCatalog = models;
    },
    setVllmAvailable: (available: boolean): void => {
      vllmAvailable = available;
    },
    credentialCalls,
    verifyCalls,
  };
}

/** A cookie-resolved Principal for a user id (role defaults to `user` — selection is role-agnostic; the
 *  owner gate lives in credentials, faked here). Delegates to the shared `support/factories/principal` —
 *  connection keeps its existing positional `(id, role)` convention (id is a bare string here). */
export function principal(userId: string, role: UserRole = "user"): Principal {
  const id = castId<UserId>(userId);
  return makePrincipal(id, { role, handle: castId<Handle>(userId) });
}

/** A minimal-valid agent-sdk daemon model row for cache/alias-resolution tests. Defaults to the `sonnet`
 *  alias → `claude-sonnet-5` (effort mode, the daemon's full level set). */
export function makeAgentSdkModel(overrides: Partial<AgentSdkModel> = {}): AgentSdkModel {
  return {
    alias: "sonnet",
    resolvedModel: "claude-sonnet-5",
    displayName: "Sonnet",
    description: "Sonnet 5",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
    supportsAdaptiveThinking: false,
    ...overrides,
  };
}

/** A minimal-valid OR catalog entry for cache/synthesis tests. */
export function makeOrEntry(overrides: Partial<ModelCatalogEntry> = {}): ModelCatalogEntry {
  return {
    id: "openai/gpt-5",
    name: "GPT-5",
    contextLength: 128_000,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: ["text"],
    supportedParameters: ["temperature", "top_p"],
    ...overrides,
  };
}
