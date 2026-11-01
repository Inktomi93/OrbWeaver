// Feedback shape: for each consumer of an entity-mutation hook, what tells the user it worked and what tells them it failed.
import ts from "typescript";
import type { Cohort, Member } from "./compare.ts";
import type { Source } from "./source.ts";
import { lineOf, visit } from "./source.ts";
import { anyNode, enclosingFunction, hasProperty, resultBinding } from "./syntax.ts";

const FACTORY = "createEntityMutation";
const ERROR_READS = new Set(["error", "isError", "retry", "clearError"]);
const SUCCESS_READS = new Set(["onSuccess", "isSuccess"]);

export interface FeedbackScan {
  readonly factories: number;
  readonly consumers: number;
  readonly files: number;
}

const clientSources = (sources: readonly Source[]): readonly (Source & { readonly sf: ts.SourceFile })[] =>
  sources.flatMap((source) => (source.sf === null || source.layer !== "client" ? [] : [{ ...source, sf: source.sf }]));

/** The calls whose arguments carry a failed-state mark: the mark is state only and never message text. */
const STATE_MARK_CALLS = new Set(["saveStateOf", "useReportSaveStatus"]);

/** Does the factory toast, and does a function-form toast ever answer `null` (a failure its consumer says itself)? */
interface FactoryToast {
  readonly toasts: boolean;
  readonly suppresses: boolean;
}

function toastOf(options: ts.Expression | undefined): FactoryToast {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return { toasts: false, suppresses: false };
  }
  const property = options.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText() === "errorToast");
  if (property === undefined || !ts.isPropertyAssignment(property)) {
    return { toasts: hasProperty(options, "errorToast"), suppresses: false };
  }
  return { toasts: true, suppresses: returnsNull(property.initializer) };
}

/** A returned leaf is the `null` literal. A call that merely takes `null` as an argument answers unknown, so it does not count. */
function isNullLeaf(expression: ts.Expression | undefined): boolean {
  if (expression === undefined) {
    return false;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return isNullLeaf(expression.expression);
  }
  if (ts.isConditionalExpression(expression)) {
    return isNullLeaf(expression.whenTrue) || isNullLeaf(expression.whenFalse);
  }
  return expression.kind === ts.SyntaxKind.NullKeyword;
}

/** A function-form toast that can answer `null`: a returned leaf, not any `null` inside the body. */
function returnsNull(value: ts.Expression): boolean {
  if (!(ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
    return false;
  }
  if (!ts.isBlock(value.body)) {
    return isNullLeaf(value.body);
  }
  const returned: ts.Expression[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && node !== value) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      returned.push(node.expression);
    }
    ts.forEachChild(node, collect);
  };
  collect(value.body);
  return returned.some(isNullLeaf);
}

/** Mutation hooks minted by the factory at module scope, with how the factory toasts. */
function factoryDefs(sources: readonly Source[]): ReadonlyMap<string, FactoryToast> {
  const defs = new Map<string, FactoryToast>();
  for (const { sf } of clientSources(sources)) {
    visit(sf, (node) => {
      const call = ts.isVariableDeclaration(node) ? node.initializer : undefined;
      if (call !== undefined && ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === FACTORY) {
        defs.set((node as ts.VariableDeclaration).name.getText(sf), toastOf(call.arguments[0]));
      }
    });
  }
  return defs;
}

/** `x.error !== null` handed to a state-mark call, which carries the state and no text. */
function isStateMark(node: ts.Node): boolean {
  for (let at = node.parent; !ts.isSourceFile(at); at = at.parent) {
    if (ts.isCallExpression(at) && ts.isIdentifier(at.expression)) {
      return STATE_MARK_CALLS.has(at.expression.text);
    }
    if (ts.isFunctionLike(at)) {
      return false;
    }
  }
  return false;
}

/** A setter says a failure only when its name does: `setOpen(false)` or `setPending(false)` in a catch says nothing about what failed. */
const FAILURE_SETTER = /^set\w*(?:Error|Failure|Fail|Message|Refusal|Notice|Problem)\w*$/u;

/** The consumer says the failure itself: a call that sets failure state or toasts. */
function isFailureStatement(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return FAILURE_SETTER.test(callee.text);
  }
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "notify" && callee.name.text === "error";
}

const MUTATE_CALLS = new Set(["mutate", "mutateAsync"]);

/** The node names this mutation's result: the bound handle, or a destructured `mutate`/`mutateAsync`. */
function mentionsMutation(root: ts.Node, handles: ReadonlySet<string>): boolean {
  return anyNode(root, (node) => ts.isIdentifier(node) && handles.has(node.text));
}

