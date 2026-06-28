// biome-ignore-all lint/performance/noBarrelFile: this IS the contract front door by design — the
// `providers-public-surface-only` cruiser rule forbids outside callers from reaching `contract/<file>`,
// so the barrel is load-bearing for the executor's typed surface.
//
// infra/providers/contract — THE BARREL. The one front door for the role request/result shapes + the
// sealed-backend contract. Infra-internal request shapes (ChatRequest variants, AgentTurnRequest, the
// non-chat role requests, ChatEvent/ChatError/wire vocab) live behind this barrel; cross-boundary shapes
// (the role RESULTS, ResolvedCredential, CredentialHealth, ModelCapability) are RE-EXPORTS from
// `@orb/contracts` so a consumer needs ONE import for the whole provider surface (providers.md).

export type { ChatApi, ChatSource, ModelCapability } from "@orb/contracts/connection";
export type {
  CredentialHealth,
  CredentialSource,
  ResolvedCredential,
} from "@orb/contracts/credentials";
// ── Cross-boundary RE-EXPORTS (canonical home is @orb/contracts; surfaced for one-import ergonomics) ─
export type {
  EmbedResult,
  ImageEmbedResult,
  RerankHit,
  RerankResult,
  SummarizeResult,
  SummarizeResultItem,
} from "@orb/contracts/providers";
// ── Infra-internal: the agent role ───────────────────────────────────────────────────────────────
export type { AgentToolServer, AgentTurnRequest } from "./agent";
export type {
  BackendKey,
  BackendRegistry,
  FirewallRequest,
  ProviderBackend,
  ProviderDeps,
  ProviderExecutor,
  ProviderRole,
} from "./backend";
// ── Infra-internal: the sealed-backend contract + dispatch surface ───────────────────────────────
export { BACKEND_KEYS, PROVIDER_ROLES } from "./backend";
export type {
  AgentSdkChatRequest,
  ChatHistoryMessage,
  ChatRequest,
  ChatResult,
  ChatUsage,
  CostDetails,
  NormalizedFinishReason,
  OpenRouterChatRequest,
} from "./chat";
// ── Infra-internal: the chat role (request/result/usage/finish vocab) ────────────────────────────
export { NORMALIZED_FINISH_REASONS, normalizeFinishReason } from "./chat";
export type { ProviderErrorInit, ProviderErrorKind } from "./errors";
// ── Infra-internal: errors ───────────────────────────────────────────────────────────────────────
export { PROVIDER_ERROR_KINDS, ProviderError } from "./errors";
// ── Infra-internal: per-turn observability vocab ─────────────────────────────────────────────────
export type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events";
export type {
  ResolvedChatKnobs,
  ResolvedReasoning,
  ResolvedSampling,
  ResolvedWarning,
  WarningCode,
} from "./resolve";
// ── Infra-internal: the resolve-chat funnel's output shapes ──────────────────────────────────────
export { WARNING_CODES } from "./resolve";
// ── Infra-internal: the non-chat role requests + image-gen result ────────────────────────────────
export type {
  EmbedRequest,
  GeneratedImage,
  ImageEmbedRequest,
  ImageGenerateRequest,
  ImageGenerateResult,
  RerankRequest,
  SummarizeRequest,
  SummarizeRequestItem,
} from "./roles";
