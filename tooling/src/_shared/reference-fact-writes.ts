// One source-local write scan for every reference fact reader. The immutable alias closure the write and
// invocation sets expand through is `reference-fact-alias.ts` (split 2026-09-18 at the size cap): the graph
// is the leaf, this module consumes it.

import { descendantsOfKind } from "@orb/tooling/_shared/ts-workspace";
import type { Identifier, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { aliasEdges, lexicalReferenceSymbol, rootIdentifier, unwrapTarget } from "./reference-fact-alias.ts";

function transparentUse(node: MorphNode): MorphNode {
  let current = node;
  for (let parent = current.getParent(); parent !== undefined && isTransparentWrapper(parent, current); parent = current.getParent()) {
    current = parent;
  }
  return current;
}

function aliasName(reference: MorphNode): MorphNode | undefined {
  const parent = reference.getParent();
  let name: MorphNode | undefined;
  if (Node.isImportSpecifier(reference) || Node.isExportSpecifier(reference)) {
    name = reference.getAliasNode() ?? reference.getNameNode();
  } else if (Node.isVariableDeclaration(parent) && (parent.getInitializer() === reference || parent.getNameNode() === reference)) {
    name = parent.getNameNode();
  } else if (Node.isImportSpecifier(parent) || Node.isExportSpecifier(parent)) {
    name = parent.getAliasNode() ?? parent.getNameNode();
  } else if (Node.isImportClause(parent)) {
    name = parent.getDefaultImport();
  }
  return name;
}

/** The first use not proven to preserve this value's identity/cardinality, in the loaded Project.
 *  Caller endpoints are exact value nodes, never property names or permission paths. Const aliases and
 *  compiler-resolved import/re-export references are followed; a spread copies an array's elements but
 *  does not alias its length. Opaque arguments, member calls (including callbacks), storage and returns
 *  refuse. This does not model consumers outside the loaded Project or external host mutation.
 *  The older source-local write/member queries below intentionally retain their weaker contracts. */
export function unprovenReferenceUse(identifier: Identifier, accepted: ReadonlySet<MorphNode>): MorphNode | undefined {
  const pending: Identifier[] = [identifier];
  const seen = new Set<object>();
  let refusal: MorphNode | undefined;
  for (const name of pending) {
    if (refusal !== undefined) {
      break;
    }
    const symbol = lexicalReferenceSymbol(name);
    if (symbol === undefined) {
      refusal = name;
      continue;
    }
    if (seen.has(symbol.compilerSymbol)) {
      continue;
    }
    seen.add(symbol.compilerSymbol);
    const declaration = name.getParent();
    if (
      Node.isVariableDeclaration(declaration) &&
      declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() !== VariableDeclarationKind.Const
    ) {
      refusal = name;
      continue;
    }
    refusal = name.findReferencesAsNodes().find((reference) => {
      if (reference === name || reference.getAncestors().some(Node.isTypeNode)) {
        return false;
      }
      const wrapped = transparentUse(reference);
      if (accepted.has(wrapped)) {
        return false;
      }
      const parent = wrapped.getParent();
      const alias = aliasName(wrapped);
      if (alias === undefined) {
        return !(Node.isSpreadElement(parent) && parent.getExpression() === wrapped && Node.isArrayLiteralExpression(parent.getParent()));
      }
      if (!Node.isIdentifier(alias)) {
        return true;
      }
      pending.push(alias);
      return false;
    });
  }
  return refusal;
}

function isDeclarationName(node: MorphNode): boolean {
  const parent = node.getParent();
  if (parent === undefined) {
    return false;
  }
  if (Node.isVariableDeclaration(parent) || Node.isBindingElement(parent) || Node.isParameterDeclaration(parent) || Node.isNamespaceImport(parent)) {
    return parent.getNameNode() === node;
  }
  if (Node.isImportSpecifier(parent) || Node.isExportSpecifier(parent)) {
    return parent.getNameNode() === node || parent.getAliasNode() === node;
  }
  return Node.isImportClause(parent) && parent.getDefaultImport() === node;
}

function isTransparentWrapper(parent: MorphNode, child: MorphNode): boolean {
  return (
    (Node.isParenthesizedExpression(parent) || Node.isAsExpression(parent) || Node.isSatisfiesExpression(parent) || Node.isNonNullExpression(parent)) &&
    parent.getExpression() === child
  );
}

function isMemberReceiver(parent: MorphNode, child: MorphNode): boolean {
  return (Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) && parent.getExpression() === child;
}

function isAssignmentContainer(parent: MorphNode, child: MorphNode): boolean {
  if (Node.isArrayLiteralExpression(parent)) {
    return parent.getElements().some((element) => element.compilerNode === child.compilerNode);
  }
  if (Node.isObjectLiteralExpression(parent)) {
    return parent.getProperties().some((property) => property.compilerNode === child.compilerNode);
  }
  if (Node.isPropertyAssignment(parent)) {
    return parent.getInitializer() === child;
  }
  if (Node.isShorthandPropertyAssignment(parent)) {
    return parent.getNameNode() === child;
  }
  return (Node.isSpreadAssignment(parent) || Node.isSpreadElement(parent)) && parent.getExpression() === child;
}

function isDirectWriteTarget(parent: MorphNode, child: MorphNode): boolean {
  if (Node.isBinaryExpression(parent) && parent.getLeft() === child) {
    const operator = parent.getOperatorToken().getKind();
    return operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment;
  }
  if ((Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent)) && parent.getOperand() === child) {
    const operator = parent.getOperatorToken();
    return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken;
  }
  return (
    (Node.isDeleteExpression(parent) && parent.getExpression() === child) ||
    ((Node.isForInStatement(parent) || Node.isForOfStatement(parent)) && parent.getInitializer() === child)
  );
}

