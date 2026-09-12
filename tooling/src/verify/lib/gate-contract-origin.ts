import type { BindingElement, Expression, Identifier, Node as MorphNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { readMemberReference, readStaticString, resolveModuleMemberOrigin, resolveStableExpression } from "./reference-fact.ts";

export interface CallableMember {
  readonly name: string;
  readonly receiver: MorphNode;
  readonly nameNode: MorphNode;
}

const INVOCATION_WRAPPERS = new Set(["apply", "bind", "call"]);
const TS_MORPH_MODULE = "ts-morph";
const FINAL_POLICY_MODULE = "/tooling/src/verify/contract/policy.ts";

function unwrap(node: MorphNode): MorphNode {
  let current = node;
  while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isNonNullExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

function oneDeclaration(identifier: Identifier): MorphNode | undefined {
  const declarations = identifier.getSymbol()?.getDeclarations() ?? [];
  return declarations.length === 1 ? declarations[0] : undefined;
}

function bindingPropertyName(binding: BindingElement): string | undefined {
  const property = binding.getPropertyNameNode() ?? binding.getNameNode();
  if (Node.isIdentifier(property)) {
    return property.getText();
  }
  const read = readStaticString(Node.isComputedPropertyName(property) ? property.getExpression() : property);
  return read.kind === "resolved" ? read.value : undefined;
}

function memberFromBinding(binding: BindingElement): CallableMember | undefined {
  const pattern = binding.getParent();
  const variable = binding.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const receiver = variable?.getInitializer();
  const name = bindingPropertyName(binding);
  if (!Node.isObjectBindingPattern(pattern) || variable === undefined || pattern.getParent() !== variable || receiver === undefined || name === undefined) {
    return;
  }
  return { name, receiver, nameNode: binding.getPropertyNameNode() ?? binding.getNameNode() };
}

/** Resolve the member ultimately invoked through const aliases, destructuring, and call/apply/bind. */
export function resolveCallableMember(raw: MorphNode, seen: Set<object> = new Set()): CallableMember | undefined {
  const node = unwrap(raw);
  const identity: object = node.compilerNode;
  if (seen.has(identity)) {
    return;
  }
  seen.add(identity);
  if (Node.isCallExpression(node)) {
    return resolveCallableMember(node.getExpression(), seen);
  }
  if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    const read = readMemberReference(node);
    if (read.kind === "unresolved") {
      return;
    }
    return INVOCATION_WRAPPERS.has(read.value.name)
      ? resolveCallableMember(read.value.receiver, seen)
      : { name: read.value.name, receiver: read.value.receiver, nameNode: read.value.nameNode };
  }
  if (!Node.isIdentifier(node)) {
    return;
  }
  const declaration = oneDeclaration(node);
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    return initializer === undefined ? undefined : resolveCallableMember(initializer, seen);
  }
  return Node.isBindingElement(declaration) ? memberFromBinding(declaration) : undefined;
}

/** A `.bind(...)` call only creates a callable; the later invocation is the prohibited operation. */
export function isBindCreationCall(call: import("ts-morph").CallExpression): boolean {
  const read = readMemberReference(call.getExpression());
  return read.kind === "resolved" && read.value.name === "bind";
}

