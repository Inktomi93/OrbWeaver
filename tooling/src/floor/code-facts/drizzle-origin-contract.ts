// Persisted column provenance and consumer-judged normalization data belong to one native snapshot.
import type { CallExpression, Node, ts } from "ts-morph";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { SchemaProjectedColumn, SchemaProjectedModel, SchemaProjectedTable } from "./schema-projection-contract.ts";

export type JsonColumnOrigin =
  | { readonly kind: "caller" }
  | { readonly kind: "missing" }
  | { readonly kind: "rows" | "row"; readonly table: SchemaProjectedTable; readonly projection: Node | undefined }
  | {
      readonly kind: "column";
      readonly table: SchemaProjectedTable;
      readonly column: SchemaProjectedColumn;
      readonly field: string | undefined;
      readonly historicalHeal: boolean;
    };

export interface JsonNormalizerProof {
  readonly historicalHeal: boolean;
  readonly schema: Node;
}

export interface DrizzleNormalization {
  readonly proof: JsonNormalizerProof;
  readonly matches: ReadonlyMap<SchemaProjectedColumn, DrizzleNormalizationMatch>;
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

export interface DrizzleOriginReaders {
  readonly module: typeof import("./reference-fact.ts").resolveModuleMemberOrigin;
  readonly stable: typeof import("./reference-fact.ts").resolveStableExpression;
  readonly member: (node: Node) => ReturnType<typeof import("./reference-fact.ts").staticMemberAccess>;
  readonly valueDeclaration: (node: Node) => Node | undefined;
  readonly declarations: (node: Node) => readonly Node[];
  readonly calledMember: typeof import("./drizzle-write-chain.ts").readCalledMember;
  readonly selection: typeof import("./drizzle-select.ts").readDrizzleSelection;
  readonly rowIdentity: typeof import("./drizzle-row-origin.ts").schemaRowOriginIdentity;
  readonly returns: typeof import("./call-returns.ts").readCallReturns;
  readonly bindings: typeof import("./call-returns.ts").readCallBindings;
}

export interface DrizzleValueContext {
  readonly readers?: DrizzleOriginReaders;
  readonly readNormalizer?: (call: CallExpression) => ReferenceFact<DrizzleNormalization | undefined>;
  readonly schema: SchemaProjectedModel;
  readonly bindings: ReadonlyMap<Node, Node>;
  readonly active: ReadonlySet<object>;
  readonly normalizers: ReadonlyMap<ts.CallExpression, DrizzleNormalizerSnapshot>;
}
