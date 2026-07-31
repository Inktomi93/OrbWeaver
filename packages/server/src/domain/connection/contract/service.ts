// domain/connection/contract/service — the typed API surface: ConnectionContext (the DI bundle) +
// ConnectionService (selection, not execution). Every cross-feature/infra dep arrives as an injected op,
// wired at the composition root; connection sideways-imports no sibling runtime.

import type {
  AgentSdkModel,
  ChatSendAvailability,
  CredentialSource,
  ModelCatalogEntry,
  ResolvedChatCapability,
  ResolvedConnection,
} from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { AccountCredits, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { EnginesPosture } from "#foundation/env";
import type {
  CheckChatAvailabilityParams,
  GetCatalogParams,
  GetGenerationCostParams,
  GetModelsForSourceParams,
  GetOrCreditsParams,
  RefreshCatalogParams,
  ResolveChatCapabilityParams,
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

/** The vLLM engine axis as the CONNECTION domain consumes it (window self-report keying). Homed here —
 *  the substrate cache + resolve-role derive from this tuple; infra's launch-side VLLM_ENGINES is the
 *  spawn axis (same members, different layer — the domain never imports infra for a type). */
const VLLM_WINDOW_ENGINES = ["embed", "rerank", "gen"] as const;
export type VllmWindowEngine = (typeof VLLM_WINDOW_ENGINES)[number];

/** infra/providers.fetchVllmGenWindow — the gen engine's self-reported context window (loopback
 *  `/v1/models` → `max_model_len`). `null` when the engine is unreachable/warming — the resolver then
 *  falls back to the env-owned window. Takes the engine (gen for the fit ceiling; embed/rerank for the
 *  pooling window the local-light capability + parity consume). */
type FetchVllmGenWindowOp = (req: { readonly engine: VllmWindowEngine; readonly signal?: AbortSignal | undefined }) => Promise<number | null>;

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

/** The LOCAL vLLM gen engine's live reachability, in a DOMAIN-SAFE vocab (the infra `EngineStatusRecord`
 *  status tuple never crosses the providers boundary). `up` = serving now; `asleep` = slept but wakes on the
 *  turn; `warming` = spawned/starting or stack-pending (coming up, don't refuse); `down` = not running and not
 *  coming up on its own (down/hung/foreign/failed); `unknown` = no supervisor telemetry yet / vLLM disabled
 *  (never refuse on missing telemetry). Compose maps the sealed infra status → this. */
const LOCAL_ENGINE_REACHABILITIES = ["up", "asleep", "warming", "down", "unknown"] as const;
export type LocalEngineReachability = (typeof LOCAL_ENGINE_REACHABILITIES)[number];

/** infra/providers vLLM supervisor → the chat GEN engine's live reachability. A pure local read (no network),
 *  wired at the composition root; `unknown` when there is no supervisor (vLLM disabled) or no tick yet. */
type LocalGenEngineReachabilityOp = () => LocalEngineReachability;

/** The DI bundle the connection verbs close over (wired at the entry composition root). */
export interface ConnectionContext {
  readonly db: Db;
  readonly now: () => number;
  readonly resolveCredential: ResolveCredentialOp;

  readonly fetchOrCatalog: FetchOrCatalogOp;
  readonly fetchAgentSdkModels: FetchAgentSdkModelsOp;
  readonly fetchVllmGenWindow: FetchVllmGenWindowOp;
  readonly loadUserSettings: LoadUserSettingsOp;

  readonly verifyClaudeAuth: VerifyClaudeAuthOp;
  readonly accountCredits: AccountCreditsOp;
  readonly generationCost: GenerationCostOp;
  /** The boot GPU/vLLM-availability fact. When `false`, `resolveRole` reroutes derive roles (embed/
   *  rerank/imageEmbed) that resolved to `vllm` onto the in-process `local-light` tier. */
  readonly vllmAvailable: boolean;
  /** The effective engine POSTURE (foundation). The send-availability gate (#54) refuses a DOWN local engine
   *  ONLY under `adopt-only` (a passive consumer that never spawns); under `adopt-or-start` the fleet manager
   *  spawns on the turn, so a down engine is still AVAILABLE (cold-slow, not doomed). `off` = disabled. */
  readonly enginesPosture: EnginesPosture;
  /** The chat GEN engine's live reachability (domain-safe vocab), read by the send-availability gate to refuse
   *  a DOWN local engine under adopt-only. Cheap local read; `unknown` ⇒ never refuse. */
  readonly localGenEngineReachability: LocalGenEngineReachabilityOp;
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
  /** The caller's OWN resolved chat connection — the `(api, source, model)` a turn would run as PLUS its
   *  `ModelCapability` — resolved END-TO-END in one hop. The client params-panel + rpg lite gate read the
   *  descriptor; the Connections pane reads the identity to NAME the fallback a never-saved row resolves to
   *  (a vLLM-default chat resolves the same here as at the engine). Collapses the former selection→descriptor
   *  round-trip (it superseded the standalone `getModelCapability` verb, deleted 2026-07-31 — AU-5). */
  readonly resolveChatCapability: (params: ResolveChatCapabilityParams) => Promise<ResolvedChatCapability>;
  /** The deterministic pre-send serveability verdict for a chat's OWN resolved connection (#54) — "would
   *  `resolveChat → deriveRunner → requireBackend` succeed WITHOUT firing a turn/API call?" Mirrors the turn's
   *  selection + coherence + credential-presence + engine-presence and NEVER pre-flights a hosted api. */
  readonly checkChatAvailability: (params: CheckChatAvailabilityParams) => Promise<ChatSendAvailability>;
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
