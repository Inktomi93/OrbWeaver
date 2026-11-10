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
/** A callback prop that hands the failure to the parent surface that renders it: `onPreviewFailed(epoch, message)`. */
const FAILURE_CALLBACK = /^on\w*(?:Error|Failure|Failed|Refusal|Refused)$/u;

/** The props whose awaited handler's rejection the receiving component renders: `ConfirmDialog`, `DestructiveAction` and a
 *  row menu's `destructive` action state a rejected `onConfirm` in the dialog's alert line, and a row's `onDelete` is typed
 *  as that `onConfirm` (`LibraryRowActions`, `ThemeRowMenu`) or forwarded to it. A handler that awaits or returns nothing
 *  hands no rejection on, so a plain `onDelete` callback never reads as one. */
const REJECTION_RENDERING_PROPS = new Set(["onConfirm", "onDelete"]);

/** `useRowDeleteFocus().delete(key, run)` wraps `run` into the row's `onDelete`, so its second argument is a rejection position. */
const ROW_DELETE_RUN = { method: "delete", argument: 1 } as const;

function isRowDeleteRun(value: ts.Node): boolean {
  const call = value.parent;
  return (
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === ROW_DELETE_RUN.method &&
    call.arguments[ROW_DELETE_RUN.argument] === value
  );
}

function propName(node: ts.Node): string | null {
  if (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
    return node.name.getText();
  }
  return null;
}

/** The value sits directly in a rejection-rendering prop: `onConfirm={value}` or `{ onConfirm: value }`. */
function inRejectionProp(value: ts.Node): boolean {
  if (isRowDeleteRun(value)) {
    return true;
  }
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
    return FAILURE_SETTER.test(callee.text) || FAILURE_CALLBACK.test(callee.text);
  }
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "notify" && callee.name.text === "error";
}

// Bind only the parsed consumer file: a callback elsewhere with the same spelling cannot handle this rejection.
const localCheckers = new WeakMap<ts.SourceFile, ts.TypeChecker>();

function callbackBody(name: ts.Identifier): ts.ConciseBody | undefined {
  const file = name.getSourceFile();
  let checker = localCheckers.get(file);
  if (checker === undefined) {
    const options: ts.CompilerOptions = { noLib: true, noResolve: true, jsx: ts.JsxEmit.Preserve, types: [] };
    const host = ts.createCompilerHost(options);
    host.getSourceFile = (path): ts.SourceFile | undefined => (path === file.fileName ? file : undefined);
    checker = ts.createProgram([file.fileName], options, host).getTypeChecker();
    localCheckers.set(file, checker);
  }
  const declaration = checker.getSymbolAtLocation(name)?.valueDeclaration;
  if (declaration === undefined || declaration.getSourceFile() !== file) {
    return undefined;
  }
  if (ts.isFunctionDeclaration(declaration)) {
    return declaration.body;
  }
  if (
    !(ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent)) ||
    declaration.parent.getFirstToken()?.kind !== ts.SyntaxKind.ConstKeyword
  ) {
    return undefined;
  }
  const value = declaration.initializer;
  return value !== undefined && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value.body : undefined;
}

function handlerSaysFailure(handler: ts.Node): boolean {
  const visited = new Set<ts.Node>();
  const follow = (name: ts.Identifier): boolean => {
    const body = callbackBody(name);
    if (body === undefined || visited.has(body)) {
      return false;
    }
    visited.add(body);
    return reads(body);
  };
  const reads = (node: ts.Node): boolean => {
    if (ts.isFunctionLike(node)) {
      return false;
    }
    if (isFailureStatement(node) || isFailedState(node)) {
      return true;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && follow(node.expression)) {
      return true;
    }
    return ts.forEachChild(node, readsChild) === true;
  };
  function readsChild(child: ts.Node): true | undefined {
    return reads(child) ? true : undefined;
  }
  if (ts.isIdentifier(handler)) {
    return follow(handler);
  }
  return reads(ts.isArrowFunction(handler) || ts.isFunctionExpression(handler) ? handler.body : handler);
}

const MUTATE_CALLS = new Set(["mutate", "mutateAsync"]);

/** The call is `handle.mutateAsync(...)` or a destructured `mutateAsync(...)` of this mutation. */
function isOwnMutateAsync(node: ts.Node, handles: ReadonlySet<string>): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const callee = node.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text === "mutateAsync" && ts.isIdentifier(callee.expression) && handles.has(callee.expression.text);
  }
  return ts.isIdentifier(callee) && callee.text === "mutateAsync" && handles.has(callee.text);
}

const PASSING_LINKS = new Set(["then", "finally"]);

/** The outermost expression that still rejects when the settle does: a one-handler `.then` or a `.finally` chained on it,
 *  a `.map` callback that returns it, or a `Promise.all` over it. A `.catch` or a two-handler `.then` ends the chain. */
