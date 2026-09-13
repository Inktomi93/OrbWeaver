// Shared TYPE-level origin facts: the declaration home of a member, of a contextual key, and of a node's
// own type. The value-origin readers in `reference-fact.ts` refuse a receiver produced by a call, which is
// what every client seam looks like (`useTRPC()`, `useQueryClient()`, a store hook, a form api). This is
// the other half of "identity, never spelling" for those subjects, and it is a pure reader over nodes the
// dispatcher delivered: no walk, no Project, no cache, no filesystem.
//
// WHY DECLARATIONS AND NOT A TYPE NAME: a type NAME is spelling again (`interface QueryClient` can be
// declared anywhere). The declaration's own source file is the home, and comparing it against a package
// directory or a project SourceFile identity is what a same-named lookalike cannot satisfy.
import type { Node as MorphNode, Symbol as MorphSymbol, SourceFile, Type } from "ts-morph";
import { Node } from "ts-morph";
import type { ReferenceFact, ReferenceUnresolvedReason } from "../contract/reference-fact.ts";
import type { ContextualMemberOrigin, TypeIdentityOrigin, TypeMemberOrigin } from "../contract/type-member-origin.ts";
import { readMemberReference } from "./reference-fact.ts";

function resolved<T>(value: T, origin: MorphNode, declarations: readonly MorphNode[]): ReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [...declarations], origin } };
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, detail: string): ReferenceFact<never> {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

function symbolDeclarations(symbol: MorphSymbol, node: MorphNode, subject: string): ReferenceFact<readonly MorphNode[]> {
  const declarations = symbol.getDeclarations();
  return declarations.length === 0 ? unresolved("missing", node, `${subject} has no declaration`) : resolved(declarations, node, declarations);
}

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

/** Resolve `<expression>.<name>` WHEN THERE IS NO MEMBER-ACCESS NODE TO HAND OVER — the BINDING-PATTERN twin
 *  of {@link resolveTypeMemberOrigin}. A destructure (`const { issues } = failure`) asks the same question
 *  the dotted read asks, but its subject is a `BindingElement`: there is no `PropertyAccessExpression` for
 *  the member reader to normalise, only the initializer expression and a name. Without this door a policy
 *  finishes the chain itself (`type.getProperty(name)?.getDeclarations()`) — the #2097 class, and the exact
 *  reason the audit routes those sites to a shared reader: a `lib/` reader that hands back a `Symbol`
 *  invites the gate to answer the declaration question, so the reader answers it.
 *
 *  NON-NULLABLE for the same reason the member reader is: a union carrying `undefined` exposes NO property
 *  symbols at all, and the read only happens where the receiver is present. Unresolved exactly when the
 *  checker resolves no such property, or resolves one with no declaration — both of which are "cannot be
 *  established", never "not this identity".
 *
 *  WHAT FOLDED ONTO IT, AND WHAT DID NOT (the move must END a duplicate, never create one). Folded in the
 *  same commit: `project-home-origin.ts#uncastMemberDeclaredByPackage` and
 *  `bus-fact-read.ts#busChannelPublisher` — both spelled the identical chain and both already treated "no
 *  symbol" and "no declaration" as one no-evidence answer, so each collapses an unresolved fact to `[]` and
 *  is behaviour-identical. NOT folded: `resolveTypeMemberOrigin` directly above, which looks like the same
 *  three lines and is a DIFFERENT predicate — it anchors its refusal on the `nameNode` rather than on the
 *  receiver expression (the coordinate a policy reports), and it needs the property SYMBOL itself for the
 *  `TypeMemberOrigin` it returns, which this reader deliberately does not hand back. Folding it would move
 *  every one of that reader's refusal positions. */
export function resolveTypePropertyOrigin(expression: MorphNode, name: string): ReferenceFact<readonly MorphNode[]> {
  const symbol = expression.getType().getNonNullableType().getProperty(name);
  if (symbol === undefined) {
    return unresolved("missing", expression, `the checker resolved no property symbol named ${name} on ${expression.getText()}`);
  }
  return symbolDeclarations(symbol, expression, `property ${name}`);
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
  const contextual: Type | undefined = literal.getContextualType();
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

/** Resolve a node's own TYPE to the declarations of the symbol that names it — the alias symbol when the
 *  checker kept one (`GatedStoreHook<T>`), otherwise the structural symbol. */
export function resolveTypeIdentityOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const type = node.getType();
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
  const chain: TypeIdentityOrigin[] = [first.value];
  const visited = new Set<object>(first.value.declarations.map((declaration) => declaration.compilerNode));
  let current: TypeIdentityOrigin = first.value;
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
  return resolved(
    chain,
    node,
    chain.flatMap((origin) => origin.declarations),
  );
}

function normalizedPath(node: MorphNode): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
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
