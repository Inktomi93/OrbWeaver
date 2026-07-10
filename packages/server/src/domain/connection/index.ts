// domain/connection — FRONT DOOR: the only legal external import (domain-feature-front-door). Re-exports
// the public surface:
//   • createConnectionService — the factory the entry composition root wires.
//   • the service contract + its DI bundle/deps types (transport/tests reference the service type).
//   • the verb param/result shapes + the client-facing views.
//   • the typed errors.
// The cross-boundary types — ResolvedConnection, ModelCapability, ChatApi, ChatSource, RoutingRoleKey,
// ModelCatalogEntry, ChatModelId, DEFAULT_CHAT_MODEL_ID, DEFAULT_OR_CHAT_MODEL_ID — live in
// `@orb/contracts/connection`; callers (chat, buddy, workloads, transport, client) import them from there
// directly, NOT through this door (§7.4 — one home, contracts is the cross-boundary node). The curated
// `CHAT_MODELS` catalog + `getChatModel` are connection-internal (the `catalog/` subsystem) — never exported.

export {
  AgentSdkCatalogUnavailableError,
  CatalogUnavailableError,
  ConnectionRoutingError,
} from "./contract/errors";
export type {
  AgentOverride,
  GetCatalogParams,
  GetGenerationCostParams,
  GetModelCapabilityParams,
  GetOrCreditsParams,
  RefreshCatalogParams,
  ResolveChatParams,
  ResolveRoleParams,
  TestClaudeAuthParams,
} from "./contract/params";
export type { AgentSdkCatalogSnapshot, CatalogSnapshot } from "./contract/results";
export type {
  ConnectionContext,
  ConnectionService,
  ConnectionServiceDeps,
} from "./contract/service";
export type { ModelCapabilityView, ModelCatalogView } from "./contract/views";
export { createConnectionService } from "./service";
