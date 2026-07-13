// biome-ignore-all lint/performance/noBarrelFile: this IS the providers public surface by design — the
// `providers-public-surface-only` cruiser rule forbids consumers from reaching into sealed families, so
// the barrel is load-bearing for the encapsulation + firewall invariants.

// Front door: roles + the sealed-backend contract + the credential firewall. `createProviderExecutor(deps)`
// binds the wired `BackendRegistry` into the bound role surface. Backend agents each export a
// `ProviderBackend` factory; `entry/` wires them into the registry without touching this core.

import type { AgentSdkBackendDeps } from "./backends/agent-sdk";
import { createAgentSdkBackend } from "./backends/agent-sdk";
import type { AnthDirectBackendDeps } from "./backends/anth-direct";
import { createAnthDirectBackend } from "./backends/anth-direct";
import { createCustomByoBackend } from "./backends/custom-byo";
import { createLocalLightBackend } from "./backends/local-light";
import type { OpenRouterBackendDeps } from "./backends/openrouter";
import { createOpenRouterBackend } from "./backends/openrouter";
import type { BackendRegistry, ProviderBackend, ProviderDeps, ProviderExecutor } from "./contract";
import { createAgentRole } from "./roles/agent";
import { createChatRole } from "./roles/chat";
import { createEmbedRole } from "./roles/embed";
import { createGenerateImageRole } from "./roles/generate-image";
import { createImageEmbedRole } from "./roles/image-embed";
import { createRerankRole } from "./roles/rerank";
import { createSummarizeRole } from "./roles/summarize";
import type { VllmBackendDeps, VllmEngineHandle } from "./vllm";
import { createVllmBackend } from "./vllm";

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

/** Deps the boot binder injects to build the wired backend registry. Optional members are per-backend DI
 *  seams threaded through the sealed front door — the only channel a composition root/test has to reach a
 *  sealed backend's deps without importing it. */
export interface BackendRegistryDeps {
  readonly now: () => number;
  readonly vllmDisabled: boolean;
  readonly vllmConcurrency?: VllmBackendDeps["concurrency"];
  readonly repoRoot?: VllmBackendDeps["repoRoot"];
  readonly random?: OpenRouterBackendDeps["random"];
  readonly getClient?: OpenRouterBackendDeps["getClient"];
  readonly getAnthClient?: AnthDirectBackendDeps["getClient"];
  readonly query?: AgentSdkBackendDeps["query"];
  readonly sessionStore?: AgentSdkBackendDeps["sessionStore"];
  readonly vllmClient?: VllmBackendDeps["client"];
  readonly vllmEmbedDim?: VllmBackendDeps["embedDim"];
  readonly vllmChunkSize?: VllmBackendDeps["chunkSize"];
}

/** vllmEngine is null when `vllmDisabled`. */
export interface BackendRegistryResult {
  readonly backends: BackendRegistry;
  readonly vllmEngine: VllmEngineHandle | null;
}

function openRouterDeps(deps: BackendRegistryDeps): OpenRouterBackendDeps {
  return {
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
    ...(deps.getClient !== undefined ? { getClient: deps.getClient } : {}),
  };
}
function anthDirectDeps(deps: BackendRegistryDeps): AnthDirectBackendDeps {
  return {
    now: deps.now,
    ...(deps.getAnthClient !== undefined ? { getClient: deps.getAnthClient } : {}),
  };
}
function agentSdkDeps(deps: BackendRegistryDeps): AgentSdkBackendDeps {
  return {
    now: deps.now,
    ...(deps.query !== undefined ? { query: deps.query } : {}),
    ...(deps.sessionStore !== undefined ? { sessionStore: deps.sessionStore } : {}),
  };
}
function vllmDeps(deps: BackendRegistryDeps): VllmBackendDeps {
  return {
    now: deps.now,
    ...(deps.vllmConcurrency !== undefined ? { concurrency: deps.vllmConcurrency } : {}),
    ...(deps.repoRoot !== undefined ? { repoRoot: deps.repoRoot } : {}),
    ...(deps.vllmClient !== undefined ? { client: deps.vllmClient } : {}),
    ...(deps.vllmEmbedDim !== undefined ? { embedDim: deps.vllmEmbedDim } : {}),
    ...(deps.vllmChunkSize !== undefined ? { chunkSize: deps.vllmChunkSize } : {}),
  };
}

// vLLM is constructed only when not disabled; when disabled it is absent from the map and a role that
// resolves to it fail-closes.
export function createBackendRegistry(deps: BackendRegistryDeps): BackendRegistryResult {
  const backends: ProviderBackend[] = [
    createOpenRouterBackend(openRouterDeps(deps)),
    createAgentSdkBackend(agentSdkDeps(deps)),
    createAnthDirectBackend(anthDirectDeps(deps)),
    createCustomByoBackend({
      now: deps.now,
      ...(deps.random !== undefined ? { random: deps.random } : {}),
    }),
    createLocalLightBackend(),
  ];

  let vllmEngine: VllmEngineHandle | null = null;
  if (!deps.vllmDisabled) {
    const vllm = createVllmBackend(vllmDeps(deps));
    backends.push(vllm);
    vllmEngine = vllm.engine;
  }

  const registry: BackendRegistry = new Map(
    backends.map((b): readonly [ProviderBackend["key"], ProviderBackend] => [b.key, b]),
  );
  return { backends: registry, vllmEngine };
}

export type { AgentToolResult, AgentToolSpec } from "./backends/agent-sdk";
export { createAgentToolServer, fetchAgentSdkModels } from "./backends/agent-sdk";
export {
  DEFAULT_EMBED_MODEL,
  DEFAULT_IMAGE_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
} from "./backends/local-light";
export { fetchOrCatalog } from "./backends/openrouter";
export * from "./contract";
export { createProviderDiagnostics } from "./diagnostics";
export { createAgentRole } from "./roles/agent";
export { createChatRole } from "./roles/chat";
export { backendForSource, deriveRunner, requireBackend, requireRoleImpl } from "./roles/dispatch";
export { createEmbedRole } from "./roles/embed";
export { assertCredentialAllowed } from "./roles/firewall";
export { createGenerateImageRole } from "./roles/generate-image";
export { createImageEmbedRole } from "./roles/image-embed";
export { createRerankRole } from "./roles/rerank";
export { createSummarizeRole } from "./roles/summarize";
export { buildScriptedOverrideRunner } from "./scripted-override";
export type { VllmEngineHandle } from "./vllm";
export { detectGpu } from "./vllm";
