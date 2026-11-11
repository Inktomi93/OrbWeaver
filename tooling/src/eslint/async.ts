import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
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
    current.type === AST_NODE_TYPES.ChainExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    current = current.expression;
  }
  return current;
}

function staticDetachedKey(context: OrbRuleContext, node: TSESTree.Node, hops = 4): string | undefined {
  const value = unwrapTransparent(node);
  if (value.type === AST_NODE_TYPES.Literal) {
    return typeof value.value === "string" ? value.value : undefined;
  }
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.expressions.length === 0 ? (value.quasis[0] as TSESTree.TemplateElement & { value: { cooked: string } }).value.cooked : undefined;
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression && value.operator === "+") {
    const left = staticDetachedKey(context, value.left, hops);
    const right = staticDetachedKey(context, value.right, hops);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  const initializer = value.type === AST_NODE_TYPES.Identifier && hops > 0 ? singleInitializer(context, value) : undefined;
  return initializer === undefined ? undefined : staticDetachedKey(context, initializer, hops - 1);
}

function literalMember(context: OrbRuleContext, node: TSESTree.Node): { name: string; receiver: TSESTree.Node } | undefined {
  const member = unwrapTransparent(node);
  if (member.type !== AST_NODE_TYPES.MemberExpression) {
    return;
  }
  const name = member.computed ? staticDetachedKey(context, member.property) : member.property.name;
  return name === undefined ? undefined : { name, receiver: unwrapTransparent(member.object) };
}

function isOpenerCall(context: OrbRuleContext, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapTransparent(node.callee);
  return ROOT_SPAN_OPENER_NAMES.has((callee.type === AST_NODE_TYPES.Identifier ? callee.name : literalMember(context, callee)?.name) as string);
}

function isDiscardingHandler(context: OrbRuleContext, node: TSESTree.Node | undefined): boolean {
  const handler = node === undefined ? undefined : unwrapTransparent(node);
  if (handler?.type !== AST_NODE_TYPES.ArrowFunctionExpression && handler?.type !== AST_NODE_TYPES.FunctionExpression) {
    return false;
  }
  return handler.body.type === AST_NODE_TYPES.BlockStatement
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
  while (current.type === AST_NODE_TYPES.CallExpression) {
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
  while (current.type === AST_NODE_TYPES.CallExpression) {
    const link = literalMember(context, current.callee);
    if (link === undefined || !PROMISE_LINKS.has(link.name)) {
      return;
    }
    current = link.receiver;
  }
  return current.type === AST_NODE_TYPES.Identifier ? current : undefined;
}

const PROMISE_CHAIN_MEMBERS = new Set(["then", "catch", "finally"]);

const FLOW_DEPTH = 4;

const TRANSPARENT_PARENTS = new Set(["ChainExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"]);

function bindingConsumed(context: OrbRuleContext, id: TSESTree.Identifier, depth: number): boolean {
  const variable = lexicalVariable(context, id);
  return variable?.references.some((reference) => reference.isRead() && flowConsumed(context, reference.identifier, depth)) === true;
}

function loopConsumes(context: OrbRuleContext, loop: TSESTree.ForOfStatement, depth: number): boolean {
  const declarator = loop.left.type === AST_NODE_TYPES.VariableDeclaration ? loop.left.declarations[0] : undefined;
  return loop.await || declarator?.id.type !== AST_NODE_TYPES.Identifier || bindingConsumed(context, declarator.id, depth);
}

function callbackConsumes(context: OrbRuleContext, callback: TSESTree.Node | undefined, depth: number): boolean {
  if (callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression && callback?.type !== AST_NODE_TYPES.FunctionExpression) {
    return callback !== undefined;
  }
  const [first] = callback.params;
  return first !== undefined && (first.type !== AST_NODE_TYPES.Identifier || bindingConsumed(context, first, depth));
}

function callFlowConsumed(context: OrbRuleContext, parent: TSESTree.CallExpression, current: TSESTree.Node, depth: number): boolean {
  if (parent.callee === current) {
    return false;
  }
  return COMBINATOR_MEMBERS.has(staticMemberName(parent.callee) as string) ? flowConsumed(context, parent, depth) : true;
}

function memberFlowConsumed(context: OrbRuleContext, parent: TSESTree.MemberExpression, current: TSESTree.Node, depth: number): boolean {
  const call = parent.object === current && parent.parent.type === AST_NODE_TYPES.CallExpression && parent.parent.callee === parent ? parent.parent : undefined;
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
  const target = parent.type === AST_NODE_TYPES.VariableDeclarator ? parent.id : parent.left;
  const source = parent.type === AST_NODE_TYPES.VariableDeclarator ? parent.init : parent.right;
  return source === current && target.type === AST_NODE_TYPES.Identifier && bindingConsumed(context, target, depth - 1);
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
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.ReturnStatement:
      return true;
    case AST_NODE_TYPES.ArrowFunctionExpression:
      return parent.body === current;
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.ConditionalExpression:
    case AST_NODE_TYPES.LogicalExpression:
      return flowConsumed(context, parent, depth);
    case AST_NODE_TYPES.SpreadElement:
      return parent.parent.type === AST_NODE_TYPES.ArrayExpression ? flowConsumed(context, parent.parent, depth) : true;
    case AST_NODE_TYPES.ForOfStatement:
      return parent.right === current && loopConsumes(context, parent, depth - 1);
    case AST_NODE_TYPES.VariableDeclarator:
    case AST_NODE_TYPES.AssignmentExpression:
      return boundFlowConsumed(context, parent, current, depth);
    case AST_NODE_TYPES.CallExpression:
      return callFlowConsumed(context, parent, current, depth);
    case AST_NODE_TYPES.MemberExpression:
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
      const collecting = call.type === AST_NODE_TYPES.CallExpression && call.arguments.includes(identifier as TSESTree.Identifier) ? call.callee : undefined;
      return (
        collecting?.type === AST_NODE_TYPES.MemberExpression &&
        collecting.object.type === AST_NODE_TYPES.Identifier &&
        COLLECTING_MEMBERS.has(staticMemberName(collecting) as string) &&
        readsWhole(context, collecting.object)
      );
    }) === true
  );
}

