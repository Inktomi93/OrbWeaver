import type { ExpressionWithTypeArguments, InterfaceDeclaration, Node, Type, TypeAliasDeclaration, TypeNode, TypeReferenceNode, ts } from "ts-morph";

export interface NativeGenericArgumentInput {
  readonly reference: TypeReferenceNode | ExpressionWithTypeArguments;
  readonly argument: TypeNode;
  readonly binding?: Node;
  readonly program: ts.Program;
  readonly source: ts.SourceFile;
}

/** Native value-type contribution only; authored declaration ownership requires a separate binding-origin witness. */
export interface NativeGenericArgumentContribution {
  readonly utility: TypeAliasDeclaration | InterfaceDeclaration;
  readonly argument: TypeNode;
  readonly binding?: Node;
  readonly contributes: boolean;
  readonly witnesses: readonly Type[];
  readonly detail: string;
}
