// domain/connection/contract/params — every verb's *Params, declared ONCE (§7.4). The acting `principal`
// (resolved at the entry seam) scopes the user's routing settings; connection NEVER reads the `users`
// table (no-direct-users-read). The cross-boundary input shapes (`RouteChatAssignment`, the `ChatApi`/`CredentialSource`
// axes, `RoutingRoleKey`) live in `@orb/contracts/connection`; the verb param wrappers live here.

import type { ChatApi, CredentialSource, RouteChatAssignment, RoutingRoleKey } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { ModelId } from "@orb/kit/ids";

export interface RouteOverride {
  readonly api?: ChatApi | undefined;
  readonly source?: CredentialSource | undefined;
  readonly model?: ModelId | string | null | undefined;
}

/** `resolveRole(params)` — the one resolver for all 7 roles. Reads `routing.roleDefaults.<role>` for the
 *  principal, applies the optional per-role override, returns the resolved
 *  `{api, model, credential, capability}`. */
export interface ResolveRoleParams {
  readonly role: RoutingRoleKey;
  readonly principal: Principal;
  readonly routeOverride?: RouteOverride;
}

/** `resolveChat(params)` — the chat-specific overlay. The chat row's routing fields (`routableChat`) BEAT
 *  the UserSettings `roleDefaults.chat` overlay (read inside via `resolveRole`); the per-field merge +
 *  model heal then yield the resolved connection. */
export interface ResolveChatParams {
  readonly principal: Principal;
  readonly routableChat: RouteChatAssignment;
}

/** `resolveChatCapability(params)` — resolve the caller's OWN chat-role `ModelCapability` end-to-end
 *  (selection → descriptor) in one hop, for the client params-panel + the rpg lite gate. Reads the acting
 *  principal's settings ONLY — no caller-supplied user id (the cross-tenant-safe posture). */
export interface ResolveChatCapabilityParams {
  readonly principal: Principal;
}

/** `getModelCapability(params)` — resolve the ONE descriptor for a `(model, source, api)` (feeds the params
 *  panel + an active request). `model` is a curated branded id OR a plain OR id; `source` selects the arm;
 *  `api` drives the wire-shape the `turns` cell keys on (D66, part 01 §3). */
export interface GetModelCapabilityParams {
  readonly model: ModelId | string;
  readonly source: CredentialSource;
  readonly api: ChatApi;
}

/** `getModelsForSource(params)` — the read-only Connections picker facade (CONNECTIONS-BUILD-SPEC §2.2).
 *  Reads snapshots/config/state ONLY — ZERO outbound fetch (the SSRF-guarded probes stay on the
 *  `.mutation()`s). `principal` gates `max-pro-sub` (owner) + resolves the per-source credential presence;
 *  `role` selects which config/default the vllm/local-light/custom arms surface. */
export interface GetModelsForSourceParams {
  readonly principal: Principal;
  readonly source: CredentialSource;
  readonly role: RoutingRoleKey;
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
  /** OpenRouter's UPSTREAM generation handle (THEIR id namespace, opaque to us) — deliberately NOT a
   *  branded orbweaver id (`ImageryGenerationId` is ours; this is foreign wire vocab. 2026-07-09 audit). */
  readonly generationId: string;
  readonly signal?: AbortSignal | undefined;
}
