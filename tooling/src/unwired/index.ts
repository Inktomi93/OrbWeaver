// The unwired scans and the restated-port matcher: `pnpm unwired` reports callable members no production code calls, its
// `fields`, `params`, `unions` and `shapes` verbs what is dead inside live code, `codes` the error and refusal codes nothing
// throws or no client branch names, `procedures` the tRPC procedures and HTTP routes no production code calls, `columns`
// the Drizzle columns production never reads or writes, `ports` the port members that hand-restate another member,
// `removed-keys` the removed contract keys a sender still writes, and `coverage` the production code no test run
// executed. Never in CI, never a gate.

export type { Restatement } from "../eslint/index.ts";
export { memberLabel, passesDbHandle, RELATION, restatementsAt, runtimeTypes } from "../eslint/index.ts";
export type { Analysis, Bucket, Finding, MemberBucket } from "./graph/analyse.ts";
export { BUCKETS, MEMBER_BUCKETS } from "./graph/analyse.ts";
export type { CodesReport } from "./graph/codes.ts";
export type { ColumnsReport } from "./graph/columns.ts";
export type { CssBucket, CssReport } from "./graph/css.ts";
export { CSS_BUCKETS } from "./graph/css.ts";
export type { DomBucket, DomReport, Unresolved, World } from "./graph/dom.ts";
export { DOM_BUCKETS, WORLDS } from "./graph/dom.ts";
export { GRAPH_DUMP_FORMAT } from "./graph/dump.ts";
export type { FieldsReport } from "./graph/fields.ts";
export type { MemberScanReport } from "./graph/members.ts";
export type { Ablation, GraphOptions, Trace, WhyTarget } from "./graph/options.ts";
export { ABLATIONS, FRESH_BUILD } from "./graph/options.ts";
export type { ParamsReport } from "./graph/params.ts";
export type { ProceduresReport } from "./graph/procedures.ts";
export { OUTSIDE_CALLERS } from "./graph/procedures.ts";
export type { GraphProfileReport } from "./graph/profile.ts";
export { PROFILE_PHASES } from "./graph/profile.ts";
export type { Query, QueryAnswer } from "./graph/query.ts";
export { QUERIES } from "./graph/query.ts";
export type { RemovedKeysReport } from "./graph/removed-keys.ts";
export type { GraphScan, GraphSessionReport, GraphVerification, WithSession } from "./graph/scan.ts";
export {
  codesGraph,
  columnsGraph,
  cssGraph,
  domGraph,
  fieldsGraph,
  memberScanGraph,
  paramsGraph,
  proceduresGraph,
  queryGraph,
  removedKeysGraph,
  scanGraph,
  shapesGraph,
  trialGraph,
  unionsGraph,
  verifyGraph,
} from "./graph/scan.ts";
export type { ShapesReport } from "./graph/shapes.ts";
export type { TrialReport } from "./graph/trial.ts";
export type { UnionsReport } from "./graph/unions.ts";
export type { Verdict, Verified } from "./graph/verify.ts";
export { VERDICTS } from "./graph/verify.ts";
export type { JudgedEntry } from "./judged.ts";
export { constituents, DEFAULT_LIBRARY, hasFlag, homeFiles, NativeWorld, propertiesNamed } from "./native.ts";
export { joinOptionalConstructions, optionalConstructionFacts } from "./optional-constructions.ts";
export type { OptionalInventory } from "./optional-inventory.ts";
export type { PluginSources } from "./optional-population.ts";
export { isProduction as isOptionalProduction, pluginAuthorWorlds, pluginSources } from "./optional-population.ts";
export { publishedSdkSources } from "./plugin-surface.ts";
export type { PortCensus } from "./port-census.ts";
export { portCensus } from "./port-census.ts";
export type { PortTarget, TargetKind } from "./port-targets.ts";
export { runUnwired, TRIAL_VERB } from "./run.ts";
export { isProduction, packageWorlds } from "./worlds.ts";
