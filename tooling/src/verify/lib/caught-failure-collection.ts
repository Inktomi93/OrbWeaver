// Retained failures require a native collection that cannot lose or escape its contents before aggregation.
// Same-function throws and returned async disposal are syntactic lifetime owners, never arbitrary returned callbacks.
import type { Block, CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { wrappedValue } from "../../floor/code-facts/expression-value.ts";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import { FUNCTION_KINDS, literalMember, sourceDeclaresName, sourceNameImports, uniqueLexicalBinding } from "./caught-failure-core.ts";
import { rawFailureDeclarations } from "./caught-failure-read.ts";
import { guardedThrow, returnedDisposalBody } from "./caught-failure-retained.ts";

function enclosingFunction(node: Node): Node | undefined {
  return node.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()));
}
const LEAVING_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ReturnStatement,
  SyntaxKind.ThrowStatement,
  SyntaxKind.BreakStatement,
  SyntaxKind.ContinueStatement,
]);
export const COLLECTING_METHODS: ReadonlySet<string> = new Set(["add", "push"]);
const AGGREGATE_ERROR = "AggregateError";
const COUNT_MEMBERS: ReadonlySet<string> = new Set(["length", "size"]);
const NONEMPTY_OPERATORS: ReadonlySet<string> = new Set([">", "!==", "!="]);
const EQUALITY_OPERATORS: ReadonlySet<string> = new Set(["===", "=="]);
const MANY_OPERATORS: ReadonlySet<string> = new Set([">"]);
/** `new AggregateError(failures, …)` or `new AggregateError([...failures], …)`. */
function aggregateOf(thrown: Node | undefined, name: string): boolean {
  const value = thrown === undefined ? undefined : unwrapExpression(thrown).asKind(SyntaxKind.NewExpression);
  const first = value?.getArguments()?.[0];
  if (value?.getExpression().getText() !== AGGREGATE_ERROR || first === undefined) {
    return false;
  }
  const collected = unwrapExpression(first);
  const spread = collected.asKind(SyntaxKind.ArrayLiteralExpression)?.getElements() ?? [];
  return collected.getText() === name || spread.some((element) => element.asKind(SyntaxKind.SpreadElement)?.getExpression().getText() === name);
}

/** `failures.length` or `failures.size`, compared against `bound` by one of `operators`. */
function countGuard(condition: Node, name: string, operators: ReadonlySet<string>, bound: string): boolean {
  const comparison = unwrapExpression(condition).asKind(SyntaxKind.BinaryExpression);
  const count = comparison === undefined ? undefined : unwrapExpression(comparison.getLeft()).asKind(SyntaxKind.PropertyAccessExpression);
  return (
    comparison !== undefined &&
    count !== undefined &&
    COUNT_MEMBERS.has(count.getName()) &&
    unwrapExpression(count.getExpression()).getText() === name &&
    operators.has(comparison.getOperatorToken().getText()) &&
    unwrapExpression(comparison.getRight()).getText() === bound
  );
}

/** Does this statement (with its successor) throw the collection on every nonempty count? `throw new AggregateError`
 *  outright, behind `.length > 0` / `!== 0` (or `.size`), or the pair `=== 1 → throw c[0]` then `> 1 → aggregate`. */
function throwsEveryFailure(statement: Node, next: Node | undefined, name: string): boolean {
  if (aggregateOf(statement.asKind(SyntaxKind.ThrowStatement)?.getExpression(), name)) {
    return true;
  }
  const guarded = guardedThrow(statement);
  if (guarded !== undefined && countGuard(guarded.guard, name, NONEMPTY_OPERATORS, "0") && aggregateOf(guarded.thrown, name)) {
    return true;
  }
  const single =
    guarded !== undefined && countGuard(guarded.guard, name, EQUALITY_OPERATORS, "1") && unwrapExpression(guarded.thrown).getText() === `${name}[0]`;
  const rest = guardedThrow(next);
  return single && rest !== undefined && countGuard(rest.guard, name, MANY_OPERATORS, "1") && aggregateOf(rest.thrown, name);
}

/** Can control leave `statement` (outside any nested function) by return, throw, break or continue? */
function canLeave(statement: Node): boolean {
  return [statement, ...statement.getDescendants()].some(
    (node) => LEAVING_KINDS.has(node.getKind()) && (node === statement || enclosingFunction(node) === enclosingFunction(statement)),
  );
}

/** Collections may grow or be counted/read by the aggregate; every alias, escape or destructive use refuses. */
function collectionMemberPreserves(parent: Node, reads?: CaughtFailureReadServices): boolean {
  const member = literalMember(parent, reads);
  if (member === undefined) {
    return false;
  }
  const wrapped = wrappedValue(parent);
  const use = wrapped.getParent();
  if (COLLECTING_METHODS.has(member.name)) {
    return use?.isKind(SyntaxKind.CallExpression) === true && use.getExpression() === wrapped;
  }
  const write = use?.asKind(SyntaxKind.BinaryExpression);
  const assigned =
    write?.getLeft() === wrapped &&
    write.getOperatorToken().getKind() >= SyntaxKind.FirstAssignment &&
    write.getOperatorToken().getKind() <= SyntaxKind.LastAssignment;
  return COUNT_MEMBERS.has(member.name) && use?.isKind(SyntaxKind.BinaryExpression) === true && !assigned;
}

