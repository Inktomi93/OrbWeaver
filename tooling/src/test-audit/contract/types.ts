// The edge table's shapes: one row per test case and production file range it reaches.

/** A production file range a trace cites. Both lines are null when the trace names the whole file. */
export interface ProductionRef {
  readonly path: string;
  readonly startLine: number | null;
  readonly endLine: number | null;
}

/** Where an edge came from: the auditor's trace, or CodeGraph's callees of the test file for a case whose
 *  trace cites no production file. */
export const EDGE_SOURCES = ["trace", "codegraph"] as const;
export type EdgeSource = (typeof EDGE_SOURCES)[number];

/** One test case to one production range. Each end carries the revision its lines are read at. */
export interface Edge extends ProductionRef {
  readonly recordId: string;
  readonly testPath: string;
  readonly caseName: string;
  readonly testRevision: string;
  readonly edgeRevision: string;
  readonly source: EdgeSource;
}

/** Why an edge no longer holds: its test file changed, or its production range did. */
export type StaleEnd = "test" | "production";

export interface JudgedEdge extends Edge {
  readonly stale: readonly StaleEnd[];
}

/** One changed run of old-file lines from `git diff -U0`. `count` is zero for a pure insertion after `start`. */
export interface Hunk {
  readonly start: number;
  readonly count: number;
}

/** Per path, the changed old-file lines since a revision. */
export type ChangedLines = ReadonlyMap<string, readonly Hunk[]>;
