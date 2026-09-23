// cache-check's programmatic front door: the run the cli fronts, and the pure verdict, argv and fixture its
// tests pin.

export type { CardSpec, CasePlan, Measure, ProbeStep, RoomKind, RoomSpec } from "./contract/plan.ts";
export { MEASURES, ROOM_KINDS } from "./contract/plan.ts";
export type {
  CacheCase,
  CacheCheckOptions,
  CacheRoute,
  CallUsage,
  CaseEvidence,
  CaseJudgement,
  CaseOutcome,
  CaseRun,
  CaseVerdict,
  EnvFile,
  JudgedPair,
  OrbApi,
  RouteRefusal,
  RouteSpec,
} from "./contract/types.ts";
export { CACHE_CASES, CACHE_ROUTES, CASE_VERDICTS } from "./contract/types.ts";
export { parseCacheCheckArgs } from "./lib/argv.ts";
export { CASE_PLANS } from "./lib/fixture.ts";
export { missingCredential, ROUTE_SPECS } from "./lib/routes.ts";
export { CACHE_READ_FLOOR, exitFor, FLOOR_CALIBRATION, formatOutcome, formatSpend, judgeCase, runVerdict, tally } from "./lib/verdict.ts";
export { runCacheCheck } from "./ops/run.ts";