function thrownFirstFailure(parent: Node): boolean {
  const index = parent.asKind(SyntaxKind.ElementAccessExpression);
  return index?.getArgumentExpression()?.getText() === "0" && index.getParent()?.isKind(SyntaxKind.ThrowStatement) === true;
}

function collectionUsesPreserve(scope: Node, declaration: Node, reads?: CaughtFailureReadServices, settled?: Node): boolean {
  const name = declaration.asKindOrThrow(SyntaxKind.VariableDeclaration).getName();
  return scope
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((node) => node.getText() === name)
    .every((node) => {
      if (node === declaration.asKind(SyntaxKind.VariableDeclaration)?.getNameNode()) {
        return true;
      }
      const parent = node.getParent();
      if (
        (parent?.isKind(SyntaxKind.PropertyAccessExpression) === true || parent?.isKind(SyntaxKind.ElementAccessExpression) === true) &&
        parent.getExpression() === node
      ) {
        return thrownFirstFailure(parent) || collectionMemberPreserves(parent, reads);
      }
      const spread = parent?.asKind(SyntaxKind.SpreadElement);
      const array = spread?.getParentIfKind(SyntaxKind.ArrayLiteralExpression);
      if (array !== undefined && array.getParent() === settled) {
        return true;
      }
      const construct = parent?.asKind(SyntaxKind.NewExpression) ?? array?.getParentIfKind(SyntaxKind.NewExpression);
      if (construct !== undefined && construct.getArguments()[0] === (array ?? node) && aggregateOf(construct, name)) {
        return true;
      }
      return false;
    });
}

function callbackExpression(node: Node | undefined): { readonly parameter: string; readonly value: Node } | undefined {
  const fn = node?.asKind(SyntaxKind.ArrowFunction);
  const parameter = fn?.getParameters()[0]?.getNameNode().asKind(SyntaxKind.Identifier);
  const body = fn?.getBody();
  return fn?.isAsync() === false && parameter !== undefined && body !== undefined && !body.isKind(SyntaxKind.Block)
    ? { parameter: parameter.getText(), value: unwrapExpression(body) }
    : undefined;
}

/** Native allSettled -> exact rejected filter -> every reason, with no intervening mutation or escape. */
function nativeSettledOf(results: Node | undefined, name: string, reads?: CaughtFailureReadServices): Node | undefined {
  const awaiter = results?.asKind(SyntaxKind.VariableDeclaration)?.getInitializer()?.asKind(SyntaxKind.AwaitExpression);
  const settled = awaiter?.getExpression().asKind(SyntaxKind.CallExpression);
  if (settled === undefined) {
    return;
  }
  const aggregate = literalMember(settled.getExpression(), reads);
  const array = settled.getArguments()[0]?.asKind(SyntaxKind.ArrayLiteralExpression);
  return aggregate?.receiver.getText() === "Promise" &&
    aggregate.name === "allSettled" &&
    nativeNameUnshadowed(settled, "Promise") &&
    array?.getElements().some((element) => element.asKind(SyntaxKind.SpreadElement)?.getExpression().getText() === name)
    ? settled
    : undefined;
}

function settledFailureCollection(body: Block, name: string, reads?: CaughtFailureReadServices): Node | undefined {
  if (!nativeNameUnshadowed(body, AGGREGATE_ERROR)) {
    return;
  }
  const declarations = body.getStatements().flatMap((statement) => statement.asKind(SyntaxKind.VariableStatement)?.getDeclarations() ?? []);
  let joined: Node | undefined;
  for (const failure of declarations) {
    const mapped = failure.getInitializer()?.asKind(SyntaxKind.CallExpression);
    const map = mapped === undefined ? undefined : literalMember(mapped.getExpression(), reads);
    const mapper = callbackExpression(mapped?.getArguments()[0]);
    const filtered = map?.receiver.asKind(SyntaxKind.CallExpression);
    const filter = filtered === undefined ? undefined : literalMember(filtered.getExpression(), reads);
    const predicate = callbackExpression(filtered?.getArguments()[0]);
    if (
      map?.name !== "map" ||
      filter?.name !== "filter" ||
      mapper?.value.getText() !== `${mapper?.parameter}.reason` ||
      predicate?.value.getText().replaceAll("'", '"') !== `${predicate?.parameter}.status === "rejected"`
    ) {
      continue;
    }
    const results = declarations.find((node) => node.getName() === filter.receiver.getText());
    const settled = nativeSettledOf(results, name, reads);
    if (settled === undefined) {
      continue;
    }
    const scope = body.getParentOrThrow();
    const resultsReads = scope.getDescendantsOfKind(SyntaxKind.Identifier).filter((node) => node.getText() === results?.getName());
    if (resultsReads.length !== 2 || !collectionUsesPreserve(scope, failure, reads) || !bodyAggregates(body, -1, failure.getName())) {
      continue;
    }
    joined = settled;
    break;
  }
  return joined;
}

