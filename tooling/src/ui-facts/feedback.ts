// Feedback shape: for each consumer of an entity-mutation hook, what tells the user it worked and what tells them it failed.
import ts from "typescript";
import type { Source } from "../eslint/index.ts";
import { lineOf, visit } from "../eslint/index.ts";
import type { Cohort, Member } from "../floor/verdict/cohort-compare.ts";
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

/** The factory's failure class (client-architecture-state-and-gates.md §11) and whether a function-form toast ever
 *  answers `null` (a failure its consumer says itself). */
interface FactoryToast {
  readonly toasts: boolean;
  readonly suppresses: boolean;
  readonly background: boolean;
  readonly inline: boolean;
}

const NO_FEEDBACK: FactoryToast = { toasts: false, suppresses: false, background: false, inline: false };

function toastOf(options: ts.Expression | undefined): FactoryToast {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return NO_FEEDBACK;
  }
  if (hasProperty(options, "backgroundFailure")) {
    return { ...NO_FEEDBACK, background: true };
  }
  if (hasProperty(options, "failureShownInline")) {
    return { ...NO_FEEDBACK, inline: true };
  }
  const property = options.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText() === "errorToast");
  if (property === undefined || !ts.isPropertyAssignment(property)) {
    return { ...NO_FEEDBACK, toasts: hasProperty(options, "errorToast") };
  }
  return { ...NO_FEEDBACK, toasts: true, suppresses: returnsNull(property.initializer) };
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
const FAILURE_SETTER = /^set\w*(?:Error|Failure|Failed|Message|Refusal|Notice|Problem)$/u;

/** The props whose awaited handler's rejection the receiving component renders: `ConfirmDialog`, `DestructiveAction` and a
 *  row menu's `destructive` action state a rejected `onConfirm` in the dialog's alert line. */
const REJECTION_RENDERING_PROPS = new Set(["onConfirm"]);

function propName(node: ts.Node): string | null {
  if (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
    return node.name.getText();
  }
  return null;
}

/** The value sits directly in a rejection-rendering prop: `onConfirm={value}` or `{ onConfirm: value }`. */
function inRejectionProp(value: ts.Node): boolean {
  const holder = ts.isJsxExpression(value.parent) ? value.parent.parent : value.parent;
  const name = propName(holder);
  return name !== null && REJECTION_RENDERING_PROPS.has(name);
}

function functionName(fn: ts.Node): string | null {
  if (ts.isFunctionDeclaration(fn)) {
    return fn.name?.text ?? null;
  }
  return ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : null;
}

/** An expression-bodied arrow whose body calls `name`, so it returns that call's promise: `() => remove(id)`. */
function forwards(value: ts.Node, name: string): boolean {
  return ts.isArrowFunction(value) && ts.isCallExpression(value.body) && ts.isIdentifier(value.body.expression) && value.body.expression.text === name;
}

/** The function's rejection reaches a component that renders it: the function is handed to a rejection-rendering prop
 *  itself, by name, by its shorthand, or through an arrow that returns its call. */
function reachesRejectionSurface(fn: ts.Node): boolean {
  if (inRejectionProp(fn)) {
    return true;
  }
  const name = functionName(fn);
  if (name === null) {
    return false;
  }
  // The name is looked up in the scope that declares it, so a same-named handler in another component does not count.
  return anyNode(enclosingFunction(fn), (node) => {
    if (ts.isShorthandPropertyAssignment(node)) {
      return node.name.text === name && REJECTION_RENDERING_PROPS.has(name);
    }
    return ((ts.isIdentifier(node) && node.text === name) || forwards(node, name)) && node !== fn && inRejectionProp(node);
  });
}

/** The consumer says the failure itself: a call that sets failure state or toasts, or a rethrow that hands the
 *  rejection to a component that renders it. A rethrow into a plain click handler renders nothing. */
function isFailureStatement(node: ts.Node): boolean {
  if (ts.isThrowStatement(node)) {
    let fn = enclosingFunction(node);
    // A `.catch(...)` callback's rethrow rejects the chain, so the function that returns the chain is the one handed on.
    while (
      !ts.isSourceFile(fn) &&
      ts.isCallExpression(fn.parent) &&
      ts.isPropertyAccessExpression(fn.parent.expression) &&
      fn.parent.expression.name.text === "catch"
    ) {
      fn = enclosingFunction(fn.parent);
    }
    return reachesRejectionSurface(fn);
  }
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

/** The function fires this mutation: `handle.mutate(...)`, `handle.mutateAsync(...)`, or a destructured `mutate`/`mutateAsync` call. */
function callsMutation(root: ts.Node, handles: ReadonlySet<string>): boolean {
  return anyNode(root, (node) => {
    if (!ts.isCallExpression(node)) {
      return false;
    }
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      return MUTATE_CALLS.has(callee.name.text) && ts.isIdentifier(callee.expression) && handles.has(callee.expression.text);
    }
    return ts.isIdentifier(callee) && MUTATE_CALLS.has(callee.text) && handles.has(callee.text);
  });
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
    // A form submit rethrows the save's failure, so `form.handleSubmit().catch(...)` is where the mutation's failure lands,
    // provided this function calls the mutation at all (a submit whose save is another mutation's says nothing about this one).
    const reachesMutation = (receiver: ts.Expression): boolean => mentionsMutation(receiver, handles) || (isSubmit(receiver) && callsMutation(root, handles));
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

function failureOf(factory: FactoryToast, consumerSays: boolean): string {
  if (factory.background) {
    return "log";
  }
  const factoryToast = factory.toasts;
  const inline = consumerSays && !factory.suppresses;
  if (factoryToast && inline) {
    return "toast+inline";
  }
  if (factoryToast) {
    return "toast";
  }
  if (inline) {
    return "inline";
  }
  return "none";
}

function memberOf(source: Source, sf: ts.SourceFile, call: ts.CallExpression, factory: FactoryToast): Member {
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
      failure: { value: failureOf(factory, errorRead), line },
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
        out.push(memberOf(source, source.sf, node, defs.get(node.expression.text) ?? NO_FEEDBACK));
      }
    });
    return out;
  });
  return {
    scan: { factories: defs.size, consumers: members.length, files: files.length },
    cohort: {
      name: "feedback",
      what: "entity-mutation consumers: success (toast, callback, none) and failure surface (factory toast, inline, both, background log, none)",
      // No law rules how a success is told, so success is a spread to read, not a convention to deviate from.
      columns: ["failure"],
      info: ["success"],
      // A failure never shows neither (client-architecture-state-and-gates.md §11), so an inline-class consumer that reads no error is a defect.
      defects: { failure: ["none"] },
      kept: {
        failure: {
          "toast+inline":
            "a failure may show a toast and inline text together while the inline line can be off screen (client-architecture-state-and-gates.md §11, Toasts)",
          inline:
            "a surface on screen while it fails states the failure inline and no toast repeats it, or a function-form toast answers null for an error the consumer says in place (client-architecture-state-and-gates.md §11, Toasts)",
          log: "background housekeeping the person did not start logs its failure and shows no toast (client-architecture-state-and-gates.md §11, Toasts)",
        },
      },
      basis: { success: "heuristic", failure: "heuristic" },
      members,
    },
  };
}
