// biome-ignore-all lint/performance/noBarrelFile: the engine sub-barrel — the ONE seam surfaces register
// against; surfaces import engine pieces through here, never each other (`vllm-surface-isolation`).

export type { EngineArgvContext, EngineLaunchConfig, EngineLaunchEnvFloor, EngineLaunchOverride } from "./build-argv";
export { buildEngineArgv, engineCudaVisibleDevices, resolveEngineLaunchConfig } from "./build-argv";
export type {
  VllmChatCompletionRequest,
  VllmChatCompletionResult,
  VllmChatMessage,
} from "./chat-completion";
export { cleanJsonSchema, runVllmChatCompletion } from "./chat-completion";
export type { VllmEngineClient } from "./client";
export { createVllmEngineClient } from "./client";
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
export { engineBaseUrl } from "./engine-url";
export { VLLM_ENGINES } from "./engines";
export type { AutoSleepState, EngineMetrics, WakeDecision } from "./fleet-control";
export {
  advanceAutoSleep,
  clearHold,
  decideWake,
  enginePortPid,
  fetchEngineMetrics,
  fleetRunDir,
  getIsSleeping,
  holdMarkerPath,
  initialAutoSleepState,
  isEngineIdle,
  isHeld,
  parseEngineMetrics,
  postSleep,
  postWakeAndAwait,
  WAKE_READY_TIMEOUT_MS,
  writeHold,
} from "./fleet-control";
export { fetchEngineMaxModelLen, fetchGenMaxModelLen } from "./gen-window";
export { countGpus, detectGpu } from "./gpu";
export { sniffMime, toDataUri } from "./image";
export { findOrphanedFamily, makeCwdMarker, parsePsRows, reapOrphanedFamily } from "./reaper";
export type { EngineDeploymentEnv, EngineDeploymentFacts, EngineSpawnSpec } from "./spawn-engine";
export { buildEngineSpawnSpec, resolveEngineDeploymentFacts, resolveStoreRoot } from "./spawn-engine";
export {
  breakerAllows,
  decideTick,
  startVllmEngines,
} from "./supervisor";
export type { EngineUtilFractions, EngineVramNeed, GpuShortfall, GpuTenant, GpuVram, WakeBudgetVerdict } from "./wake-budget";
export { decideWakeBudget, engineVramNeed, parseComputeAppsCsv, parseGpuVramCsv, queryGpuVram } from "./wake-budget";
export type { WakeGateDeps } from "./wake-gate";
export { __resetWakeGateCache, ensureAwake } from "./wake-gate";