function moduleSpecifier(node: MorphNode): string | undefined {
  return (
    node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue() ??
    node.getFirstAncestorByKind(SyntaxKind.ExportDeclaration)?.getModuleSpecifierValue() ??
    node
      .getFirstAncestorByKind(SyntaxKind.ModuleDeclaration)
      ?.getName()
      .replace(/^['"]|['"]$/gu, "")
  );
}

function comesFromTsMorph(node: MorphNode): boolean {
  return moduleSpecifier(node) === TS_MORPH_MODULE || node.getSourceFile().getFilePath().replaceAll("\\", "/").includes("/node_modules/ts-morph/");
}

function declarationOwnerName(node: MorphNode): string | undefined {
  const owner = node.getFirstAncestor((ancestor) => Node.isInterfaceDeclaration(ancestor) || Node.isClassDeclaration(ancestor));
  return owner !== undefined && (Node.isInterfaceDeclaration(owner) || Node.isClassDeclaration(owner)) ? owner.getName() : undefined;
}

function callableDeclarations(member: CallableMember): readonly MorphNode[] {
  const memberSymbols = [member.nameNode.getSymbol(), member.receiver.getType().getProperty(member.name)].filter(
    (symbol): symbol is import("ts-morph").Symbol => symbol !== undefined,
  );
  const declarations = memberSymbols.flatMap((symbol) => symbol.getDeclarations());
  const signatures = memberSymbols.flatMap((symbol) =>
    symbol
      .getTypeAtLocation(member.receiver)
      .getCallSignatures()
      .map((signature) => signature.getDeclaration()),
  );
  return [...declarations, ...signatures];
}

/** True only when the member declaration and receiver type prove a ts-morph member — and, when `owner` is
 *  given, one declared on THAT ts-morph class or interface. The owner half is what tells `Symbol#getDeclarations`
 *  (binding resolution) from `VariableStatement#getDeclarations` (a syntax accessor of the same name): identity,
 *  not spelling, exactly as the walk test below reads `getSourceFiles` off `Project` and nothing else. */
export function isTsMorphMember(member: CallableMember, owner?: string): boolean {
  return callableDeclarations(member).some(
    (declaration) => comesFromTsMorph(declaration) && (owner === undefined || declarationOwnerName(declaration) === owner),
  );
}

/** True only when the member declaration and receiver type prove a ts-morph Project/Node walk. */
export function isTsMorphWalk(member: CallableMember): boolean {
  const declarations = callableDeclarations(member);
  if (declarations.length === 0 || !declarations.some(comesFromTsMorph)) {
    return false;
  }
  return member.name.startsWith("getSourceFile")
    ? declarations.some((declaration) => comesFromTsMorph(declaration) && declarationOwnerName(declaration) === "Project")
    : true;
}

/** True when ReferenceFact reaches the ts-morph Project export, including re-export trace doors. */
export function isTsMorphProjectConstructor(node: MorphNode): boolean {
  const fact = resolveModuleMemberOrigin(node);
  if (fact.kind === "unresolved") {
    return false;
  }
  if (fact.value.moduleSpecifier === TS_MORPH_MODULE && fact.value.exportedName === "Project" && fact.value.memberPath.length === 0) {
    return true;
  }
  return [...fact.trace.declarations, fact.value.declaration].some(
    (declaration) =>
      comesFromTsMorph(declaration) &&
      (Node.isExportSpecifier(declaration)
        ? declaration.getName() === "Project"
        : declaration.getFirstAncestorByKind(SyntaxKind.ExportSpecifier)?.getName() === "Project"),
  );
}

function visibleExportName(specifier: import("ts-morph").ExportSpecifier): string {
  return specifier.getAliasNode()?.getText() ?? specifier.getName();
}

function reExportOriginCount(sourceFile: import("ts-morph").SourceFile, exportedName: string): number {
  return sourceFile.getExportDeclarations().reduce((count, declaration) => {
    if (declaration.hasNamedExports()) {
      return count + declaration.getNamedExports().filter((specifier) => visibleExportName(specifier) === exportedName).length;
    }
    if (declaration.getNamespaceExport() !== undefined) {
      return count;
    }
    const source = declaration.getModuleSpecifierSourceFile();
    return count + (source?.getExportSymbols().some((symbol) => symbol.getName() === exportedName) === true ? 1 : 0);
  }, 0);
}

/** True only when the callable resolves to the final policy contract's defineGate export. */
export function isCanonicalDefineGate(node: MorphNode): boolean {
  const fact = resolveModuleMemberOrigin(node);
  if (fact.kind === "unresolved" || fact.value.exportedName !== "defineGate" || fact.value.memberPath.length > 0) {
    return false;
  }
  const declarations = [...fact.trace.declarations, fact.value.declaration];
  const canonicalDeclarations = new Set(
    declarations
      .filter((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith(FINAL_POLICY_MODULE))
      .map((declaration) => declaration.compilerNode),
  );
  if (canonicalDeclarations.size !== 1) {
    return false;
  }
  return declarations
    .filter((declaration) => Node.isExportSpecifier(declaration) || Node.isExportDeclaration(declaration))
    .every(
      (declaration) =>
        reExportOriginCount(declaration.getSourceFile(), Node.isExportSpecifier(declaration) ? visibleExportName(declaration) : "defineGate") === 1,
    );
}

function isTopLevel(declaration: VariableDeclaration): boolean {
  return Node.isSourceFile(declaration.getVariableStatement()?.getParent());
}

function isConst(declaration: VariableDeclaration): boolean {
  return declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() === VariableDeclarationKind.Const;
}

function moduleBindingFromIdentifier(identifier: Identifier, seen: Set<object>): VariableDeclaration | undefined {
  const declaration = oneDeclaration(identifier);
  if (Node.isBindingElement(declaration)) {
    const variable = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    const initializer = variable?.getInitializer();
    return initializer === undefined ? undefined : resolveModuleBinding(initializer, seen);
  }
  if (!Node.isVariableDeclaration(declaration)) {
    return;
  }
  if (isTopLevel(declaration) && !isConst(declaration)) {
    return declaration;
  }
  const fact = resolveStableExpression(identifier);
  if (fact.kind === "unresolved" && (fact.reason === "write" || fact.reason === "cycle" || fact.reason === "ambiguous")) {
    return;
  }
  return [...fact.trace.declarations]
    .reverse()
    .find((candidate): candidate is VariableDeclaration => Node.isVariableDeclaration(candidate) && isTopLevel(candidate));
}

/** Resolve an object/member through immutable local aliases to its top-level variable declaration. */
export function resolveModuleBinding(raw: MorphNode, seen: Set<object> = new Set()): VariableDeclaration | undefined {
  let node = unwrap(raw);
  const identity: object = node.compilerNode;
  if (seen.has(identity)) {
    return;
  }
  seen.add(identity);
  while (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    node = unwrap(node.getExpression());
  }
  return Node.isIdentifier(node) ? moduleBindingFromIdentifier(node, seen) : undefined;
}

const BUILTIN_MUTATOR_OWNERS = new Set(["Array", "Map", "Set", "WeakMap", "WeakSet"]);

/** Built-in collection/array mutation requires a lib declaration; same-named local methods stay silent. */
export function isBuiltinMutator(member: CallableMember): boolean {
  const declarations = callableDeclarations(member);
  return declarations.some((declaration) => {
    const name = declarationOwnerName(declaration);
    return name !== undefined && BUILTIN_MUTATOR_OWNERS.has(name) && declaration.getSourceFile().isDeclarationFile();
  });
}

/** Object.assign is recognized by its standard-library declaration, not its text spelling. */
export function objectAssignTarget(call: import("ts-morph").CallExpression): Expression | undefined {
  const member = resolveCallableMember(call.getExpression());
  if (member?.name !== "assign" || member.receiver.getType().getSymbol()?.getName() !== "ObjectConstructor") {
    return;
  }
  const target = call.getArguments()[0];
  return target !== undefined && Node.isExpression(target) ? target : undefined;
}
