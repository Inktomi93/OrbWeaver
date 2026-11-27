// stack's programmatic front door: the dev and prod supervisors, the production launcher and the fixture.
import type { doDevDown as DoDevDown } from "./ops/dev-down.ts";
import type { doDevStatus as DoDevStatus } from "./ops/dev-status.ts";
import type { doDevUp as DoDevUp } from "./ops/dev-up.ts";
import type { runFixture as RunFixture } from "./ops/fixture.ts";
import type { runStackProd as RunStackProd } from "./ops/prod.ts";
import type { runStack as RunStack } from "./ops/run.ts";
import type { probeServedTransform as ProbeServedTransform, runServedProbe as RunServedProbe } from "./ops/served-probe.ts";
import type { runStart as RunStart } from "./ops/start.ts";

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
export { FIXTURE_CREDENTIALS, FIXTURE_DIR_REL, FIXTURE_SEED_CLI_REL, fixtureEnv, fixtureIdentityEnv } from "./lib/fixture-plan.ts";
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
  BIND_HOST_KEY,
  decideSetup,
  effectiveAuthMode,
  openUrls,
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
  classifyServedTransform,
  DRAIN_MARGIN_MS,
  debugPostureText,
  servedCarriesDiskBytes,
  valueExportNames,
} from "./lib/verdicts.ts";
export { runSetup } from "./ops/setup.ts";

// The commands below load on first call, not with the index: the snap CLI imports this index for its port and fixture
// constants, and loading every command's module graph (the server network adapter and its logger among it) cost it
// seconds on each start under load. Each wrapper keeps its command's exact signature and result.
export async function doDevDown(...args: Parameters<typeof DoDevDown>): ReturnType<typeof DoDevDown> {
  return await (await import("./ops/dev-down.ts")).doDevDown(...args);
}
export async function doDevStatus(...args: Parameters<typeof DoDevStatus>): ReturnType<typeof DoDevStatus> {
  return await (await import("./ops/dev-status.ts")).doDevStatus(...args);
}
export async function doDevUp(...args: Parameters<typeof DoDevUp>): ReturnType<typeof DoDevUp> {
  return await (await import("./ops/dev-up.ts")).doDevUp(...args);
}
export async function runFixture(...args: Parameters<typeof RunFixture>): ReturnType<typeof RunFixture> {
  return await (await import("./ops/fixture.ts")).runFixture(...args);
}
export async function runStackProd(...args: Parameters<typeof RunStackProd>): ReturnType<typeof RunStackProd> {
  return await (await import("./ops/prod.ts")).runStackProd(...args);
}
export async function runStack(...args: Parameters<typeof RunStack>): ReturnType<typeof RunStack> {
  return await (await import("./ops/run.ts")).runStack(...args);
}
export async function probeServedTransform(...args: Parameters<typeof ProbeServedTransform>): ReturnType<typeof ProbeServedTransform> {
  return await (await import("./ops/served-probe.ts")).probeServedTransform(...args);
}
export async function runServedProbe(...args: Parameters<typeof RunServedProbe>): ReturnType<typeof RunServedProbe> {
  return await (await import("./ops/served-probe.ts")).runServedProbe(...args);
}
export async function runStart(...args: Parameters<typeof RunStart>): ReturnType<typeof RunStart> {
  return await (await import("./ops/start.ts")).runStart(...args);
}
