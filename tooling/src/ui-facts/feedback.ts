// Feedback shape: for each consumer of an entity-mutation hook, what tells the user it worked and what tells them it failed.
import ts from "typescript";
import type { Source } from "../eslint/index.ts";
import { lineOf, visit } from "../eslint/index.ts";
import type { Cohort, KeptRead, Member } from "../floor/verdict/cohort-compare.ts";
import { anyNode, enclosingFunction, hasProperty, resultBinding } from "./syntax.ts";

const FACTORY = "createEntityMutation";
const ERROR_READS = new Set(["error", "isError", "retry", "clearError"]);
const SUCCESS_READS = new Set(["onSuccess", "isSuccess"]);

export interface FeedbackScan {
  readonly factories: number;
  readonly consumers: number;
  /** Success toasts no mutation consumer owns. */
  readonly unownedToasts: number;
  readonly files: number;
}

/** A client source with its parse. */
type ClientSource = Source & { readonly sf: ts.SourceFile };

const clientSources = (sources: readonly Source[]): readonly ClientSource[] =>
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

function readsFrom(
  call: ts.CallExpression,
  names: ReadonlySet<string>,
  managers: ReadonlySet<string>,
): { readonly errorRead: boolean; readonly successRead: boolean; readonly successToasts: readonly ts.CallExpression[] } {
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
  return { errorRead, successRead, successToasts: successToastCalls(scope, handles, managers) };
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

// The consumers whose success toast tells a result that lands out of the person's sight, each with where it lands
// (client-architecture-state-and-gates.md §11, Toasts). A further success toast in one of these files stays a defect.
const SUCCESS_OUT_OF_SIGHT: readonly KeptRead[] = [
  {
    path: "packages/client/src/lib/copy-with-notice.ts",
    label: "copyWithNotice",
    value: "toast",
    count: 1,
    reason: "the copy lands on the clipboard, which nothing in place shows",
  },
  {
    path: "packages/client/src/features/plugin/lib/plugin-ui-outcome.ts",
    label: "module",
    value: "toast",
    count: 1,
    reason: "a plugin's own notice: what it reports lands in the plugin, out of the host surface's sight",
  },
  {
    path: "packages/client/src/features/regex/hooks/use-regex-collection.ts",
    label: "useImportRegexScriptFile",
    value: "toast",
    count: 1,
    reason: "an import from a file: whether the script was new or already held shows nowhere in place",
  },
  {
    path: "packages/client/src/features/world-info/hooks/use-world-info-collection.ts",
    label: "useImportWorldBookFile",
    value: "toast",
    count: 1,
    reason: "an import from a file: its count of books and entries shows nowhere in place",
  },
  {
    path: "packages/client/src/features/character/components/character-appearance-tab.tsx",
    label: "usePromoteTheme",
    value: "toast",
    count: 1,
    reason: "a save to another place: the theme lands in the person's themes, not on this tab",
  },
  {
    path: "packages/client/src/features/chat/components/invite-dialog.tsx",
    label: "useCreateInvite",
    value: "toast",
    count: 1,
    reason: "the invite lands in the invitee's notifications",
  },
  {
    path: "packages/client/src/features/chat/components/message-actions-row.tsx",
    label: "useForkMutation",
    value: "toast",
    count: 1,
    reason: "the fork opens a copy of the transcript, so nothing in place shows the switch",
  },
  {
    path: "packages/client/src/features/config/components/appearance-looks-section.tsx",
    label: "useImportThemeFile",
    value: "toast",
    count: 1,
    reason: "an import from a file: the theme it made shows nowhere in place",
  },
  {
    path: "packages/client/src/features/databank/hooks/use-owner-sweep.tsx",
    label: "useReindexDocuments",
    value: "toast",
    count: 1,
    reason: "the rebuild runs as a background job the person cannot see start",
  },
  {
    path: "packages/client/src/features/databank/surfaces/databank-detail-surface.tsx",
    label: "useReindexDocuments",
    value: "toast",
    count: 1,
    reason: "the rebuild runs as a background job the person cannot see start",
  },
  {
    path: "packages/client/src/features/imagery/components/image-detail-body.tsx",
    label: "useSetChatBackground",
    value: "toast",
    count: 1,
    reason: "a save to another place: the background lands in the chat, not in this dialog",
  },
  {
    path: "packages/client/src/features/imagery/components/image-edit-body.tsx",
    label: "useEditImage",
    value: "toast",
    count: 1,
    reason: "a save to another place: the edited image lands in the gallery",
  },
  {
    path: "packages/client/src/features/plugin/components/plugin-distribute-section.tsx",
    label: "useDistributePlugin",
    value: "toast",
    count: 1,
    reason: "the plugin lands in other accounts; the toast states how many",
  },
  {
    path: "packages/client/src/features/plugin/components/plugin-distribute-section.tsx",
    label: "useWithdrawPlugin",
    value: "toast",
    count: 1,
    reason: "the plugin leaves other accounts; the toast states how many",
  },
  {
    path: "packages/client/src/features/preset/hooks/use-preset-list-header.tsx",
    label: "useImportPresetFile",
    value: "toast",
    count: 1,
    reason: "an import from a file: whether it was new, renamed or already held shows nowhere in place",
  },
  {
    path: "packages/client/src/features/roster-preset/components/roster-picker.tsx",
    label: "useCreateRosterPreset",
    value: "toast",
    count: 1,
    reason: "a save to another place: the roster lands in the saved rosters, not in the room",
  },
  {
    path: "packages/client/src/features/tag/components/labels-suggestions.tsx",
    label: "useAcceptSuggestion",
    value: "toast",
    count: 1,
    reason: "the apply-to-all count covers characters that are not on screen",
  },
  {
    path: "packages/client/src/features/user-admin/components/admin-link-sso-dialog.tsx",
    label: "useLinkSsoIdentity",
    value: "toast",
    count: 1,
    reason: "the link changes the other person's next sign-in",
  },
  {
    path: "packages/client/src/features/user-admin/components/admin-reset-password-dialog.tsx",
    label: "useResetPassword",
    value: "toast",
    count: 1,
    reason: "the reset revokes the other person's sessions",
  },
  {
    path: "packages/client/src/features/world-info/surfaces/world-info-member-surface.tsx",
    label: "useBackfillWorldTitles",
    value: "toast",
    count: 1,
    reason: "the fill count covers entries that are not on screen, and a fill of none changes nothing in place",
  },
];

// The names a file binds to `useToastManager()`.
function toastManagers(sf: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  visit(sf, (node) => {
    if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined)) {
      return;
    }
    const init = node.initializer;
    if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "useToastManager") {
      names.add(node.name.text);
    }
  });
  return names;
}

