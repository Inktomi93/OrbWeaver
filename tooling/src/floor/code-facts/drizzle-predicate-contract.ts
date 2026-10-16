// Predicate structure is source evidence, not a tenancy verdict.
import type { Node } from "ts-morph";

export const DRIZZLE_PREDICATE_PRESENCES = ["absent", "optional", "present"] as const;
export const DRIZZLE_PREDICATE_GROUP_KINDS = ["and", "or", "choice"] as const;
export const DRIZZLE_PREDICATE_TERMINAL_KINDS = ["unresolved", "empty"] as const;

export type DrizzlePredicate = (
  | { readonly kind: (typeof DRIZZLE_PREDICATE_GROUP_KINDS)[number]; readonly node: Node; readonly terms: readonly DrizzlePredicate[] }
  | { readonly kind: "leaf"; readonly node: Node; readonly bindings: ReadonlyMap<Node, Node> }
  | { readonly kind: (typeof DRIZZLE_PREDICATE_TERMINAL_KINDS)[number]; readonly node: Node }
) & { readonly contained: boolean; readonly presence: (typeof DRIZZLE_PREDICATE_PRESENCES)[number] };
