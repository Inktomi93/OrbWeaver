// The unwired scans and the restated-port matcher: `pnpm unwired` reports members no production code reaches, its
// `fields`, `params`, `unions` and `shapes` verbs what is dead inside live code, `codes` the error and refusal codes nothing
// throws or no client branch names, `procedures` the tRPC procedures and HTTP routes no production code calls, `columns`
// the Drizzle columns production never reads or writes, `ports` the port members that hand-restate another member,
// `removed-keys` the removed contract keys a sender still writes, and `coverage` the production code no test run
// executed. Never in CI, never a gate.

export type { Restatement } from "../eslint/index.ts";
export { memberLabel, passesDbHandle, RELATION, restatementsAt, runtimeTypes } from "../eslint/index.ts";
export { Sources } from "./classify.ts";
export { scanCodes } from "./codes.ts";
export { scanColumns } from "./columns.ts";
export { scanFields } from "./fields.ts";
export type { Analysis, Bucket, Finding, MemberBucket } from "./graph/analyse.ts";
export { BUCKETS, MEMBER_BUCKETS } from "./graph/analyse.ts";
export type { CssBucket, CssReport } from "./graph/css.ts";
export { CSS_BUCKETS } from "./graph/css.ts";
export type { GraphScan, GraphVerification } from "./graph/scan.ts";
export { cssGraph, scanGraph, verifyGraph } from "./graph/scan.ts";
export type { Verdict, Verified } from "./graph/verify.ts";
export { VERDICTS } from "./graph/verify.ts";
export type { JudgedEntry } from "./judged.ts";
export { serviceReferences } from "./language-service.ts";
export { constituents, hasFlag, homeFiles, NativeWorld, propertiesNamed } from "./native.ts";
export { joinOptionalConstructions, optionalConstructionFacts } from "./optional-constructions.ts";
export type { OptionalInventory } from "./optional-inventory.ts";
export { isProduction as isOptionalProduction, pluginAuthorWorlds, publishedSdkSources } from "./optional-population.ts";
export { scanParams } from "./params.ts";
export type { PortCensus } from "./port-census.ts";
export { portCensus } from "./port-census.ts";
export type { PortTarget, TargetKind } from "./port-targets.ts";
export { OUTSIDE_CALLERS, scanProcedures } from "./procedures.ts";
export { runUnwired } from "./run.ts";
export { scanUnwired, scanWorld } from "./scan.ts";
export { scanShapes } from "./shapes.ts";
export { scanUnions } from "./unions.ts";
export { isProduction, packageWorlds } from "./worlds.ts";
