// Fluent select observations retain their real calls for each consumer's identity judgment.
import type { CallExpression, Node } from "ts-morph";

export interface DrizzleSelection {
  readonly root: CallExpression;
  readonly source: Node | undefined;
  readonly projection: Node | undefined;
  readonly output: "row" | "rows";
  readonly calls: readonly CallExpression[];
  readonly sqlOperands: readonly Node[];
}

/** Column lineage from an explicit member or an actual single-table full-row schema field. */
export interface DrizzleProjectedColumn {
  readonly name: string;
  readonly receiver: Node;
  readonly origin: Node;
}
