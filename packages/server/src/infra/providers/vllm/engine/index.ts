// The launch-ownership vocabulary is homed in the providers `contract/` (the type home) and re-exported
// here so a consumer of the engine surface has ONE import path for the values and their shapes.
export type { EngineGroupAdoption, EngineLaunchMarker } from "../../contract/index.ts";
export type { EngineArgvContext, EngineLaunchConfig, EngineLaunchEnvFloor, EngineLaunchOverride } from "./build-argv.ts";
export { buildEngineArgv, engineCudaVisibleDevices, resolveEngineLaunchConfig } from "./build-argv.ts";
export type {
  VllmChatCompletionRequest,
  VllmChatCompletionResult,
  VllmChatMessage,
} from "./chat-completion.ts";
export { cleanJsonSchema, runVllmChatCompletion } from "./chat-completion.ts";
export type { EnginePostOpts, VllmEngineClient } from "./client.ts";
export { createVllmEngineClient } from "./client.ts";
export {
  DOC_INSTRUCTION,
  fitToDim,
  normalizeVector,
  QUERY_INSTRUCTION,
  toEmbedPrompt,
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
export type { AutoSleepState, EngineCapacityMetrics, EngineMetrics, WakeDecision } from "./fleet-control.ts";
export {
  advanceAutoSleep,
  capacityWarnings,
  clearHold,
  clearStopped,
  decideWake,
  enginePortPid,
  fetchEngineCapacity,
  fetchEngineMetrics,
  fleetCapacitySnapshot,
  fleetRunDir,
  getIsSleeping,
  holdMarkerPath,
  initialAutoSleepState,
  isEngineIdle,
  isHeld,
  isStopped,
  parseEngineCapacity,
  parseEngineMetrics,
  postSleep,
  postWakeAndAwait,
  stoppedMarkerPath,
  WAKE_READY_TIMEOUT_MS,
  writeHold,
  writeStopped,
} from "./fleet-control.ts";
export { fetchEngineMaxModelLen } from "./gen-window.ts";
export { countGpus, detectGpu } from "./gpu.ts";
export { sniffMime, toDataUri } from "./image.ts";
export type {
  EngineIdentityFile,
  EngineLaunchIdentity,
  EngineStopOutcome,
  ObservedEngineProcess,
} from "./process-identity.ts";
export {
  adoptEngineGroup,
  captureEngineLaunchIdentity,
  ENGINE_LAUNCH_MARKER_ENV,
  engineAdoptionText,
  engineGroupMembers,
  engineIdentityFilePath,
  mintEngineLaunchMarker,
  parseEngineIdentityFile,
  parseProcIdentityStat,
  readEngineIdentityFile,
  readEngineProcessLaunchMarker,
  readObservedEngineProcess,
  serializeEngineIdentityFile,
  signalAdoptedEngineGroup,
  signalEngineLaunchIdentity,
  signalOrphanedEngineGroup,
  signalRecordedEngineProcess,
  stopRecordedEngineProcess,
  verifyEngineLaunchIdentity,
  writeEngineLaunchIdentities,
} from "./process-identity.ts";
export { reapOrphanedFamily } from "./reaper.ts";
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
