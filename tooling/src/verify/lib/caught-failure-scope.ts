// Two ownership scopes above the value/call classifiers: FRAMEWORK provenance (does a call trace back to a
// governed TanStack query/form hook or `createEntityMutation`, which owns the failure itself) and the
// STATEMENT-level walk (`hasExplicitOwner`) that scans a catch/finally block's own statements — including
// the discriminated-rethrow and cause-chaining credits — for an explicit owner or an escaping throw.
import type { Block, CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import {
  calleeName,
  declarationsOf,
  directlyCarriesBinding,
  FUNCTION_KINDS,
  hasInterveningWrite,
  importedName,
  literalMember,
  originatesFromFactory,
  propertyValueNode,
  referencesBinding,
  resolvedFunction,
} from "./caught-failure-core.ts";
import { isFailureOutcome } from "./caught-failure-outcome.ts";
import { rawFailureDeclarations } from "./caught-failure-read.ts";
import { heldFailureRethrown } from "./caught-failure-retained.ts";
import { isExplicitOwnerCall } from "./caught-failure-sinks.ts";

// ── framework provenance ────────────────────────────────────────────────────────────────────────────────
const QUERY_FACTORIES: ReadonlySet<string> = new Set(["useInfiniteQuery", "useQuery", "useQueryClient", "useSuspenseInfiniteQuery", "useSuspenseQuery"]);
const FORM_FACTORIES: ReadonlySet<string> = new Set(["useForm"]);

function entityMutationFactoryOwns(call: CallExpression, reads?: CaughtFailureReadServices): boolean {
  const callee = unwrapExpression(call.getExpression());
  return declarationsOf(callee, reads).some((declaration) => {
    if (!declaration.isKind(SyntaxKind.VariableDeclaration)) {
      return false;
    }
    if (callee.isKind(SyntaxKind.Identifier) && hasInterveningWrite(callee, declaration, reads)) {
      return false;
    }
    // The write guard reads only the importing file, so a hook declared in another module must be a `const`.
    const foreign = declaration.getSourceFile() !== callee.getSourceFile();
    if (foreign && declaration.getVariableStatement()?.getDeclarationKind() !== "const") {
      return false;
    }
    const initializer = declaration.getInitializerIfKind(SyntaxKind.CallExpression);
    const config = initializer?.getArguments()[0];
    if (initializer === undefined || config?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
      return false;
    }
    const factoryDeclarations = declarationsOf(initializer.getExpression(), reads);
    const governedFactory =
      importedName(initializer.getExpression(), new Set(["#data", "./create-entity-mutation.ts"]), reads) === "createEntityMutation" ||
      factoryDeclarations.some(
        (factory) =>
          factory.isKind(SyntaxKind.FunctionDeclaration) &&
          factory.getName() === "createEntityMutation" &&
          factory.getSourceFile().getFilePath().endsWith("/packages/client/src/data/create-entity-mutation.ts"),
      );
    const toastValue = propertyValueNode(config.getProperty("errorToast"));
    return governedFactory && toastValue !== undefined && isFailureOutcome(toastValue, undefined, reads);
  });
}

function originatesFromOwnedEntityMutation(node: Node, seen: ReadonlySet<Node> = new Set(), reads?: CaughtFailureReadServices): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.CallExpression)) {
    return entityMutationFactoryOwns(value, reads);
  }
  if (!value.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const declaration = rawFailureDeclarations(value, reads)[0];
  if (declaration !== undefined && hasInterveningWrite(value, declaration, reads)) {
    return false;
  }
  if (declaration?.isKind(SyntaxKind.BindingElement) === true) {
    const initializer = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
    return initializer !== undefined && originatesFromOwnedEntityMutation(initializer, nextSeen, reads);
  }
  const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
  return initializer !== undefined && originatesFromOwnedEntityMutation(initializer, nextSeen, reads);
}

