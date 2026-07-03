// domain/connection/contract/params — every verb's *Params, declared ONCE (§7.4). The acting `principal`
// (resolved at the entry seam) scopes the user's routing settings; connection NEVER reads the `users`
// table (no-direct-users-read). The cross-boundary input shapes (`RoutableChat`, the `ChatApi`/`ChatSource`
// axes, `RoutingRoleKey`) live in `@orb/contracts/connection`; the verb param wrappers live here.

import type { ChatApi, ChatSource, RoutableChat, RoutingRoleKey } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { ModelId } from "@orb/kit/ids";

/**
 * The per-agent connection override (participants-agents-identity.md §2): a character/buddy participant can
 * run on its OWN backend/model, beating the role default. All fields optional — an unset field falls
 * through to the role default. `resolveRole` applies it over `routing.roleDefaults.<role>`.
 */
export interface AgentOverride {
  readonly api?: ChatApi | undefined;
  readonly source?: ChatSource | undefined;
  readonly model?: string | null | undefined;
}

/** `resolveRole(params)` — the one resolver for all 7 roles. Reads `routing.roleDefaults.<role>` for the
 *  principal, applies the optional per-agent override, returns the resolved
 *  `{api, model, credential, capability}`. */
export interface ResolveRoleParams {
  readonly role: RoutingRoleKey;
  readonly principal: Principal;
  readonly agentOverride?: AgentOverride | undefined;
}

/** `resolveChat(params)` — the chat-specific overlay. The chat row's routing fields (`routableChat`) BEAT
 *  the UserSettings `roleDefaults.chat` overlay (read inside via `resolveRole`); the per-field merge +
 *  model heal then yield the resolved connection. */
export interface ResolveChatParams {
  readonly principal: Principal;
  readonly routableChat: RoutableChat;
}

/** `getModelCapability(params)` — resolve the ONE descriptor for a `(model, source)` (feeds the params
 *  panel + an active request). `model` is a curated branded id OR a plain OR id; `source` selects the arm. */
export interface GetModelCapabilityParams {
  readonly model: ModelId | string;
  readonly source: ChatSource;
}

/** `getCatalog(params)` — read the OR catalog snapshot (seeds the in-memory cache). `signal` for parity
 *  with the other I/O verbs; the read itself is a db query. */
export interface GetCatalogParams {
  readonly signal?: AbortSignal | undefined;
}

/** `refreshCatalog(params)` — fetch OR `/models`, write the KV snapshot, warm the cache. */
export interface RefreshCatalogParams {
  readonly signal?: AbortSignal | undefined;
}

/** `testClaudeAuth` input — the acting principal (the owner gate runs inside `credentials.resolve`
 *  for the `max-pro-sub` source, D17; connection never re-checks it). */
export interface TestClaudeAuthParams {
  readonly principal: Principal;
}

/** `getOrCredits` input — the acting principal (the key is the caller's own `openrouter` credential). */
export interface GetOrCreditsParams {
  readonly principal: Principal;
  readonly signal?: AbortSignal | undefined;
}

/** `getGenerationCost` input — the principal + the upstream generation id to settle. */
export interface GetGenerationCostParams {
  readonly principal: Principal;
  readonly generationId: string;
  readonly signal?: AbortSignal | undefined;
}
