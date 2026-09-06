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