export function frameworkOwns(call: CallExpression, reads?: CaughtFailureReadServices): boolean {
  const name = calleeName(call, reads);
  const callee = unwrapExpression(call.getExpression());
  if (
    name === "withRequestSpan" &&
    importedName(callee, new Set(["#foundation/observability", "#foundation/observability/tracing"]), reads) === "withRequestSpan"
  ) {
    return true;
  }
  const member = literalMember(call.getExpression(), reads);
  const work = member === undefined ? callee : member.receiver;
  if (name === "fetchNextPage" || name === "fetchQuery" || name === "refetch" || name === "invalidateQueries" || name === "ensureQueryData") {
    return originatesFromFactory(work, new Set(["@tanstack/react-query"]), QUERY_FACTORIES, reads);
  }
  if (name === "handleSubmit") {
    return originatesFromFactory(work, new Set(["@tanstack/react-form"]), FORM_FACTORIES, reads);
  }
  if (name === "mutateAsync") {
    return originatesFromOwnedEntityMutation(work, undefined, reads);
  }
  return false;
}

export function hasFrameworkOwner(block: Block, reads?: CaughtFailureReadServices): boolean {
  if (block.getStatements().length !== 1) {
    return false;
  }
  const calls = block.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => !insideNestedFunction(call, block));
  // A constructor can throw too, so a `new` beside the governed operation is other work the catch absorbs.
  const constructs = block.getDescendantsOfKind(SyntaxKind.NewExpression).some((construct) => !insideNestedFunction(construct, block));
  const [onlyCall] = calls;
  return calls.length === 1 && !constructs && onlyCall !== undefined && frameworkOwns(onlyCall, reads);
}

