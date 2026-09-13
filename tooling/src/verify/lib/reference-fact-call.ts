// Callable-origin normalization over the shared module and ambient-global fact readers.
import type { Identifier, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type {
  CallableDeclaration,
  CallableOrigin,
  ReferenceFact,
  ReferenceOrigin,
  ReferenceUnresolvedReason,
  ResolvedReferenceFact,
  UnresolvedReferenceFact,
} from "../contract/reference-fact.ts";
import { inspectBindingReassignment, readMemberReference, referenceResolutionServices, resolveModuleMemberOrigin } from "./reference-fact.ts";
import { resolveGlobalMemberOriginWith } from "./reference-fact-global.ts";
import { overloadHome } from "./reference-fact-module.ts";
import { lexicalReferenceSymbol } from "./reference-fact-writes.ts";

const INVOCATION_WRAPPERS = new Set(["apply", "bind", "call"]);

/** Most specific first: when two axes both refuse, the reason that says the most about WHY wins. */
const REFUSAL_PRIORITY: readonly ReferenceUnresolvedReason[] = ["write", "cycle", "ambiguous", "dynamic", "unsupported", "missing"];

function chooseRefusal(moduleFact: UnresolvedReferenceFact, globalFact: UnresolvedReferenceFact): UnresolvedReferenceFact {
  return REFUSAL_PRIORITY.indexOf(moduleFact.reason) <= REFUSAL_PRIORITY.indexOf(globalFact.reason) ? moduleFact : globalFact;
}

function invocationWrapper(node: MorphNode): MorphNode | undefined {
  const current = referenceResolutionServices.unwrapExpression(node);
  if (!(Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current))) {
    return;
  }
  const member = readMemberReference(current);
  return member.kind === "resolved" && INVOCATION_WRAPPERS.has(member.value.name) ? member.value.nameNode : undefined;
}

function resolveReferenceOrigin(node: MorphNode): ReferenceFact<ReferenceOrigin> {
  const moduleFact = resolveModuleMemberOrigin(node);
  if (moduleFact.kind === "resolved") {
    return moduleFact;
  }
  const globalFact = resolveGlobalMemberOriginWith(node, referenceResolutionServices);
  return globalFact.kind === "resolved" ? globalFact : chooseRefusal(moduleFact, globalFact);
}

// ── WHICH CALLABLE DECLARATION DOES THIS CALL DENOTE? (#2097) ────────────────────────────────────────
//
// `resolveCallableOrigin` above answers "which module EXPORT is this", and that is a different question:
// it cannot reach a module-LOCAL factory at all (TS-MORPH-CAPABILITIES.md limit 2), which is why three
// policies finished it with their own `getSymbol().getDeclarations()` chain and each answered alias,
// multiplicity, reassignment and cycle DIFFERENTLY — `class-token-splice` demanded exactly one
// declaration, `audit-client-tests` took the first with a body, `plugin-dump-guard` asked whether ANY of
// them matched. `resolveCallableDeclaration` is the one home for the question. It tries the MODULE axis
// FIRST (it is what resolves cross-module factories, aliases and re-export renames) and falls back to the
// LEXICAL binding for the module-local case, which is the order that document prescribes — now inside the
// shared reader instead of copied into each caller.
//
// THE SEMANTICS, EXPLICIT — every one of these is a pinned control in
// `tests/tooling/verify/lib/reference-fact-call.test.ts`:
//   local `function f`            → resolved at the FunctionDeclaration (body absent for `declare function`)
//   `const g = f` / `import { f as g }` / a re-export rename → resolved at the SAME declaration as `f`
//   `const h = () => …`           → resolved at the ARROW, never at the binding
//   a binding reassigned anywhere → `write`; a mutable (`let`/`var`) binding → `write`
//   several declarations          → `ambiguous`, EXCEPT an overload set, which has one home (`overloadHome`)
//   an alias or export cycle      → `cycle`
//   a parameter                   → `missing`; a destructured binding → `dynamic`
// A refusal is never absence, and the reader never returns a declaration LIST.

interface CallableWalk {
  readonly visited: Set<object>;
  readonly declarations: MorphNode[];
}

function walk(): CallableWalk {
  return { visited: new Set<object>(), declarations: [] };
}

function record(state: CallableWalk, declaration: MorphNode): boolean {
  const identity: object = declaration.compilerNode;
  if (state.visited.has(identity)) {
    return false;
  }
  state.visited.add(identity);
  state.declarations.push(declaration);
  return true;
}

