// stack's programmatic front door: the dev and prod supervisors, the production launcher and the fixture.
export type {
  DebugArming,
  DebugConflict,
  DebugEnvKey,
  DebugPosture,
  DevPinKey,
  DevPins,
  DistState,
  DistVerdict,
  DrainOutcome,
  FixtureVerb,
  InstanceClassification,
  InstanceVerdict,
  LeaderProbes,
  LeaderRead,
  LeaderRecord,
  LeaderState,
  LockHolder,
  ObservedInstance,
  PinSource,
  ProdRecord,
  ProdSpawnPlan,
  ProdSpawnPlanOpts,
  ServedState,
  ServedVerdict,
  SetupMachine,
  SetupValues,
  SpawnLockAction,
  StackCommand,
  StackCommandParse,
  StackContext,
  StackInvocation,
  StackLogs,
  StackMode,
  StackParse,
  StackSpawner,
  StackVerb,
  StartBrowser,
  StartBuildDecision,
  StartBuildMode,
  StartInvocation,
  StartLaunch,
  StartParse,
  StartSpawn,
  StartSupervisorDeps,
  SupervisedChild,
  UpAction,
} from "./contract/types.ts";
export { DEBUG_ENV_KEYS, DEV_PIN_KEYS, FIXTURE_VERBS, LEADER_STATES, SETUP_AUDIENCES, STACK_MODES, STACK_VERBS, START_BUILD_MODES } from "./contract/types.ts";
export { parseStackArgv, parseStackCommand, STACK_USAGE } from "./lib/argv.ts";
export { debugConflictMessage, resolveDebugArming, stripDebugEnv } from "./lib/debug-env.ts";
export { envFilePath, parseEnvText, readEnvText } from "./lib/env-file.ts";
export { FIXTURE_CREDENTIALS, FIXTURE_DIR_REL, fixtureEnv } from "./lib/fixture-plan.ts";
export { classifyInstance, decideDown, decideUp } from "./lib/identity.ts";
export {
  HEARTBEAT_MS,
  HEARTBEAT_STALE_MS,
  LAUNCH_ID_ENV,
  LEADER_RECORD_FILE,
  leaderRecordPath,
  leaderVerdict,
  parseLeaderRecord,
  readLeaderRecord,
  recordAuthorizesSignal,
  removeLeaderRecord,
  serializeLeaderRecord,
  writeLeaderRecord,
} from "./lib/leader-record.ts";
export { decideSpawnLock, lockHolderText, mayRemovePidfile, parseLockHolder, parseProdRecord, serializeProdRecord } from "./lib/prod-record.ts";
export {
  AUTH_MODE_KEY,
  BIND_HOST_KEY,
  decideSetup,
  effectiveAuthMode,
  openUrls,
  PORT_KEY,
  parseAddressAnswer,
  parseChoiceAnswer,
  parsePortAnswer,
  SETUP_FILE_HEADER,
  SINGLE_USER_MODE,
  setupDefaults,
  setupEnvEdits,
  setupValues,
} from "./lib/setup-plan.ts";
export type { SourceEntry } from "./lib/source-scan.ts";
export { newestSourceEntries } from "./lib/source-scan.ts";
export type { SpawnLockOpts } from "./lib/spawn-lock.ts";
export { acquireSpawnLock, handleHeldSpawnLock, pidIsAlive, releaseSpawnLock } from "./lib/spawn-lock.ts";
export { buildProdSpawnPlan, CLIENT_DIST_INDEX_REL, CLIENT_DIST_REL } from "./lib/spawn-plan.ts";
export { STACK_SPAWNERS, spawnerForPort } from "./lib/spawners.ts";
export {
  cmdlineNamesCheckout,
  devStackPins,
  ENV_NO_FILE,
  healthzUrl,
  PINNED_KEYS_ENV,
  PORT_ENV,
  PRINTABLE_PINS,
  printablePins,
  RUN_DIR_ENV,
  STACK_CLI_REL,
  stackContext,
  stackLogs,
  stackPorts,
  stackRunDir,
  VITE_API_TARGET_ENV,
  VITE_PORT_ENV,
  viteUrl,
} from "./lib/stack-plan.ts";
export {
  decideStartBuild,
  OPEN_BROWSER_KEY,
  parseStartArgv,
  restateFileEnv,
  START_USAGE,
  shareLaunchRefusal,
  singleUserFallbackEnv,
  startBannerLines,
  startBrowser,
  startLaunch,
  startSpawnPlan,
} from "./lib/start-plan.ts";
export { superviseStart } from "./lib/supervisor.ts";
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
export { doDevDown } from "./ops/dev-down.ts";
export { doDevStatus } from "./ops/dev-status.ts";
export { doDevUp } from "./ops/dev-up.ts";
export { runFixture } from "./ops/fixture.ts";
export { runStackProd } from "./ops/prod.ts";
export { runStack } from "./ops/run.ts";
export { probeServedTransform, runServedProbe } from "./ops/served-probe.ts";
export { runSetup } from "./ops/setup.ts";
export { runStart } from "./ops/start.ts";