/** A promise retained before its bookkeeping catch and joined by the returned disposal's native allSettled. */
export function rejectionRetainedByDisposal(call: CallExpression, receiver: Node, reads?: CaughtFailureReadServices): boolean {
  const promise = unwrapExpression(receiver);
  const declaration = promise.isKind(SyntaxKind.Identifier) ? rawFailureDeclarations(promise, reads)[0]?.asKind(SyntaxKind.VariableDeclaration) : undefined;
  const ownBody = declaration?.getVariableStatement()?.getParentIfKind(SyntaxKind.Block);
  if (declaration === undefined || ownBody === undefined || declaration.getVariableStatement()?.getDeclarationKind() !== "const") {
    return false;
  }
  if (uniqueLexicalBinding(ownBody, promise.getText()) !== declaration) {
    return false;
  }
  const add = ownBody
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find(
      (candidate) =>
        candidate.getEnd() < call.getStart() &&
        candidate.getParentIfKind(SyntaxKind.ExpressionStatement)?.getParent() === ownBody &&
        enclosingFunction(candidate) === enclosingFunction(declaration) &&
        candidate.getArguments()[0]?.getText() === promise.getText() &&
        literalMember(candidate.getExpression(), reads)?.name === "add",
    );
  const member = add === undefined ? undefined : literalMember(add.getExpression(), reads);
  if (member === undefined) {
    return false;
  }
  for (const scope of call.getAncestors().filter((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()))) {
    const disposal = returnedDisposalBody(scope);
    const collection = uniqueLexicalBinding(scope, member.receiver.getText());
    const settled = disposal === undefined ? undefined : settledFailureCollection(disposal, member.receiver.getText(), reads);
    if (
      collection?.isKind(SyntaxKind.VariableDeclaration) === true &&
      collection.getVariableStatement()?.getDeclarationKind() === "const" &&
      nativeCollection(collection) &&
      settled !== undefined &&
      collectionUsesPreserve(scope, collection, reads, settled)
    ) {
      return true;
    }
  }
  return false;
}

function nativeNameUnshadowed(scope: Node, name: string): boolean {
  const source = scope.getSourceFile();
  return !sourceDeclaresName(source, name) && sourceNameImports(source, name).length === 0;
}

function nativeCollection(declaration: Node): boolean {
  const initializer = declaration.asKind(SyntaxKind.VariableDeclaration)?.getInitializer();
  const construct = initializer?.asKind(SyntaxKind.NewExpression);
  return (
    initializer?.isKind(SyntaxKind.ArrayLiteralExpression) === true ||
    (construct?.getExpression().getText() === "Set" && construct.getArguments().length === 0 && nativeNameUnshadowed(declaration, "Set"))
  );
}

function bodyAggregates(body: Block, at: number, name: string): boolean {
  const statements = body.getStatements();
  for (let index = at + 1; index < statements.length; index += 1) {
    const statement = statements[index];
    if (statement !== undefined && throwsEveryFailure(statement, statements[index + 1], name)) {
      return !statements.slice(Math.max(at, 0), index).some(canLeave);
    }
  }
  return false;
}

/** A RETAINED failure: a `const` collection, pushed to in the very function that declares it, which a later
 *  top-level statement of that function throws as an `AggregateError` on every nonempty count, with nothing
 *  between the push and that throw able to leave. The throw sits outside the catch, so it is read by name inside
 *  that one function, where nothing else declares the name. */
export function collectionIsAggregated(call: CallExpression, receiver: Node, reads?: CaughtFailureReadServices): boolean {
  const collection = unwrapExpression(receiver);
  const declaration = collection.isKind(SyntaxKind.Identifier) ? rawFailureDeclarations(collection, reads)[0] : undefined;
  if (declaration?.isKind(SyntaxKind.VariableDeclaration) !== true || declaration.getVariableStatement()?.getDeclarationKind() !== "const") {
    return false;
  }
  const scope = enclosingFunction(declaration);
  const body = scope?.getChildrenOfKind(SyntaxKind.Block)[0];
  if (scope === undefined || body === undefined || !nativeCollection(declaration)) {
    return false;
  }
  const name = collection.getText();
  const shadowed = uniqueLexicalBinding(scope, name) !== declaration;
  const localAggregate = !nativeNameUnshadowed(declaration, AGGREGATE_ERROR);
  const statements = body.getStatements();
  const at = statements.findIndex((statement) => statement.getStart() <= call.getStart() && statement.getEnd() >= call.getEnd());
  if (shadowed || localAggregate || at < 0 || !collectionUsesPreserve(scope, declaration, reads)) {
    return false;
  }
  const disposal = returnedDisposalBody(scope);
  return (enclosingFunction(call) === scope && bodyAggregates(body, at, name)) || (disposal !== undefined && bodyAggregates(disposal, -1, name));
}
