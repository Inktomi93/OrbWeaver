// verb: resolveChat — the chat-specific overlay (`resolveRole` is the generic 7-role path). The chat
// row's routing fields (`routableChat`) BEAT the per-user `roleDefaults.chat` overlay, which beats the
// system default. The precedence falls out of the layering: this verb passes the row's fields as the
// `agentOverride`, and `resolveRole('chat')` reads `roleDefaults.chat` as the base BENEATH the override and
// performs the heal + credential + capability assembly. So `resolveChat` is a thin adapter — it does NOT
// re-implement the resolution (one home: `resolveRole`).
//
// `resolveRole` is injected at the composition root (service.ts) rather than imported sibling-verb→verb —
// the dependency is explicit at the root. `providerRouting` rides on the row/overlay (RouteChatAssignment)
// but is NOT part of the resolved 4-tuple (ResolvedConnection = {api, model, credential, capability}). It is
// DORMANT/RESERVED: the OpenRouterProviderRouting contract + the wire projection (resolveProviderPreferences)
// are fully built, but the middle hop from here → ChatRequest.providerRouting is intentionally NOT wired
// (no writer verb, no UI). This verb drops it today; wiring it is a deferred feature, not an accident.

import type { ResolvedConnection } from "@orb/contracts/connection";
import type { ResolveChatParams, RouteOverride } from "../contract/params";
import type { ConnectionService } from "../contract/service";

export function createResolveChat(resolveRole: ConnectionService["resolveRole"]): ConnectionService["resolveChat"] {
  return (params: ResolveChatParams): Promise<ResolvedConnection> => {
    const routeOverride: RouteOverride = {
      api: params.routableChat.api,
      source: params.routableChat.source,
      model: params.routableChat.model,
    };
    return resolveRole({ role: "chat", principal: params.principal, routeOverride });
  };
}
