// One writer object/helper/accumulator extraction; consumers retain their declared helper precision and merge policy.
import { Node, SyntaxKind } from "ts-morph";
import { readCallReturns } from "./call-returns.ts";
import type { DrizzleWriterMember, DrizzleWriterSource } from "./drizzle-writer-source-contract.ts";
import { readFunctionBodyNodes } from "./function-context.ts";
import { propertyValue } from "./value-carrier.ts";

function members(node: import("ts-morph").ObjectLiteralExpression, active: ReadonlySet<object>): readonly DrizzleWriterMember[] {
  return node.getProperties().flatMap((member): readonly DrizzleWriterMember[] => {
    if (Node.isSpreadAssignment(member)) {
      return [{ kind: "spread", source: source(member.getExpression(), active) }];
    }
    return Node.isPropertyAssignment(member) || Node.isShorthandPropertyAssignment(member)
      ? [{ kind: "named", name: member.getName(), node: member, value: propertyValue(member) }]
      : [];
  });
}

function accumulator(owner: Node): readonly DrizzleWriterMember[] {
  if (!Node.isFunctionDeclaration(owner)) {
    return [];
  }
  return readFunctionBodyNodes(owner)
    .filter(Node.isBinaryExpression)
    .flatMap((node): readonly DrizzleWriterMember[] => {
      const left = node.getLeft();
      return node.getOperatorToken().getKind() === SyntaxKind.EqualsToken && Node.isPropertyAccessExpression(left)
        ? [{ kind: "named", name: left.getName(), node, value: node.getRight() }]
        : [];
    });
}

function source(node: Node | undefined, active: ReadonlySet<object>): DrizzleWriterSource {
  if (node === undefined) {
    return { kind: "empty", node };
  }
  if (active.has(node.compilerNode)) {
    return { kind: "unresolved", node, detail: "writer source/body cycle" };
  }
  const next = new Set(active).add(node.compilerNode);
  if (Node.isParenthesizedExpression(node)) {
    return source(node.getExpression(), next);
  }
  if (Node.isConditionalExpression(node)) {
    return { kind: "choice", node, values: [source(node.getWhenTrue(), next), source(node.getWhenFalse(), next)] };
  }
  if (Node.isObjectLiteralExpression(node)) {
    return { kind: "object", node, members: members(node, next) };
  }
  if (Node.isCallExpression(node)) {
    const returned = readCallReturns(node);
    return returned.kind === "unresolved"
      ? { kind: "unresolved", node, detail: returned.detail }
      : {
          kind: "call",
          node,
          owner: returned.trace.origin,
          returns: returned.value.map((value) => source(value, next)),
          assignments: accumulator(returned.trace.origin),
        };
  }
  return { kind: "empty", node };
}

/** Native source graph only; an unreadable helper remains a refusal rather than an empty writer set. */
export function readDrizzleWriterSource(node: Node | undefined): DrizzleWriterSource {
  return source(node, new Set());
}
