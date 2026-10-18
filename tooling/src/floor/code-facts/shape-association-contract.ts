import type { Expression, InterfaceDeclaration, Node, TypeAliasDeclaration } from "ts-morph";

export interface ShapeAssociationSite {
  readonly boundary: Node;
  readonly value: Expression;
  readonly target: Node;
  readonly argument?: number;
  readonly assignment?: boolean;
}

export interface ShapeAssociation {
  readonly hand: InterfaceDeclaration | TypeAliasDeclaration;
  readonly production: InterfaceDeclaration | TypeAliasDeclaration;
  readonly boundary: Node;
}

export type ShapeAssociationRead =
  | { readonly kind: "associated"; readonly value: ShapeAssociation }
  | { readonly kind: "unassociated" }
  | { readonly kind: "unknown"; readonly boundary: Node; readonly reason: string };
