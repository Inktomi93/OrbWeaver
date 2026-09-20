// engine-fleet — the owner's DEV vLLM fleet: the argv builder, the spawner, the launch-identity record, the
// reaper, GPU detection, the wake budget and the sleep/wake/hold controls. YEETED from the server
// (inference program §4, F1, owner word 2026-09-19): the server knows an engine only as a connection row's
// `baseUrl` + `features`; `pnpm engines` owns spawn, hold/stop and auto-sleep, `pnpm engines compose` the
// container overlay. One barrel so every stack op + the compose generator import ONE path.

export type { EngineArgvContext, EngineLaunchConfig, EngineLaunchEnvFloor, EngineLaunchOverride } from "./build-argv.ts";
export { buildEngineArgv, engineCudaVisibleDevices, resolveEngineLaunchConfig } from "./build-argv.ts";
export { engineBaseUrl } from "./engine-url.ts";
export { VLLM_ENGINES } from "./engines.ts";
export { engineDeploymentEnv, engineLaunchEnvFloor, fleetEnv, processEnvSnapshot } from "./env.ts";
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
export { countGpus, detectGpu } from "./gpu.ts";
export type { EngineGroupAdoption, EngineLaunchMarker } from "./launch-ownership.ts";
export type { EngineIdentityFile, EngineLaunchIdentity, EngineStopOutcome, ObservedEngineProcess } from "./process-identity.ts";
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
export type { EngineUtilFractions, EngineVramNeed, GpuShortfall, GpuTenant, GpuVram, WakeBudgetVerdict } from "./wake-budget.ts";
export { decideWakeBudget, engineVramNeed, parseComputeAppsCsv, parseGpuVramCsv, queryGpuVram } from "./wake-budget.ts";
