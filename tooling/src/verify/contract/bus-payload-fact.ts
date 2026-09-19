// The closed vocabulary shared by the `bus-payload` reader family's AST-resolution leaves
// (`lib/bus-payload-fact-resolve.ts`, `lib/bus-payload-fact.ts`).
import type { InterfaceDeclaration, Node as MorphNode, TypeAliasDeclaration } from "ts-morph";

export type NamedTypeDecl = InterfaceDeclaration | TypeAliasDeclaration;

/** What an `X[I]` type node in a member position IS, for this reader. */
export type IndexedRead =
  /** `Named[K]` — a shape the position REFERENCES, so the non-transitive boundary decides it. */
  | { readonly kind: "referenced" }
  /** A mapped type whose key space this reader cannot enumerate — an open key space, fail closed. */
  | { readonly kind: "unprovable" }
  /** `{ [K in <finite union>]: T }[<subset>]` — the arms are provable and T is their shared shape. */
  | { readonly kind: "distributed"; readonly template: MorphNode };