function rejectingChain(call: ts.Expression): ts.Expression {
  let at: ts.Expression = call;
  for (;;) {
    const parent = at.parent;
    const link = ts.isPropertyAccessExpression(parent) && parent.expression === at ? parent.parent : undefined;
    if (
      link !== undefined &&
      ts.isCallExpression(link) &&
      ts.isPropertyAccessExpression(parent) &&
      PASSING_LINKS.has(parent.name.text) &&
      link.arguments.length <= 1
    ) {
      at = link;
    } else if (ts.isArrowFunction(parent) && parent.body === at && isCallTo(parent.parent, "map")) {
      at = parent.parent as ts.CallExpression;
    } else if (isCallTo(parent, "all") && (parent as ts.CallExpression).arguments.includes(at)) {
      at = parent as ts.CallExpression;
    } else {
      return at;
    }
  }
}

function isCallTo(node: ts.Node, method: string): boolean {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === method;
}

/** The settle's rejection leaves the function: awaited or returned outside any `try`, so the function rejects with it. */
function rejectsOutward(call: ts.CallExpression, fn: ts.Node): boolean {
  const chain = rejectingChain(call);
  const carrier = chain.parent;
  if (!(ts.isAwaitExpression(carrier) || ts.isReturnStatement(carrier) || (ts.isArrowFunction(carrier) && carrier.body === chain))) {
    return false;
  }
  for (let at: ts.Node = chain; at !== fn; at = at.parent) {
    if (ts.isTryStatement(at.parent) && at.parent.tryBlock === at) {
      return false;
    }
  }
  return true;
}

/** The mutation's rejection reaches a component that renders it: a confirm awaits a handler that awaits or returns the settle. */
function rejectsIntoSurface(root: ts.Node, handles: ReadonlySet<string>): boolean {
  return anyNode(root, (node) => {
    if (!isOwnMutateAsync(node, handles)) {
      return false;
    }
    const fn = enclosingFunction(rejectingChain(node));
    return !ts.isSourceFile(fn) && rejectsOutward(node, fn) && reachesRejectionSurface(fn);
  });
}

const FAILED_STATES = new Set(["failed", "error", "rejected"]);

/** A discriminated state set to its failed arm, `{ state: "failed" }`, which the surface that reads the state renders. */
function isFailedState(node: ts.Node): boolean {
  return ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer) && FAILED_STATES.has(node.initializer.text);
}

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

function isSubmit(receiver: ts.Node): boolean {
  return ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression) && receiver.expression.name.text === "handleSubmit";
}

/** Where the mutation promise rejects: a `try/catch` around its call or a `.catch(...)` chained on it, saying the failure.
 *  Only `mutateAsync` rejects; `mutate` never throws, so a catch around it says nothing about this mutation. */
function catchSaysFailure(root: ts.Node, handles: ReadonlySet<string>): boolean {
  // A form submit rethrows the save's failure, so `form.handleSubmit()` is where the mutation's failure lands, provided
  // this function calls the mutation at all (a submit whose save is another mutation's says nothing about this one).
  const rejectsHere = (node: ts.Node): boolean =>
    anyNode(node, (inner) => isOwnMutateAsync(inner, handles) || (isSubmit(inner) && callsMutation(root, handles)));
  return anyNode(root, (node) => {
    if (ts.isCatchClause(node)) {
      const attempt = node.parent;
      return ts.isTryStatement(attempt) && rejectsHere(attempt.tryBlock) && handlerSaysFailure(node.block);
    }
    const isPromiseCatch = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "catch";
    const reachesMutation = (receiver: ts.Expression): boolean => rejectsHere(receiver);
    return isPromiseCatch && reachesMutation(node.expression.expression) && node.arguments.some(handlerSaysFailure);
  });
}

/** A per-call `onError` handler on this mutation's own `mutate` call that states the failure. A handler that only tidies
 *  up (retires a card whose ask is gone) leaves the toast as the one surface. */
function isOwnOnError(node: ts.Node, handles: ReadonlySet<string>): boolean {
  if (!(ts.isPropertyAssignment(node) && node.name.getText() === "onError" && handlerSaysFailure(node.initializer))) {
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
  let errorRead = binding.destructured.some((name) => names.has(name)) || catchSaysFailure(scope, handles) || rejectsIntoSurface(scope, handles);
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

/** The failure surface one consumer shows. A toast-class consumer that declares `failureShownInline` at its hook call
 *  skips the toast, so it shows only what it says itself. */
function failureOf(factory: FactoryToast, consumerSays: boolean, declaresInline: boolean): string {
  if (factory.background) {
    return "log";
  }
  if (factory.toasts && declaresInline) {
    return consumerSays ? "inline" : "none";
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
      failure: { value: failureOf(factory, errorRead, hasProperty(call.arguments[0], "failureShownInline")), line },
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
      // A failure never shows neither and never both (client-architecture-state-and-gates.md §11): an inline consumer that reads no
      // error, and a toast-class consumer that states the failure without declaring `failureShownInline`, are defects.
      defects: { failure: ["none", "toast+inline"] },
      kept: {
        failure: {
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
