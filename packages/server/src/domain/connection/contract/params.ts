// domain/connection/contract/params — every verb's *Params, declared ONCE (§7.4). The acting `principal`
// (resolved at the entry seam) scopes the user's routing settings; connection NEVER reads the `users`
// table (no-direct-users-read). The cross-boundary input shapes (`RouteChatAssignment`, the `ChatApi`/`CredentialSource`
// axes, `RoutingRoleKey`) live in `@orb/contracts/connection`; the verb param wrappers live here.

import type { ChatApi, CredentialSource, RouteChatAssignment, RoutingRoleKey } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { ModelId, UserId } from "@orb/kit/ids";

/**
 * The per-agent connection override (core/Spine-Identity-and-Auth.md §4 — agents first-class): a character/buddy participant can
 * run on its OWN backend/model, beating the role default. All fields optional — an unset field falls
 * through to the role default. `resolveRole` applies it over `routing.roleDefaults.<role>`.
 */
export interface AgentOverride {
  readonly api?: ChatApi | undefined;
  readonly source?: CredentialSource | undefined;
  readonly model?: string | null | undefined;
}

/** `resolveRole(params)` — the one resolver for all 7 roles. Reads `routing.roleDefaults.<role>` for the
 *  principal, applies the optional per-agent override, returns the resolved
 *  `{api, model, credential, capability}`. */
export interface ResolveRoleParams {
  readonly role: RoutingRoleKey;
  readonly principal: Principal;
  readonly agentOverride?: AgentOverride | undefined;
  /** The SPEAKING agent's principal id (D67 amendment): when set on an `agent`-role resolve, its stored
   *  per-agent connection (`routing.agentConnections[id]`) beats `roleDefaults.agent`. Absent ⇒ the default
   *  agent connection (solo buddy, crew, and any agent with no override). Looked up against `principal`'s
   *  settings (funding follows the acting principal, D19). */
  readonly agentPrincipalId?: UserId | undefined;
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

/** `probeComfyui` input (MA-8/D96) — the acting principal (authed browse of the owner-configured ComfyUI
 *  endpoint; no owned id). The probe hits the deployment-global endpoint, not a per-user resource. */
export interface ProbeComfyuiParams {
  readonly principal: Principal;
}

/** `getGenerationCost` input — the principal + the upstream generation id to settle. */
export interface GetGenerationCostParams {
  readonly principal: Principal;
  /** OpenRouter's UPSTREAM generation handle (THEIR id namespace, opaque to us) — deliberately NOT a
   *  branded orbweaver id (`ImageryGenerationId` is ours; this is foreign wire vocab. 2026-07-09 audit). */
  readonly generationId: string;
  readonly signal?: AbortSignal | undefined;
}
