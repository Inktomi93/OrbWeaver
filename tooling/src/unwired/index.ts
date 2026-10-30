// The unwired scan and the restated-port matcher: `pnpm unwired` reports members no production code reaches,
// `pnpm unwired ports` lists the port members that hand-restate another member. Never in CI, never a gate.

export { passesDbHandle, runtimeTypes } from "./foreign-types.ts";
export { serverReferences } from "./language-server.ts";
export { scanWorld } from "./language-service.ts";
export type { PortCensus } from "./port-census.ts";
export { portCensus } from "./port-census.ts";
export type { PortTarget, TargetKind } from "./port-targets.ts";
export type { Restatement } from "./restated-port.ts";
export { memberLabel, RELATION, restatementsAt } from "./restated-port.ts";
export { runUnwired } from "./run.ts";
export { scanUnwired } from "./scan.ts";
