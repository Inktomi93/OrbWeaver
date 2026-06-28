// biome-ignore-all lint/performance/noBarrelFile: the engine sub-barrel — the ONE seam the surfaces (and
// the subsystem root) register against (down). Surfaces import engine pieces through here, never each other
// (`vllm-surface-isolation`); keeping one stable surface is what makes that seal enforceable.
//
// infra/providers/vllm/engine — the ONE OWNER of vLLM lifecycle + the shared wire cores. The supervisor
// (adopt/spawn/death-couple/breaker/health/orphan-reap) plus the loopback HTTP client, the status/control
// registries, the engine-identity leaf, and the shared gen/embed wire helpers the surfaces shape onto.
// Exports are path-sorted (organizeImports): chat-completion → client → embedding → engine-control →
// engine-status → engines → image → supervisor.

export type {
  VllmChatCompletionRequest,
  VllmChatCompletionResult,
  VllmChatMessage,
} from "./chat-completion";
export { cleanJsonSchema, runVllmChatCompletion } from "./chat-completion";
export type { VllmEngineClient } from "./client";
export { createVllmEngineClient, engineBaseUrl } from "./client";
export {
  DOC_INSTRUCTION,
  normalizeVector,
  QUERY_INSTRUCTION,
  toEmbedPrompt,
  truncateToDim,
} from "./embedding";
export type { VllmEngineController } from "./engine-control";
export { getVllmEngineController, registerVllmEngineController } from "./engine-control";
export type { EngineStatusRecord } from "./engine-status";
export {
  allEngineStatuses,
  ENGINE_LIFECYCLE_STATUSES,
  getEngineStatus,
  setEngineStatus,
} from "./engine-status";
export { VLLM_ENGINES } from "./engines";
export { detectGpu } from "./gpu";
export { sniffMime, toDataUri } from "./image";
export {
  breakerAllows,
  decideTick,
  findOrphanedEngineCores,
  reapOrphanedEngineCores,
  startVllmEngines,
} from "./supervisor";