function writeKind(node: MorphNode): "binding" | "member" | undefined {
  let current = node;
  let parent = current.getParent();
  let member = false;
  while (parent !== undefined && (isTransparentWrapper(parent, current) || isAssignmentContainer(parent, current) || isMemberReceiver(parent, current))) {
    member ||= isMemberReceiver(parent, current);
    current = parent;
    parent = current.getParent();
  }
  if (parent === undefined || !isDirectWriteTarget(parent, current)) {
    return;
  }
  return member ? "member" : "binding";
}

export function isReferenceWriteTarget(node: MorphNode): boolean {
  return writeKind(node) !== undefined;
}

function isTypeScriptLibraryDeclaration(node: MorphNode): boolean {
  const path = node.getSourceFile().getFilePath().replaceAll("\\", "/");
  return node.getSourceFile().isDeclarationFile() && path.includes("/node_modules/typescript/lib/lib.");
}

function staticMemberName(node: MorphNode): string | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const argument = node.getArgumentExpression();
  return argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) ? argument.getLiteralText() : undefined;
}

function objectAssignTarget(call: import("ts-morph").CallExpression): MorphNode | undefined {
  const callee = unwrapTarget(call.getExpression());
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee)) || staticMemberName(callee) !== "assign") {
    return;
  }
  const receiver = unwrapTarget(callee.getExpression());
  const receiverSymbol = receiver.getSymbol();
  const memberSymbol = callee.getSymbol() ?? receiver.getType().getProperty("assign");
  const receiverDeclarations = receiverSymbol?.getDeclarations() ?? [];
  const memberDeclarations = memberSymbol?.getDeclarations() ?? [];
  const canonicalReceiver =
    receiverSymbol?.getName() === "Object" && receiverDeclarations.length > 0 && receiverDeclarations.every(isTypeScriptLibraryDeclaration);
  const canonicalMember =
    memberDeclarations.length > 0 &&
    memberDeclarations.every(
      (declaration) =>
        isTypeScriptLibraryDeclaration(declaration) && declaration.getFirstAncestorByKind(SyntaxKind.InterfaceDeclaration)?.getName() === "ObjectConstructor",
    );
  return canonicalReceiver && canonicalMember ? call.getArguments()[0] : undefined;
}

