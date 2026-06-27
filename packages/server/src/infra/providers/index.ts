// biome-ignore-all lint/performance/noBarrelFile: this IS the providers public surface by design — the
// `providers-public-surface-only` cruiser rule forbids consumers from reaching into sealed families, so
// the barrel is load-bearing for the encapsulation + firewall invariants.
//
// infra/providers — FRONT DOOR (the CORE: roles + the sealed-backend contract + the credential
// firewall). `createProviderExecutor(deps)` binds the wired {@link BackendRegistry} into the bound role
// surface ({@link ProviderExecutor}) connection/chat/buddy call. The three backend agents (openrouter /
// agent-sdk / vllm+local-light) each export a `ProviderBackend` factory and `entry/` wires them into the
// registry — they fulfill the {@link ProviderBackend} contract WITHOUT touching this core.
//
// NOT here yet (separate slices): the sealed backends (`backends/`, `vllm/`), `resolve-chat.ts` (the
// intent×capability wire-knob funnel), `scripted-override.ts`, and the diagnostic surfaces
// (account/probe/inspect/catalog-fetch). The CORE is role dispatch + contract + firewall only.

import type { ProviderDeps, ProviderExecutor } from "./contract";
import { createAgentRole } from "./roles/agent";
import { createChatRole } from "./roles/chat";
import { createEmbedRole } from "./roles/embed";
import { createGenerateImageRole } from "./roles/generate-image";
import { createImageEmbedRole } from "./roles/image-embed";
import { createRerankRole } from "./roles/rerank";
import { createSummarizeRole } from "./roles/summarize";

/**
 * Compose the bound inference role surface from a wired backend registry. Each role function runs the
 * firewall check, derives the sealed backend, and dispatches (fail-closed on a denied source, an
 * invalid (api, source) pairing, an unwired backend, or a backend that doesn't serve the role).
 */
export function createProviderExecutor(deps: ProviderDeps): ProviderExecutor {
  return {
    runChatTurn: createChatRole(deps),
    runAgentTurn: createAgentRole(deps),
    embed: createEmbedRole(deps),
    rerank: createRerankRole(deps),
    imageEmbed: createImageEmbedRole(deps),
    summarize: createSummarizeRole(deps),
    generateImage: createGenerateImageRole(deps),
  };
}

// ── The contract surface (request/result/error/event vocab + the sealed-backend contract + re-exports) ─
export * from "./contract";
// ── The individual role-dispatcher factories (composed above; exported for targeted wiring/tests) ─
export { createAgentRole } from "./roles/agent";
export { createChatRole } from "./roles/chat";
// ── The firewall + sealed dispatch derivation (for the backend agents + tests) ───────────────────
export { backendForSource, deriveRunner, requireBackend, requireRoleImpl } from "./roles/dispatch";
export { createEmbedRole } from "./roles/embed";
export { assertCredentialAllowed } from "./roles/firewall";
export { createGenerateImageRole } from "./roles/generate-image";
export { createImageEmbedRole } from "./roles/image-embed";
export { createRerankRole } from "./roles/rerank";
export { createSummarizeRole } from "./roles/summarize";
