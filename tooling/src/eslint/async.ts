import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { lexicalVariable, singleInitializer } from "./general.ts";
import { staticMemberName } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { ROOT_SPAN_OPENERS } from "./syntax.ts";
import { FUNCTION_NODES } from "./tests.ts";

const ROOT_SPAN_OPENER_NAMES = new Set(ROOT_SPAN_OPENERS);

const PROMISE_LINKS = new Set(["then", "catch", "finally"]);

const REJECTION_HANDLER_ARGUMENT = new Map([
  ["catch", 0],
  ["then", 1],
]);

const DISCARD_BODIES = new Set(["undefined", "null", "void 0"]);

const DETACHED_MESSAGES = {
  untraced:
    "Fire-and-forget work with a discarded rejection is invisible: the request root has sealed, so the failure reaches no log, trace or caller. " +
    "Await it so the caller owns completion, or start it with `superviseDetached(<ownRequestId>, <spanName>, <attrs>, () => work())`. " +
    "Work that has nothing to trace and no caller to inform takes `// eslint-disable-next-line orb/detached-work-traced -- <why it is invisible on purpose and what would end the exemption>`.",
  swallowed:
    "A catch inside a detached root span that does not rethrow seals the span `ok` on every failure. Warn or emit, then rethrow so the span marks ERROR; the supervisor owns the terminal rejection.",
  blinded:
    "A discarding `.catch` nested inside a detached root callback blinds the span: it can mark ERROR only if the rejection reaches it. Attach the absorber to the opener call, outside the callback.",
};

function unwrapTransparent(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.type === "ChainExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    current = current.expression;
  }
  return current;
}

function staticDetachedKey(context: OrbRuleContext, node: TSESTree.Node, hops = 4): string | undefined {
  const value = unwrapTransparent(node);
  if (value.type === "Literal") {
    return typeof value.value === "string" ? value.value : undefined;
  }
  if (value.type === "TemplateLiteral") {
    return value.expressions.length === 0 ? (value.quasis[0] as TSESTree.TemplateElement & { value: { cooked: string } }).value.cooked : undefined;
  }
  if (value.type === "BinaryExpression" && value.operator === "+") {
    const left = staticDetachedKey(context, value.left, hops);
    const right = staticDetachedKey(context, value.right, hops);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  const initializer = value.type === "Identifier" && hops > 0 ? singleInitializer(context, value) : undefined;
  return initializer === undefined ? undefined : staticDetachedKey(context, initializer, hops - 1);
}

function literalMember(context: OrbRuleContext, node: TSESTree.Node): { name: string; receiver: TSESTree.Node } | undefined {
  const member = unwrapTransparent(node);
  if (member.type !== "MemberExpression") {
    return;
  }
  const name = member.computed ? staticDetachedKey(context, member.property) : (member.property as TSESTree.Identifier | TSESTree.PrivateIdentifier).name;
  return name === undefined ? undefined : { name, receiver: unwrapTransparent(member.object) };
}

function isOpenerCall(context: OrbRuleContext, node: TSESTree.Node): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = unwrapTransparent(node.callee);
  return ROOT_SPAN_OPENER_NAMES.has((callee.type === "Identifier" ? callee.name : literalMember(context, callee)?.name) as string);
}

function isDiscardingHandler(context: OrbRuleContext, node: TSESTree.Node | undefined): boolean {
  const handler = node === undefined ? undefined : unwrapTransparent(node);
  if (handler?.type !== "ArrowFunctionExpression" && handler?.type !== "FunctionExpression") {
    return false;
  }
  return handler.body.type === "BlockStatement"
    ? handler.body.body.length === 0
    : DISCARD_BODIES.has(context.sourceCode.getText(unwrapTransparent(handler.body)));
}

function discardsRejection(context: OrbRuleContext, call: TSESTree.CallExpression): boolean {
  const link = literalMember(context, call.callee);
  const index = link === undefined ? undefined : REJECTION_HANDLER_ARGUMENT.get(link.name);
  return index !== undefined && isDiscardingHandler(context, call.arguments[index]);
}

function hasAbsorbingLink(context: OrbRuleContext, expression: TSESTree.Node): boolean {
  let current = unwrapTransparent(expression);
  while (current.type === "CallExpression") {
    if (discardsRejection(context, current)) {
      return true;
    }
    const link = literalMember(context, current.callee);
    if (link === undefined || !PROMISE_LINKS.has(link.name)) {
      return false;
    }
    current = link.receiver;
  }
  return false;
}

