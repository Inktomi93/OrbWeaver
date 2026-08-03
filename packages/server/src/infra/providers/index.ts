// biome-ignore-all lint/performance/noBarrelFile: this IS the providers public surface by design — the
// `providers-public-surface-only` cruiser rule forbids consumers from reaching into sealed families, so
// the barrel is load-bearing for the encapsulation + firewall invariants.

// Front door: roles + the sealed-backend contract + the credential firewall. `createProviderExecutor(deps)`
// binds the wired `BackendRegistry` into the bound role surface. Backend agents each export a
// `ProviderBackend` factory; `entry/` wires them into the registry without touching this core.

import type { AgentSdkBackendDeps } from "./backends/agent-sdk/index.ts";
import { createAgentSdkBackend } from "./backends/agent-sdk/index.ts";

import { createCustomByoBackend } from "./backends/custom-byo/index.ts";
import type { ImageToPng } from "./backends/kit/index.ts";
import { createImageNormalizer } from "./backends/kit/index.ts";
import { createLocalLightBackend, createLocalLightMatte, createModelCache } from "./backends/local-light/index.ts";
import type { OpenRouterBackendDeps } from "./backends/openrouter/index.ts";
import { createOpenRouterBackend } from "./backends/openrouter/index.ts";
import type { BackendRegistry, ProviderBackend, ProviderDeps, ProviderExecutor, WireCaptureSink } from "./contract/index.ts";
import { createAgentRole } from "./roles/agent.ts";
import { createChatRole } from "./roles/chat.ts";
import { createEmbedRole } from "./roles/embed.ts";
import { createGenerateImageRole } from "./roles/generate-image.ts";
import { createImageEmbedRole } from "./roles/image-embed.ts";
import { createRerankRole } from "./roles/rerank.ts";
import { createStructuredRole } from "./roles/structured.ts";
import { createSummarizeRole } from "./roles/summarize.ts";
import type { VllmBackendDeps, VllmEngineHandle } from "./vllm/index.ts";
import { createVllmBackend } from "./vllm/index.ts";

export function createProviderExecutor(deps: ProviderDeps): ProviderExecutor {
  return {
    runChatTurn: createChatRole(deps),
    runAgentTurn: createAgentRole(deps),
    embed: createEmbedRole(deps),
    rerank: createRerankRole(deps),
    imageEmbed: createImageEmbedRole(deps),
    summarize: createSummarizeRole(deps),
    structured: createStructuredRole(deps),
    generateImage: createGenerateImageRole(deps),
  };
}

/** Deps the boot binder injects to build the wired backend registry. Optional members are per-backend DI
 *  seams threaded through the sealed front door — the only channel a composition root/test has to reach a
 *  sealed backend's deps without importing it. */
export interface BackendRegistryDeps {
  readonly now: () => number;
  readonly vllmDisabled: boolean;
  /** The fleet MANAGER posture (adopt-or-start) triggers the detached spawner + owns auto-sleep; adopt-only
   *  adopts but never spawns. Absent ⇒ the supervisor's manager default (true). Derived from ENGINES_POSTURE. */
  readonly vllmManages?: boolean;
  readonly vllmConcurrency?: VllmBackendDeps["concurrency"];
  /** Live getter for the resolved engine LAUNCH config (admin ⊕ env floor) — read per spawn so a
   *  restart-to-apply picks up an admin retune. Absent ⇒ the supervisor uses the pure env floor. */
  readonly engineLaunch?: VllmBackendDeps["engineLaunch"];
  readonly repoRoot?: VllmBackendDeps["repoRoot"];
  readonly random?: OpenRouterBackendDeps["random"];
  readonly getClient?: OpenRouterBackendDeps["getClient"];
  /** Raw sharp PNG transform (MA-6). Wrapped into the OpenRouter GIF→first-frame-PNG wire-normalize op
   *  here so `infra/image` never leaks into the sealed backend; absent ⇒ the label-only passthrough. */
  readonly imageToPng?: ImageToPng;

  readonly query?: AgentSdkBackendDeps["query"];
  readonly sessionStore?: AgentSdkBackendDeps["sessionStore"];
  /** Live getter for the agent-sdk summarize worker count (Q6 — agentSdkConcurrency.summarize). Absent ⇒ floor. */
  readonly agentSdkSummarizeConcurrency?: AgentSdkBackendDeps["summarizeConcurrency"];
  /** Live getter for the vLLM chat surface's per-request presence-penalty default (item 7 — engineLaunch
   *  .genPresencePenalty). Read per request so an admin retune applies without a restart. Absent ⇒ the card floor. */
  readonly genPresencePenalty?: VllmBackendDeps["genPresencePenalty"];
  /** TASK-24: the provider wire-capture sink. When present, threaded into the agent-sdk + vLLM backends so
   *  their send boundaries record the final request body; absent ⇒ no capture (the prod default). */
  readonly captureWire?: WireCaptureSink;
  readonly vllmClient?: VllmBackendDeps["client"];
  readonly vllmEmbedDim?: VllmBackendDeps["embedDim"];
  readonly vllmChunkSize?: VllmBackendDeps["chunkSize"];
}

