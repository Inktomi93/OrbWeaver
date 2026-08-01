// The ONE home of "which model does a CONFIG-DERIVED source serve for this role?" — the vLLM engine's
// launch model per role (`VLLM_*_MODEL`) and the local-light builtin trio. Two consumers read it and MUST
// agree: `getModelsForSource` (what the Connections pane displays as the row's `defaultModelId`) and
// `resolveRole` (what a turn actually sends). They were separate copies until the copies drifted into a
// 404: the pane showed the engine's configured model while the resolver sent a stale user-pinned id.
//
// Config-derived means the user has NO choice (the engine serves exactly what it was launched with), which
// is why `roleDefaults.<role>.model` stays "" for these sources — see `isConfigDerivedModelSource`.

import type { RoutingRoleKey } from "@orb/contracts/connection";
import { isConfigDerivedModelSource } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import { env } from "#foundation/env";
import type { ConnectionContext } from "../context";

/** The two roles that consume the embed engine (text + image share one 1024-dim space). */
export const EMBED_ROLES: ReadonlySet<RoutingRoleKey> = new Set<RoutingRoleKey>(["embed", "imageEmbed"]);

/** The vLLM launch model for a role. Mirrors `resolve-role.ts`'s per-role selectors; `generateImage` isn't
 *  a vllm role, so the GEN fall-through is harmless (its callers gate that role first). */
export function vllmModelForRole(role: RoutingRoleKey): string {
  if (EMBED_ROLES.has(role)) {
    return env.VLLM_EMBED_MODEL;
  }
  if (role === "rerank") {
    return env.VLLM_RERANK_MODEL;
  }
  return env.VLLM_GEN_MODEL;
}

/** The local-light builtin for a role; `null` for a non-derive role — the in-process tier serves the three
 *  derive roles only (it cannot generate). */
export function localLightModelForRole(role: RoutingRoleKey, trio: ConnectionContext["localLightDefaults"]): string | null {
  if (EMBED_ROLES.has(role)) {
    return role === "imageEmbed" ? trio.imageEmbed : trio.embed;
  }
  if (role === "rerank") {
    return trio.rerank;
  }
  return null;
}

/** The model this `(source, role)` pair is CONFIGURED to serve, or `null` when the source is not
 *  config-derived (openrouter / max-pro-sub / custom_openai pick from a catalog or free text) or serves
 *  this role no model at all (generateImage on vllm; a generation role on local-light). `null` therefore
 *  means "nothing to compare a stored pin against" — never "the pin is fine". */
export function configuredModelForSource(source: CredentialSource, role: RoutingRoleKey, trio: ConnectionContext["localLightDefaults"]): string | null {
  if (!isConfigDerivedModelSource(source)) {
    return null;
  }
  if (source === "local-light") {
    return localLightModelForRole(role, trio);
  }
  return role === "generateImage" ? null : vllmModelForRole(role);
}
