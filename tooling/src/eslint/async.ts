import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
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
  "This catch never reads its error and answers a constant or nothing, so a database fault or a programming error reads as an ordinary false, empty or missing answer and reaches no log. " +
  "Decide by the error's class and rethrow the rest (`if (!isResolveRefusal(error)) throw error;`), or carry the fault to the caller. Where a ruling keeps every fault contained, cite it and log the error.";

const RENAME_DEPTH = 3;

const CONSTANT_HOPS = 4;

const CONSTANT_UNARY = new Set(["-", "+", "!", "void"]);

// A constant is built only from literals: the same answer whatever fault reached the catch. `await` and
// `Promise.resolve(...)` carry their operand's answer, and a same-file `const` with such an initializer is that literal
// by another name. A value read from any other state is an answer the catch did not invent.
function isConstantAnswer(context: OrbRuleContext, argument: TSESTree.Node | null | undefined, hops = CONSTANT_HOPS): boolean {
  if (argument === null || argument === undefined) {
    return true;
  }
  const value = unwrapTransparent(argument);
  const constant = (node: TSESTree.Node | null | undefined): boolean => isConstantAnswer(context, node, hops);
  switch (value.type) {
    case AST_NODE_TYPES.Literal:
      return true;
    case AST_NODE_TYPES.TemplateLiteral:
      return value.expressions.length === 0;
    case AST_NODE_TYPES.Identifier: {
      const initializer = value.name === "undefined" || hops === 0 ? undefined : singleInitializer(context, value);
      return value.name === "undefined" || (initializer !== undefined && isConstantAnswer(context, initializer, hops - 1));
    }
    case AST_NODE_TYPES.UnaryExpression:
      return value.operator === "void" || (CONSTANT_UNARY.has(value.operator) && constant(value.argument));
    case AST_NODE_TYPES.ArrayExpression:
      return value.elements.every((element) => element === null || (element.type !== AST_NODE_TYPES.SpreadElement && constant(element)));
    case AST_NODE_TYPES.ObjectExpression:
      return value.properties.every(
        (property) =>
          property.type === AST_NODE_TYPES.Property && !property.method && (!property.computed || constant(property.key)) && constant(property.value),
      );
    case AST_NODE_TYPES.ConditionalExpression:
      return constant(value.consequent) && constant(value.alternate);
    case AST_NODE_TYPES.LogicalExpression:
      return constant(value.left) && constant(value.right);
    case AST_NODE_TYPES.AwaitExpression:
      return constant(value.argument);
    case AST_NODE_TYPES.CallExpression:
      return isPromiseResolve(value) && constant(value.arguments[0]);
    default:
      return false;
  }
}

function isPromiseResolve(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression || node.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const { object, property } = node.callee;
  return object.type === AST_NODE_TYPES.Identifier && object.name === "Promise" && property.type === AST_NODE_TYPES.Identifier && property.name === "resolve";
}

// The node whose value is `node`'s value: a wrapper, `error ?? x`, `error || x`, the right of `&&`, or an arm of `?:`.
function carriedValue(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  for (let parent = current.parent; parent !== undefined; parent = current.parent) {
    const carries =
      TRANSPARENT_PARENTS.has(parent.type) ||
      (parent.type === AST_NODE_TYPES.LogicalExpression && (parent.operator !== "&&" || parent.right === current)) ||
      (parent.type === AST_NODE_TYPES.ConditionalExpression && parent.test !== current);
    if (!carries) {
      break;
    }
    current = parent;
  }
  return current;
}

const TESTED_STATEMENTS: ReadonlySet<string> = new Set([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ConditionalExpression,
]);

// A caught value is truthy whenever anything was thrown, so a bare truthiness test classifies nothing.
function onlyTested(parent: TSESTree.Node, current: TSESTree.Node): boolean {
  return (
    (TESTED_STATEMENTS.has(parent.type) && "test" in parent && parent.test === current) ||
    (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === "!") ||
    (parent.type === AST_NODE_TYPES.LogicalExpression && parent.operator === "&&" && parent.left === current)
  );
}

