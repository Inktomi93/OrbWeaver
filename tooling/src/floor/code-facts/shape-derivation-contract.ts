import type {
  ClassDeclaration,
  ExpressionWithTypeArguments,
  InterfaceDeclaration,
  Node,
  Type,
  TypeAliasDeclaration,
  TypeNode,
  TypeReferenceNode,
  ts,
} from "ts-morph";

import type { NativeParserTypeContext } from "./type-member-origin-contract.ts";

export interface NativeGenericArgumentInput {
  readonly parser?: NativeParserTypeContext;
  readonly reference: TypeReferenceNode | ExpressionWithTypeArguments;
  readonly argument: TypeNode;
  readonly binding?: Node;
  readonly program: ts.Program;
  readonly source: ts.SourceFile;
}

/** Native value-type contribution only; authored declaration ownership requires a separate binding-origin witness. */
export interface NativeGenericArgumentContribution {
  readonly utility: TypeAliasDeclaration | InterfaceDeclaration | ClassDeclaration;
  readonly argument: TypeNode;
  readonly binding?: Node;
  readonly contributes: boolean;
  readonly witnesses: readonly Type[];
  readonly detail: string;
}