function escapedCatchClause(context: OrbRuleContext, thrown: TSESTree.ThrowStatement): TSESTree.CatchClause | undefined {
  let clause: TSESTree.CatchClause | undefined;
  for (const node of context.sourceCode.getAncestors(thrown).toReversed()) {
    if (node.type === AST_NODE_TYPES.CatchClause) {
      clause = node;
      break;
    }
    const guardedTry =
      node.type === AST_NODE_TYPES.BlockStatement &&
      node.parent.type === AST_NODE_TYPES.TryStatement &&
      node.parent.block === node &&
      node.parent.handler !== null;
    if (FUNCTION_NODES.has(node.type) || guardedTry) {
      return;
    }
  }
  return clause;
}

const BLIND_CATCH_MESSAGE =
  "This catch never reads its error and answers null or nothing, so a database fault or a programming error reads as an ordinary miss and reaches no log. " +
  "Decide by the error's class and rethrow the rest (`if (!isResolveRefusal(error)) throw error;`). Where a ruling keeps every fault contained, cite it and log the error.";

const BLIND_FINALLY_MESSAGE =
  "This `finally` returns null or nothing, which discards any error the try threw before anything reads it. Move the answer into a catch that decides by the error's class.";

const RENAME_DEPTH = 3;

// `await` and `Promise.resolve(...)` carry their operand's answer, so `return Promise.resolve(null)` answers nothing too.
function isNoAnswer(argument: TSESTree.Node | null | undefined): boolean {
  if (argument === null || argument === undefined) {
    return true;
  }
  const value = unwrapTransparent(argument);
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return isNoAnswer(value.argument);
  }
  if (isPromiseResolve(value)) {
    return isNoAnswer(value.arguments[0]);
  }
  return (
    (value.type === AST_NODE_TYPES.Literal && value.raw === "null") ||
    (value.type === AST_NODE_TYPES.Identifier && value.name === "undefined") ||
    (value.type === AST_NODE_TYPES.UnaryExpression && value.operator === "void")
  );
}

function isPromiseResolve(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression || node.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const { object, property } = node.callee;
  return object.type === AST_NODE_TYPES.Identifier && object.name === "Promise" && property.type === AST_NODE_TYPES.Identifier && property.name === "resolve";
}

// A read that discards the value (`void error`, a bare `error;`) or only renames it into a binding nothing reads
// leaves the error as unexamined as no binding at all.
function usedRead(context: OrbRuleContext, identifier: TSESTree.Node, depth: number): boolean {
  let current = identifier;
  while (TRANSPARENT_PARENTS.has(current.parent?.type ?? "")) {
    current = current.parent as TSESTree.Node;
  }
  const parent = current.parent;
  if (parent === undefined || parent.type === AST_NODE_TYPES.ExpressionStatement) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === "void") {
    return false;
  }
  const renamed = renamedInto(parent, current);
  if (renamed?.type !== AST_NODE_TYPES.Identifier) {
    return true;
  }
  return depth > 0 && variableUsed(context, lexicalVariable(context, renamed), depth - 1);
}