const COLLECTING_MEMBERS = new Set(["add", "push", "set", "unshift"]);

const COLLECTION_READ_MEMBERS = new Set(["values", "entries", "forEach"]);

const COMBINATOR_MEMBERS = new Set(["all", "allSettled", "race", "any", "from"]);

function chainRootName(context: OrbRuleContext, expression: TSESTree.Node): TSESTree.Identifier | undefined {
  let current = unwrapTransparent(expression);
  while (current.type === "CallExpression") {
    const link = literalMember(context, current.callee);
    if (link === undefined || !PROMISE_LINKS.has(link.name)) {
      return;
    }
    current = link.receiver;
  }
  return current.type === "Identifier" ? current : undefined;
}

const PROMISE_CHAIN_MEMBERS = new Set(["then", "catch", "finally"]);

const FLOW_DEPTH = 4;

const TRANSPARENT_PARENTS = new Set(["ChainExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"]);

function bindingConsumed(context: OrbRuleContext, id: TSESTree.Identifier, depth: number): boolean {
  const variable = lexicalVariable(context, id);
  return variable?.references.some((reference) => reference.isRead() && flowConsumed(context, reference.identifier, depth)) === true;
}

function loopConsumes(context: OrbRuleContext, loop: TSESTree.ForOfStatement, depth: number): boolean {
  const declarator = loop.left.type === "VariableDeclaration" ? loop.left.declarations[0] : undefined;
  return loop.await || declarator?.id.type !== "Identifier" || bindingConsumed(context, declarator.id, depth);
}

function callbackConsumes(context: OrbRuleContext, callback: TSESTree.Node | undefined, depth: number): boolean {
  if (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression") {
    return callback !== undefined;
  }
  const [first] = callback.params;
  return first !== undefined && (first.type !== "Identifier" || bindingConsumed(context, first, depth));
}

function callFlowConsumed(context: OrbRuleContext, parent: TSESTree.CallExpression, current: TSESTree.Node, depth: number): boolean {
  if (parent.callee === current) {
    return false;
  }
  return COMBINATOR_MEMBERS.has(staticMemberName(parent.callee) as string) ? flowConsumed(context, parent, depth) : true;
}

function memberFlowConsumed(context: OrbRuleContext, parent: TSESTree.MemberExpression, current: TSESTree.Node, depth: number): boolean {
  const call = parent.object === current && parent.parent.type === "CallExpression" && parent.parent.callee === parent ? parent.parent : undefined;
  const member = staticMemberName(parent);
  if (call === undefined) {
    return false;
  }
  if (member === "forEach") {
    return callbackConsumes(context, call.arguments[0], depth - 1);
  }
  return (COLLECTION_READ_MEMBERS.has(member as string) || PROMISE_CHAIN_MEMBERS.has(member as string)) && flowConsumed(context, call, depth);
}

function boundFlowConsumed(
  context: OrbRuleContext,
  parent: TSESTree.VariableDeclarator | TSESTree.AssignmentExpression,
  current: TSESTree.Node,
  depth: number,
): boolean {
  const target = parent.type === "VariableDeclarator" ? parent.id : parent.left;
  const source = parent.type === "VariableDeclarator" ? parent.init : parent.right;
  return source === current && target.type === "Identifier" && bindingConsumed(context, target, depth - 1);
}

function flowConsumed(context: OrbRuleContext, node: TSESTree.Node, depth: number = FLOW_DEPTH): boolean {
  let current = node;
  let parent: TSESTree.Node | undefined;
  for (const ancestor of context.sourceCode.getAncestors(node).toReversed()) {
    if (!TRANSPARENT_PARENTS.has(ancestor.type)) {
      parent = ancestor;
      break;
    }
    current = ancestor;
  }
  if (depth === 0 || parent === undefined) {
    return false;
  }
  switch (parent.type) {
    case "AwaitExpression":
    case "ReturnStatement":
      return true;
    case "ArrowFunctionExpression":
      return parent.body === current;
    case "ArrayExpression":
    case "ConditionalExpression":
    case "LogicalExpression":
      return flowConsumed(context, parent, depth);
    case "SpreadElement":
      return parent.parent.type === "ArrayExpression" ? flowConsumed(context, parent.parent, depth) : true;
    case "ForOfStatement":
      return parent.right === current && loopConsumes(context, parent, depth - 1);
    case "VariableDeclarator":
    case "AssignmentExpression":
      return boundFlowConsumed(context, parent, current, depth);
    case "CallExpression":
      return callFlowConsumed(context, parent, current, depth);
    case "MemberExpression":
      return memberFlowConsumed(context, parent, current, depth);
    default:
      return false;
  }
}