// The call fires this mutation itself: `handle.mutate(...)`, `handle.mutateAsync(...)` or a destructured `mutate(...)`.
function isOwnMutateCall(node: ts.Node, handles: ReadonlySet<string>): boolean {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const callee = node.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return MUTATE_CALLS.has(callee.name.text) && ts.isIdentifier(callee.expression) && handles.has(callee.expression.text);
  }
  return ts.isIdentifier(callee) && MUTATE_CALLS.has(callee.text) && handles.has(callee.text);
}

// The statement itself awaits this mutation; an `await` inside a function it declares runs at another time.
function awaitsOwn(root: ts.Node, handles: ReadonlySet<string>): boolean {
  if (ts.isAwaitExpression(root) && isOwnMutateAsync(unwrapAwaited(root.expression), handles)) {
    return true;
  }
  return !ts.isFunctionLike(root) && ts.forEachChild(root, (child) => (awaitsOwn(child, handles) ? true : undefined)) === true;
}

const unwrapAwaited = (node: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(node) ? unwrapAwaited(node.expression) : node);

const SUCCESS_HANDLER = "onSuccess";
const FAILURE_HANDLER = "onError";

// An `onSuccess` on this mutation's own `mutate` call is its success path; an `onError` anywhere is a failure path.
function handlerStep(at: ts.PropertyAssignment, handles: ReadonlySet<string>): boolean | null {
  const name = at.name.getText();
  if (name === FAILURE_HANDLER) {
    return false;
  }
  if (name !== SUCCESS_HANDLER) {
    return null;
  }
  return ts.isObjectLiteralExpression(at.parent) && isOwnMutateCall(at.parent.parent, handles) ? true : null;
}

// A callback of a promise link: the first argument of a `.then` on this mutation's `mutateAsync` is its success path;
// a `.catch` callback or a `.then` rejection callback is a failure path.
function callbackStep(at: ts.Expression, call: ts.CallExpression, link: ts.PropertyAccessExpression, handles: ReadonlySet<string>): boolean | null {
  const name = link.name.text;
  if (name === "catch" || (name === "then" && call.arguments.indexOf(at) > 0)) {
    return false;
  }
  return name === "then" && anyNode(link.expression, (node) => isOwnMutateAsync(node, handles)) ? true : null;
}

// How one step out from a toast relates it to this mutation: on its success, on a failure, or neither.
function successStep(at: ts.Node, handles: ReadonlySet<string>): boolean | null {
  const parent = at.parent;
  if (ts.isCatchClause(at)) {
    return false;
  }
  if (ts.isPropertyAssignment(at)) {
    return handlerStep(at, handles);
  }
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && ts.isExpression(at) && parent.arguments.includes(at)) {
    return callbackStep(at, parent, parent.expression, handles);
  }
  if ((ts.isBlock(parent) || ts.isSourceFile(parent)) && ts.isStatement(at)) {
    // A statement after an `await` of this mutation runs only once it has settled without a throw.
    const before = parent.statements.slice(0, parent.statements.indexOf(at));
    return before.some((statement) => awaitsOwn(statement, handles)) ? true : null;
  }
  return null;
}

// The toast sits on this mutation's success path: its `onSuccess`, a `.then` on its `mutateAsync`, or a statement after
// an `await` of it. A catch, a `.catch`, a rejection callback or an `onError` on the way out is a failure path.
function onOwnSuccess(node: ts.Node, scope: ts.Node, handles: ReadonlySet<string>): boolean {
  for (let at = node.parent; at !== scope; at = at.parent) {
    const step = successStep(at, handles);
    if (step !== null) {
      return step;
    }
  }
  return false;
}