// A read inside a function nested in the binding's scope counts only when that function itself is used: called,
// handed on or returned. `boundary` is the scope block that declares the binding.
function closureUsed(context: OrbRuleContext, identifier: TSESTree.Node, boundary: TSESTree.Node, depth: number): boolean {
  const ancestors = context.sourceCode.getAncestors(identifier);
  const closure = ancestors.slice(ancestors.indexOf(boundary) + 1).find((ancestor) => FUNCTION_NODES.has(ancestor.type));
  if (closure === undefined) {
    return true;
  }
  if (closure.type === AST_NODE_TYPES.FunctionDeclaration) {
    return closure.id !== null && depth > 0 && variableUsed(context, lexicalVariable(context, closure.id), depth - 1);
  }
  return usedRead(context, closure, depth);
}

// A read that discards the value (`void error`, a bare `error;`), only tests its truthiness, sits in a closure nothing
// runs, or only renames it into a binding nothing reads leaves the error as unexamined as no binding at all.
function usedRead(context: OrbRuleContext, identifier: TSESTree.Node, depth: number, boundary?: TSESTree.Node): boolean {
  const current = carriedValue(identifier);
  const parent = current.parent;
  if (parent === undefined || parent.type === AST_NODE_TYPES.ExpressionStatement || onlyTested(parent, current)) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === "void") {
    return false;
  }
  const renamed = renamedInto(parent, current);
  const used = renamed?.type !== AST_NODE_TYPES.Identifier || (depth > 0 && variableUsed(context, lexicalVariable(context, renamed), depth - 1));
  return used && (boundary === undefined || closureUsed(context, identifier, boundary, depth));
}

function renamedInto(parent: TSESTree.Node, current: TSESTree.Node): TSESTree.Node | undefined {
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === current) {
    return parent.id;
  }
  return parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === current ? parent.left : undefined;
}

function variableUsed(context: OrbRuleContext, variable: ReturnType<typeof lexicalVariable>, depth: number): boolean {
  return variable?.references.some((reference) => reference.isRead() && usedRead(context, reference.identifier, depth, variable.scope.block)) === true;
}

type RejectionHandler = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

type ErrorHandler = TSESTree.CatchClause | RejectionHandler;

const ZOD_NAMESPACE = "z";

const SCHEMA_SUFFIX = /(?:^s|S)chema$/u;

const ASYNC_SUFFIX = "Async";

// A zod schema's `.catch(fn)` is a parse fallback: zod calls it only for the schema's own validation issues, never for
// a thrown fault, so the narrowing is the library's. A schema is a method chain on the `z` namespace or on a `*Schema`
// binding; a plain call such as `loadSchema()`, or an async method such as `parseAsync` or `then`, answers a promise.
function isSchemaReceiver(receiver: TSESTree.Node): boolean {
  let current = unwrapTransparent(receiver);
  for (;;) {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      current = unwrapTransparent(current.object);
    } else if (current.type === AST_NODE_TYPES.CallExpression && unwrapTransparent(current.callee).type === AST_NODE_TYPES.MemberExpression) {
      const method = staticMemberName(unwrapTransparent(current.callee)) ?? "";
      if (PROMISE_LINKS.has(method) || method.endsWith(ASYNC_SUFFIX)) {
        return false;
      }
      current = unwrapTransparent(current.callee);
    } else {
      break;
    }
  }
  return current.type === AST_NODE_TYPES.Identifier && (current.name === ZOD_NAMESPACE || SCHEMA_SUFFIX.test(current.name));
}

// An inline function a promise link hands its rejection to: `.catch(fn)` or the second argument of `.then`. A named
// handler is a function declared elsewhere, judged by whatever reads it there.
function isRejectionHandler(context: OrbRuleContext, node: TSESTree.Node): node is RejectionHandler {
  if (node.type !== AST_NODE_TYPES.ArrowFunctionExpression && node.type !== AST_NODE_TYPES.FunctionExpression) {
    return false;
  }
  const call = node.parent;
  const link = call.type === AST_NODE_TYPES.CallExpression ? literalMember(context, call.callee) : undefined;
  const index = link === undefined ? undefined : REJECTION_HANDLER_ARGUMENT.get(link.name);
  return (
    index !== undefined &&
    call.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[index] === node &&
    !(link?.name === "catch" && isSchemaReceiver(link.receiver))
  );
}

