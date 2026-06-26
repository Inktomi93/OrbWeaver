// Gate: no-inline-union-redecl (spine/string-union-dispatch.md §7.5) — a string-union AXIS is
// declared ONCE as an `as const` tuple and the union DERIVED ((typeof X_VALUES)[number]); never
// re-spelled inline. Flags an inline string-literal union TYPE ALIAS of >=3 members (the derived
// form is an indexed-access node, NOT matched). Trivial 2-member unions are allowed (ledger §5).
import { Node } from "ts-morph";
import type { Check, Violation } from "./harness.ts";

const MIN_MEMBERS = 3;

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const noInlineUnionRedecl: Check = {
  name: "no-inline-union-redecl",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      for (const alias of sf.getTypeAliases()) {
        const typeNode = alias.getTypeNode();
        if (typeNode === undefined || !Node.isUnionTypeNode(typeNode)) {
          continue;
        }
        const stringMembers = typeNode
          .getTypeNodes()
          .filter((m) => Node.isLiteralTypeNode(m) && Node.isStringLiteral(m.getLiteral()));
        if (stringMembers.length < MIN_MEMBERS) {
          continue;
        }
        violations.push({
          file: relPath(root, sf.getFilePath()),
          line: alias.getStartLineNumber(),
          message: `inline string-literal union '${alias.getName()}' (${stringMembers.length} members) — declare the axis once as a tuple (export const X_VALUES = [...] as const satisfies readonly …[]) and derive ((typeof X_VALUES)[number]). §7.5`,
        });
      }
    }
    return violations;
  },
};
