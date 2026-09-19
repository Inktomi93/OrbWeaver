// Two ownership scopes above the value/call classifiers: FRAMEWORK provenance (does a call trace back to a
// governed TanStack query/form hook or `createEntityMutation`, which owns the failure itself) and the
// STATEMENT-level walk (`hasExplicitOwner`) that scans a catch/finally block's own statements — including
// the discriminated-rethrow and cause-chaining credits — for an explicit owner or an escaping throw.
import type { Block, CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
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
} from "./caught-failure-core.ts";
import { isExplicitOwnerCall, isFailureOutcome } from "./caught-failure-outcome.ts";

// ── framework provenance ────────────────────────────────────────────────────────────────────────────────
const QUERY_FACTORIES: ReadonlySet<string> = new Set(["useInfiniteQuery", "useQuery", "useQueryClient", "useSuspenseInfiniteQuery", "useSuspenseQuery"]);
const FORM_FACTORIES: ReadonlySet<string> = new Set(["useForm"]);

function entityMutationFactoryOwns(call: CallExpression): boolean {
  const callee = unwrapExpression(call.getExpression());
  return declarationsOf(callee).some((declaration) => {
    if (!declaration.isKind(SyntaxKind.VariableDeclaration)) {
      return false;
    }
    if (callee.isKind(SyntaxKind.Identifier) && hasInterveningWrite(callee, declaration)) {
      return false;
    }
    const initializer = declaration.getInitializerIfKind(SyntaxKind.CallExpression);
    const config = initializer?.getArguments()[0];
    if (initializer === undefined || config?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
      return false;
    }
    const factoryDeclarations = declarationsOf(initializer.getExpression());
    const governedFactory =
      importedName(initializer.getExpression(), new Set(["#data", "./create-entity-mutation.ts"])) === "createEntityMutation" ||
      factoryDeclarations.some(
        (factory) =>
          factory.isKind(SyntaxKind.FunctionDeclaration) &&
          factory.getName() === "createEntityMutation" &&
          factory.getSourceFile().getFilePath().endsWith("/packages/client/src/data/create-entity-mutation.ts"),
      );
    const toastValue = propertyValueNode(config.getProperty("errorToast"));
    return governedFactory && toastValue !== undefined && isFailureOutcome(toastValue, undefined);
  });
}

function originatesFromOwnedEntityMutation(node: Node, seen: ReadonlySet<Node> = new Set()): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.CallExpression)) {
    return entityMutationFactoryOwns(value);
  }
  if (!value.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const declaration = value.getSymbol()?.getDeclarations()[0];
  if (declaration !== undefined && hasInterveningWrite(value, declaration)) {
    return false;
  }
  if (declaration?.isKind(SyntaxKind.BindingElement) === true) {
    const initializer = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
    return initializer !== undefined && originatesFromOwnedEntityMutation(initializer, nextSeen);
  }
  const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
  return initializer !== undefined && originatesFromOwnedEntityMutation(initializer, nextSeen);
}

export function frameworkOwns(call: CallExpression): boolean {
  const name = calleeName(call);
  const callee = unwrapExpression(call.getExpression());
  if (name === "withRequestSpan" && importedName(callee, new Set(["#foundation/observability", "#foundation/observability/tracing"])) === "withRequestSpan") {
    return true;
  }
  const member = literalMember(call.getExpression());
  const work = member === undefined ? callee : member.receiver;
  if (name === "fetchNextPage" || name === "fetchQuery" || name === "refetch" || name === "invalidateQueries" || name === "ensureQueryData") {
    return originatesFromFactory(work, new Set(["@tanstack/react-query"]), QUERY_FACTORIES);
  }
  if (name === "handleSubmit") {
    return originatesFromFactory(work, new Set(["@tanstack/react-form"]), FORM_FACTORIES);
  }
  if (name === "mutateAsync") {
    return originatesFromOwnedEntityMutation(work);
  }
  return false;
}

