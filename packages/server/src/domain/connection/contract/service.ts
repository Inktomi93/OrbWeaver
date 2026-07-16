// domain/connection/contract/service — the typed API surface: ConnectionContext (the DI bundle) +
// ConnectionService (selection, not execution). Every cross-feature/infra dep arrives as an injected op,
// wired at the composition root; connection sideways-imports no sibling runtime.

import type { AgentSdkModel, CredentialSource, ModelCapability, ModelCatalogEntry, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { AccountCredits, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type {
  GetCatalogParams,
  GetGenerationCostParams,
  GetModelCapabilityParams,
  GetModelsForSourceParams,
  GetOrCreditsParams,
  RefreshCatalogParams,
  ResolveChatParams,
  ResolveRoleParams,
  TestClaudeAuthParams,
} from "./params";
import type { AgentSdkCatalogSnapshot, CatalogSnapshot, OrSkinTierModels, SourceModelsResult } from "./results";

/** credentials.resolve — resolve the brand-protected credential for a `{principal, source}`. */
type ResolveCredentialOp = (params: { readonly principal: Principal; readonly source: CredentialSource }) => Promise<ResolvedCredential>;

/** infra/providers.fetchOrCatalog — the live OpenRouter `/models` fetch (keyless, no credential). */
type FetchOrCatalogOp = (req: { readonly signal?: AbortSignal | undefined }) => Promise<ModelCatalogEntry[]>;

/** infra/providers.fetchAgentSdkModels — the live agent-sdk `supportedModels()` discovery. */
type FetchAgentSdkModelsOp = (req: { readonly signal?: AbortSignal | undefined }) => Promise<AgentSdkModel[]>;

/** settings.loadUserSettings — the parsed per-user UserSettings; connection is a consumer, not an owner. */
type LoadUserSettingsOp = (userId: UserId) => Promise<UserSettings>;

/** infra/providers.verifyAuth — the host-Claude auth-verify diagnostic (which credential the spawned
 *  runtime used). The credential is the owner-gated `max-pro-sub` mint this domain resolves first. */
type VerifyClaudeAuthOp = (req: { readonly credential: ResolvedCredential; readonly model: string }) => Promise<VerifyAuthResult>;

/** infra/providers.accountCredits — the OpenRouter credit-balance read. */
type AccountCreditsOp = (req: { readonly credential: ResolvedCredential; readonly signal?: AbortSignal | undefined }) => Promise<AccountCredits>;

/** infra/providers.generationCost — the settled upstream cost of one generation, read with the billing key. */
type GenerationCostOp = (req: {
  readonly credential: ResolvedCredential;
  readonly generationId: string;
  readonly signal?: AbortSignal | undefined;
}) => Promise<GenerationCost>;

/** The DI bundle the connection verbs close over (wired at the entry composition root). */
export interface ConnectionContext {
  readonly db: Db;
  readonly now: () => number;
  readonly resolveCredential: ResolveCredentialOp;
  readonly fetchOrCatalog: FetchOrCatalogOp;
  readonly fetchAgentSdkModels: FetchAgentSdkModelsOp;
  readonly loadUserSettings: LoadUserSettingsOp;
  readonly verifyClaudeAuth: VerifyClaudeAuthOp;
  readonly accountCredits: AccountCreditsOp;
  readonly generationCost: GenerationCostOp;
  /** The boot GPU/vLLM-availability fact. When `false`, `resolveRole` reroutes derive roles (embed/
   *  rerank/imageEmbed) that resolved to `vllm` onto the in-process `local-light` tier. */
  readonly vllmAvailable: boolean;
  /** Owner-ness of the acting principal. Read by `resolveRole('chat')` for the owner-conditional default. */
  readonly isOwner: (principal: Principal) => boolean;
  /** The local-light builtin model trio (embed/imageEmbed/rerank), injected at the composition root. A
   *  display fact for `getModelsForSource`, never a stamped value. */
  readonly localLightDefaults: {
    readonly embed: string;
    readonly imageEmbed: string;
    readonly rerank: string;
  };
}

/** What `createConnectionService` receives from the entry root; identical to {@link ConnectionContext}. */
export type ConnectionServiceDeps = ConnectionContext;

/** The connection surface — selection, not execution. None carry `runner`/`family` (sealed in infra). */
export interface ConnectionService {
  readonly resolveRole: (params: ResolveRoleParams) => Promise<ResolvedConnection>;
  readonly resolveChat: (params: ResolveChatParams) => Promise<ResolvedConnection>;
  readonly getModelCapability: (params: GetModelCapabilityParams) => Promise<ModelCapability>;
  /** Derive the mode-2 (OR-Anthropic skin) tier→OpenRouter-slug map from the two live catalogs this domain
   *  holds. Never throws — a cold catalog degrades to the curated shortlist. */
  readonly getOrSkinTierModels: () => Promise<OrSkinTierModels>;
  /** The read-only Connections role-slot picker facade — zero outbound fetch, safe as a query. */
  readonly getModelsForSource: (params: GetModelsForSourceParams) => Promise<SourceModelsResult>;
  readonly getCatalog: (params: GetCatalogParams) => Promise<CatalogSnapshot>;
  readonly refreshCatalog: (params: RefreshCatalogParams) => Promise<CatalogSnapshot>;
  /** The agent-sdk daemon's family→version catalog, separate from the OR catalog verbs above. */
  readonly getAgentSdkCatalog: (params: GetCatalogParams) => Promise<AgentSdkCatalogSnapshot>;
  readonly refreshAgentSdkCatalog: (params: RefreshCatalogParams) => Promise<AgentSdkCatalogSnapshot>;
  /** The max-pro-sub health check: resolve the owner-gated credential, then run a tiny SDK verify turn. */
  readonly testClaudeAuth: (params: TestClaudeAuthParams) => Promise<VerifyAuthResult>;
  /** The caller's OpenRouter credit balance. No/revoked key → `DomainNoCredentialError`, never a fabricated zero. */
  readonly getOrCredits: (params: GetOrCreditsParams) => Promise<AccountCredits>;
  /** The settled cost of one OpenRouter generation, read with the caller's billing key. */
  readonly getGenerationCost: (params: GetGenerationCostParams) => Promise<GenerationCost>;
}
