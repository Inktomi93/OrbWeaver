// Native member and type declaration facts; receiver and member refusal anchors remain distinct.
import { readMemberReference } from "@orb/tooling/floor/code-facts/reference-fact";
import type { ReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { Node as MorphNode, SourceFile, Type } from "ts-morph";
import { Node } from "ts-morph";
import { resolveCallableDeclaration } from "./reference-fact-call.ts";
import type { ContextualMemberOrigin, TypeIdentityOrigin, TypeMemberOrigin } from "./type-member-origin-contract.ts";
import { normalizedPath, resolved, symbolDeclarations, unresolved } from "./type-member-origin-core.ts";

/** Resolve one property read to the declarations of the property symbol the checker found on the receiver's
 *  type. Dotted, optional, and computed-literal spellings normalize through the shared member reader, so a
 *  `x["setQueryData"]` respelling is the same fact; an assignment target refuses as a write. */
export function resolveTypeMemberOrigin(node: MorphNode): ReferenceFact<TypeMemberOrigin> {
  const read = readMemberReference(node);
  if (read.kind === "unresolved") {
    return read;
  }
  const { name, receiver, nameNode, access } = read.value;
  // NON-NULLABLE on purpose: an optional chain (`cache?.setQueryData`) types its receiver as
  // `Cache | undefined`, and a union carrying `undefined` exposes NO property symbols at all — the read
  // would refuse as `missing` on a spelling that is the same fact. The read only happens when the receiver
  // is present, so the present arm is the one whose home the policy is asking about.
  const symbol = receiver.getType().getNonNullableType().getProperty(name);
  if (symbol === undefined) {
    return unresolved("missing", nameNode, `the checker resolved no property symbol named ${name} on ${receiver.getText()}`);
  }
  const declarations = symbolDeclarations(symbol, nameNode, `property ${name}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved({ name, access, receiver, nameNode, symbol, declarations: declarations.value }, nameNode, declarations.value);
}

/** Resolve one object-literal key to the property of the CONTEXTUAL type the literal is checked against.
 *  The key's own symbol declares on the literal and therefore carries no identity at all; the contextual
 *  property is what says the key belongs to a query-options type rather than an unrelated config bag. */
export function resolveContextualMemberOrigin(node: MorphNode): ReferenceFact<ContextualMemberOrigin> {
  if (!Node.isPropertyAssignment(node)) {
    return unresolved("unsupported", node, `${node.getKindName()} is not an object-literal property assignment`);
  }
  const nameNode = node.getNameNode();
  if (Node.isComputedPropertyName(nameNode)) {
    return unresolved("dynamic", nameNode, "a computed key does not name one contextual property");
  }
  // ts-morph types a PropertyAssignment's parent as the ObjectLiteralExpression that owns it, so there is
  // no other-parent arm to write — a `!isObjectLiteralExpression` guard narrows to `never` and reds TS7.
  const literal = node.getParent();
  const contextual = literal.getContextualType();
  if (contextual === undefined) {
    return unresolved("missing", literal, "the object literal has no contextual type");
  }
  const name = node.getName();
  const symbol = contextual.getNonNullableType().getProperty(name);
  if (symbol === undefined) {
    return unresolved("missing", nameNode, `the contextual type declares no property named ${name}`);
  }
  const declarations = symbolDeclarations(symbol, nameNode, `contextual property ${name}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved({ name, assignment: node, nameNode, literal, symbol, declarations: declarations.value }, nameNode, declarations.value);
}

// Node and callable-result queries retain the same compiler alias and declaration identity.
function typeIdentityOrigin(type: Type, node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const alias = type.getAliasSymbol();
  const symbol = alias ?? type.getSymbol();
  if (symbol === undefined) {
    return unresolved("missing", node, `the checker resolved no named type for ${node.getText()}`);
  }
  const declarations = symbolDeclarations(symbol, node, `type ${symbol.getName()}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved({ name: symbol.getName(), node, aliased: alias !== undefined, declarations: declarations.value }, node, declarations.value);
}

/** Resolve a node's own TYPE to the declarations of the symbol that names it — the alias symbol when the
 *  checker kept one (`GatedStoreHook<T>`), otherwise the structural symbol. */
export function resolveTypeIdentityOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  return typeIdentityOrigin(node.getType(), node);
}

// The callable owner, not a selected overload guess, supplies both result queries.
function callableReturnType(node: MorphNode): ReferenceFact<Type> {
  const callable = resolveCallableDeclaration(node);
  if (callable.kind === "unresolved") {
    return callable;
  }
  const declaration = callable.value.declaration;
  if (
    !(
      Node.isFunctionDeclaration(declaration) ||
      Node.isArrowFunction(declaration) ||
      Node.isFunctionExpression(declaration) ||
      Node.isMethodDeclaration(declaration)
    )
  ) {
    return unresolved("unsupported", node, "the callable has no native return-type signature");
  }
  const result = declaration.getReturnType().getAwaitedType();
  return result === undefined
    ? unresolved("missing", node, "the checker resolved no awaited callable result")
    : resolved(result, node, callable.trace.declarations);
}

/** Resolve the native awaited result of the same callable declaration the origin reader admits. */
export function resolveReturnTypeIdentityOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const result = callableReturnType(node);
  return result.kind === "unresolved" ? result : typeIdentityOrigin(result.value, node);
}

// Only actual data members carry a nested value; function signatures and phantom type arguments do not.
function returnedDataChildren(type: Type, node: MorphNode): readonly Type[] {
  const parts = [...type.getUnionTypes(), ...type.getIntersectionTypes()];
  if (parts.length > 0) {
    return parts;
  }
  if (type.isTuple()) {
    return type.getTupleElements();
  }
  const element = type.getArrayElementType();
  if (element !== undefined) {
    return [element];
  }
  if (!type.isObject()) {
    return [];
  }
  const indexed = [type.getStringIndexType(), type.getNumberIndexType()].filter((member) => member !== undefined);
  return [...type.getProperties().map((property) => property.getTypeAtLocation(node)), ...indexed];
}

/** Named identities physically carried by the callable's returned data, including wrappers and containers.
 * Callable parameters/results and erased generic arguments are not carried data. An optional declaration
 * home ends the query when that identity is proven, without expanding the service's remaining type universe. */
export function resolveReturnTypeIdentityGraph(node: MorphNode, stopAtDeclarationHome?: string): ReferenceFact<readonly TypeIdentityOrigin[]> {
  const result = callableReturnType(node);
  if (result.kind === "unresolved") {
    return result;
  }
  const pending = [result.value];
  const visited = new Set<object>();
  const identities: TypeIdentityOrigin[] = [];
  for (const current of pending) {
    if (visited.has(current.compilerType)) {
      continue;
    }
    visited.add(current.compilerType);
    if (current.getCallSignatures().length > 0 || current.getConstructSignatures().length > 0) {
      continue;
    }
    const identity = typeIdentityOrigin(current, node);
    const chain = identity.kind === "resolved" ? identityChain(identity.value) : [];
    identities.push(...chain);
    if (
      stopAtDeclarationHome !== undefined &&
      chain.some((origin) => origin.declarations.some((declaration) => normalizedPath(declaration) === stopAtDeclarationHome))
    ) {
      break;
    }
    pending.push(...returnedDataChildren(current, node));
  }
  return resolved(
    identities,
    node,
    identities.flatMap((identity) => identity.declarations),
  );
}

/** Resolve the direct array element's named identity, never a type nested inside that element. */
export function resolveArrayElementTypeIdentityOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const element = node.getType().getArrayElementType();
  const symbol = element?.getSymbol();
  if (symbol === undefined) {
    return unresolved("missing", node, "the checker resolved no named direct array element type");
  }
  const declarations = symbolDeclarations(symbol, node, `array element ${symbol.getName()}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved({ name: symbol.getName(), node, aliased: false, declarations: declarations.value }, node, declarations.value);
}

/** One step UP a declared type-alias chain: `type MyHook = GatedStoreHook<T>` steps from `MyHook` to
 *  `GatedStoreHook`, following an import specifier to the real declaration on the way. */
function aliasStep(origin: TypeIdentityOrigin): TypeIdentityOrigin | undefined {
  let step: TypeIdentityOrigin | undefined;
  for (const declaration of origin.declarations) {
    if (step !== undefined || !Node.isTypeAliasDeclaration(declaration)) {
      continue;
    }
    const typeNode = declaration.getTypeNode();
    if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
      continue;
    }
    const nameNode = typeNode.getTypeName();
    const symbol = nameNode.getSymbol();
    const target = symbol?.getAliasedSymbol() ?? symbol;
    const declarations = target?.getDeclarations() ?? [];
    if (target !== undefined && declarations.length > 0) {
      step = { name: target.getName(), node: nameNode, aliased: true, declarations };
    }
  }
  return step;
}

/** Every type identity a node's type resolves through, OUTERMOST FIRST, walking declared type aliases to
 *  their root. Unresolved exactly when {@link resolveTypeIdentityOrigin} is, so a caller has one door.
 *
 *  WHY A CHAIN AND NOT ONE NAME: the checker keeps the OUTERMOST alias symbol, so a store hook re-aliased
 *  one hop (`type MyHook = GatedStoreHook<S>; declare const useUserStore: MyHook`) reports as `MyHook`
 *  declared in the CONSUMING file, and a home test against the outermost name alone silently misses it. That
 *  is the same alias/re-export positive twin every policy in this family owes on its other axes; the walk is
 *  bounded by a visited set over declaration identity, so a self-referential alias terminates. */
export function resolveTypeIdentityChain(node: MorphNode): ReferenceFact<readonly TypeIdentityOrigin[]> {
  const first = resolveTypeIdentityOrigin(node);
  if (first.kind === "unresolved") {
    return first;
  }
  const chain = identityChain(first.value);
  return resolved(
    chain,
    node,
    chain.flatMap((origin) => origin.declarations),
  );
}

function identityChain(first: TypeIdentityOrigin): readonly TypeIdentityOrigin[] {
  const chain: TypeIdentityOrigin[] = [first];
  const visited = new Set<object>(first.declarations.map((declaration) => declaration.compilerNode));
  let current: TypeIdentityOrigin = first;
  for (;;) {
    const next: TypeIdentityOrigin | undefined = aliasStep(current);
    if (next === undefined || next.declarations.some((declaration) => visited.has(declaration.compilerNode))) {
      break;
    }
    for (const declaration of next.declarations) {
      visited.add(declaration.compilerNode);
    }
    chain.push(next);
    current = next;
  }
  return chain;
}

/** Is EVERY declaration in this fact declared by the named npm package's own type surface? The fragment is
 *  the package's `node_modules` directory, which survives version bumps, pnpm's virtual store, and the
 *  package's internal `dist/`/`build/` layout — the three things a pinned file path does not. */
export function declaredByPackage(declarations: readonly MorphNode[], packageName: string): boolean {
  const home = `/node_modules/${packageName}/`;
  return declarations.length > 0 && declarations.every((declaration) => normalizedPath(declaration).includes(home));
}

/** Is EVERY declaration in this fact declared by exactly this project source file? The caller obtains the
 *  file through `ctx.sourceFile(path)`, so a rename REFUSES at the door instead of silently un-matching. */
export function declaredByFile(declarations: readonly MorphNode[], sourceFile: SourceFile): boolean {
  return declarations.length > 0 && declarations.every((declaration) => declaration.getSourceFile().compilerNode === sourceFile.compilerNode);
}

/** Is EVERY declaration ambient TypeScript/DefinitelyTyped surface? Used to separate a real vendor type from
 *  a project lookalike when the vendor ships its own `@types` package rather than inline declarations. */
export function declaredByAnyPackage(declarations: readonly MorphNode[], packageNames: readonly string[]): boolean {
  return packageNames.some((packageName) => declaredByPackage(declarations, packageName));
}