function isSubmit(receiver: ts.Expression): boolean {
  return ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression) && receiver.expression.name.text === "handleSubmit";
}

/** Where the mutation promise rejects: a `try/catch` around its call or a `.catch(...)` chained on it, saying the failure. */
function catchSaysFailure(root: ts.Node, handles: ReadonlySet<string>): boolean {
  return anyNode(root, (node) => {
    if (ts.isCatchClause(node)) {
      const attempt = node.parent;
      return ts.isTryStatement(attempt) && mentionsMutation(attempt.tryBlock, handles) && anyNode(node.block, isFailureStatement);
    }
    const isPromiseCatch = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "catch";
    // A form submit rethrows the save's failure, so `form.handleSubmit().catch(...)` is where the mutation's failure lands.
    const reachesMutation = (receiver: ts.Expression): boolean => mentionsMutation(receiver, handles) || isSubmit(receiver);
    return isPromiseCatch && reachesMutation(node.expression.expression) && node.arguments.some((argument) => anyNode(argument, isFailureStatement));
  });
}

/** A per-call `onError` handler on this mutation's own `mutate` call. */
function isOwnOnError(node: ts.Node, handles: ReadonlySet<string>): boolean {
  if (!(ts.isPropertyAssignment(node) && node.name.getText() === "onError")) {
    return false;
  }
  for (let at: ts.Node = node.parent; !ts.isSourceFile(at); at = at.parent) {
    if (ts.isCallExpression(at)) {
      return mentionsMutation(at.expression, handles) && anyNode(at.expression, (inner) => ts.isIdentifier(inner) && MUTATE_CALLS.has(inner.text));
    }
  }
  return false;
}

function readsFrom(call: ts.CallExpression, names: ReadonlySet<string>): { readonly errorRead: boolean; readonly successRead: boolean } {
  const binding = resultBinding(call);
  const scope = enclosingFunction(call);
  const handles = new Set([...(binding.name === null ? [] : [binding.name]), ...binding.destructured.filter((name) => MUTATE_CALLS.has(name))]);
  let errorRead = binding.destructured.some((name) => names.has(name)) || catchSaysFailure(scope, handles);
  let successRead = false;
  visit(scope, (node) => {
    if (binding.name !== null && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === binding.name) {
      errorRead ||= names.has(node.name.text) && !isStateMark(node);
    }
    // A per-call `onError` handler is the consumer's own failure statement.
    errorRead ||= isOwnOnError(node, handles);
    successRead ||= ts.isIdentifier(node) && SUCCESS_READS.has(node.text);
  });
  return { errorRead, successRead };
}

function failureOf(factoryToast: boolean, inline: boolean): string {
  if (factoryToast && inline) {
    return "toast+inline";
  }
  if (factoryToast) {
    return "toast";
  }
  return inline ? "inline" : "none";
}

function memberOf(source: Source, sf: ts.SourceFile, call: ts.CallExpression, factory: FactoryToast): Member {
  const inlineFlag = hasProperty(call.arguments[0], "failureShownInline");
  const { errorRead, successRead } = readsFrom(call, ERROR_READS);
  let success = "none";
  if (sf.text.includes("useToastManager(")) {
    success = "toast";
  } else if (successRead) {
    success = "callback";
  }
  const line = lineOf(sf, call);
  return {
    path: source.path,
    section: source.section,
    label: call.expression.getText(sf),
    cells: {
      success: { value: success, line },
      failure: { value: failureOf(factory.toasts && !inlineFlag, (inlineFlag || errorRead) && !factory.suppresses), line },
    },
  };
}

export function buildFeedbackCohort(sources: readonly Source[]): { readonly cohort: Cohort; readonly scan: FeedbackScan } {
  const defs = factoryDefs(sources);
  const files = clientSources(sources);
  const members = files.flatMap((source) => {
    const out: Member[] = [];
    visit(source.sf, (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && defs.has(node.expression.text)) {
        out.push(memberOf(source, source.sf, node, defs.get(node.expression.text) ?? { toasts: false, suppresses: false }));
      }
    });
    return out;
  });
  return {
    scan: { factories: defs.size, consumers: members.length, files: files.length },
    cohort: {
      name: "feedback",
      what: "entity-mutation consumers: success (toast, callback, none) and failure surface (factory toast, inline, both, none)",
      columns: ["success", "failure"],
      defects: { failure: ["toast+inline"] },
      basis: { success: "heuristic", failure: "heuristic" },
      members,
    },
  };
}
