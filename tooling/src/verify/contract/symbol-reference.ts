// The shapes lib/symbol-reference.ts's readers RETURN. Homed here (not beside the reader) because the
// five-slot template puts every exported shape in contract/ (docs/law/Core-Tooling-Law.md
// §2.5) and `no-inline-types` enforces it; lib/symbol-reference.ts is the machine, this is its vocabulary.
import type { Node } from "ts-morph";

/** ONE member read off a receiver, whatever the spelling — `x.foo`, `x?.foo`, `x["foo"]`, `x?.["foo"]`,
 *  and `x[KEY]` where a same-file `const KEY = "foo"` names it.
 *
 *  A gate that recognises `.foo` through `PropertyAccessExpression.getName()` alone is blind to the
 *  bracket spellings of the SAME semantics, and blindness is a silent GREEN (#1506). This record is what
 *  a gate judges instead, so the two spellings cannot disagree. */
export interface MemberRead {
  /** The member name, resolved through the bracket argument when the access is an element access. */
  readonly name: string;
  /** What the member is read OFF — the namespace object, the receiver expression. */
  readonly receiver: Node;
  /** The name identifier (`.foo`) or the bracket argument (`["foo"]`) — where a `token` points. */
  readonly nameNode: Node;
  /** The whole access expression, for a node-anchored `ctx.report`. */
  readonly access: Node;
}

/** How a module's exported member was reached — a named import binding, or a member read off an
 *  `import * as ns` namespace binding. Both are the same reference; only the spelling differs. */
export type ModuleMemberReference =
  | { readonly kind: "named-import"; readonly name: string; readonly specifier: string; readonly node: Node }
  | { readonly kind: "namespace-member"; readonly name: string; readonly specifier: string; readonly node: Node; readonly read: MemberRead };
