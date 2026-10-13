// Persisted column provenance and consumer-judged normalization data belong to one native snapshot.
import type { Node, ts } from "ts-morph";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { SchemaColumn, SchemaModel, SchemaTable } from "./schema-model-contract.ts";

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

export interface JsonNormalizerProof {
  readonly historicalHeal: boolean;
  readonly schema: Node;
}

export interface DrizzleNormalization {
  readonly proof: JsonNormalizerProof;
  readonly matches: ReadonlyMap<SchemaColumn, DrizzleNormalizationMatch>;
}

export interface DrizzleNormalizationMatch {
  readonly whole: boolean;
  readonly fields: ReadonlySet<string>;
}

export interface DrizzleNormalizerSnapshot {
  readonly program: ts.Program;
  readonly source: ts.SourceFile;
  readonly fact: ReferenceFact<DrizzleNormalization | undefined>;
}

export interface DrizzleValueContext {
  readonly schema: SchemaModel;
  readonly bindings: ReadonlyMap<Node, Node>;
  readonly active: ReadonlySet<object>;
  readonly normalizers: ReadonlyMap<ts.CallExpression, DrizzleNormalizerSnapshot>;
}
