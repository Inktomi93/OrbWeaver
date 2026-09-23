// The sealed-backend contract: ONE backend per WIRE (`BACKEND_DEFS: Record<Wire, …>`), each implementing
// only the tasks + diagnostics its wire serves (`WIRE_DEFS[wire].serves` is pinned against the implemented
// methods by a table test). Dispatch is `BACKEND_DEFS[connection.provider.wire]` — no `(api, source)`
// matrix, no firewall, no consent belt. A wire's backend fail-closes with a typed `ProviderError` when asked
// for a method it lacks.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { ModelListing, Wire } from "@orb/contracts/inference";
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
import type { ChatId } from "@orb/kit/ids";
import type { AgentTurnRequest } from "./agent.ts";
import type { ChatRequest, ChatResult } from "./chat.ts";
import type { AccountCreditsRequest, GenerationCostRequest, InspectRequest, ListModelsRequest, ProbeRequest, VerifyAuthRequest } from "./diagnostics.ts";
import type {
  EmbedRequest,
  ImageEmbedRequest,
  ImageGenerateRequest,
  ImageGenerateResult,
  RerankRequest,
  StructuredRequest,
  SummarizeRequest,
} from "./roles.ts";

/** The interface EVERY wire's backend implements. Methods are property-style (no `this`) so a dispatcher can
 *  pull the function off and call it directly. */
export interface ProviderBackend {
  readonly wire: Wire;
  readonly runChatTurn?: ((req: ChatRequest) => Promise<ChatResult>) | undefined;
  readonly runAgentTurn?: ((req: AgentTurnRequest) => Promise<ChatResult>) | undefined;
  readonly embed?: ((req: EmbedRequest) => Promise<EmbedResult>) | undefined;
  readonly rerank?: ((req: RerankRequest) => Promise<RerankResult>) | undefined;
  readonly imageEmbed?: ((req: ImageEmbedRequest) => Promise<ImageEmbedResult>) | undefined;
  readonly summarize?: ((req: SummarizeRequest) => Promise<SummarizeResult>) | undefined;
  /** Returns the SAME `SummarizeResult` — each item's `text` is the schema-conforming JSON. */
  readonly structured?: ((req: StructuredRequest) => Promise<SummarizeResult>) | undefined;
  readonly generateImage?: ((req: ImageGenerateRequest) => Promise<ImageGenerateResult>) | undefined;
  readonly probe?: ((req: ProbeRequest) => Promise<CredentialHealth>) | undefined;
  readonly accountCredits?: ((req: AccountCreditsRequest) => Promise<AccountCredits>) | undefined;
  readonly generationCost?: ((req: GenerationCostRequest) => Promise<GenerationCost>) | undefined;
  readonly inspect?: ((req: InspectRequest) => Promise<EndpointInspection>) | undefined;
  readonly verifyAuth?: ((req: VerifyAuthRequest) => Promise<VerifyAuthResult>) | undefined;
  readonly listModels?: ((req: ListModelsRequest) => Promise<ModelListing>) | undefined;
}

/** The wire-capture sink — the send-boundary hook a backend calls with the FINAL request body, so the
 *  fidelity harness reads the real wire. Compose-injected, never a module global. `body` is the backend's
 *  OWN wire vocabulary (the api axis: the Anthropic and OpenAI wires differ BY DESIGN), SECRET-SCRUBBED BY
 *  VALUE before it is handed here (`transport.includeBody` can carry key-in-body auth). The agent-sdk wire
 *  has no observable HTTP body; its `body` is the SDK query input. */
export type WireCaptureSink = (entry: {
  readonly chatId: ChatId | undefined;
  readonly api: string;
  readonly wire: Wire;
  readonly providerId: string;
  readonly model: string;
  readonly body: Record<string, unknown>;
  /** WHAT CAME BACK'S envelope (§D1): the response headers, lower-cased, secret-scrubbed by value like the
   *  body. This is where the support handle and the rate-limit budget live — Anthropic's `request-id` +
   *  `anthropic-ratelimit-*`, OpenRouter's `x-openrouter-*` routing trail — and without them a captured
   *  request cannot be correlated with anything the provider logged. Absent when the transport never
   *  produced a response (a socket failure still records the request that caused it). */
  readonly responseHeaders?: Readonly<Record<string, string>> | undefined;
  /** WHAT CAME BACK'S BODY (§D2/§D3), as literal wire TEXT — the SSE frame stream or the JSON body, head-capped
   *  and secret-scrubbed by value exactly like `body`. Rides the SAME entry as the request that produced it,
   *  so one ring row is one send. Present ONLY when the send boundary was asked for it (the reply tap is
   *  opt-in and independently off — a process-tier decision, never implied by the request capture), and absent
   *  on the agent-sdk wire, which has no observable HTTP body at all. This is where OpenRouter's
   *  `debug.echo_upstream_body` first frame lands. */
  readonly responseBody?: string | undefined;
}) => void;

/** The registry the runtime builds: one entry per wire whose `needs` were present at construction. A task
 *  that resolves to an absent wire fail-closes (`unavailable` — an operator error, never a silent default). */
export type BackendRegistry = ReadonlyMap<Wire, ProviderBackend>;

/** The bound task surface — `createProviderExecutor(registry)` returns this. Consumers call these with a
 *  `Resolved` connection and never see a wire or a backend. */
export interface ProviderExecutor {
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  readonly runAgentTurn: (req: AgentTurnRequest) => Promise<ChatResult>;
  readonly embed: (req: EmbedRequest) => Promise<EmbedResult>;
  readonly rerank: (req: RerankRequest) => Promise<RerankResult>;
  readonly imageEmbed: (req: ImageEmbedRequest) => Promise<ImageEmbedResult>;
  readonly summarize: (req: SummarizeRequest) => Promise<SummarizeResult>;
  readonly structured: (req: StructuredRequest) => Promise<SummarizeResult>;
  readonly generateImage: (req: ImageGenerateRequest) => Promise<ImageGenerateResult>;
}
