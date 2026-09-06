// One source-local write scan, including immutable alias closure, for every reference fact reader.
import type { Identifier, Node as MorphNode, Symbol as MorphSymbol, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

/** Shorthand references denote their value binding, not the synthesized object-property symbol. */
export function lexicalReferenceSymbol(identifier: Identifier): MorphSymbol | undefined {
  const parent = identifier.getParent();
  return Node.isShorthandPropertyAssignment(parent) && parent.getNameNode() === identifier ? parent.getValueSymbol() : identifier.getSymbol();
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

function rootIdentifier(raw: MorphNode): Identifier | undefined {
  let node = raw;
  for (;;) {
    if (
      Node.isParenthesizedExpression(node) ||
      Node.isAsExpression(node) ||
      Node.isSatisfiesExpression(node) ||
      Node.isNonNullExpression(node) ||
      Node.isPropertyAccessExpression(node) ||
      Node.isElementAccessExpression(node)
    ) {
      node = node.getExpression();
      continue;
    }
    return Node.isIdentifier(node) ? node : undefined;
  }
}

function unwrapTarget(raw: MorphNode): MorphNode {
  let node = raw;
  while (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node) || Node.isNonNullExpression(node)) {
    node = node.getExpression();
  }
  return node;
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

function connect(edges: Map<object, Set<object>>, left: object, right: object): void {
  (edges.get(left) ?? edges.set(left, new Set()).get(left))?.add(right);
  (edges.get(right) ?? edges.set(right, new Set()).get(right))?.add(left);
}

function connectBindingName(name: MorphNode, origin: object, edges: Map<object, Set<object>>): void {
  if (Node.isIdentifier(name)) {
    const symbol = name.getSymbol();
    if (symbol !== undefined) {
      connect(edges, symbol.compilerSymbol, origin);
    }
    return;
  }
  if (!(Node.isObjectBindingPattern(name) || Node.isArrayBindingPattern(name))) {
    return;
  }
  for (const binding of name.getElements()) {
    if (Node.isBindingElement(binding)) {
      connectBindingName(binding.getNameNode(), origin, edges);
    }
  }
}

function connectArrayTarget(target: import("ts-morph").ArrayLiteralExpression, origin: object, edges: Map<object, Set<object>>): void {
  for (const element of target.getElements()) {
    if (!Node.isOmittedExpression(element)) {
      connectAssignmentTarget(Node.isSpreadElement(element) ? element.getExpression() : element, origin, edges);
    }
  }
}

function connectObjectTarget(target: import("ts-morph").ObjectLiteralExpression, origin: object, edges: Map<object, Set<object>>): void {
  for (const property of target.getProperties()) {
    if (Node.isShorthandPropertyAssignment(property)) {
      const symbol = property.getValueSymbol();
      if (symbol !== undefined) {
        connect(edges, symbol.compilerSymbol, origin);
      }
    } else if (Node.isPropertyAssignment(property)) {
      connectAssignmentTarget(property.getInitializerOrThrow(), origin, edges);
    } else if (Node.isSpreadAssignment(property)) {
      connectAssignmentTarget(property.getExpression(), origin, edges);
    }
  }
}

function connectAssignmentTarget(raw: MorphNode, origin: object, edges: Map<object, Set<object>>): void {
  const target = unwrapTarget(raw);
  if (Node.isIdentifier(target)) {
    connectBindingName(target, origin, edges);
  } else if (Node.isArrayLiteralExpression(target)) {
    connectArrayTarget(target, origin, edges);
  } else if (Node.isObjectLiteralExpression(target)) {
    connectObjectTarget(target, origin, edges);
  }
}

function connectDeclarationAlias(declaration: import("ts-morph").VariableDeclaration, edges: Map<object, Set<object>>): void {
  const name = declaration.getNameNode();
  const initializer = declaration.getInitializer();
  const origin = initializer === undefined ? undefined : rootIdentifier(initializer)?.getSymbol()?.compilerSymbol;
  if (origin === undefined) {
    return;
  }
  connectBindingName(name, origin, edges);
}

function aliasEdges(sourceFile: SourceFile): Map<object, Set<object>> {
  const edges = new Map<object, Set<object>>();
  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    connectDeclarationAlias(declaration, edges);
  }
  for (const assignment of sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      continue;
    }
    const origin = rootIdentifier(assignment.getRight())?.getSymbol()?.compilerSymbol;
    if (origin !== undefined) {
      connectAssignmentTarget(assignment.getLeft(), origin, edges);
    }
  }
  return edges;
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
  for (const identifier of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
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
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
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

function invokedMemberRootedAt(reference: MorphNode): MorphNode | undefined {
  let current = reference;
  let parent = current.getParent();
  let crossedMember = false;
  while (parent !== undefined) {
    if (isTransparentWrapper(parent, current)) {
      current = parent;
      parent = current.getParent();
      continue;
    }
    if (isMemberReceiver(parent, current)) {
      crossedMember = true;
      current = parent;
      parent = current.getParent();
      continue;
    }
    break;
  }
  return crossedMember && parent !== undefined && Node.isCallExpression(parent) && parent.getExpression() === current ? parent : undefined;
}

function collectInvokedMembers(sourceFile: SourceFile): Map<object, MorphNode> {
  const invoked = new Map<object, MorphNode>();
  for (const identifier of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (isDeclarationName(identifier)) {
      continue;
    }
    const call = invokedMemberRootedAt(identifier);
    if (call === undefined) {
      continue;
    }
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
