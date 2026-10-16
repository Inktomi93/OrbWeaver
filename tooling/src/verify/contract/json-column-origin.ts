import type { CallExpression, Node, ObjectLiteralExpression } from "ts-morph";
import type { DrizzleValueContext } from "../../floor/code-facts/drizzle-origin-contract.ts";
import type { SchemaProjectedColumn, SchemaProjectedTable } from "../../floor/code-facts/schema-projection-contract.ts";
import type { NativeTypeSelectionPlan, NativeTypeSelections } from "../../floor/code-facts/type-projection-contract.ts";

export type { JsonColumnOrigin, JsonNormalizerProof } from "../../floor/code-facts/drizzle-origin-contract.ts";

export interface JsonColumnSchemaReaders {
  readonly member: (node: Node) => ReturnType<typeof import("../../floor/code-facts/reference-fact.ts").staticMemberAccess>;
  readonly module: typeof import("../../floor/code-facts/reference-fact.ts").resolveModuleMemberOrigin;
  readonly global: typeof import("../../floor/code-facts/reference-fact.ts").resolveGlobalMemberOrigin;
  readonly stable: typeof import("../../floor/code-facts/reference-fact.ts").resolveStableExpression;
  readonly callable: typeof import("../../floor/code-facts/reference-fact-call.ts").resolveCallableOrigin;
  readonly declaration: typeof import("../../floor/code-facts/reference-fact-call.ts").resolveCallableDeclaration;
  readonly string: typeof import("../../floor/code-facts/reference-fact.ts").readStaticString;
  readonly authored: typeof import("../../floor/code-facts/static-authored-value.ts").readStaticAuthoredValue;
  readonly composite: typeof import("../../floor/code-facts/static-authored-value.ts").resolveAuthoredComposite;
  readonly lexical: (node: Node) => import("../../floor/code-facts/type-projection-contract.ts").NativeLexicalTypeProjection;
  readonly propertyDeclarations: (node: Node, name: string, nonnullable: boolean) => readonly Node[];
}

export interface JsonColumnOriginContext extends DrizzleValueContext {
  readonly schemaReaders: JsonColumnSchemaReaders;
  readonly typeSelections: (plan: NativeTypeSelectionPlan) => NativeTypeSelections;
  readonly writerReaders?: JsonColumnWriterReaders;
  readonly mergeActive: ReadonlySet<object>;
}

export interface JsonColumnMergeProof {
  readonly keywise: boolean;
  readonly historicalHeal: boolean;
}

export interface JsonColumnTarget {
  readonly table: SchemaProjectedTable;
  readonly column: SchemaProjectedColumn;
}

export interface JsonColumnParseReaders {
  readonly parse: (call: CallExpression) => boolean;
  readonly target: typeof import("../../floor/code-facts/call-returns.ts").readCallTarget;
  readonly references: typeof import("../../floor/code-facts/value-carrier.ts").referencesOf;
}
export interface JsonColumnReadReaders extends JsonColumnParseReaders {
  readonly writeColumn: (site: Node, column: string) => boolean;
  readonly insertModel: (literal: ObjectLiteralExpression) => boolean;
}

export interface JsonColumnWriterReaders {
  readonly member: JsonColumnSchemaReaders["member"];
  readonly roots: typeof import("../../floor/code-facts/drizzle-write-chain.ts").readDrizzleWriteRoots;
  readonly source: typeof import("../../floor/code-facts/drizzle-writer-source.ts").readDrizzleWriterSource;
  readonly table: (node: Node) => import("../../floor/code-facts/reference-fact-contract.ts").ReferenceFact<SchemaProjectedTable>;
}

export interface JsonColumnObservationReaders {
  readonly graph: import("../../floor/code-facts/ordinary-observations-contract.ts").NativeOrdinaryObservations;
  readonly schemaReaders: JsonColumnSchemaReaders;
  readonly originReaders: import("../../floor/code-facts/drizzle-origin-contract.ts").DrizzleOriginReaders;
  readonly rowReaders: import("../../floor/code-facts/drizzle-row-contract.ts").RowReadServices;
  readonly readReaders: JsonColumnReadReaders;
  readonly writerReaders: JsonColumnWriterReaders;
  readonly selected: (
    selector: import("../../floor/code-facts/type-projection-contract.ts").NativeTypeSelector,
  ) => import("../../floor/code-facts/type-projection-contract.ts").NativeSelectedType | null;
  readonly typeSelections: (plan: NativeTypeSelectionPlan) => NativeTypeSelections;
  readonly returned: (
    node: Node,
    path: readonly string[],
  ) => import("../../floor/code-facts/reference-fact-contract.ts").ReferenceFact<
    readonly import("../../floor/code-facts/reference-fact-contract.ts").ReturnedValueSource[]
  >;
  readonly exports: (source: import("ts-morph").SourceFile) => readonly string[];
}
