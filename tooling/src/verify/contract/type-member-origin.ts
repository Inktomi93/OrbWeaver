// The closed vocabulary returned by the shared TYPE-level origin readers.
//
// `reference-fact.ts` answers "where does this VALUE come from" by walking bindings to a module export or
// an ambient global. A large family of client policies cannot ask that question at all: their subject is a
// MEMBER of a receiver that was produced at runtime (`useTRPC()`, `useQueryClient()`, a store hook, a form
// api, a mutation result). The value walk correctly refuses those — a call result is a dynamic terminal —
// so the only identity available is the TYPE the checker resolved for the receiver, and the DECLARATION the
// property symbol came from. That declaration is the member's one home, and it is exactly what separates
// `queryClient.setQueryData` from `myCache.setQueryData`.
//
// The same refusal contract as `reference-fact.ts`: a positive value with its proof, or one precise
// refusal. Absence is never a verdict.
import type { Symbol as MorphSymbol, Node } from "ts-morph";

/** One property read whose property SYMBOL the checker resolved off the receiver's type. */
export interface TypeMemberOrigin {
  readonly name: string;
  /** The member access node the read was normalized from (dotted, optional, or computed-literal). */
  readonly access: Node;
  readonly receiver: Node;
  readonly nameNode: Node;
  readonly symbol: MorphSymbol;
  /** Every declaration of the property symbol; an overload set legitimately has more than one. */
  readonly declarations: readonly Node[];
}

/** One property of the CONTEXTUAL type an object literal is being checked against — the identity of a
 *  `{ staleTime: … }` key, which its own literal cannot supply (its symbol declares on the literal). */
export interface ContextualMemberOrigin {
  readonly name: string;
  /** The property assignment the key was read from. */
  readonly assignment: Node;
  readonly nameNode: Node;
  readonly literal: Node;
  readonly symbol: MorphSymbol;
  readonly declarations: readonly Node[];
}

/** A type declaration identity. Resolved-Type readers use the alias symbol when the checker kept one,
 *  otherwise the type's symbol. The value-type query may retain an authored alias identity only when that
 *  reference's resolved type occupies the declared data graph: root/union/intersection types, element/index
 *  types and named data properties. This proves typed containment, not present runtime data or how it is used.
 *  Callable parameters/results and erased reference occurrences do not establish containment, including a
 *  supplied argument erased by a recursively expanding generic. */
export interface TypeIdentityOrigin {
  readonly name: string;
  readonly node: Node;
  /** Resolved-Type readers: the name came from the type's alias symbol (`GatedStoreHook<T>`).
   *  Value-type query's authored provenance: the resolved symbol declares a type alias. */
  readonly aliased: boolean;
  readonly declarations: readonly Node[];
}
