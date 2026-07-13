// biome-ignore-all lint/performance/noBarrelFile: the engine sub-barrel — the ONE seam surfaces register
// against; surfaces import engine pieces through here, never each other (`vllm-surface-isolation`).

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