/** vllmEngine is null when `vllmDisabled`. */
export interface BackendRegistryResult {
  readonly backends: BackendRegistry;
  readonly vllmEngine: VllmEngineHandle | null;
  /** The local-light background-removal (alpha-matte) op, bound over the SAME shared model cache the
   *  local-light backend uses (expressions-design/03 §4.1). Always present (local-light is unconditionally
   *  registered); compose threads it into expressions' sprite-sheet matte arm. NOT a provider role. */
  readonly matteModel: ReturnType<typeof createLocalLightMatte>;
}

function openRouterDeps(deps: BackendRegistryDeps): OpenRouterBackendDeps {
  return {
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
    ...(deps.getClient !== undefined ? { getClient: deps.getClient } : {}),
    ...(deps.imageToPng !== undefined ? { normalizeImageBytes: createImageNormalizer(deps.imageToPng) } : {}),
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
  };
}

function agentSdkDeps(deps: BackendRegistryDeps): AgentSdkBackendDeps {
  return {
    now: deps.now,
    ...(deps.query !== undefined ? { query: deps.query } : {}),
    ...(deps.sessionStore !== undefined ? { sessionStore: deps.sessionStore } : {}),
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    ...(deps.imageToPng !== undefined ? { normalizeImageBytes: createImageNormalizer(deps.imageToPng) } : {}),
    ...(deps.agentSdkSummarizeConcurrency !== undefined ? { summarizeConcurrency: deps.agentSdkSummarizeConcurrency } : {}),
  };
}
function vllmDeps(deps: BackendRegistryDeps): VllmBackendDeps {
  return {
    now: deps.now,
    ...(deps.vllmManages !== undefined ? { manages: deps.vllmManages } : {}),
    ...(deps.vllmConcurrency !== undefined ? { concurrency: deps.vllmConcurrency } : {}),
    ...(deps.engineLaunch !== undefined ? { engineLaunch: deps.engineLaunch } : {}),
    ...(deps.genPresencePenalty !== undefined ? { genPresencePenalty: deps.genPresencePenalty } : {}),
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    ...(deps.repoRoot !== undefined ? { repoRoot: deps.repoRoot } : {}),
    ...(deps.vllmClient !== undefined ? { client: deps.vllmClient } : {}),
    ...(deps.vllmEmbedDim !== undefined ? { embedDim: deps.vllmEmbedDim } : {}),
    ...(deps.vllmChunkSize !== undefined ? { chunkSize: deps.vllmChunkSize } : {}),
  };
}

// vLLM is constructed only when not disabled; when disabled it is absent from the map and a role that
// resolves to it fail-closes.
export function createBackendRegistry(deps: BackendRegistryDeps): BackendRegistryResult {
  // One shared local-light model cache — the embed/rerank/imageEmbed backend AND the sprite-sheet matte op
  // load through it (one process-wide model LRU + device/CPU-fallback mechanics; §4.1).
  const localLightCache = createModelCache();
  const backends: ProviderBackend[] = [
    createOpenRouterBackend(openRouterDeps(deps)),
    createAgentSdkBackend(agentSdkDeps(deps)),
    createCustomByoBackend({
      now: deps.now,
      ...(deps.random !== undefined ? { random: deps.random } : {}),
      ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    }),
    createLocalLightBackend({ cache: localLightCache }),
  ];

  let vllmEngine: VllmEngineHandle | null = null;
  if (!deps.vllmDisabled) {
    const vllm = createVllmBackend(vllmDeps(deps));
    backends.push(vllm);
    vllmEngine = vllm.engine;
  }

  const registry: BackendRegistry = new Map(backends.map((b): readonly [ProviderBackend["key"], ProviderBackend] => [b.key, b]));
  return { backends: registry, vllmEngine, matteModel: createLocalLightMatte(localLightCache) };
}

export type { AgentToolResult, AgentToolSpec } from "./backends/agent-sdk/index.ts";
export { createAgentToolServer, fetchAgentSdkModels } from "./backends/agent-sdk/index.ts";
export {
  DEFAULT_EMBED_MODEL,
  DEFAULT_IMAGE_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
} from "./backends/local-light/index.ts";
export { fetchOrCatalog } from "./backends/openrouter/index.ts";
export * from "./contract/index.ts";
export { createProviderDiagnostics } from "./diagnostics.ts";
// The (UserIntent × ModelCapability) → resolved wire knobs FUNNEL. Public because it has a SECOND consumer
// besides the runners: `preset.resolveEffective` projects the very same call for the editor, so the deck
// shows what the next turn will actually send instead of a client re-derivation (redesign §4.3, D5).
export { resolveChat } from "./resolve-chat.ts";
export { createAgentRole } from "./roles/agent.ts";
export { createChatRole } from "./roles/chat.ts";
export { backendForSource, deriveRunner, requireBackend, requireRoleImpl } from "./roles/dispatch.ts";
export { createEmbedRole } from "./roles/embed.ts";
export { assertCredentialAllowed } from "./roles/firewall.ts";
export { createGenerateImageRole } from "./roles/generate-image.ts";
export { createImageEmbedRole } from "./roles/image-embed.ts";
export { createRerankRole } from "./roles/rerank.ts";
export { createStructuredRole } from "./roles/structured.ts";
export { createSummarizeRole } from "./roles/summarize.ts";
export type { EngineDeploymentFacts, EngineStatusRecord, VllmEngineHandle } from "./vllm/index.ts";
export { detectGpu, fetchEngineMaxModelLen, fetchGenMaxModelLen, resolveEngineDeploymentFacts } from "./vllm/index.ts";
