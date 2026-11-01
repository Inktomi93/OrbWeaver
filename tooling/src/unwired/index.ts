// The unwired scans and the restated-port matcher: `pnpm unwired` reports members no production code reaches, its
// `fields`, `params`, `unions` and `shapes` verbs what is dead inside live code, and `ports` the port members that
// hand-restate another member. Never in CI, never a gate.

export { Sources } from "./classify.ts";
export { scanFields } from "./fields.ts";
export { passesDbHandle, runtimeTypes } from "./foreign-types.ts";
export { serviceReferences } from "./language-service.ts";
export { constituents, hasFlag, homeFiles, NativeWorld, propertiesNamed } from "./native.ts";
export { scanParams } from "./params.ts";
export type { PortCensus } from "./port-census.ts";
export { portCensus } from "./port-census.ts";
export type { PortTarget, TargetKind } from "./port-targets.ts";
export type { Restatement } from "./restated-port.ts";
export { memberLabel, RELATION, restatementsAt } from "./restated-port.ts";
export { runUnwired } from "./run.ts";
export { scanUnwired, scanWorld } from "./scan.ts";
export { scanShapes } from "./shapes.ts";
export { scanUnions } from "./unions.ts";
export { isProduction, packageWorlds, TEST_WORLDS } from "./worlds.ts";
