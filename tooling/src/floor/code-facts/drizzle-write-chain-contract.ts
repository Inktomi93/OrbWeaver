import type { CallExpression, Node } from "ts-morph";
import type { ReferenceFact, UnresolvedReferenceFact } from "./reference-fact-contract.ts";

/** The invoked write member's native declarations, including an explicit empty declaration set. */
export interface CalledMember {
  readonly name: string;
  readonly nameNode: Node;
  readonly declarations: readonly Node[];
}

/** Source observations precede the consumer's decision about which declarations admit a writer. */
export type DrizzleWriteChain =
  | { readonly kind: "root"; readonly node: CallExpression; readonly member: ReferenceFact<CalledMember>; readonly table: Node | undefined }
  | {
      readonly kind: "call";
      readonly node: CallExpression;
      readonly returns: ReferenceFact<readonly DrizzleWriteChain[]>;
      readonly arguments: readonly DrizzleWriteChain[];
    }
  | { readonly kind: "empty"; readonly node: Node }
  | { readonly kind: "unresolved"; readonly fact: UnresolvedReferenceFact };

/** One observed root keeps its table argument separate from declaration admission. */
export interface DrizzleWriteRoot {
  readonly node: CallExpression;
  readonly member: ReferenceFact<CalledMember>;
  readonly table: Node;
}
