// Predicate structure is source evidence, not a tenancy verdict.
import type { Node } from "ts-morph";

export type DrizzlePredicate =
  | { readonly kind: "and" | "or" | "choice"; readonly node: Node; readonly terms: readonly DrizzlePredicate[] }
  | { readonly kind: "leaf"; readonly node: Node; readonly bindings: ReadonlyMap<Node, Node> }
  | { readonly kind: "unresolved" | "empty"; readonly node: Node };
