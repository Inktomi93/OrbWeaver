// biome-ignore-all lint/performance/noBarrelFile: the engine sub-barrel — the ONE seam surfaces register
// against; surfaces import engine pieces through here, never each other (`vllm-surface-isolation`).

export type { EngineArgvContext, EngineLaunchConfig, EngineLaunchEnvFloor, EngineLaunchOverride } from "./build-argv.ts";
export { buildEngineArgv, engineCudaVisibleDevices, resolveEngineLaunchConfig } from "./build-argv.ts";
export type {
  VllmChatCompletionRequest,
  VllmChatCompletionResult,
  VllmChatMessage,
} from "./chat-completion.ts";
export { cleanJsonSchema, runVllmChatCompletion } from "./chat-completion.ts";
export type { VllmEngineClient } from "./client.ts";
export { createVllmEngineClient } from "./client.ts";
export {
  DOC_INSTRUCTION,
  normalizeVector,
  QUERY_INSTRUCTION,
  toEmbedPrompt,
  truncateToDim,
} from "./embedding.ts";
export type { VllmEngineController } from "./engine-control.ts";
export { getVllmEngineController, registerVllmEngineController } from "./engine-control.ts";
export type { EngineStatusRecord } from "./engine-status.ts";
export {
  allEngineStatuses,
  ENGINE_LIFECYCLE_STATUSES,
  getEngineStatus,
  setEngineStatus,
} from "./engine-status.ts";
export { engineBaseUrl } from "./engine-url.ts";
export { VLLM_ENGINES } from "./engines.ts";
export type { AutoSleepState, EngineMetrics, WakeDecision } from "./fleet-control.ts";
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
} from "./fleet-control.ts";
export { fetchEngineMaxModelLen, fetchGenMaxModelLen } from "./gen-window.ts";
export { countGpus, detectGpu } from "./gpu.ts";
export { sniffMime, toDataUri } from "./image.ts";
export { findOrphanedFamily, makeCwdMarker, parsePsRows, reapOrphanedFamily } from "./reaper.ts";
export type { EngineDeploymentEnv, EngineDeploymentFacts, EngineSpawnSpec } from "./spawn-engine.ts";
export { buildEngineSpawnSpec, resolveEngineDeploymentFacts, resolveStoreRoot } from "./spawn-engine.ts";
export {
  breakerAllows,
  decideTick,
  startVllmEngines,
} from "./supervisor.ts";
export type { EngineUtilFractions, EngineVramNeed, GpuShortfall, GpuTenant, GpuVram, WakeBudgetVerdict } from "./wake-budget.ts";
export { decideWakeBudget, engineVramNeed, parseComputeAppsCsv, parseGpuVramCsv, queryGpuVram } from "./wake-budget.ts";
export type { WakeGateDeps } from "./wake-gate.ts";
export { __resetWakeGateCache, ensureAwake } from "./wake-gate.ts";
