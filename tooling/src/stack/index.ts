// stack's programmatic front door — mode-aware stack control (`pnpm stack`). This tool is
// BASH-FRONTED: `stack.sh` at the tool root is the operator entrypoint (the pgid/setsid
// choreography is bash's wheelhouse), and every DECISION it makes is imported from here — one grammar,
// one identity rule, one debug-arming precedence, never a second copy in shell.
export type {
  DebugArming,
  DebugConflict,
  DebugEnvKey,
  DebugPosture,
  DevStackAdoption,
  DevStackIdentity,
  DevStackIdentityVerdict,
  DistState,
  DistVerdict,
  DrainOutcome,
  InstanceClassification,
  InstanceVerdict,
  LockHolder,
  ObservedInstance,
  ObservedStackProcess,
  PnpmInvocation,
  ProdRecord,
  ProdSpawnPlan,
  ProdSpawnPlanOpts,
  ServedState,
  ServedVerdict,
  SpawnLockAction,
  StackInvocation,
  StackMode,
  StackParse,
  StackSpawner,
  StackVerb,
  StartBuildDecision,
  StartBuildMode,
  StartInvocation,
  StartParse,
  UpAction,
} from "./contract/types.ts";
export { DEBUG_ENV_KEYS, STACK_MODES, STACK_VERBS, START_BUILD_MODES } from "./contract/types.ts";
export { formatDispatch, parseStackArgv, STACK_USAGE } from "./lib/argv.ts";
export { debugConflictMessage, resolveDebugArming, stripDebugEnv } from "./lib/debug-env.ts";
export {
  adoptDevStackGroup,
  adoptionText,
  captureDevStackIdentity,
  DEV_STACK_LAUNCH_ID_ENV,
  devStackGroupHasMembers,
  devStackGroupMembers,
  devStackIdentityFilePath,
  parseDevStackIdentity,
  readProcessLaunchId,
  recordedDevStackVerdict,
  signalAdoptedDevStackGroup,
  signalDevStackIdentity,
  verifyDevStackIdentity,
  writeDevStackIdentity,
} from "./lib/dev-process-identity.ts";
export { classifyInstance, decideDown, decideUp } from "./lib/identity.ts";
export { parseListenerPid, parseProcStartTicks } from "./lib/proc-parse.ts";
export { decideSpawnLock, lockHolderText, mayRemovePidfile, parseLockHolder, parseProdRecord, serializeProdRecord } from "./lib/prod-record.ts";
export type { SourceEntry } from "./lib/source-scan.ts";
export { newestSourceEntries } from "./lib/source-scan.ts";
export type { SpawnLockOpts } from "./lib/spawn-lock.ts";
export { acquireSpawnLock, handleHeldSpawnLock, pidIsAlive, releaseSpawnLock } from "./lib/spawn-lock.ts";
export { buildProdSpawnPlan, CLIENT_DIST_INDEX_REL, CLIENT_DIST_REL, SERVER_ENTRY_REL } from "./lib/spawn-plan.ts";
export { STACK_SPAWNERS, spawnerForPort } from "./lib/spawners.ts";
export {
  childExitCode,
  decideStartBuild,
  effectiveAuthMode,
  PNPM_EXECPATH_ENV,
  parseStartArgv,
  resolvePnpmInvocation,
  SINGLE_USER_MODE,
  START_USAGE,
  singleUserFallbackEnv,
  startBannerLines,
  startSpawnPlan,
} from "./lib/start-plan.ts";
export {
  classifyDebugPosture,
  classifyDist,
  classifyDrainTail,
  classifyServedTransform,
  DRAIN_MARGIN_MS,
  DRAIN_WATCH_MS,
  debugPostureText,
  SERVER_DRAIN_MS,
  servedCarriesDiskBytes,
  valueExportNames,
} from "./lib/verdicts.ts";
export { runStackProd } from "./ops/prod.ts";
export { probeServedTransform } from "./ops/served-probe.ts";
export { FORWARDED_SIGNALS, forwardSignalsTo, runStart } from "./ops/start.ts";
