// infra/providers/contract/backend — THE SEALED-BACKEND CONTRACT. The interface every sealed backend
// (openrouter / agent-sdk / vllm / custom-byo) implements, the two infra-internal dispatch axes, the
// registry the composition root fills, and the bound role surface (`ProviderExecutor`) connection/chat/
// buddy call. This is the seam the three backend agents fulfill WITHOUT touching the role firewall.
//
// THE TWO SEALED AXES (infra-internal, never leak to a domain — providers.md §7.5):
//   • BackendKey (BACKEND_KEYS) — the `runner` axis: `agent-sdk | openrouter | vllm | local-light |
//     custom-openai`. Derived inside providers from {api, source} via `deriveRunner` / `backendForSource`;
//     a domain never names it. NOT a `@orb/contracts` union (the runner axis stays infra-sealed entirely).
//   • ProviderRole (PROVIDER_ROLES) — the 7 inference roles. A providers-local axis used by the
//     firewall policy table + the registry key checks; the public surface is the role FUNCTIONS.
//
// The `credential.source` axis is NOT redeclared here — it is `CredentialSource` from
// `@orb/contracts/credentials` (D31), imported by the dispatch + firewall.

import type { ChatApi, ModelCatalogEntry } from "@orb/contracts/connection";
import type { CredentialHealth, CredentialSource } from "@orb/contracts/credentials";
import type {
  AccountCredits,
  EmbedResult,
  EndpointInspection,
  GenerationCost,
  ImageEmbedResult,
  RerankResult,
  SummarizeResult,
  VerifyAuthResult,
} from "@orb/contracts/providers";
import type { AgentTurnRequest } from "./agent";
import type { ChatRequest, ChatResult } from "./chat";
import type {
  AccountCreditsRequest,
  FetchCatalogRequest,
  GenerationCostRequest,
  InspectRequest,
  ProbeRequest,
  VerifyAuthRequest,
} from "./diagnostics";
import type {
  EmbedRequest,
  ImageEmbedRequest,
  ImageGenerateRequest,
  ImageGenerateResult,
  RerankRequest,
  SummarizeRequest,
} from "./roles";

// --- The sealed backend-key axis (the `runner`) ------------------------------
/** The sealed backend keys a role dispatches to. `custom-openai` (hyphen) is the runner key; the
 *  credential source is `custom_openai` (underscore) — they are deliberately distinct spellings.
 *  `local-light` is the in-process transformers.js/ONNX backend (D39 — embed/rerank/imageEmbed only). */
export const BACKEND_KEYS = [
  "agent-sdk",
  "openrouter",
  "vllm",
  "local-light",
  "custom-openai",
] as const;
export type BackendKey = (typeof BACKEND_KEYS)[number];

// --- The inference-role axis -------------------------------------------------
/** The 7 inference roles `connection.resolveRole` resolves and the firewall gates. */
export const PROVIDER_ROLES = [
  "chat",
  "agent",
  "embed",
  "rerank",
  "imageEmbed",
  "summarize",
  "generateImage",
] as const;
export type ProviderRole = (typeof PROVIDER_ROLES)[number];

// --- The sealed-backend contract ---------------------------------------------
/**
 * The interface EVERY sealed backend implements. Each method is OPTIONAL: a backend implements only the
 * roles + diagnostics it serves (the remote backends serve `chat`; vLLM serves five roles; agent-sdk serves
 * chat + agent; openrouter additionally serves probe/accountCredits/generationCost/fetchCatalog; custom-byo
 * serves `inspect`). The role + diagnostic dispatchers fail-close with a typed {@link ProviderError} when a
 * resolved backend doesn't implement the requested verb. Methods are property-style (no `this`), so a
 * dispatcher can pull the function off and call it directly.
 *
 * The three backend agents each export a factory (e.g. `createOpenRouterBackend(deps): ProviderBackend`)
 * returning a `{ key, …role methods }` object; `entry/` wires them into a {@link BackendRegistry}.
 */
export interface ProviderBackend {
  /** The sealed key this backend registers under (must match its registry slot). */
  readonly key: BackendKey;
  readonly runChatTurn?: ((req: ChatRequest) => Promise<ChatResult>) | undefined;
  readonly runAgentTurn?: ((req: AgentTurnRequest) => Promise<ChatResult>) | undefined;
  readonly embed?: ((req: EmbedRequest) => Promise<EmbedResult>) | undefined;
  readonly rerank?: ((req: RerankRequest) => Promise<RerankResult>) | undefined;
  readonly imageEmbed?: ((req: ImageEmbedRequest) => Promise<ImageEmbedResult>) | undefined;
  readonly summarize?: ((req: SummarizeRequest) => Promise<SummarizeResult>) | undefined;
  readonly generateImage?:
    | ((req: ImageGenerateRequest) => Promise<ImageGenerateResult>)
    | undefined;
  // ── Diagnostics (the family-agnostic credential surfaces; a backend implements only what it serves) ──
  readonly probe?: ((req: ProbeRequest) => Promise<CredentialHealth>) | undefined;
  readonly accountCredits?: ((req: AccountCreditsRequest) => Promise<AccountCredits>) | undefined;
  readonly generationCost?: ((req: GenerationCostRequest) => Promise<GenerationCost>) | undefined;
  readonly inspect?: ((req: InspectRequest) => Promise<EndpointInspection>) | undefined;
  readonly verifyAuth?: ((req: VerifyAuthRequest) => Promise<VerifyAuthResult>) | undefined;
  readonly fetchCatalog?: ((req: FetchCatalogRequest) => Promise<ModelCatalogEntry[]>) | undefined;
}

/** The backend registry the composition root fills (one entry per WIRED backend). A role that resolves
 *  to an unwired key fail-closes (a missing wire is an operator error, not a silent default). */
export type BackendRegistry = ReadonlyMap<BackendKey, ProviderBackend>;

/** The deps the role dispatchers close over — wired once at boot. */
export interface ProviderDeps {
  readonly backends: BackendRegistry;
}

// --- The bound role surface (what connection/chat/buddy call) ----------------
/**
 * The bound inference role surface — `createProviderExecutor(deps)` returns this. Each method runs the
 * firewall check, derives the sealed backend, and dispatches. Consumers (connection, chat, buddy,
 * embeddings/search/discovery via RoleClients) call these and never see a backend key or a runner.
 */
export interface ProviderExecutor {
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  readonly runAgentTurn: (req: AgentTurnRequest) => Promise<ChatResult>;
  readonly embed: (req: EmbedRequest) => Promise<EmbedResult>;
  readonly rerank: (req: RerankRequest) => Promise<RerankResult>;
  readonly imageEmbed: (req: ImageEmbedRequest) => Promise<ImageEmbedResult>;
  readonly summarize: (req: SummarizeRequest) => Promise<SummarizeResult>;
  readonly generateImage: (req: ImageGenerateRequest) => Promise<ImageGenerateResult>;
}

// --- The credential firewall (the policy input) ------------------------------
/**
 * The input to the firewall check (`assertCredentialAllowed`). The dispatch routes through it BEFORE
 * deriving a backend (fail-closed). `api` is present for chat/agent; `ownerConsented` carries the D17
 * turn-time consent belt for a `max-pro-sub`-funded turn.
 */
export interface FirewallRequest {
  readonly role: ProviderRole;
  readonly source: CredentialSource;
  readonly api?: ChatApi | undefined;
  readonly ownerConsented?: boolean | undefined;
}
