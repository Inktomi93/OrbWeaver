// `test-audit`: the test audit as an edge table of test case to production range, with staleness judged
// against the working tree. `cli.ts` is the argv door and `pnpm test-audit` the front door.
export type { ChangedLines, Edge, EdgeSource, Hunk, JudgedEdge, ProductionRef, StaleEnd } from "./contract/types.ts";
export { EDGE_SOURCES } from "./contract/types.ts";
export { changedLines, rangeChanged } from "./lib/diff.ts";
export { productionRefs } from "./lib/trace.ts";
export type { BuildInputs, BuildSummary, ReaderAgreement } from "./ops/edges.ts";
export { buildEdges, codegraphAgreement, judgeEdges, provesFile, touchedBy } from "./ops/edges.ts";
export { formatAgreement, formatEdges } from "./ops/report.ts";
