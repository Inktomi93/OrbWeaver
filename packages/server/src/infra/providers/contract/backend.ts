// The sealed-backend contract: every backend (openrouter/agent-sdk/local-light/vllm/
// custom-byo) implements this. BackendKey + ProviderRole are infra-SEALED axes — a domain never names
// them; `credential.source` is `CredentialSource` from @orb/contracts/credentials, never redeclared.

import type { AgentSdkModel, ChatApi, ModelCatalogEntry } from "@orb/contracts/connection";
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
  FetchAgentSdkModelsRequest,
  FetchCatalogRequest,
  GenerationCostRequest,
  InspectRequest,
  ProbeRequest,
  VerifyAuthRequest,
} from "./diagnostics";
import type { EmbedRequest, ImageEmbedRequest, ImageGenerateRequest, ImageGenerateResult, RerankRequest, StructuredRequest, SummarizeRequest } from "./roles";

// --- The sealed backend-key axis (the `runner`) ------------------------------
/** The sealed backend keys a role dispatches to. `custom-openai` (hyphen) is the runner key; the
 *  credential source is `custom_openai` (underscore) — they are deliberately distinct spellings.
 *  `local-light` is the in-process transformers.js/ONNX backend (D39 — embed/rerank/imageEmbed only). */
export const BACKEND_KEYS = ["agent-sdk", "openrouter", "vllm", "local-light", "custom-openai"] as const;
export type BackendKey = (typeof BACKEND_KEYS)[number];

// --- The inference-role axis -------------------------------------------------
/** The inference roles `connection.resolveRole` resolves and the firewall gates. `structured` is the one-shot
 *  schema-constrained generation PRIMITIVE, split from `summarize` (owner ruling 2026-07-27) — summarize is
 *  summarization, structured is constrained output. */
export const PROVIDER_ROLES = ["chat", "agent", "embed", "rerank", "imageEmbed", "summarize", "structured", "generateImage"] as const;
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
  /** The one-shot schema-constrained generation primitive (`structured` role). Returns the SAME
   *  {@link SummarizeResult} — each item's `text` is the schema-conforming JSON. Backends that can't
   *  constrain output don't implement it (dispatch fail-closes). */
  readonly structured?: ((req: StructuredRequest) => Promise<SummarizeResult>) | undefined;
  readonly generateImage?: ((req: ImageGenerateRequest) => Promise<ImageGenerateResult>) | undefined;
  // ── Diagnostics (the family-agnostic credential surfaces; a backend implements only what it serves) ──
  readonly probe?: ((req: ProbeRequest) => Promise<CredentialHealth>) | undefined;
  readonly accountCredits?: ((req: AccountCreditsRequest) => Promise<AccountCredits>) | undefined;
  readonly generationCost?: ((req: GenerationCostRequest) => Promise<GenerationCost>) | undefined;
  readonly inspect?: ((req: InspectRequest) => Promise<EndpointInspection>) | undefined;
  readonly verifyAuth?: ((req: VerifyAuthRequest) => Promise<VerifyAuthResult>) | undefined;
  readonly fetchCatalog?: ((req: FetchCatalogRequest) => Promise<ModelCatalogEntry[]>) | undefined;
  /** The agent-sdk `supportedModels()` discovery — only the agent-sdk backend serves it (OR serves
   *  `fetchCatalog`). Distinct verb so the two catalogs never co-mingle at the dispatch. */
  readonly fetchModels?: ((req: FetchAgentSdkModelsRequest) => Promise<AgentSdkModel[]>) | undefined;
}

/**
 * TASK-24 wire-capture sink — the send-boundary hook a backend calls with the FINAL request body it sends,
 * so the four-layer fidelity harness can read the real wire (see foundation `wire-capture.ts`). Compose-
 * injected (ExtractQuiet-style), threaded through each backend's own factory deps — NEVER a module global,
 * so a test that doesn't wire it gets zero writes. Absent ⇒ the send boundary is a plain send (no capture).
 *
 * `body` is the backend's OWN TRUE wire vocabulary — the caller does NOT normalize across backends (the api
 * axis: Anthropic vs OpenAI wire differ BY DESIGN). Fidelity is per-backend: vLLM + custom-byo pass the literal
 * `fetch` body (custom-byo scrubs credential literals by value first — `includeBody` can carry key-in-body
 * auth); OpenRouter re-parses the body through the SDK's own `$outboundSchema` at the capture site so the
 * recorded bytes are the snake_case literal wire, not the pre-serialize SDK input; agent-sdk has no observable
 * HTTP body (the SDK subprocess builds it), so its `body` is the SDK QUERY INPUT. The sink is defined here (the
 * sealed-backend contract home) so the two send boundaries share ONE shape; foundation owns the ring.
 */
export type WireCaptureSink = (entry: {
  readonly chatId: string | undefined;
  readonly api: string;
  readonly backend: BackendKey;
  readonly model: string;
  readonly body: Record<string, unknown>;
}) => void;

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
  /** The one-shot schema-constrained generation primitive (split from `summarize` — owner ruling). */
  readonly structured: (req: StructuredRequest) => Promise<SummarizeResult>;
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