function addMemberWriteSymbols(identifier: Identifier, written: Set<object>, mutated: Set<object>): void {
  let current: MorphNode = identifier;
  let parent = current.getParent();
  while (parent !== undefined && isMemberReceiver(parent, current)) {
    const symbol = parent.getSymbol();
    if (symbol !== undefined) {
      written.add(symbol.compilerSymbol);
      mutated.add(symbol.compilerSymbol);
    }
    current = parent;
    parent = current.getParent();
  }
}

function addCallArgumentMutation(target: MorphNode, written: Set<object>, mutated: Set<object>): void {
  const root = rootIdentifier(target);
  const symbol = root === undefined ? undefined : lexicalReferenceSymbol(root);
  if (root === undefined || symbol === undefined) {
    return;
  }
  written.add(symbol.compilerSymbol);
  mutated.add(symbol.compilerSymbol);
  addMemberWriteSymbols(root, written, mutated);
}

function collectWrites(sourceFile: SourceFile): { readonly written: Set<object>; readonly mutated: Set<object>; readonly reassigned: Set<object> } {
  const written = new Set<object>();
  const mutated = new Set<object>();
  const reassigned = new Set<object>();
  for (const identifier of descendantsOfKind(sourceFile, SyntaxKind.Identifier)) {
    const kind = isDeclarationName(identifier) ? undefined : writeKind(identifier);
    const symbol = kind === undefined ? undefined : lexicalReferenceSymbol(identifier);
    if (symbol === undefined) {
      continue;
    }
    written.add(symbol.compilerSymbol);
    if (kind === "member") {
      mutated.add(symbol.compilerSymbol);
      addMemberWriteSymbols(identifier, written, mutated);
    } else {
      reassigned.add(symbol.compilerSymbol);
    }
  }
  for (const call of descendantsOfKind(sourceFile, SyntaxKind.CallExpression)) {
    const target = objectAssignTarget(call);
    if (target !== undefined) {
      addCallArgumentMutation(target, written, mutated);
    }
  }
  return { written, mutated, reassigned };
}

function expandMutated(mutated: Set<object>, edges: ReadonlyMap<object, Set<object>>): void {
  const pending = [...mutated];
  for (const current of pending) {
    for (const alias of edges.get(current) ?? []) {
      if (!mutated.has(alias)) {
        mutated.add(alias);
        pending.push(alias);
      }
    }
  }
}

function invokedMemberRootedAt(reference: MorphNode): { readonly call: MorphNode; readonly members: readonly (string | undefined)[] } | undefined {
  let current = reference;
  let parent = current.getParent();
  const members: (string | undefined)[] = [];
  while (parent !== undefined) {
    if (isTransparentWrapper(parent, current)) {
      current = parent;
      parent = current.getParent();
      continue;
    }
    if (isMemberReceiver(parent, current)) {
      members.push(staticMemberName(parent));
      current = parent;
      parent = current.getParent();
      continue;
    }
    break;
  }
  return members.length > 0 && parent !== undefined && Node.isCallExpression(parent) && parent.getExpression() === current
    ? { call: parent, members }
    : undefined;
}

/** Members whose invocation CANNOT change the receiver — the read-only half of `Array.prototype`, which is
 *  also every member name a repo-local registry projects itself through. Invoking one is evidence about the
 *  literal's USE, never about its contents, so it must not refuse the read (#1950 D2: one `.map()` three
 *  lines below `DESIGN_AUDIT_RULES` blinded `design-audit-rule-proof` on a 62-row registry, and the same
 *  refusal withheld `no-parallel-section-map` on `SECTION_IDS.includes(v)`).
 *
 *  CLOSED BY CONSTRUCTION, and that is the property that keeps it safe: a mutator (`push`, `splice`, `sort`,
 *  …) is simply not on the list, and so is anything the list does not name — a computed member, a member of
 *  a deeper chain, and any future prototype method all stay `dynamic`. Only INVOCABLE members belong here —
 *  `length` is read-only but is not callable, so a row for it would be a line this list asserts and the
 *  language cannot reach. It is a NAME test, so a hand-written
 *  object literal declaring its own mutating `map` is out of scope here; such a member writes through the
 *  binding and `collectWrites` refuses it as a write. */
