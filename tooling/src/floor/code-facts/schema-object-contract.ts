// Authored object members retain source provenance and empty binding/spread observations.
import type { Node, ObjectLiteralExpression } from "ts-morph";
import type { ResolvedReferenceFact } from "./reference-fact-contract.ts";

export interface SchemaObjectEntry {
  readonly name: string;
  readonly nameNode: Node;
  readonly literalString: boolean;
  readonly key: ResolvedReferenceFact<string | number>;
  readonly node: Node;
  readonly value: Node;
}

export interface SchemaObjectMembers {
  readonly object: ObjectLiteralExpression;
  readonly entries: readonly SchemaObjectEntry[];
  readonly emptySources: readonly { readonly node: Node; readonly bound: boolean; readonly spread: boolean }[];
}