export function hasFrameworkOwner(block: Block): boolean {
  if (block.getStatements().length !== 1) {
    return false;
  }
  const calls = block.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => !insideNestedFunction(call, block));
  const [onlyCall] = calls;
  return calls.length === 1 && onlyCall !== undefined && frameworkOwns(onlyCall);
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

function assignmentOwns(expression: Node, errorBinding: Node | undefined): boolean {
  if (errorBinding === undefined || !expression.isKind(SyntaxKind.BinaryExpression)) {
    return false;
  }
  const left = expression.getLeft();
  const member = literalMember(left);
  if (member === undefined) {
    return false;
  }
  if (!(member.receiver.isKind(SyntaxKind.Identifier) || member.receiver.isKind(SyntaxKind.ThisKeyword))) {
    return false;
  }
  const receiverDeclaration = member.receiver.isKind(SyntaxKind.Identifier) ? member.receiver.getSymbol()?.getDeclarations()[0] : undefined;
  const discardedLocal = receiverDeclaration?.isKind(SyntaxKind.VariableDeclaration) === true;
  return (
    !discardedLocal &&
    /(?:^|\.)(?:error|failure)$/iu.test(expression.getLeft().getText()) &&
    expression.getOperatorToken().getText() === "=" &&
    directlyCarriesBinding(expression.getRight(), errorBinding)
  );
}

function statementOwner(statement: Node, errorBinding: Node | undefined, returnedOutcomeOwns: boolean): OwnerVerdict {
  if (hasNestedEscape(statement)) {
    return "escape";
  }
  if (statement.isKind(SyntaxKind.ThrowStatement)) {
    return "owner";
  }
  if (statement.isKind(SyntaxKind.BreakStatement) || statement.isKind(SyntaxKind.ContinueStatement)) {
    return "escape";
  }
  const returned = statement.isKind(SyntaxKind.ReturnStatement) ? statement.getExpression() : undefined;
  if (returnedOutcomeOwns && returned !== undefined && isFailureOutcome(returned, errorBinding)) {
    return "owner";
  }
  const rawExpression = statement.isKind(SyntaxKind.ExpressionStatement) ? statement.getExpression() : returned;
  if (rawExpression === undefined) {
    return statement.isKind(SyntaxKind.ReturnStatement) ? "escape" : "none";
  }
  const expression = unwrapExpression(rawExpression);
  if (assignmentOwns(expression, errorBinding)) {
    return "owner";
  }
  if (expression.isKind(SyntaxKind.CallExpression) && isExplicitOwnerCall(expression, errorBinding)) {
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
function throwChainsCause(thrown: Node, errorBinding: Node): boolean {
  return thrown.getDescendantsOfKind(SyntaxKind.PropertyAssignment).some((property) => {
    const initializer = property.getInitializer();
    return property.getName() === "cause" && initializer !== undefined && directlyCarriesBinding(initializer, errorBinding);
  });
}

function rethrowsCaughtBinding(block: Block, errorBinding: Node | undefined): boolean {
  if (errorBinding === undefined) {
    return false;
  }
  return block.getDescendantsOfKind(SyntaxKind.ThrowStatement).some((thrown) => {
    if (!throwEscapes(thrown, block)) {
      return false;
    }
    const expression = thrown.getExpression();
    return directlyCarriesBinding(expression, errorBinding) || throwChainsCause(expression, errorBinding);
  });
}

export function hasExplicitOwner(block: Block, errorBinding: Node | undefined, returnedOutcomeOwns = true): boolean {
  for (const statement of block.getStatements()) {
    const verdict = statementOwner(statement, errorBinding, returnedOutcomeOwns);
    if (verdict === "owner") {
      return true;
    }
    if (verdict === "escape") {
      // A guarded early exit only leaves a swallow path if the REST of the block absorbs. When the block
      // still rethrows the caught binding, the non-discriminated path propagates and every exit is owned.
      return rethrowsCaughtBinding(block, errorBinding);
    }
  }
  return false;
}
