import type { Node, Type, TypeAliasDeclaration, TypeNode, TypeReferenceNode, ts } from "ts-morph";

export interface NativeGenericArgumentInput {
  readonly reference: TypeReferenceNode;
  readonly argument: TypeNode;
  readonly binding?: Node;
  readonly program: ts.Program;
  readonly source: ts.SourceFile;
}

/** Native value-type contribution only; authored declaration ownership requires a separate binding-origin witness. */
export interface NativeGenericArgumentContribution {
  readonly utility: TypeAliasDeclaration;
  readonly argument: TypeNode;
  readonly binding?: Node;
  readonly contributes: boolean;
  readonly witnesses: readonly Type[];
  readonly detail: string;
}
