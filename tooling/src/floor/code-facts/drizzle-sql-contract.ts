// Executed SQL INSERT source identity and its authored header.
import type { Node } from "ts-morph";
import type { MemberReference, ModuleMemberOrigin, ReferenceFact } from "./reference-fact-contract.ts";

export type SqlTemplateCarrier =
  | { readonly kind: "bare"; readonly template: Node }
  | { readonly kind: "tagged"; readonly template: Node; readonly callee: Node; readonly origin: ReferenceFact<ModuleMemberOrigin> }
  | {
      readonly kind: "call";
      readonly template: Node;
      readonly callee: Node;
      readonly origin: ReferenceFact<ModuleMemberOrigin>;
      readonly member: ReferenceFact<MemberReference>;
    };
export interface ExecutedSqlInsert {
  readonly table: string;
  readonly columns: readonly string[];
  readonly node: Node;
}

/** The single lexical composition reader supplied to native constructors. */
export type SqlFragmentsReader = (node: Node) => readonly (string | undefined)[] | undefined;

/** Native projection origin requires the same complete select-containment judgment. */
export type SqlSelectContainment = (node: Node) => boolean;
