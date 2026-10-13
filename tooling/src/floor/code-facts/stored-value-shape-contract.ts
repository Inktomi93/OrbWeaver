// Native authored value-shape alternatives; consumers decide which shapes give a stored-key vocabulary.
import type { Node, Type } from "ts-morph";

export type StoredValueShape =
  | { readonly kind: "empty" | "sql" | "unresolved" | "typed"; readonly node: Node; readonly type: Type }
  | { readonly kind: "binding" | "call" | "choice"; readonly node: Node; readonly type: Type; readonly values: readonly StoredValueShape[] }
  | { readonly kind: "object"; readonly node: Node; readonly type: Type; readonly members: readonly StoredValueMember[] };

export type StoredValueMember =
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "spread"; readonly value: StoredValueShape }
  | { readonly kind: "computed" | "other" };
