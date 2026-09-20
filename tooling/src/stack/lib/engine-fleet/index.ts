// engine-fleet — the owner's DEV vLLM fleet: the argv builder, the spawner, the launch-identity record, the
// reaper, GPU detection, the wake budget and the sleep/wake/hold controls. YEETED from the server
// (inference program §4, F1, owner word 2026-09-19): the server knows an engine only as a connection row's
// `baseUrl` + `features`; `pnpm engines` owns spawn, hold/stop and auto-sleep, `pnpm engines compose` the
// container overlay. One barrel so every stack op + the compose generator import ONE path.

export type { EngineGroupAdoption, EngineLaunchMarker } from "../../contract/engine-ownership.ts";
export type { EngineArgvContext, EngineLaunchConfig, EngineLaunchEnvFloor, EngineLaunchOverride } from "./build-argv.ts";
export { buildEngineArgv, engineCudaVisibleDevices, resolveEngineLaunchConfig } from "./build-argv.ts";
export { engineBaseUrl } from "./engine-url.ts";
export { VLLM_ENGINES } from "./engines.ts";
export { engineDeploymentEnv, engineLaunchEnvFloor, fleetEnv, processEnvSnapshot } from "./env.ts";
export type { WakeDecision } from "./fleet-control.ts";
export {
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
  isHeld,
  isStopped,
  postSleep,
  postWakeAndAwait,
  stoppedMarkerPath,
  WAKE_READY_TIMEOUT_MS,
  writeHold,
  writeStopped,
} from "./fleet-control.ts";
export type { AutoSleepDecision, AutoSleepState, EngineCapacityMetrics, EngineMetrics } from "./fleet-metrics.ts";
export { advanceAutoSleep, capacityWarnings, initialAutoSleepState, isEngineIdle, parseEngineCapacity, parseEngineMetrics } from "./fleet-metrics.ts";
export { countGpus, detectGpu } from "./gpu.ts";
export type { ObservedEngineProcess } from "./proc-observe.ts";
export {
  ENGINE_LAUNCH_MARKER_ENV,
  engineGroupMembers,
  mintEngineLaunchMarker,
  parseProcIdentityStat,
  readEngineProcessLaunchMarker,
  readObservedEngineProcess,
} from "./proc-observe.ts";
export type { EngineIdentityFile, EngineLaunchIdentity, EngineStopOutcome } from "./process-identity.ts";
export {
  adoptEngineGroup,
  captureEngineLaunchIdentity,
  engineAdoptionText,
  engineIdentityFilePath,
  parseEngineIdentityFile,
  readEngineIdentityFile,
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
