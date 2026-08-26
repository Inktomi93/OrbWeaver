// stack's programmatic front door — mode-aware stack control (`pnpm stack`, `pnpm engines*`). This tool is
// BASH-FRONTED: `stack.sh` / `engines.sh` at the tool root are the operator entrypoints (the pgid/setsid
// choreography is bash's wheelhouse), and every DECISION they make is imported from here — one grammar,
// one identity rule, one debug-arming precedence, never a second copy in shell.
export type {
  DebugArming,
  DebugConflict,
  DebugEnvKey,
  DebugPosture,
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
  UpAction,
} from "./contract/types.ts";
export { DEBUG_ENV_KEYS, STACK_MODES, STACK_VERBS } from "./contract/types.ts";
export { formatDispatch, parseStackArgv, STACK_USAGE } from "./lib/argv.ts";
export { debugConflictMessage, resolveDebugArming, stripDebugEnv } from "./lib/debug-env.ts";
export {
  captureDevStackIdentity,
  devStackIdentityFilePath,
  parseDevStackIdentity,
  recordedDevStackVerdict,
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
export { acquireSpawnLock, handleHeldSpawnLock, releaseSpawnLock } from "./lib/spawn-lock.ts";
export { buildProdSpawnPlan, CLIENT_DIST_INDEX_REL, CLIENT_DIST_REL, SERVER_ENTRY_REL } from "./lib/spawn-plan.ts";
export { STACK_SPAWNERS, spawnerForPort } from "./lib/spawners.ts";
export {
  classifyDebugPosture,
  classifyDist,
  classifyDrainTail,
  classifyServedTransform,
  DRAIN_MARGIN_MS,
  DRAIN_WATCH_MS,
  debugPostureText,
  SERVER_DRAIN_MS,
  valueExportNames,
} from "./lib/verdicts.ts";
export { runStackProd } from "./ops/prod.ts";
export { probeServedTransform } from "./ops/served-probe.ts";