// Every name the parameter binds, a destructured field included, counts only when it is itself read; `catch ({})` binds
// nothing and so reads nothing.
function readsCaughtError(context: OrbRuleContext, handler: ErrorHandler): boolean {
  return context.sourceCode
    .getDeclaredVariables(handler)
    .some(
      (variable) =>
        (handler.type === AST_NODE_TYPES.CatchClause || variable.defs.some(({ type }) => type === TSESLint.Scope.DefinitionType.Parameter)) &&
        variableUsed(context, variable, RENAME_DEPTH),
    );
}

// Only `return` and `throw` end a catch with an answer. A `break` or `continue` that leaves the catch answers nothing,
// and the rule marks that catch where it meets the jump; `left` holds every statement some `break` leaves.
function endsAbruptly(statement: TSESTree.Statement, left: ReadonlySet<TSESTree.Node>): boolean {
  switch (statement.type) {
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement:
      return true;
    case AST_NODE_TYPES.BlockStatement:
      return statement.body.some((inner) => endsAbruptly(inner, left));
    case AST_NODE_TYPES.IfStatement:
      return statement.alternate !== null && endsAbruptly(statement.consequent, left) && endsAbruptly(statement.alternate, left);
    case AST_NODE_TYPES.SwitchStatement:
      return switchEndsAbruptly(statement, left);
    case AST_NODE_TYPES.TryStatement:
      return (
        (statement.finalizer !== null && endsAbruptly(statement.finalizer, left)) ||
        (endsAbruptly(statement.block, left) && (statement.handler === null || endsAbruptly(statement.handler.body, left)))
      );
    default:
      return false;
  }
}

// A switch answers on every path when it has a `default`, no `break` leaves it at any depth, and its last case ends
// abruptly: every earlier case then either ends abruptly or falls through into the next.
function switchEndsAbruptly(statement: TSESTree.SwitchStatement, left: ReadonlySet<TSESTree.Node>): boolean {
  const last = statement.cases.at(-1);
  return (
    last !== undefined &&
    statement.cases.some((branch) => branch.test === null) &&
    !left.has(statement) &&
    last.consequent.some((inner) => endsAbruptly(inner, left))
  );
}

