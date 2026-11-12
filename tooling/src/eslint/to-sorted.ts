// A sorted copy of an array is `x.toSorted(fn)` (Spine-TypeScript-and-Patterns §9). The rule refuses the three copy-then-sort
// spellings, `[...x].sort()`, `x.slice().sort()` and `Array.from(x).sort()`, only when the checker types `x` as an array or
// a tuple in every union member. A Set, a Map iterator or another iterable has no `toSorted`, so its spread is the one
// copy and stays.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import { staticMemberName } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const MESSAGE = "Copying an array to sort it: call `toSorted` on the array itself, which returns the sorted copy (Spine-TypeScript-and-Patterns §9).";

// The operand a receiver copies, when the receiver is one of the copy spellings.
function copiedOperand(receiver: TSESTree.Node): TSESTree.Node | undefined {
  if (receiver.type === AST_NODE_TYPES.ArrayExpression) {
    const [only, ...rest] = receiver.elements;
    return rest.length === 0 && only?.type === AST_NODE_TYPES.SpreadElement ? only.argument : undefined;
  }
  if (receiver.type !== AST_NODE_TYPES.CallExpression || receiver.optional || receiver.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return;
  }
  const name = staticMemberName(receiver.callee);
  if (name === "slice" && receiver.arguments.length === 0) {
    return receiver.callee.object;
  }
  const [source, ...more] = receiver.arguments;
  const fromArray =
    name === "from" && receiver.callee.object.type === AST_NODE_TYPES.Identifier && receiver.callee.object.name === "Array" && more.length === 0;
  return fromArray && source !== undefined && source.type !== AST_NODE_TYPES.SpreadElement ? source : undefined;
}

/** Refuses a copy-then-sort of an array or tuple; `toSorted` is the one spelling. */
export const preferToSortedRule: OrbRule = {
  meta: { type: "suggestion", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
    const arrayTyped = (type: ts.Type): boolean => {
      const resolved = type.isTypeParameter() ? (checker.getBaseConstraintOfType(type) ?? type) : type;
      return resolved.isUnion() ? resolved.types.every(arrayTyped) : checker.isArrayType(resolved) || checker.isTupleType(resolved);
    };
    return {
      CallExpression: (node: TSESTree.CallExpression): void => {
        if (node.callee.type !== AST_NODE_TYPES.MemberExpression || staticMemberName(node.callee) !== "sort") {
          return;
        }
        const operand = copiedOperand(node.callee.object);
        if (operand !== undefined && arrayTyped(checker.getTypeAtLocation(toTs.get(operand)))) {
          context.report({ node, message: MESSAGE });
        }
      },
    };
  },
};