// The toasts this consumer tells as a success: `notify.success`, or a toast manager's `add`, on its own success path.
function successToastCalls(scope: ts.Node, handles: ReadonlySet<string>, managers: ReadonlySet<string>): readonly ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  visit(scope, (node) => {
    if (!(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression))) {
      return;
    }
    const { expression: owner, name } = node.expression;
    const toast = (owner.text === "notify" && name.text === "success") || (managers.has(owner.text) && name.text === "add");
    if (toast && onOwnSuccess(node, scope, handles)) {
      found.push(node);
    }
  });
  return found;
}

function memberOf(source: ClientSource, call: ts.CallExpression, factory: FactoryToast, owned: Set<ts.Node>): Member {
  const { sf } = source;
  const { errorRead, successRead, successToasts } = readsFrom(call, ERROR_READS, toastManagers(sf));
  for (const toast of successToasts) {
    owned.add(toast);
  }
  let success = "none";
  if (successToasts.length > 0) {
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

/** The failure cell of a success toast that no mutation's success path owns: there is no mutation whose failure it could tell. */
const NOT_A_MUTATION = "not a mutation";

/** The nearest enclosing function that carries a name, so a toast inside a `.then` callback is named for the function that holds it. */
function holderName(node: ts.Node): string {
  for (let at: ts.Node = node.parent; !ts.isSourceFile(at); at = at.parent) {
    if (ts.isFunctionDeclaration(at) && at.name !== undefined) {
      return at.name.text;
    }
    if (ts.isFunctionLike(at) && ts.isVariableDeclaration(at.parent) && ts.isIdentifier(at.parent.name)) {
      return at.parent.name.text;
    }
  }
  return "module";
}

/** Every `notify.success` that no entity-mutation consumer's success path owns: a toast in a hook that runs a state machine or a raw
 *  request, or in a helper. Each is a success toast like any other, so the ruling on where its result lands judges it too. */
function unownedSuccessToasts(source: ClientSource, owned: ReadonlySet<ts.Node>): Member[] {
  const { sf } = source;
  const out: Member[] = [];
  visit(sf, (node) => {
    const isNotifySuccess =
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "notify" &&
      node.expression.name.text === "success";
    if (!isNotifySuccess || owned.has(node)) {
      return;
    }
    const line = lineOf(sf, node);
    out.push({
      path: source.path,
      section: source.section,
      label: holderName(node),
      cells: { success: { value: "toast", line }, failure: { value: NOT_A_MUTATION, line } },
    });
  });
  return out;
}

export function buildFeedbackCohort(sources: readonly Source[]): { readonly cohort: Cohort; readonly scan: FeedbackScan } {
  const defs = factoryDefs(sources);
  const files = clientSources(sources);
  const members = files.flatMap((source) => {
    const out: Member[] = [];
    const owned = new Set<ts.Node>();
    visit(source.sf, (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && defs.has(node.expression.text)) {
        out.push(memberOf(source, node, defs.get(node.expression.text) ?? NO_FEEDBACK, owned));
      }
    });
    return [...out, ...unownedSuccessToasts(source, owned)];
  });
  return {
    scan: {
      factories: defs.size,
      consumers: members.filter((member) => member.cells["failure"]?.value !== NOT_A_MUTATION).length,
      unownedToasts: members.filter((member) => member.cells["failure"]?.value === NOT_A_MUTATION).length,
      files: files.length,
    },
    cohort: {
      name: "feedback",
      what: "entity-mutation consumers and every other success toast: success (toast, callback, none) and failure surface (factory toast, inline, both, background log, none, or not a mutation)",
      columns: ["failure"],
      // Success has no majority to follow: a success the person sees in place tells itself, and a toast is the defect
      // unless a ruling below names where the result lands out of sight (client-architecture-state-and-gates.md §11, Toasts).
      info: ["success"],
      // A failure never shows neither and never both (client-architecture-state-and-gates.md §11): an inline consumer that reads no
      // error, and a toast-class consumer that states the failure without declaring `failureShownInline`, are defects.
      defects: { failure: ["none", "toast+inline"], success: ["toast"] },
      keptReads: { success: SUCCESS_OUT_OF_SIGHT },
      kept: {
        failure: {
          inline:
            "a surface on screen while it fails states the failure inline and no toast repeats it, or a function-form toast answers null for an error the consumer says in place (client-architecture-state-and-gates.md §11, Toasts)",
          log: "background housekeeping the person did not start logs its failure and shows no toast (client-architecture-state-and-gates.md §11, Toasts)",
          [NOT_A_MUTATION]:
            "a success toast outside every mutation's success path has no mutation failure to tell; its success column is judged like any other (client-architecture-state-and-gates.md §11, Toasts)",
        },
      },
      basis: { success: "heuristic", failure: "heuristic" },
      members,
    },
  };
}
