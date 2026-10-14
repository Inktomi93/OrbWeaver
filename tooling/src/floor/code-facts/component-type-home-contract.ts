import type { InterfaceDeclaration, Node, ParameterDeclaration, TypeAliasDeclaration, ts } from "ts-morph";
import type { SemanticSourceView } from "../compiler/ts-workspace-contract.ts";
import type { ShapeCopyComparison } from "./shape-copy-contract.ts";

export interface ComponentTypeHomeView extends SemanticSourceView {
  readonly nativeProgram: ts.Program;
  readonly nativeSource: ts.SourceFile;
}

export interface ComponentTypeHomeInput {
  readonly declaration: InterfaceDeclaration | TypeAliasDeclaration;
  readonly path: string;
  readonly view: ComponentTypeHomeView;
  /** Explicit native supporting sources; actual declaration edges, not membership, prove contribution. */
  readonly supportingViews?: readonly ComponentTypeHomeView[];
  /** Supplied native lower-owner declarations; an empty or partial set cannot prove absence of copies. */
  readonly lowerDeclarations: readonly (InterfaceDeclaration | TypeAliasDeclaration)[];
}

export interface ComponentRenderEvidence {
  readonly callable: Node;
  readonly parameter: ParameterDeclaration;
  readonly returns: readonly Node[];
  readonly supportingDeclarations: readonly (InterfaceDeclaration | TypeAliasDeclaration)[];
}

export type ComponentLowerDataEvidence =
  | { readonly kind: "derived"; readonly origins: readonly Node[] }
  | { readonly kind: "unqualified"; readonly reason: string; readonly comparisons: readonly ShapeCopyComparison[] };

/** Owned proves component API placement only. Its lower-data plane is independent and is never an acquittal by nonmatch. */
export type ComponentTypeHomeResult =
  | { readonly kind: "owned"; readonly component: ComponentRenderEvidence; readonly lowerData: ComponentLowerDataEvidence }
  | { readonly kind: "refused"; readonly reason: string }
  | {
      readonly kind: "unqualified";
      readonly reason: string;
      readonly component: ComponentRenderEvidence | null;
      readonly lowerData: ComponentLowerDataEvidence;
    };

export class ComponentTypeHomeComparisonError extends Error {}
