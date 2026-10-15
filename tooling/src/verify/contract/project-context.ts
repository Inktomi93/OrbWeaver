// THE WHOLE-PROJECT READ CONTEXT — root, the ONE shared ts-morph workspace, and the source files it
// resolved. Minted at #2176 Phase F (2026-09-14) out of the legacy `GateRunCtx`'s three surviving fields:
// the descriptor contract retired with `lib/pass.ts`, but the real-tree entrypoints that used to build a
// run context still need one shared workspace read (`ops/structure.ts`, `ops/scoped.ts`,
// `ops/gen/caught-failure-population.ts` and the repo-int suites that drive a policy pass by hand).
//
// It carries NO `scope` and NO `checker`: the final dispatcher resolves its own population from
// `requestedPaths` and acquires the checker through the policy context, so re-exposing either here would
// be a second spelling of a decision `lib/policy-pass.ts` already owns.

import type { AsExpression, CallExpression, Node, Project, SourceFile, TypeNode } from "ts-morph";
import type { TypeRelation } from "../../floor/code-facts/assignability.ts";
import type { CallableDeclaration, ReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import type { InventoryRuntimeExport, InventoryShapeQuery } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { NativeCallMemberOrigin } from "../../floor/code-facts/type-member-origin-contract.ts";
import type { SemanticSourceView } from "../../floor/compiler/ts-workspace-contract.ts";

export type NativeTypeRequest =
  | { readonly kind: "cast-relations"; readonly nodes: readonly AsExpression[] }
  | { readonly kind: "id-brands"; readonly nodes: readonly TypeNode[] }
  | { readonly kind: "runtime-exports"; readonly nodes: readonly SourceFile[] }
  | { readonly kind: "declaration-outputs"; readonly nodes: readonly Node[] }
  | { readonly kind: "type-member-origins"; readonly nodes: readonly CallExpression[] }
  | { readonly kind: "callable-declarations"; readonly nodes: readonly CallExpression[] }
  | { readonly kind: "computed-names"; readonly nodes: readonly Node[] }
  | { readonly kind: "shape-relations"; readonly nodes: readonly SourceFile[]; readonly prepare: () => readonly InventoryShapeQuery[] };

/** A producer owns native or isolated-proof provenance; neither exposes a checker through this capability. */
export interface NativeTypeFactReader extends Disposable {
  readonly computedNames: (nodes: readonly Node[]) => ReadonlyMap<Node, ReferenceFact<string>>;
  readonly callableDeclarations: (nodes: readonly CallExpression[]) => ReadonlyMap<CallExpression, ReferenceFact<CallableDeclaration>>;
  readonly callMemberOrigins: (nodes: readonly CallExpression[]) => ReadonlyMap<CallExpression, NativeCallMemberOrigin>;
  readonly declarationOutputs: (nodes: readonly Node[]) => ReadonlyMap<Node, boolean | null>;
  readonly prepareShapes: (sources: readonly SourceFile[]) => void;
  readonly runtimeExports: (nodes: readonly SourceFile[]) => ReadonlyMap<SourceFile, readonly InventoryRuntimeExport[]>;
  readonly castRelations: (nodes: readonly AsExpression[]) => ReadonlyMap<AsExpression, TypeRelation>;
  readonly idBrands: (nodes: readonly TypeNode[]) => ReadonlyMap<TypeNode, string | null>;
}

export interface NativeTypeContext {
  readonly computedNames: NativeTypeFactReader["computedNames"];
  readonly callableDeclarations: NativeTypeFactReader["callableDeclarations"];
  readonly callMemberOrigins: NativeTypeFactReader["callMemberOrigins"];
  readonly declarationOutputs: NativeTypeFactReader["declarationOutputs"];
  readonly prepareShapes: NativeTypeFactReader["prepareShapes"];
  readonly runtimeExports: NativeTypeFactReader["runtimeExports"];
  readonly request: (query: NativeTypeRequest) => void;
  readonly castRelations: NativeTypeFactReader["castRelations"];
  readonly idBrands: NativeTypeFactReader["idBrands"];
}

/** Registration is owner-scoped during the existing walk; a sealed run reads one closed native generation. */
export interface NativeTypeFacts extends Disposable {
  readonly computedNames: (owner: string, nodes: readonly Node[]) => ReturnType<NativeTypeFactReader["computedNames"]>;
  readonly callableDeclarations: (owner: string, nodes: readonly CallExpression[]) => ReturnType<NativeTypeFactReader["callableDeclarations"]>;
  readonly callMemberOrigins: (owner: string, nodes: readonly CallExpression[]) => ReturnType<NativeTypeFactReader["callMemberOrigins"]>;
  readonly declarationOutputs: (owner: string, nodes: readonly Node[]) => ReturnType<NativeTypeFactReader["declarationOutputs"]>;
  readonly prepareShapes: (owner: string, sources: readonly SourceFile[]) => void;
  readonly runtimeExports: (owner: string, nodes: readonly SourceFile[]) => ReturnType<NativeTypeFactReader["runtimeExports"]>;
  readonly request: (owner: string, query: NativeTypeRequest) => void;
  readonly seal: (owners: ReadonlySet<string>) => void;
  readonly castRelations: (owner: string, nodes: readonly AsExpression[]) => ReadonlyMap<AsExpression, TypeRelation>;
  readonly idBrands: (owner: string, nodes: readonly TypeNode[]) => ReadonlyMap<TypeNode, string | null>;
}

export interface ProjectContext {
  readonly nativeTypeFacts?: () => NativeTypeFacts;
  /** On-demand canonical primary owner; ordinary syntax and checker selection remain unchanged. */
  readonly nativeSourceView?: (path: string) => SemanticSourceView | undefined;
  readonly root: string;
  /** The ONE shared workspace (`floor/compiler/ts-workspace.ts#getWorkspace`) — never a per-caller Project. */
  readonly project: Project;
  /** Every source file that workspace resolved, read once. */
  readonly files: readonly SourceFile[];
}