function readsWhole(context: OrbRuleContext, collection: TSESTree.Identifier): boolean {
  const variable = lexicalVariable(context, collection);
  return variable?.references.some(({ identifier }) => identifier !== collection && flowConsumed(context, identifier)) === true;
}

function isRetainedPromise(context: OrbRuleContext, name: TSESTree.Identifier): boolean {
  const variable = lexicalVariable(context, name);
  return (
    variable?.references.some(({ identifier }) => {
      const call = identifier.parent;
      const collecting = call.type === "CallExpression" && call.arguments.includes(identifier as TSESTree.Identifier) ? call.callee : undefined;
      return (
        collecting?.type === "MemberExpression" &&
        collecting.object.type === "Identifier" &&
        COLLECTING_MEMBERS.has(staticMemberName(collecting) as string) &&
        readsWhole(context, collecting.object)
      );
    }) === true
  );
}

function escapedCatchClause(context: OrbRuleContext, thrown: TSESTree.ThrowStatement): TSESTree.CatchClause | undefined {
  let clause: TSESTree.CatchClause | undefined;
  for (const node of context.sourceCode.getAncestors(thrown).toReversed()) {
    if (node.type === "CatchClause") {
      clause = node;
      break;
    }
    const guardedTry = node.type === "BlockStatement" && node.parent.type === "TryStatement" && node.parent.block === node && node.parent.handler !== null;
    if (FUNCTION_NODES.has(node.type) || guardedTry) {
      return;
    }
  }
  return clause;
}

export const detachedWorkRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const insideOpener = (node: TSESTree.Node) => context.sourceCode.getAncestors(node).some((ancestor) => isOpenerCall(context, ancestor));
    const statements: TSESTree.ExpressionStatement[] = [];
    const openers: TSESTree.CallExpression[] = [];
    const clauses: TSESTree.CatchClause[] = [];
    const rethrowing = new Set<TSESTree.CatchClause>();
    return {
      ExpressionStatement: (statement: TSESTree.ExpressionStatement) => {
        const raw = unwrapTransparent(statement.expression);
        const expression = raw.type === "UnaryExpression" && raw.operator === "void" ? raw.argument : raw;
        const root = chainRootName(context, expression);
        const retained = root !== undefined && isRetainedPromise(context, root);
        if (hasAbsorbingLink(context, expression) && !retained && !insideOpener(statement)) {
          statements.push(statement);
        }
      },
      CallExpression: (call: TSESTree.CallExpression) => {
        if (isOpenerCall(context, call)) {
          openers.push(call);
        } else if (discardsRejection(context, call) && insideOpener(call)) {
          context.report({ node: call, message: DETACHED_MESSAGES.blinded });
        }
      },
      CatchClause: (clause: TSESTree.CatchClause) => {
        if (insideOpener(clause)) {
          clauses.push(clause);
        }
      },
      ThrowStatement: (thrown: TSESTree.ThrowStatement) => {
        const clause = escapedCatchClause(context, thrown);
        if (clause !== undefined) {
          rethrowing.add(clause);
        }
      },
      "Program:exit": () => {
        // "Traced" is any opener call anywhere in the statement: proving the opener wraps the work needs types.
        for (const statement of statements) {
          if (!openers.some(({ range }) => range[0] >= statement.range[0] && range[1] <= statement.range[1])) {
            context.report({ node: statement, message: DETACHED_MESSAGES.untraced });
          }
        }
        // Reported at the owning `try`, so a waiver sits above the statement a reader sees.
        for (const clause of clauses.filter((candidate) => !rethrowing.has(candidate))) {
          context.report({ node: clause.parent, message: DETACHED_MESSAGES.swallowed });
        }
      },
    };
  },
};