// ── the statement-level ownership walk ──────────────────────────────────────────────────────────────────
function insideNestedFunction(node: Node, boundary: Node): boolean {
  let current: Node | undefined = node.getParent();
  while (current !== undefined && current !== boundary) {
    if (FUNCTION_KINDS.has(current.getKind())) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

export function escapingDescendants<T extends Node>(block: Block, kind: SyntaxKind, nodes: readonly T[]): readonly T[] {
  return nodes.filter((node) => !insideNestedFunction(node, block) && node.getKind() === kind);
}

const OWNER_VERDICTS = ["escape", "none", "owner"] as const;
type OwnerVerdict = (typeof OWNER_VERDICTS)[number];

function hasNestedEscape(statement: Node): boolean {
  return [SyntaxKind.ReturnStatement, SyntaxKind.BreakStatement, SyntaxKind.ContinueStatement].some((kind) =>
    statement.getDescendants().some((node) => node.getKind() === kind && !insideNestedFunction(node, statement)),
  );
}

function assignmentOwns(expression: Node, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  if (errorBinding === undefined || !expression.isKind(SyntaxKind.BinaryExpression)) {
    return false;
  }
  const left = expression.getLeft();
  if (heldFailureRethrown(expression, errorBinding, reads)) {
    return true;
  }
  const member = literalMember(left, reads);
  if (member === undefined) {
    return false;
  }
  if (!(member.receiver.isKind(SyntaxKind.Identifier) || member.receiver.isKind(SyntaxKind.ThisKeyword))) {
    return false;
  }
  const receiverDeclaration = member.receiver.isKind(SyntaxKind.Identifier) ? rawFailureDeclarations(member.receiver, reads)[0] : undefined;
  const discardedLocal = receiverDeclaration?.isKind(SyntaxKind.VariableDeclaration) === true;
  return (
    !discardedLocal &&
    /(?:^|\.)(?:error|failure)$/iu.test(expression.getLeft().getText()) &&
    expression.getOperatorToken().getText() === "=" &&
    directlyCarriesBinding(expression.getRight(), errorBinding, reads)
  );
}

/** Every way this statement leaves the block is a `return` of a failure outcome, so none of them swallows. */
function escapesOnlyByRefusal(statement: Node, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const kinds = new Set([SyntaxKind.ReturnStatement, SyntaxKind.BreakStatement, SyntaxKind.ContinueStatement]);
  return statement
    .getDescendants()
    .filter((node) => kinds.has(node.getKind()) && !insideNestedFunction(node, statement))
    .every((node) => {
      const value = node.isKind(SyntaxKind.ReturnStatement) ? node.getExpression() : undefined;
      return value !== undefined && isFailureOutcome(value, errorBinding, reads);
    });
}

/** The verdict a statement's own control flow decides before its value is read, if any. */
function controlFlowVerdict(
  statement: Node,
  errorBinding: Node | undefined,
  returnedOutcomeOwns: boolean,
  reads?: CaughtFailureReadServices,
): OwnerVerdict | undefined {
  if (guardedRethrow(statement, errorBinding, reads) || statement.isKind(SyntaxKind.ThrowStatement)) {
    return "owner";
  }
  if (hasNestedEscape(statement)) {
    // A conditional refusal owns its own path; the fall-through still needs an owner of its own.
    return returnedOutcomeOwns && escapesOnlyByRefusal(statement, errorBinding, reads) ? "none" : "escape";
  }
  return statement.isKind(SyntaxKind.BreakStatement) || statement.isKind(SyntaxKind.ContinueStatement) ? "escape" : undefined;
}

/** The value a statement hands its consumer: a `return`'s, or a generator's plain `yield`, which the iterating
 *  caller reads the same way. */
function deliveredValue(statement: Node): Node | undefined {
  if (statement.isKind(SyntaxKind.ReturnStatement)) {
    return statement.getExpression();
  }
  const yielded = statement.asKind(SyntaxKind.ExpressionStatement)?.getExpression().asKind(SyntaxKind.YieldExpression);
  return yielded?.getAsteriskToken() === undefined ? yielded?.getExpression() : undefined;
}

/** How one statement is judged: `forwards` is false inside a forwarded helper's body, so a forward is one hop. */
interface OwnerScan {
  readonly errorBinding: Node | undefined;
  readonly returnedOutcomeOwns: boolean;
  readonly reads: CaughtFailureReadServices | undefined;
  readonly forwards: boolean;
}

/** The unreassignable function a call resolves to, and the parameter that receives the caught binding. */
function forwardTarget(call: CallExpression, errorBinding: Node, reads?: CaughtFailureReadServices): { readonly body: Node; readonly name: Node } | undefined {
  const callee = unwrapExpression(call.getExpression());
  const index = call.getArguments().findIndex((argument) => directlyCarriesBinding(argument, errorBinding, reads));
  const declarations = index < 0 || !callee.isKind(SyntaxKind.Identifier) ? [] : declarationsOf(callee, reads);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const reassignable =
    declaration === undefined ||
    hasInterveningWrite(callee, declaration, reads) ||
    (declaration.isKind(SyntaxKind.VariableDeclaration) && declaration.getVariableStatement()?.getDeclarationKind() !== "const");
  const fn = reassignable ? undefined : resolvedFunction(declaration);
  if (
    !(
      fn?.isKind(SyntaxKind.FunctionDeclaration) === true ||
      fn?.isKind(SyntaxKind.ArrowFunction) === true ||
      fn?.isKind(SyntaxKind.FunctionExpression) === true
    )
  ) {
    return;
  }
  // A generator runs none of its body until iterated, and an async helper turns a rethrow into a rejection of the
  // promise this call discards, so neither runs its owner synchronously for the forwarding call.
  if (fn.isAsync() || (!fn.isKind(SyntaxKind.ArrowFunction) && fn.isGenerator())) {
    return;
  }
  const parameter = fn.getParameters()[index];
  const name = parameter?.isRestParameter() === false ? parameter.getNameNode() : undefined;
  const body = fn.getBody();
  return name?.isKind(SyntaxKind.Identifier) === true && body !== undefined ? { body, name } : undefined;
}

/** A call that hands the caught binding to a one-statement function whose body owns that parameter. One hop: the
 *  helper's body is read without forwarding again, and a multi-statement helper stays opaque. */
export function forwardsToOwner(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const target = errorBinding === undefined || call.getQuestionDotTokenNode() !== undefined ? undefined : forwardTarget(call, errorBinding, reads);
  if (target === undefined) {
    return false;
  }
  const { body, name } = target;
  if (body.isKind(SyntaxKind.Block)) {
    const [only, ...rest] = body.getStatements();
    return (
      only !== undefined && rest.length === 0 && statementOwner(only, { errorBinding: name, returnedOutcomeOwns: false, reads, forwards: false }) === "owner"
    );
  }
  return body.isKind(SyntaxKind.CallExpression) && isExplicitOwnerCall(body, name, reads);
}

function callOwns(call: CallExpression, { errorBinding, reads, forwards }: OwnerScan): boolean {
  return isExplicitOwnerCall(call, errorBinding, reads) || (forwards && forwardsToOwner(call, errorBinding, reads));
}

function statementOwner(statement: Node, scan: OwnerScan): OwnerVerdict {
  const { errorBinding, returnedOutcomeOwns, reads } = scan;
  const decided = controlFlowVerdict(statement, errorBinding, returnedOutcomeOwns, reads);
  if (decided !== undefined) {
    return decided;
  }
  const delivered = deliveredValue(statement);
  if (returnedOutcomeOwns && delivered !== undefined && isFailureOutcome(delivered, errorBinding, reads)) {
    return "owner";
  }
  const returned = statement.isKind(SyntaxKind.ReturnStatement) ? statement.getExpression() : undefined;
  const rawExpression = statement.isKind(SyntaxKind.ExpressionStatement) ? statement.getExpression() : returned;
  if (rawExpression === undefined) {
    return statement.isKind(SyntaxKind.ReturnStatement) ? "escape" : "none";
  }
  const expression = unwrapExpression(rawExpression);
  if (assignmentOwns(expression, errorBinding, reads)) {
    return "owner";
  }
  if (expression.isKind(SyntaxKind.CallExpression) && callOwns(expression, scan)) {
    return "owner";
  }
  return statement.isKind(SyntaxKind.ReturnStatement) ? "escape" : "none";
}

/** Does a `throw` ESCAPE this block, rather than being caught or returned somewhere inside it? A nested
 *  function's throw rejects that call, not this one; an inner catch clause absorbs; an inner `try` whose
 *  statement HAS a catch absorbs. */
function throwEscapes(thrown: Node, block: Block): boolean {
  let current: Node | undefined = thrown.getParent();
  while (current !== undefined && current !== block) {
    if (FUNCTION_KINDS.has(current.getKind()) || current.isKind(SyntaxKind.CatchClause)) {
      return false;
    }
    const parent = current.getParent();
    if (parent?.isKind(SyntaxKind.TryStatement) === true && parent.getTryBlock() === current && parent.getCatchClause() !== undefined) {
      return false;
    }
    current = parent;
  }
  return current === block;
}

/**
 * THE DISCRIMINATED-RETHROW CREDIT (#751, owner ruling — the "Arm 3" provable subset).
 *
 * `catch (error) { if (errnoIs(error, "ENOENT")) { return []; } throw error; }` is the tree's most common
 * CORRECT error handling: ONE narrowly-guarded documented case, and every other failure propagates
 * UNCHANGED. 81 of the 439 enforced sites are this shape. Without this credit the gate demanded a marker
 * for it — taxing the right idiom, which is the inverse of rewarding runtime ownership.
 *
 * THE FENCE IS BINDING IDENTITY, and it is the whole reason this is provable: the thrown value must BE the
 * caught binding. `throw new Error("refresh failed")` is loud but it destroys the original failure's
 * identity and cause chain, so it is NOT propagation of THIS failure and stays red. A throw that cannot
 * escape (nested function, inner catch) is not propagation either. Deliberately NOT generalized to
 * all-paths ownership: the conservative `escape` verdict is what keeps `if (skip) return; notify.error(err)`
 * red, and that row is pinned on both sides of this change.
 */
/** A typed wrapper that CHAINS the caught failure — `throw new CatalogUnavailableError(msg, { cause: err })`.
 *  The standard `cause` contract keeps the original error reachable, so the failure is re-typed for the
 *  caller rather than destroyed. Deliberately NARROW: only an explicit `cause` carrying the binding counts.
 *  `throw new Error(String(err))` keeps the message and drops the identity, stack and chain — that is lossy,
 *  so it stays red and its site owes a reason. */
function throwChainsCause(thrown: Node, errorBinding: Node, reads?: CaughtFailureReadServices): boolean {
  return thrown.getDescendantsOfKind(SyntaxKind.PropertyAssignment).some((property) => {
    const initializer = property.getInitializer();
    return property.getName() === "cause" && initializer !== undefined && directlyCarriesBinding(initializer, errorBinding, reads);
  });
}

function propagatesBinding(thrown: Node | undefined, errorBinding: Node, reads?: CaughtFailureReadServices): boolean {
  return thrown !== undefined && (directlyCarriesBinding(thrown, errorBinding, reads) || throwChainsCause(thrown, errorBinding, reads));
}

/** A branch that always ends by propagating the caught binding: its last statement throws it (or chains it
 *  as `cause`), and nothing before that can leave the branch. */
function branchRethrows(branch: Node | undefined, errorBinding: Node, reads?: CaughtFailureReadServices): boolean {
  if (branch === undefined) {
    return false;
  }
  const statements = branch.isKind(SyntaxKind.Block) ? branch.getStatements() : [branch];
  const last = statements.at(-1);
  const prefixLeaves = statements
    .slice(0, -1)
    .some(
      (statement) =>
        hasNestedEscape(statement) ||
        [statement, ...statement.getDescendantsOfKind(SyntaxKind.ThrowStatement)].some(
          (node) => node.isKind(SyntaxKind.ThrowStatement) && !insideNestedFunction(node, statement),
        ),
    );
  return last?.isKind(SyntaxKind.ThrowStatement) === true && !prefixLeaves && propagatesBinding(last.getExpression(), errorBinding, reads);
}

/** Does the guard classify the caught failure? It must read the binding itself, or a `const` declared in
 *  the same block whose initializer reads it. How narrow the guard is stays unjudged. */
function guardReadsBinding(condition: Node, errorBinding: Node, block: Node, reads?: CaughtFailureReadServices): boolean {
  if (referencesBinding(condition, errorBinding, reads)) {
    return true;
  }
  const identifiers = condition.isKind(SyntaxKind.Identifier) ? [condition] : condition.getDescendantsOfKind(SyntaxKind.Identifier);
  return identifiers.some((identifier) =>
    rawFailureDeclarations(identifier, reads).some((declaration) => {
      const initializer = declaration.isKind(SyntaxKind.VariableDeclaration) ? declaration.getInitializer() : undefined;
      const local = declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.getParent() === block;
      return (
        local &&
        declaration.asKind(SyntaxKind.VariableDeclaration)?.getVariableStatement()?.getDeclarationKind() === "const" &&
        initializer !== undefined &&
        referencesBinding(initializer, errorBinding, reads)
      );
    }),
  );
}

/** THE GUARDED RETHROW, the mirror of the discriminated rethrow: `if (!isConflict(err)) { throw err; }`. A
 *  guard that classifies the caught binding sends every other failure out unchanged, so only the classified
 *  case reaches the statements that follow. A guard that ignores the binding is not a classification. */
function guardedRethrow(statement: Node, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const block = statement.getParent();
  if (errorBinding === undefined || block === undefined || !statement.isKind(SyntaxKind.IfStatement)) {
    return false;
  }
  if (!guardReadsBinding(statement.getExpression(), errorBinding, block, reads)) {
    return false;
  }
  return branchRethrows(statement.getThenStatement(), errorBinding, reads) || branchRethrows(statement.getElseStatement(), errorBinding, reads);
}

function rethrowsCaughtBinding(block: Block, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  if (errorBinding === undefined) {
    return false;
  }
  return block.getDescendantsOfKind(SyntaxKind.ThrowStatement).some((thrown) => {
    if (!throwEscapes(thrown, block)) {
      return false;
    }
    const expression = thrown.getExpression();
    return directlyCarriesBinding(expression, errorBinding, reads) || throwChainsCause(expression, errorBinding, reads);
  });
}

export function hasExplicitOwner(block: Block, errorBinding: Node | undefined, returnedOutcomeOwns = true, reads?: CaughtFailureReadServices): boolean {
  for (const statement of block.getStatements()) {
    const verdict = statementOwner(statement, { errorBinding, returnedOutcomeOwns, reads, forwards: true });
    if (verdict === "owner") {
      return true;
    }
    if (verdict === "escape") {
      // A guarded early exit only leaves a swallow path if the REST of the block absorbs. When the block
      // still rethrows the caught binding, the non-discriminated path propagates and every exit is owned.
      return rethrowsCaughtBinding(block, errorBinding, reads);
    }
  }
  // A conditional refusal is an early exit too; it keeps the rethrow credit an escape would have earned.
  return block.getStatements().some(hasNestedEscape) && rethrowsCaughtBinding(block, errorBinding, reads);
}