const LOOP_NODES: ReadonlySet<string> = new Set([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

// The statement a jump leaves: its label's statement, else the nearest loop, or for a `break` the nearest switch.
function jumpTarget(context: OrbRuleContext, jump: TSESTree.BreakStatement | TSESTree.ContinueStatement): TSESTree.Node | undefined {
  for (const node of context.sourceCode.getAncestors(jump).toReversed()) {
    if (FUNCTION_NODES.has(node.type)) {
      return undefined;
    }
    if (jump.label !== null) {
      if (node.type === AST_NODE_TYPES.LabeledStatement && node.label.name === jump.label.name) {
        return node.body;
      }
    } else if (LOOP_NODES.has(node.type) || (jump.type === AST_NODE_TYPES.BreakStatement && node.type === AST_NODE_TYPES.SwitchStatement)) {
      return node;
    }
  }
  return undefined;
}

// The catch clause or rejection handler whose body holds `node` with no other function boundary between them. A
// `return`, `break` or `throw` in a `finally` is Biome's `lint/correctness/noUnsafeFinally`, so this rule judges catch
// clauses and rejection handlers only.
function owningHandler(context: OrbRuleContext, node: TSESTree.Node): ErrorHandler | undefined {
  const boundary = context.sourceCode
    .getAncestors(node)
    .findLast((ancestor) => FUNCTION_NODES.has(ancestor.type) || ancestor.type === AST_NODE_TYPES.CatchClause);
  if (boundary === undefined) {
    return undefined;
  }
  return boundary.type === AST_NODE_TYPES.CatchClause || isRejectionHandler(context, boundary) ? boundary : undefined;
}

// Whether a handler can finish with no answer: a block that falls out of its end, or an expression body that is constant.
function fallsThrough(context: OrbRuleContext, handler: ErrorHandler, left: ReadonlySet<TSESTree.Node>): boolean {
  if (handler.body.type !== AST_NODE_TYPES.BlockStatement) {
    return isConstantAnswer(context, handler.body);
  }
  return !endsAbruptly(handler.body, left);
}

// `undefined`, `void x`, a bare `return` or `Promise.resolve()`: the handler hands its reader no value at all.
function isNoValue(argument: TSESTree.Node | null | undefined): boolean {
  if (argument === null || argument === undefined) {
    return true;
  }
  const value = unwrapTransparent(argument);
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return isNoValue(value.argument);
  }
  if (isPromiseResolve(value)) {
    return isNoValue(value.arguments[0]);
  }
  return (
    (value.type === AST_NODE_TYPES.Identifier && value.name === "undefined") || (value.type === AST_NODE_TYPES.UnaryExpression && value.operator === "void")
  );
}

// A side branch on a promise binding that another statement also reads: the rejection reaches that reader, so a handler
// that answers nothing here only does bookkeeping or keeps a queue tail from rejecting.
function forksObservedPromise(context: OrbRuleContext, handler: RejectionHandler): boolean {
  let receiver = handler.parent.type === AST_NODE_TYPES.CallExpression ? literalMember(context, handler.parent.callee)?.receiver : undefined;
  while (receiver?.type === AST_NODE_TYPES.CallExpression) {
    const link = literalMember(context, receiver.callee);
    receiver = link !== undefined && PROMISE_LINKS.has(link.name) ? link.receiver : undefined;
  }
  if (receiver?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const statement = context.sourceCode
    .getAncestors(handler)
    .findLast((ancestor) => ancestor.type.endsWith("Statement") || ancestor.type === AST_NODE_TYPES.VariableDeclaration);
  const [start, end] = statement?.range ?? handler.range;
  return (
    lexicalVariable(context, receiver)?.references.some(
      (reference) => reference.isRead() && (reference.identifier.range[0] < start || reference.identifier.range[1] > end),
    ) === true
  );
}

export const blindCatchRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const unanswered = new Set<ErrorHandler>();
    // Handlers with a `return` that hands back a value rather than nothing.
    const valued = new Set<ErrorHandler>();
    const left = new Set<TSESTree.Node>();
    const jump = (statement: TSESTree.BreakStatement | TSESTree.ContinueStatement): void => {
      const target = jumpTarget(context, statement);
      if (target === undefined) {
        return;
      }
      left.add(target);
      // Every catch between the jump and the statement it leaves is left with no answer.
      for (const node of context.sourceCode.getAncestors(statement).toReversed()) {
        if (node === target) {
          return;
        }
        if (node.type === AST_NODE_TYPES.CatchClause) {
          unanswered.add(node);
        }
      }
    };
    const judge = (handler: ErrorHandler): void => {
      if (readsCaughtError(context, handler)) {
        return;
      }
      if (unanswered.has(handler) || fallsThrough(context, handler, left)) {
        context.report({ node: handler, message: BLIND_CATCH_MESSAGE });
      }
    };
    const judgeFunction = (node: RejectionHandler): void => {
      if (!isRejectionHandler(context, node)) {
        return;
      }
      const answersNothing = node.body.type === AST_NODE_TYPES.BlockStatement ? !valued.has(node) : isNoValue(node.body);
      if (!(answersNothing && forksObservedPromise(context, node))) {
        judge(node);
      }
    };
    return {
      ReturnStatement: (statement: TSESTree.ReturnStatement) => {
        const handler = isConstantAnswer(context, statement.argument) ? owningHandler(context, statement) : undefined;
        if (handler !== undefined) {
          unanswered.add(handler);
        }
        const owner = isNoValue(statement.argument) ? undefined : owningHandler(context, statement);
        if (owner !== undefined) {
          valued.add(owner);
        }
      },
      BreakStatement: jump,
      ContinueStatement: jump,
      "CatchClause:exit": judge,
      "ArrowFunctionExpression:exit": judgeFunction,
      "FunctionExpression:exit": judgeFunction,
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
