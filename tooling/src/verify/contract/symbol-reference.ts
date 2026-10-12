// The shapes lib/symbol-reference.ts's readers RETURN. Homed here (not beside the reader) because the
// five-slot template puts every exported shape in contract/ (docs/law/Core-Tooling-Law.md
// §2.5) and `no-inline-types` enforces it; lib/symbol-reference.ts is the machine, this is its vocabulary.
import type { MemberReference } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { Node } from "ts-morph";

/** How a module's exported member was reached — a named import binding, or a member read off an
 *  `import * as ns` namespace binding. Both are the same reference; only the spelling differs. */
export type ModuleMemberReference =
  | { readonly kind: "named-import"; readonly name: string; readonly specifier: string; readonly node: Node }
  | { readonly kind: "namespace-member"; readonly name: string; readonly specifier: string; readonly node: Node; readonly read: MemberReference };