const READ_ONLY_MEMBERS: ReadonlySet<string> = new Set([
  "at",
  "concat",
  "entries",
  "every",
  "filter",
  "find",
  "findIndex",
  "flatMap",
  "forEach",
  "includes",
  "indexOf",
  "join",
  "keys",
  "map",
  "reduce",
  "slice",
  "some",
  "toSorted",
  "values",
]);

/** A single named read-only member read straight off the binding. One hop only: `X.nested.join()` is not a
 *  claim this list can make about `X`, so it keeps refusing. */
function isReadOnlyInvocation(members: readonly (string | undefined)[]): boolean {
  const [only] = members;
  return members.length === 1 && only !== undefined && READ_ONLY_MEMBERS.has(only);
}

// The read-only filter lives HERE, in the collector, and not at the refusal site in
// `static-authored-value.ts#explicitCompositeRefusal`. The map keeps at most ONE invoked member per symbol
// (first in source order wins), and `writeKind` does not classify a method call as a write — so skipping a
// read-only member at the decision site would clear the refusal for `A.map(…)` and then never see the
// `A.push(x)` two lines below it. Skipping at COLLECTION keeps the mutator recorded and refusing.
function collectInvokedMembers(sourceFile: SourceFile): Map<object, MorphNode> {
  const invoked = new Map<object, MorphNode>();
  for (const identifier of descendantsOfKind(sourceFile, SyntaxKind.Identifier)) {
    if (isDeclarationName(identifier)) {
      continue;
    }
    const invocation = invokedMemberRootedAt(identifier);
    if (invocation === undefined || isReadOnlyInvocation(invocation.members)) {
      continue;
    }
    const call = invocation.call;
    const symbol = identifier.getSymbol();
    if (symbol !== undefined && !invoked.has(symbol.compilerSymbol)) {
      invoked.set(symbol.compilerSymbol, call);
    }
  }
  return invoked;
}

function expandInvokedMembers(invoked: Map<object, MorphNode>, edges: ReadonlyMap<object, Set<object>>): void {
  const pending = [...invoked.entries()];
  for (const [current, call] of pending) {
    for (const alias of edges.get(current) ?? []) {
      if (!invoked.has(alias)) {
        invoked.set(alias, call);
        pending.push([alias, call]);
      }
    }
  }
}

/** The invoked member reachable from this binding through the same source-local alias closure as writes. */
export function invokedMemberThroughAliases(identifier: Identifier, cache: Map<object, ReadonlyMap<object, MorphNode>>): MorphNode | undefined {
  const sourceFile = identifier.getSourceFile();
  const key: object = sourceFile.compilerNode;
  let invoked = cache.get(key);
  if (invoked === undefined) {
    const built = collectInvokedMembers(sourceFile);
    expandInvokedMembers(built, aliasEdges(sourceFile));
    invoked = built;
    cache.set(key, invoked);
  }
  const symbol = identifier.getSymbol();
  return symbol === undefined ? undefined : invoked.get(symbol.compilerSymbol);
}

export function writtenReferenceSymbols(sourceFile: SourceFile, cache: Map<object, ReadonlySet<object>>): ReadonlySet<object> {
  const key: object = sourceFile.compilerNode;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const { written, mutated } = collectWrites(sourceFile);
  expandMutated(mutated, aliasEdges(sourceFile));
  for (const symbol of mutated) {
    written.add(symbol);
  }
  cache.set(key, written);
  return written;
}

/** Binding identity survives a member mutation; only reassignment changes which initializer it denotes. */
export function reassignedReferenceSymbols(sourceFile: SourceFile, cache: Map<object, ReadonlySet<object>>): ReadonlySet<object> {
  const key: object = sourceFile.compilerNode;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const { reassigned } = collectWrites(sourceFile);
  cache.set(key, reassigned);
  return reassigned;
}
