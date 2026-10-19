// Ordinary captured call cohorts retain raw leaves and native questions, never consumer verdicts.
import type { CallExpression, Node, SourceFile } from "ts-morph";
import type { DrizzleSelection } from "./drizzle-select-contract.ts";
import type { CalledMember, DrizzleWriteRoot } from "./drizzle-write-chain-contract.ts";
import type { DrizzleWriterSource } from "./drizzle-writer-source-contract.ts";
import type { CallableDeclaration, ReferenceFact, ReturnedValueSource } from "./reference-fact-contract.ts";
import type { DeclaredCallTerminalSelection } from "./type-member-origin-contract.ts";
import type { NativeTypeProjection, NativeTypeSelections } from "./type-projection-contract.ts";

/** Array members whose call result a JSON column field may flow through unchanged; the planner asks column-field questions only at these calls. */
export const ORDINARY_ARRAY_REMAPS: ReadonlySet<string> = new Set(["filter", "map"]);

export interface OrdinaryObservationDemand<Anchor = Node> {
  readonly roots: readonly Anchor[];
  readonly reads: readonly { readonly node: Anchor; readonly path: readonly string[] }[];
  readonly terminals: DeclaredCallTerminalSelection;
}

export interface NativeOrdinaryNode {
  readonly node: Node;
  readonly type: NativeTypeProjection;
  readonly members: readonly { readonly name: string; readonly type: NativeTypeProjection }[];
  readonly callable: ReturnType<typeof import("./reference-fact-call.ts").resolveCallableOrigin>;
  readonly declaration: ReferenceFact<CallableDeclaration>;
  readonly table: ReferenceFact<string> | null;
  readonly column: ReferenceFact<string> | null;
  readonly valueDeclaration: Node | null;
  readonly rowIdentity: { readonly kind: "value"; readonly value: Node | null } | { readonly kind: "refusal"; readonly message: string };
  readonly writer: DrizzleWriterSource;
  readonly roots: readonly {
    readonly verb: "update" | "insert";
    readonly fact: ReferenceFact<readonly DrizzleWriteRoot[]>;
  }[];
}

export interface NativeOrdinaryCall {
  readonly call: CallExpression;
  readonly target: ReturnType<typeof import("./call-returns.ts").readCallTarget>;
  readonly returns: ReturnType<typeof import("./call-returns.ts").readCallReturns>;
  readonly calledMember: ReferenceFact<CalledMember>;
  readonly memberOrigin: ReferenceFact<readonly Node[]>;
  readonly selection: DrizzleSelection | null;
  readonly bindings: readonly { readonly owner: Node; readonly clears: readonly Node[]; readonly values: readonly (readonly [Node, Node])[] }[];
}

export interface NativeOrdinaryObservations {
  readonly anchor: SourceFile;
  readonly schemaStatus: import("./schema-model-contract.ts").SchemaFactStatus | "unavailable";
  readonly schemaReason: string | null;
  readonly assertNode: (node: Node) => void;
  readonly demand: OrdinaryObservationDemand;
  readonly profileNodes: readonly Node[];
  readonly keys: readonly Node[];
  readonly closureCalls: readonly CallExpression[];
  readonly initialCalls: readonly CallExpression[];
  readonly terminals: readonly CallExpression[];
  readonly returned: readonly { readonly node: Node; readonly path: readonly string[]; readonly fact: ReferenceFact<readonly ReturnedValueSource[]> }[];
  readonly nodes: readonly NativeOrdinaryNode[];
  readonly calls: readonly NativeOrdinaryCall[];
  readonly references: readonly { readonly node: Node; readonly scope: Node; readonly uses: readonly Node[] }[];
  readonly exports: readonly { readonly source: SourceFile; readonly names: readonly string[] }[];
  readonly types: NativeTypeSelections | null;
}

export interface OrdinaryObservationOwner {
  readonly query: import("./schema-model-contract.ts").SchemaQuery | undefined;
  readonly anchor: Node;
  readonly related: (node: Node) => Node;
  readonly profile: (node: Node) => void;
}