function refuse(state: CallableWalk, reason: ReferenceUnresolvedReason, node: MorphNode, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [...state.declarations], origin: node } };
}

/** The authored body of a function-like declaration. Absent is a FACT (an ambient or overload signature). */
function callableBody(declaration: MorphNode): MorphNode | undefined {
  const functionLike =
    Node.isFunctionDeclaration(declaration) ||
    Node.isFunctionExpression(declaration) ||
    Node.isArrowFunction(declaration) ||
    Node.isMethodDeclaration(declaration);
  return functionLike ? declaration.getBody() : undefined;
}

function accept(state: CallableWalk, declaration: MorphNode): ResolvedReferenceFact<CallableDeclaration> {
  return {
    kind: "resolved",
    value: { declaration, body: callableBody(declaration), sourceFile: declaration.getSourceFile() },
    trace: { declarations: [...state.declarations], origin: declaration },
  };
}

/** The immutable-binding refusal every lexical hop owes: a `let`/`var` home, or a reassigned name. */
function unstableBinding(identifier: Identifier, declaration: MorphNode, state: CallableWalk): UnresolvedReferenceFact | undefined {
  if (
    Node.isVariableDeclaration(declaration) &&
    declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() !== VariableDeclarationKind.Const
  ) {
    return refuse(state, "write", declaration, `binding ${declaration.getName()} is mutable`);
  }
  const reassignment = inspectBindingReassignment(identifier);
  return reassignment.kind === "unresolved" ? refuse(state, reassignment.reason, reassignment.node, reassignment.detail) : undefined;
}

function lexicalCallable(identifier: Identifier, state: CallableWalk): ReferenceFact<CallableDeclaration> {
  const symbol = lexicalReferenceSymbol(identifier);
  if (symbol === undefined) {
    return refuse(state, "missing", identifier, `no lexical symbol binds ${identifier.getText()}`);
  }
  const declarations = symbol.getDeclarations();
  const home = declarations.length === 1 ? declarations[0] : overloadHome(declarations);
  if (home === undefined) {
    return declarations.length === 0
      ? refuse(state, "missing", identifier, `the symbol for ${identifier.getText()} has no declaration`)
      : refuse(state, "ambiguous", identifier, `the symbol for ${identifier.getText()} has ${declarations.length} declarations with no single callable home`);
  }
  return callableHome(home, state, identifier);
}

function callableBindingName(home: MorphNode): Identifier | undefined {
  const name = Node.isFunctionDeclaration(home) || Node.isVariableDeclaration(home) ? home.getNameNode() : undefined;
  return Node.isIdentifier(name) ? name : undefined;
}

/** Local and exported declarations owe the same stability and callable-shape proof. Import resolution
 *  establishes a home; it does not prove that the binding is immutable or normalize its initializer. */
function callableHome(home: MorphNode, state: CallableWalk, reference?: Identifier): ReferenceFact<CallableDeclaration> {
  const identifier = reference ?? callableBindingName(home);
  if (!record(state, home)) {
    return refuse(state, "cycle", home, `callable alias cycle at ${identifier?.getText() ?? home.getKindName()}`);
  }
  const unstable = identifier === undefined ? undefined : unstableBinding(identifier, home, state);
  if (unstable !== undefined) {
    return unstable;
  }
  if (Node.isFunctionDeclaration(home) || Node.isArrowFunction(home) || Node.isFunctionExpression(home)) {
    return accept(state, home);
  }
  if (Node.isClassDeclaration(home)) {
    return refuse(state, "unsupported", home, `class ${home.getName() ?? "(anonymous)"} is a construct target whose constructor body is not modelled`);
  }
  if (Node.isVariableDeclaration(home)) {
    const initializer = home.getInitializer();
    return initializer === undefined
      ? refuse(state, "missing", home, `const binding ${home.getName()} has no initializer`)
      : callableOfExpression(initializer, state);
  }
  if (Node.isParameterDeclaration(home)) {
    return refuse(state, "missing", home, `parameter ${home.getName()} has no authored callable declaration`);
  }
  if (Node.isBindingElement(home)) {
    return refuse(state, "dynamic", home, `destructured binding ${home.getName()} depends on its runtime receiver`);
  }
  return refuse(state, "unsupported", home, `${home.getKindName()} is not a callable declaration`);
}

function isModuleDoor(declaration: MorphNode): boolean {
  const door =
    Node.isImportSpecifier(declaration) || Node.isImportClause(declaration) || Node.isNamespaceImport(declaration) || Node.isExportSpecifier(declaration);
  return door;
}

