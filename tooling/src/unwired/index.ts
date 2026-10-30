// The unwired scan and the restated-port matcher: `pnpm unwired` reports members no production code reaches,
// `pnpm unwired ports` lists the port members that hand-restate another member. Never in CI, never a gate.

export type { DeliberateEntry } from "./deliberate.ts";
export { DELIBERATE } from "./deliberate.ts";
export type { ServerReferences } from "./language-server.ts";
export { serverReferences } from "./language-server.ts";
export type { MemberReferences } from "./language-service.ts";
export { scanWorld } from "./language-service.ts";
export type { PortCensus, PortTarget, TargetImport, TargetKind } from "./port-census.ts";
export { LEGS, portCensus, TARGET_KINDS } from "./port-census.ts";
export type { Placement, PortMember, Relation, Restatement } from "./restated-port.ts";
export { effectiveMember, isConceptFreeCallback, isHandTyped, memberLabel, placementOf, RELATION, restatementsAt, tierRank } from "./restated-port.ts";
export { runUnwired } from "./run.ts";
export type { UnwiredKind, UnwiredMember, UnwiredReport } from "./scan.ts";
export { scanUnwired, UNWIRED_KINDS } from "./scan.ts";
