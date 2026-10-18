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

/** Each unsupported direct-boundary identity; none is a clean verdict or a finding. */
export const SHAPE_ASSOCIATION_UNKNOWN = {
  erasedValue: "the direct value has no supported whole named type",
  opaqueValue: "the direct value has a container, wrapper or intersection type that may carry a handwritten declaration",
  unionHand: "the direct value is a union carrying a handwritten declaration",
  manyHands: "the direct value has multiple handwritten declarations",
  unannotatedAssignment: "the assignment target has no direct explicit type annotation",
  unresolvedParameter: "the direct call has no resolved parameter for this argument",
  genericParameter: "the callee declares this parameter as a type parameter whose constraint is not observed",
  unsupportedBoundary: "the boundary has no supported whole named production type",
  manyOwners: "the boundary has multiple canonical production declarations",
} as const;

export type ShapeAssociationUnknown = (typeof SHAPE_ASSOCIATION_UNKNOWN)[keyof typeof SHAPE_ASSOCIATION_UNKNOWN];

export type ShapeAssociationRead =
  | { readonly kind: "associated"; readonly value: ShapeAssociation }
  | { readonly kind: "unassociated" }
  | { readonly kind: "unknown"; readonly reason: ShapeAssociationUnknown };
