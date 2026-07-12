// biome-ignore-all lint/performance/noBarrelFile: this IS the providers public surface by design — the
// `providers-public-surface-only` cruiser rule forbids consumers from reaching into sealed families, so
// the barrel is load-bearing for the encapsulation + firewall invariants.
//
// infra/providers — FRONT DOOR (the CORE: roles + the sealed-backend contract + the credential
// firewall). `createProviderExecutor(deps)` binds the wired {@link BackendRegistry} into the bound role
// surface ({@link ProviderExecutor}) connection/chat/buddy call. The backend agents (openrouter /
// agent-sdk / anth-direct / custom-byo / vllm+local-light) each export a `ProviderBackend` factory and
// `entry/` wires them into the registry — they fulfill the {@link ProviderBackend} contract WITHOUT touching
// this core.
//
// The diagnostic FRONT DOOR (`createProviderDiagnostics` — probe/accountCredits/generationCost/inspect/
// fetchOrCatalog) is composed here too. NOT here yet (separate slices): the sealed backends (`backends/`,
// `vllm/`), `resolve-chat.ts` (the intent×capability wire-knob funnel), `scripted-override.ts`.

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

/**
 * The deps the boot binder injects to build the wired backend registry. The four REQUIRED-for-production
 * fields are `now` (the composition root owns the clock — the `no-raw-clock` determinism seam),
 * `vllmDisabled` (the §D3 escape hatch — a GPU-less box runs without the local engine), and the vLLM
 * supervisor knobs (`vllmConcurrency`/`repoRoot`). The remaining optional members are the per-backend DI
 * seams threaded THROUGH the sealed front door — the only channel the composition root (or a test) has to
 * reach a sealed backend's deps without importing it (e.g. a durable `sessionStore` for cross-restart
 * resume, a fake `vllmClient` / `getClient` / `query` for deterministic tests). Each is derived from its
 * backend's own deps type (one home, no re-spell).
 */
export interface BackendRegistryDeps {
  readonly now: () => number;
  readonly vllmDisabled: boolean;
  readonly vllmConcurrency?: VllmBackendDeps["concurrency"];
  readonly repoRoot?: VllmBackendDeps["repoRoot"];
  // ── Pass-through DI seams (production durable overrides + test fakes; the sealed door's only channel) ──
  readonly random?: OpenRouterBackendDeps["random"];
  readonly getClient?: OpenRouterBackendDeps["getClient"];
  /** The anth-direct per-key belted `@anthropic-ai/sdk` client resolver — production defaults to the real
   *  belted LRU; a test injects a fake `AnthClient` (the sealed door's only channel, mirrors `getClient`). */
  readonly getAnthClient?: AnthDirectBackendDeps["getClient"];
  readonly query?: AgentSdkBackendDeps["query"];
  readonly sessionStore?: AgentSdkBackendDeps["sessionStore"];
  readonly vllmClient?: VllmBackendDeps["client"];
  readonly vllmEmbedDim?: VllmBackendDeps["embedDim"];
  readonly vllmChunkSize?: VllmBackendDeps["chunkSize"];
}

/** What the boot binder gets back: the wired {@link BackendRegistry} for {@link createProviderExecutor},
 *  plus the vLLM engine lifecycle handle `entry/lifecycle.ts` starts/stops — `null` when `vllmDisabled`. */
export interface BackendRegistryResult {
  readonly backends: BackendRegistry;
  readonly vllmEngine: VllmEngineHandle | null;
}

// Per-backend deps assembled from the shared registry deps. Split out of the factory so each backend's
// optional-seam spreads (omit-when-undefined, the exactOptionalPropertyTypes shape) live next to nothing
// else — keeps `createBackendRegistry` under the cognitive-complexity gate.
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

/**
 * Build the wired backend registry BEHIND the front door — the seal (`providers-runner-seal` /
 * `providers-public-surface-only`) forbids `entry/` from importing `backends/<x>` or `vllm/`, and the
 * `BackendKey` axis is sealed, so the registry MUST be keyed here off each backend's own `.key`. The five
 * remote/in-process backends (openrouter · agent-sdk · anth-direct · custom-byo · local-light) are always
 * constructed; the local vLLM engine is constructed ONLY when not
 * disabled (the §D3 escape hatch — when disabled it is absent from the map and a role that resolves to it
 * fail-closes, which is correct). Returns the engine handle so the boot lifecycle can supervise it.
 */
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

// ── The agent-mode tool-server factory (entry adapts a domain's tool specs → the sealed MCP server the
//    agent runner consumes; `createAgentToolServer` is a pure factory, NOT a sealed runner symbol, so the
//    front door surfaces it — entry can't reach `backends/agent-sdk` directly). ─────────────────────────
export type { AgentToolResult, AgentToolSpec } from "./backends/agent-sdk";
// `createAgentToolServer` = the agent-mode tool-server factory; `fetchAgentSdkModels` = the live
// `supportedModels()` discovery (agent-sdk-fixed; connection injects it for refreshAgentSdkCatalog — the
// daemon's family→version map, a control-channel call, not a billed turn).
export { createAgentToolServer, fetchAgentSdkModels } from "./backends/agent-sdk";
// ── The local-light builtin model trio (embed/imageEmbed/rerank defaults) — surfaced through the front
//    door so the composition root can inject them into `ConnectionContext.localLightDefaults` (the seal
//    forbids entry importing `backends/local-light` directly; these are DISPLAY facts for the Connections
//    picker, NOT stamped values — the resolver keeps deriving via its empty-model pass-through). ───────
export {
  DEFAULT_EMBED_MODEL,
  DEFAULT_IMAGE_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
} from "./backends/local-light";
// ── The live OpenRouter `/models` fetch verb (OR-fixed; connection injects it for refreshCatalog) ─
export { fetchOrCatalog } from "./backends/openrouter";
// ── The contract surface (request/result/error/event vocab + the sealed-backend contract + re-exports) ─
export * from "./contract";
// ── The diagnostic front door (probe/accountCredits/generationCost/inspect/fetchOrCatalog) ───────
export { createProviderDiagnostics } from "./diagnostics";
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
// ── The RUNNER_OVERRIDE dev/test seam (entry injects it as runChatTurn when env.RUNNER_OVERRIDE is set) ─
export { buildScriptedOverrideRunner } from "./scripted-override";
// ── The vLLM engine lifecycle handle type (entry wires start/stop; it can't import `vllm/`) ───────
//    + the boot GPU-presence probe (entry's ONE gpu-detect; the supervisor reads the same home). ──
export type { VllmEngineHandle } from "./vllm";
export { detectGpu } from "./vllm";
