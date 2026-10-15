// Executed SQL INSERT source identity and its authored header.
import type { Node } from "ts-morph";
import type { CallReturnProgram, MemberReference, ModuleMemberOrigin, ReferenceFact } from "./reference-fact-contract.ts";

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
export type SqlFragmentsReader = (node: Node, bindings?: ReadonlyMap<Node, Node>) => readonly (string | undefined)[] | undefined;

/** Native projection origin requires the same complete select-containment judgment. */
export type SqlSelectContainment = (node: Node, bindings?: ReadonlyMap<Node, Node>) => boolean;

/** SQL interpretation uses only the supplied same-world callable graph and argument bindings. */
export interface SqlReadContext {
  readonly bindings: ReadonlyMap<Node, Node>;
  readonly program: CallReturnProgram | undefined;
}

/** Each actual selection alternative supplies its own callback field bindings. */
export interface SqlSelectionCallback {
  readonly callback: Node;
  readonly bindings: readonly ReadonlyMap<Node, Node>[];
}
