// The unwired scans and the restated-port matcher: `pnpm unwired` reports members no production code reaches, its
// `fields`, `params`, `unions` and `shapes` verbs what is dead inside live code, and `ports` the port members that
// hand-restate another member, and `removed-keys` the removed contract keys a sender still names. Never in CI, never a gate.

export type { Restatement } from "../eslint/index.ts";
export { memberLabel, passesDbHandle, RELATION, restatementsAt, runtimeTypes } from "../eslint/index.ts";
export { Sources } from "./classify.ts";
export { scanFields } from "./fields.ts";
export { serviceReferences } from "./language-service.ts";
export { constituents, hasFlag, homeFiles, NativeWorld, propertiesNamed } from "./native.ts";
export { joinOptionalConstructions, optionalConstructionFacts } from "./optional-constructions.ts";
export type { OptionalInventory } from "./optional-inventory.ts";
export { isProduction as isOptionalProduction, pluginAuthorWorlds, publishedSdkSources } from "./optional-population.ts";
export { scanParams } from "./params.ts";
export type { PortCensus } from "./port-census.ts";
export { portCensus } from "./port-census.ts";
export type { PortTarget, TargetKind } from "./port-targets.ts";
export { runUnwired } from "./run.ts";
export { scanUnwired, scanWorld } from "./scan.ts";
export { scanShapes } from "./shapes.ts";
export { scanUnions } from "./unions.ts";
export { isProduction, packageWorlds, TEST_WORLDS } from "./worlds.ts";
