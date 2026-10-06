import type { Node } from "ts-morph";
import type { SchemaColumn, SchemaModel, SchemaTable } from "./schema-fact.ts";

/** Actual producer provenance, not a promise inferred from an annotated Row return. */
export type JsonColumnOrigin =
  | { readonly kind: "caller" }
  | { readonly kind: "missing" }
  | { readonly kind: "rows" | "row"; readonly table: SchemaTable; readonly projection: Node | undefined }
  | {
      readonly kind: "column";
      readonly table: SchemaTable;
      readonly column: SchemaColumn;
      readonly field: string | undefined;
      readonly historicalHeal: boolean;
    };

export interface JsonColumnOriginContext {
  readonly schema: SchemaModel;
  readonly bindings: ReadonlyMap<Node, Node>;
  readonly active: ReadonlySet<object>;
  readonly mergeActive: ReadonlySet<object>;
}

export interface JsonColumnMergeProof {
  readonly keywise: boolean;
  readonly historicalHeal: boolean;
}

export interface JsonColumnTarget {
  readonly table: SchemaTable;
  readonly column: SchemaColumn;
}

export interface JsonNormalizerProof {
  readonly historicalHeal: boolean;
  readonly schema: Node;
}