/** Does this identifier bind through an import/export DOOR? Such a name is the module axis's question and
 *  the lexical walk must not answer it a second time — its `ImportSpecifier is not a callable declaration`
 *  is strictly less informative than the door refusal (`module door ./x.ts has no resolvable source file`). */
function bindsThroughModuleDoor(identifier: Identifier): boolean {
  return (lexicalReferenceSymbol(identifier)?.getDeclarations() ?? []).some(isModuleDoor);
}

/** The lexical half, entered only where the MODULE half has already refused. */
function lexicalOrModuleRefusal(identifier: Identifier, moduleRefusal: UnresolvedReferenceFact, state: CallableWalk): ReferenceFact<CallableDeclaration> {
  if (bindsThroughModuleDoor(identifier)) {
    return moduleRefusal;
  }
  const lexical = lexicalCallable(identifier, state);
  if (lexical.kind === "resolved") {
    return lexical;
  }
  // Both axes refused a name neither owns outright: the more specific reason wins, and a tie goes to the
  // LEXICAL one, whose detail is about the callable rather than about a module origin it never had.
  return REFUSAL_PRIORITY.indexOf(lexical.reason) <= REFUSAL_PRIORITY.indexOf(moduleRefusal.reason) ? lexical : moduleRefusal;
}

function callableOfExpression(raw: MorphNode, state: CallableWalk): ReferenceFact<CallableDeclaration> {
  const expression = referenceResolutionServices.unwrapExpression(raw);
  if (Node.isArrowFunction(expression) || Node.isFunctionExpression(expression)) {
    return accept(state, expression);
  }
  const moduleFact = resolveModuleMemberOrigin(expression);
  if (moduleFact.kind === "resolved") {
    // A package door the checker could not resolve proves the SPELLING and nothing about the declaration
    // (contract/reference-fact.ts `external-door`), so it is not an answer to this question.
    const canonical = moduleFact.value.canonical;
    return canonical.kind === "project"
      ? callableHome(canonical.declaration, state)
      : refuse(state, "unsupported", expression, `${canonical.moduleSpecifier} is an unresolved package door, which proves no callable declaration`);
  }
  return Node.isIdentifier(expression)
    ? lexicalOrModuleRefusal(expression, moduleFact, state)
    : refuse(state, moduleFact.reason, moduleFact.node, moduleFact.detail);
}

/** WHICH callable declaration a call denotes — the one home for the question three policies used to
 *  finish with their own symbol walks (#2097). Accepts a call/new expression or the callee itself. */
export function resolveCallableDeclaration(node: MorphNode): ReferenceFact<CallableDeclaration> {
  const state = walk();
  const callee = Node.isCallExpression(node) || Node.isNewExpression(node) ? node.getExpression() : node;
  const wrapper = invocationWrapper(callee);
  return wrapper === undefined
    ? callableOfExpression(callee, state)
    : refuse(state, "unsupported", wrapper, `${wrapper.getText()} requires checker-proven Function wrapper identity`);
}

/** Resolve a direct call/new target. Function call/apply/bind spellings refuse until checker-proven. */
export function resolveCallableOrigin(node: MorphNode): ReferenceFact<CallableOrigin> {
  const expression = Node.isCallExpression(node) || Node.isNewExpression(node) ? node.getExpression() : undefined;
  if (expression === undefined) {
    const globalFact = resolveGlobalMemberOriginWith(node, referenceResolutionServices);
    return globalFact.kind === "unresolved"
      ? { ...globalFact, reason: "unsupported", detail: `${node.getKindName()} is not a call or construct expression` }
      : {
          kind: "unresolved",
          reason: "unsupported",
          detail: `${node.getKindName()} is not a call or construct expression`,
          node,
          trace: globalFact.trace,
        };
  }
  const wrapper = invocationWrapper(expression);
  if (wrapper !== undefined) {
    return {
      kind: "unresolved",
      reason: "unsupported",
      detail: `${wrapper.getText()} requires checker-proven Function wrapper identity`,
      node: wrapper,
      trace: { declarations: [], origin: wrapper },
    };
  }
  const callee = referenceResolutionServices.unwrapExpression(expression);
  const target = resolveReferenceOrigin(callee);
  return target.kind === "unresolved"
    ? target
    : {
        kind: "resolved",
        value: { invocation: Node.isNewExpression(node) ? "construct" : "call", target: target.value, callee },
        trace: target.trace,
      };
}