function renamedInto(parent: TSESTree.Node, current: TSESTree.Node): TSESTree.Node | undefined {
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === current) {
    return parent.id;
  }
  return parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === current ? parent.left : undefined;
}

function variableUsed(context: OrbRuleContext, variable: ReturnType<typeof lexicalVariable>, depth: number): boolean {
  return variable?.references.some((reference) => reference.isRead() && usedRead(context, reference.identifier, depth)) === true;
}

// Every name the parameter binds, a destructured field included, counts only when it is itself read; `catch ({})` binds
// nothing and so reads nothing.
function readsCaughtError(context: OrbRuleContext, clause: TSESTree.CatchClause): boolean {
  return context.sourceCode.getDeclaredVariables(clause).some((variable) => variableUsed(context, variable, RENAME_DEPTH));
}

// Only `return` and `throw` end a catch with an answer; `continue` and `break` skip the item and answer nothing.
function endsAbruptly(statement: TSESTree.Statement): boolean {
  switch (statement.type) {
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement:
      return true;
    case AST_NODE_TYPES.BlockStatement:
      return statement.body.some(endsAbruptly);
    case AST_NODE_TYPES.IfStatement:
      return statement.alternate !== null && endsAbruptly(statement.consequent) && endsAbruptly(statement.alternate);
    case AST_NODE_TYPES.SwitchStatement:
      return switchEndsAbruptly(statement);
    case AST_NODE_TYPES.TryStatement:
      return (
        (statement.finalizer !== null && endsAbruptly(statement.finalizer)) ||
        (endsAbruptly(statement.block) && (statement.handler === null || endsAbruptly(statement.handler.body)))
      );
    default:
      return false;
  }
}

// A switch answers on every path when it has a `default` and no case can fall out of its end: each case either ends
// abruptly or is empty and falls into the next, and the last one ends abruptly. A `break` leaves the switch, so a case
// that breaks never ends abruptly.
function switchEndsAbruptly(statement: TSESTree.SwitchStatement): boolean {
  const last = statement.cases.at(-1);
  if (last === undefined || !statement.cases.some((branch) => branch.test === null)) {
    return false;
  }
  return statement.cases.every((branch) =>
    branch === last ? branch.consequent.some(endsAbruptly) : branch.consequent.length === 0 || branch.consequent.some(endsAbruptly),
  );
}

// The catch clause or `finally` block whose body holds `node` with no function boundary between them.
function owningHandler(context: OrbRuleContext, node: TSESTree.Node): TSESTree.CatchClause | TSESTree.BlockStatement | undefined {
  const boundary = context.sourceCode.getAncestors(node).findLast((ancestor) => FUNCTION_NODES.has(ancestor.type) || isHandler(ancestor));
  return boundary !== undefined && isHandler(boundary) ? boundary : undefined;
}

function isHandler(node: TSESTree.Node): node is TSESTree.CatchClause | TSESTree.BlockStatement {
  return node.type === AST_NODE_TYPES.CatchClause || (node.parent?.type === AST_NODE_TYPES.TryStatement && node.parent.finalizer === node);
}

export const blindCatchRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const unanswered = new Set<TSESTree.CatchClause>();
    return {
      ReturnStatement: (statement: TSESTree.ReturnStatement) => {
        const handler = isNoAnswer(statement.argument) ? owningHandler(context, statement) : undefined;
        if (handler?.type === AST_NODE_TYPES.CatchClause) {
          unanswered.add(handler);
        } else if (handler !== undefined) {
          // A return in `finally` replaces whatever the try threw, with no binding to read it through.
          context.report({ node: statement, message: BLIND_FINALLY_MESSAGE });
        }
      },
      "CatchClause:exit": (clause: TSESTree.CatchClause) => {
        if (readsCaughtError(context, clause)) {
          return;
        }
        if (unanswered.has(clause) || !endsAbruptly(clause.body)) {
          context.report({ node: clause, message: BLIND_CATCH_MESSAGE });
        }
      },
    };
  },
};

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
        const expression = raw.type === AST_NODE_TYPES.UnaryExpression && raw.operator === "void" ? raw.argument : raw;
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
