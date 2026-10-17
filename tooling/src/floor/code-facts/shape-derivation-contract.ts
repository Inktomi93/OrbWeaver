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
import type nativeTs from "typescript";
import type { NativeParserTypeContext } from "./type-member-origin-contract.ts";

export interface NativeGenericArgumentInput {
  readonly reference: TypeReferenceNode | ExpressionWithTypeArguments;
  readonly argument: TypeNode;
  readonly binding?: Node;
  readonly program: ts.Program;
  readonly source: ts.SourceFile;
}

/** Native value-type contribution only; authored declaration ownership requires a separate binding-origin witness. */
export interface NativeGenericArgumentContribution<
  Anchor = Node,
  ObservedType = Type,
  Utility = TypeAliasDeclaration | InterfaceDeclaration | ClassDeclaration,
> {
  readonly utility: Utility;
  readonly argument: Anchor;
  readonly binding?: Anchor;
  readonly contributes: boolean;
  readonly witnesses: readonly ObservedType[];
  readonly detail: string;
}

export type ParserGenericDeclaration = nativeTs.TypeAliasDeclaration | nativeTs.InterfaceDeclaration | nativeTs.ClassDeclaration;

/** Actual parser/compiler inputs stay raw; Morph inputs retain their separate native compiler above. */
export interface ParserGenericArgumentInput {
  readonly reference: nativeTs.TypeReferenceNode | nativeTs.ExpressionWithTypeArguments;
  readonly argument: nativeTs.TypeNode;
  readonly binding?: nativeTs.Node;
  readonly parser: NativeParserTypeContext;
}
