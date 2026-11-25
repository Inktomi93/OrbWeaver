// The one key resolver of the unwired scans: a property name, or a string key, to the declared members it means. Every
// scan that asks which member a key names asks here, so no scan matches a member by its name alone. TypeScript leaves
// two gaps this module closes itself: a non-homomorphic mapped property is created with no declaration (TypeScript
// issue 25607, PR 42971), and find-references does not follow a string-literal key (issues 45549, 11997).
//
// The steps, in order, each run only on what the steps before it left: the checker's symbol when it has declarations;
// find-references for a string key the checker gives no symbol; the mapped-template walk for a declaration-less mapped
// property, and a Drizzle row's column for a declaration-less row member; a key slot declared `keyof X`; a generic
// call's target signature, where the slot's `keyof T` names the parameter whose argument gives `T`; a TanStack form's
// data type, walked one dotted-path segment at a time. A key none of them places is unresolved, with its reason.
import type {
  CallExpression,
  Expression,
  JsxAttribute,
  NewExpression,
  Node,
  NoSubstitutionTemplateLiteral,
  ObjectLiteralExpression,
  StringLiteral,
  TemplateExpression,
  TypeNode,
} from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrayTypeNode,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isComputedPropertyName,
  isElementAccessExpression,
  isIdentifier,
  isIntersectionTypeNode,
  isJsxAttribute,
  isJsxAttributes,
  isJsxExpression,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNewExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isStringLiteral,
  isTemplateExpression,
  isTypeLiteralNode,
  isTypeOperatorNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Signature, Type } from "@typescript/native/sync";
import { all, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { Site, SyntaxRole } from "./classify.ts";
import { rowColumns } from "./drizzle-rows.ts";
import type { NativeWorld, PropertyName } from "./native.ts";
import { constituents, hasFlag, isNamedMember, isPropertyName, propertiesNamed } from "./native.ts";
import { isOpenType } from "./open-sends.ts";

const RESOLVER_STEPS = ["symbol", "references", "mapped", "row-column", "keyof", "generic", "form-path"] as const;
/** The step that placed a key. */
type ResolverStep = (typeof RESOLVER_STEPS)[number];

const UNRESOLVED_REASONS = ["untyped", "absent", "synthetic", "no-holder", "path"] as const;
/** Why no step placed a key. `untyped`: the holder is `any` or an error type. `absent`: the holder is a closed type
 *  with no member of that name. `synthetic`: the checker's member has no declaration and no walk reaches one.
 *  `no-holder`: the checker gives the key no type to look it up on. `path`: a form path segment names no member. */
type UnresolvedReason = (typeof UNRESOLVED_REASONS)[number];

/** A name in a property position, or a string key. */
type KeyName = PropertyName;

/** What the resolver is asked about: a name in the tree, or a key named on the contextual type of an expression, as
 *  a library fills a member no caller spells (`at` is the site the key is credited at). */
type KeyRequest = { readonly node: Node } | { readonly key: string; readonly holder: Expression; readonly at: Node };

interface ResolutionBase {
  readonly site: Site;
  readonly name: string;
  /** An object literal key's own symbol: what a read through the literal's kept type resolves to. */
  readonly own: NativeSymbol | undefined;
  /** The types the key was looked up on; a removed key's sender is a write whose holder is the shape that dropped it. */
  readonly holders: readonly Type[];
  /** The role of a string key outside a property position, which no syntax gives it: a key slot names the member
   *  for whoever reads it, and a form write method stores into it. Null for a property-position name. */
  readonly slotRole: SyntaxRole | null;
}

/** One request's answer: the members it resolves to, an open slot (an index signature, `unknown` or `object`) it lands
 *  in, or the reason no step placed it. */
type KeyResolution = ResolutionBase &
  (
    | { readonly outcome: "members"; readonly step: ResolverStep; readonly members: readonly NativeSymbol[] }
    | { readonly outcome: "open" }
    | { readonly outcome: "unresolved"; readonly reason: UnresolvedReason }
  );

export type { KeyResolution };

const isKeyName = isPropertyName;
const isStringKey = (node: Node): node is StringLiteral | NoSubstitutionTemplateLiteral => isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);

// --- Property positions ------------------------------------------------------------------------------------------

// How a property-position name is looked up: its own symbol, or the property of its name on a node's contextual or
// plain type. A class member is looked up on itself and on every type its class extends or implements.
type Lookup =
  | { readonly by: "symbol"; readonly node: Node }
  | { readonly by: "contextual"; readonly node: Expression; readonly literalKey: Node | null }
  | { readonly by: "type"; readonly node: Node };

// A name the checker resolves straight to the property it means.
function isDirectPropertySite(node: Node): boolean {
  const { parent } = node;
  if (isPropertyAccessExpression(parent)) {
    return parent.name === node;
  }
  if (isElementAccessExpression(parent)) {
    return parent.argumentExpression === node && isStringKey(node);
  }
  if (isBindingElement(parent)) {
    return parent.propertyName === node;
  }
  const declares =
    isPropertySignatureDeclaration(parent) ||
    isMethodSignatureDeclaration(parent) ||
    isPropertyDeclaration(parent) ||
    (isMethodDeclaration(parent) && !isObjectLiteralExpression(parent.parent));
  return declares && parent.name === node;
}

function lookupsOf(node: KeyName): readonly Lookup[] {
  const { parent } = node;
  const own: readonly Lookup[] = isDirectPropertySite(node) ? [{ by: "symbol", node }] : [];
  if (isNamedMember(parent, node) && isObjectLiteralExpression(parent.parent)) {
    return [{ by: "contextual", node: parent.parent, literalKey: node }];
  }
  if (isJsxAttribute(parent) && parent.name === node && isJsxAttributes(parent.parent)) {
    return [{ by: "contextual", node: parent.parent, literalKey: null }];
  }
  // `"key" in value` reads the property of that name on the value's type.
  if (isBinaryExpression(parent) && parent.left === node && !isIdentifier(node) && parent.operatorToken.kind === SyntaxKind.InKeyword) {
    return [{ by: "type", node: parent.right }];
  }
  if (isBindingElement(parent) && parent.propertyName === undefined && parent.name === node && isObjectBindingPattern(parent.parent)) {
    return [{ by: "type", node: parent.parent }];
  }
  if (isNamedMember(parent, node) && (isClassDeclaration(parent.parent) || isClassExpression(parent.parent))) {
    const bases = (parent.parent.heritageClauses ?? []).flatMap((clause) => [...clause.types]);
    return [...own, ...bases.map((base): Lookup => ({ by: "type", node: base }))];
  }
  return own;
}

// The expression whose type holds the member a `symbol` lookup names: a property access's or element access's
// receiver, or a binding pattern.
function receiverOf(node: Node): Node | null {
  const { parent } = node;
  if (isPropertyAccessExpression(parent) || isElementAccessExpression(parent)) {
    return parent.expression;
  }
  return isBindingElement(parent) ? parent.parent : null;
}

function* holderOf(checker: Checker, lookup: Lookup): APIRequestGenerator<Type | undefined> {
  if (lookup.by === "contextual") {
    return yield* checker.getContextualType.gen(lookup.node);
  }
  const receiver = lookup.by === "type" ? lookup.node : receiverOf(lookup.node);
  return receiver === null ? undefined : yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(receiver));
}

// --- Mapped templates (step three) -----------------------------------------------------------------------------

// A mapped property whose keys are not `keyof` one type, as tRPC's `Overwrite<Context, Extra>` builds a procedure's
// `ctx`, carries no declaration. Its value is the `X[K]` its template returns, through conditional branches, parts and
// further mapped levels, so it is X's own property of that name.
const MAPPED_DEPTH = 4;

function* typeParts(type: Type): APIRequestGenerator<readonly Type[]> {
  return type.isUnionType() || type.isIntersectionType() ? yield* type.getTypes.gen() : [type];
}

// The object types a mapped template indexes: `T[K]`, either branch of `K extends keyof W ? W[K] : T[K]`, each part.
function* indexedSources(template: Type, depth: number): APIRequestGenerator<readonly Type[]> {
  if (depth > MAPPED_DEPTH) {
    return [];
  }
  if (template.isIndexedAccessType()) {
    return [yield* template.getObjectType.gen()];
  }
  let branches: readonly Type[] = [];
  if (template.isConditionalType()) {
    branches = [yield* template.getTrueType.gen(), yield* template.getFalseType.gen()];
  } else if (template.isUnionType() || template.isIntersectionType()) {
    branches = yield* template.getTypes.gen();
  }
  return (yield* all(...branches.map((branch) => indexedSources(branch, depth + 1)))).flat();
}

// A template that indexes a Drizzle row or a table's columns reaches the column, and the walk stops there. A row's own
// member carries no declaration (`Omit<typeof t.$inferInsert, "id">`, `Partial<Pick<Row, "k">>`), and drizzle's select
// row indexes each column's own type, whose `name` and `dialect` are the library column's, not the table's.
function* mappedOrigins(world: NativeWorld, type: Type, name: string, depth: number): APIRequestGenerator<readonly NativeSymbol[]> {
  if (depth > MAPPED_DEPTH) {
    return [];
  }
  const { checker } = world;
  const columns = depth === 0 ? [] : yield* rowColumns(world, type, name);
  if (columns.length > 0) {
    return columns;
  }
  const found: NativeSymbol[] = [];
  for (const part of yield* typeParts(type)) {
    const property = yield* checker.getPropertyOfType.gen(part, name);
    if (property !== undefined && property.declarations.length > 0) {
      found.push(property);
    } else if (property !== undefined && part.isMappedType()) {
      const sources = yield* indexedSources(yield* part.getTemplateType.gen(), 0);
      found.push(...(yield* all(...sources.map((source) => mappedOrigins(world, source, name, depth + 1)))).flat());
    }
  }
  return found;
}

// --- Key slots (steps four to six) -----------------------------------------------------------------------------

/** One step from a string key up to the slot that types it: an array element, or the value of a named property. */
type Segment = { readonly kind: "element" } | { readonly kind: "property"; readonly name: string };

/** Where a string key's climb ends: a call argument, a JSX attribute value, or a typed declaration's initializer.
 *  `literal` is the object literal whose property the first `property` segment names, when there is one. */
type SlotRoot =
  | { readonly kind: "argument"; readonly call: CallExpression | NewExpression; readonly index: number }
  | { readonly kind: "attribute"; readonly attribute: JsxAttribute }
  | { readonly kind: "annotated"; readonly type: TypeNode };

interface Slot {
  readonly root: SlotRoot | null;
  /** Segments from the root down to the key. */
  readonly path: readonly Segment[];
  /** The object literal holding the key's own property value, with that property's name. */
  readonly property: { readonly literal: ObjectLiteralExpression; readonly name: string } | null;
}

// The climb from a string key through arrays, object literal values, parentheses and assertions to its root.
function slotOf(key: Node): Slot {
  const path: Segment[] = [];
  let property: Slot["property"] = null;
  let at = key;
  for (;;) {
    const { parent } = at;
    if (isArrayLiteralExpression(parent)) {
      path.unshift({ kind: "element" });
    } else if (isPropertyAssignment(parent) && parent.initializer === at && isObjectLiteralExpression(parent.parent) && isKeyName(parent.name)) {
      path.unshift({ kind: "property", name: parent.name.text });
      property ??= { literal: parent.parent, name: parent.name.text };
      at = parent;
    } else if (!(isParenthesizedExpression(parent) || isAsExpression(parent) || isSatisfiesExpression(parent) || isObjectLiteralExpression(parent))) {
      return { root: rootOf(at, parent), path, property };
    }
    at = at.parent;
  }
}

function rootOf(at: Node, parent: Node): SlotRoot | null {
  const argumentList: readonly Node[] = isCallExpression(parent) || isNewExpression(parent) ? (parent.arguments ?? []) : [];
  const index = argumentList.indexOf(at);
  if ((isCallExpression(parent) || isNewExpression(parent)) && index >= 0) {
    return { kind: "argument", call: parent, index };
  }
  if (isJsxAttribute(parent) && parent.initializer === at) {
    return { kind: "attribute", attribute: parent };
  }
  if (isJsxExpression(parent) && isJsxAttribute(parent.parent)) {
    return { kind: "attribute", attribute: parent.parent };
  }
  const typed = parent as { readonly initializer?: Node; readonly type?: TypeNode };
  if (
    (isVariableDeclaration(parent) || isPropertyDeclaration(parent) || isParameterDeclaration(parent)) &&
    typed.initializer === at &&
    typed.type !== undefined
  ) {
    return { kind: "annotated", type: typed.type };
  }
  return null;
}

// A TanStack form instance holds its data at `state.values`: the type its field paths walk.
const FORM_STATE = "state";
const FORM_VALUES = "values";
// The field methods every form instance has beside its state, which TanStack's form core declares.
const FORM_IDENTITY: readonly string[] = ["setFieldValue", "getFieldValue"];
const FORM_CORE = "/node_modules/@tanstack/form-core/";
// The JSX components a form instance carries whose `name` attribute is a field path.
const FORM_FIELDS: ReadonlySet<string> = new Set(["Field", "AppField"]);
const FORM_NAME = "name";
// The form methods that store into the field their first argument names; every other path argument reads it.
const FORM_WRITES: ReadonlySet<string> = new Set([
  "setFieldValue",
  "pushFieldValue",
  "insertFieldValue",
  "replaceFieldValue",
  "removeFieldValue",
  "swapFieldValues",
  "moveFieldValues",
  "clearFieldValues",
  "resetField",
  "deleteField",
]);
// A dotted path's segments: `items[0].name` is `items`, an element, `name`.
const PATH_SEGMENT = /[^.[\]]+|\[\d+\]/gu;

/** A form path site: the receiver whose type is the form, and the role the path plays. A field component's `name`
 *  `binds` the member's input: the member is shown and written by the user's edits. */
interface FormPath {
  readonly form: Node;
  readonly role: SyntaxRole;
  readonly binds: boolean;
}

function formPathOf(slot: Slot): FormPath | null {
  const { root } = slot;
  if (root === null || slot.path.length > 0) {
    return null;
  }
  if (root.kind === "argument" && root.index === 0 && isPropertyAccessExpression(root.call.expression)) {
    return { form: root.call.expression.expression, role: FORM_WRITES.has(root.call.expression.name.text) ? "write" : "read", binds: false };
  }
  if (root.kind !== "attribute" || !isIdentifier(root.attribute.name) || root.attribute.name.text !== FORM_NAME) {
    return null;
  }
  const element = root.attribute.parent.parent;
  const tag = isJsxOpeningElement(element) || isJsxSelfClosingElement(element) ? element.tagName : undefined;
  return tag !== undefined && isPropertyAccessExpression(tag) && FORM_FIELDS.has(tag.name.text) ? { form: tag.expression, role: "read", binds: true } : null;
}

// The form data type a form instance carries: `state.values`. A form's type is read by its members, never by the alias
// it is spelled under, because a project alias over the hook's return (`AppFormInstance<T>`) or an `Omit` of it hides
// the form type's own alias. An object is a form only when it also stores and reads fields by the members TanStack's
// form core declares, so a store that merely holds `state.values`, or one of ours with methods of those names, takes no
// path.
function* formData(checker: Checker, form: Node): APIRequestGenerator<Type | undefined> {
  const type = yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(form));
  const state = yield* checker.getPropertyOfType.gen(type, FORM_STATE);
  if (state === undefined) {
    return undefined;
  }
  for (const name of FORM_IDENTITY) {
    const declarations = (yield* checker.getPropertyOfType.gen(type, name))?.declarations ?? [];
    if (declarations.length === 0 || !declarations.every((handle) => handle.path.includes(FORM_CORE))) {
      return undefined;
    }
  }
  const values = yield* checker.getPropertyOfType.gen(yield* checker.getNonNullableType.gen(yield* checker.getTypeOfSymbol.gen(state)), FORM_VALUES);
  return values === undefined ? undefined : yield* checker.getTypeOfSymbol.gen(values);
}

// A template path's text with each index substitution spelled `0`: `macros[${index}].name`. A substitution is an index
// only inside brackets and only when the checker types it a number; any other substitution names no segment the form's
// type could confirm, so the path is unread.
function* templateText(checker: Checker, key: TemplateExpression): APIRequestGenerator<string | undefined> {
  // one array-form request for every substitution's type
  const types = yield* checker.getTypeAtLocation.gen(key.templateSpans.map((span) => span.expression));
  let text = key.head.text;
  for (const [at, span] of key.templateSpans.entries()) {
    const type = types[at];
    if (!(type !== undefined && text.endsWith("[") && span.literal.text.startsWith("]") && hasFlag(type.flags, TypeFlags.NumberLike))) {
      return undefined;
    }
    text += `0${span.literal.text}`;
  }
  return text;
}

/** A TanStack Form field path: the member each dotted segment of `key` walks, in order, and whether the path stores
 *  into the field (a form write method), reads it, or binds it (a field component's `name`); null for a key in no form
 *  path slot. A segment that names no member ends the walk with nothing found. */
export function* formPath(
  checker: Checker,
  key: StringLiteral | NoSubstitutionTemplateLiteral | TemplateExpression,
): APIRequestGenerator<{ readonly members: readonly NativeSymbol[]; readonly role: SyntaxRole; readonly binds: boolean } | null> {
  const form = formPathOf(slotOf(key));
  const data = form === null ? undefined : yield* formData(checker, form.form);
  if (form === null || data === undefined) {
    return null;
  }
  const text = isTemplateExpression(key) ? yield* templateText(checker, key) : key.text;
  const members = text === undefined ? null : yield* walkPath(checker, data, text);
  return { members: members ?? [], role: form.role, binds: form.binds };
}

// An array's element type, or undefined for a type that is no array.
function* elementOf(checker: Checker, type: Type): APIRequestGenerator<Type | undefined> {
  const plain = yield* checker.getNonNullableType.gen(type);
  return (yield* checker.isArrayType.gen(plain)) && plain.isTypeReference() ? (yield* checker.getTypeArguments.gen(plain))[0] : undefined;
}

// Each segment's member down a dotted path, or null when a segment names nothing.
function* walkPath(checker: Checker, data: Type, path: string): APIRequestGenerator<readonly NativeSymbol[] | null> {
  const members: NativeSymbol[] = [];
  let type: Type | undefined = data;
  for (const segment of path.match(PATH_SEGMENT) ?? []) {
    if (type === undefined) {
      return null;
    }
    if (segment.startsWith("[")) {
      type = yield* elementOf(checker, type);
      continue;
    }
    const property: NativeSymbol | undefined = yield* checker.getPropertyOfType.gen(yield* checker.getNonNullableType.gen(type), segment);
    if (property === undefined) {
      return null;
    }
    members.push(property);
    type = yield* checker.getTypeOfSymbol.gen(property);
  }
  return members;
}

// The operands of every `keyof X` a type node spells at its top, through unions, intersections and parentheses.
function keyofOperands(node: TypeNode): readonly TypeNode[] {
  if (isTypeOperatorNode(node) && node.operator === SyntaxKind.KeyOfKeyword) {
    return [node.type];
  }
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
    return node.types.flatMap(keyofOperands);
  }
  return isParenthesizedTypeNode(node) ? keyofOperands(node.type) : [];
}

const ARRAY_NAMES: ReadonlySet<string> = new Set(["Array", "ReadonlyArray"]);

// The type node a path reaches inside a type node: an array's element, a type literal's member.
function typeNodeAt(node: TypeNode, path: readonly Segment[]): readonly TypeNode[] {
  const [segment, ...rest] = path;
  if (segment === undefined) {
    return [node];
  }
  if (isParenthesizedTypeNode(node) || (isTypeOperatorNode(node) && node.operator === SyntaxKind.ReadonlyKeyword)) {
    return typeNodeAt(node.type, path);
  }
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
    return node.types.flatMap((member) => typeNodeAt(member, path));
  }
  const below = segment.kind === "element" ? elementNode(node) : memberNodes(node, segment.name);
  return below.flatMap((child) => typeNodeAt(child, rest));
}

// An array type node's element: `T[]`, `Array<T>` or `ReadonlyArray<T>`.
function elementNode(node: TypeNode): readonly TypeNode[] {
  if (isArrayTypeNode(node)) {
    return [node.elementType];
  }
  const [element] = isTypeReferenceNode(node) && isIdentifier(node.typeName) && ARRAY_NAMES.has(node.typeName.text) ? (node.typeArguments ?? []) : [];
  return element === undefined ? [] : [element];
}

// A type literal's member type nodes of one name.
function memberNodes(node: TypeNode, name: string): readonly TypeNode[] {
  return isTypeLiteralNode(node)
    ? node.members.flatMap((member) => (isPropertySignatureDeclaration(member) && isKeyName(member.name) && member.name.text === name ? [member.type] : []))
    : [];
}

// The objects `keyof` names in a declared slot, a type parameter through its constraint.
function* keyofTargets(checker: Checker, nodes: readonly TypeNode[]): APIRequestGenerator<readonly Type[]> {
  const targets: Type[] = [];
  for (const operand of nodes.flatMap(keyofOperands)) {
    const type = yield* checker.getTypeFromTypeNode.gen(operand);
    const bound = type.isTypeParameter() ? yield* checker.getConstraintOfTypeParameter.gen(type) : type;
    if (bound !== undefined) {
      targets.push(...(yield* constituents(bound)));
    }
  }
  return targets;
}

// The declared type nodes of a key slot: the annotation of its root, the parameter its call passes it to, or the member
// of the object literal's contextual type its property value fills. The path below each is walked to the key.
function* declaredSlots(checker: Checker, slot: Slot): APIRequestGenerator<readonly TypeNode[]> {
  const { root, path, property } = slot;
  if (property !== null) {
    const contextual = yield* checker.getContextualType.gen(property.literal);
    const members = contextual === undefined ? [] : yield* propertiesNamed(checker, contextual, property.name);
    const below = path.slice(path.findLastIndex((segment) => segment.kind === "property") + 1);
    const nodes: TypeNode[] = [];
    for (const handle of members.flatMap((member) => member?.declarations ?? [])) {
      const declaration = yield* handle.resolve.gen();
      const type = declaration === undefined ? undefined : (declaration as { readonly type?: TypeNode }).type;
      nodes.push(...(type === undefined ? [] : typeNodeAt(type, below)));
    }
    return nodes;
  }
  if (root?.kind === "annotated") {
    return typeNodeAt(root.type, path);
  }
  if (root?.kind !== "argument") {
    return [];
  }
  const signature = yield* checker.getResolvedSignature.gen(root.call);
  const declaration = signature.declaration === undefined ? undefined : yield* signature.declaration.resolve.gen();
  const parameter = (declaration as { readonly parameters?: readonly { readonly type?: TypeNode }[] } | undefined)?.parameters?.[root.index]?.type;
  return parameter === undefined ? [] : typeNodeAt(parameter, path);
}

const BIND_DEPTH = 4;

// The type `parameter` is bound to: where the declared type is the type parameter itself, the instantiated type at the
// same place, through type arguments.
function* boundAt(
  checker: Checker,
  { declared, actual }: { readonly declared: Type; readonly actual: Type },
  parameter: Type,
  depth: number,
): APIRequestGenerator<Type | undefined> {
  if (declared.id === parameter.id) {
    return actual;
  }
  if (depth > BIND_DEPTH || !(declared.isTypeReference() && actual.isTypeReference())) {
    return undefined;
  }
  const [from, to] = yield* all(checker.getTypeArguments.gen(declared), checker.getTypeArguments.gen(actual));
  for (const [at, argument] of from.entries()) {
    const target = to[at];
    const found = target === undefined ? undefined : yield* boundAt(checker, { declared: argument, actual: target }, parameter, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function* bindTypeParameter(checker: Checker, resolved: Signature, target: Signature, parameter: Type): APIRequestGenerator<Type | undefined> {
  for (const at of target.parameters.keys()) {
    const [declared, actual] = yield* all(checker.getParameterType.gen(target, at), checker.getParameterType.gen(resolved, at));
    const found = yield* boundAt(checker, { declared, actual }, parameter, 0);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

// The objects a generic call's key slot names: the target signature's parameter type walked down the path to the
// key, its `keyof T` parts, and each `T` bound from the argument that instantiates it. Null when the slot is no key.
// The type a path reaches from a parameter type, a type parameter through its declared constraint.
function* typeAtPath(checker: Checker, start: Type, path: readonly Segment[]): APIRequestGenerator<Type | undefined> {
  let type: Type | undefined = start;
  for (const segment of path) {
    if (type === undefined) {
      return undefined;
    }
    type = segment.kind === "element" ? yield* elementOf(checker, type) : yield* checker.getTypeOfPropertyOfType.gen(type, segment.name);
  }
  return type?.isTypeParameter() === true ? yield* checker.getConstraintOfTypeParameter.gen(type) : type;
}

function* genericTargets(checker: Checker, slot: Slot): APIRequestGenerator<readonly Type[] | null> {
  const { root, path } = slot;
  if (root?.kind !== "argument") {
    return null;
  }
  const resolved = yield* checker.getResolvedSignature.gen(root.call);
  const target = yield* resolved.getTarget.gen();
  if (target === undefined || target.id === resolved.id || root.index >= target.parameters.length) {
    return null;
  }
  const type = yield* typeAtPath(checker, yield* checker.getParameterType.gen(target, root.index), path);
  const indexes = type === undefined ? [] : (yield* typeParts(type)).filter((part) => part.isIndexType());
  if (indexes.length === 0) {
    return null;
  }
  const objects: Type[] = [];
  for (const index of indexes) {
    const named = yield* index.getTarget.gen();
    const bound = named.isTypeParameter() ? yield* bindTypeParameter(checker, resolved, target, named) : named;
    objects.push(...(bound === undefined ? [] : yield* constituents(yield* checker.getNonNullableType.gen(bound))));
  }
  return objects;
}

function* namedOn(checker: Checker, holders: readonly Type[], name: string): APIRequestGenerator<readonly NativeSymbol[]> {
  const found = yield* all(...holders.map((holder) => checker.getPropertyOfType.gen(holder, name)));
  return found.filter((symbol) => symbol !== undefined);
}

// --- The resolver ------------------------------------------------------------------------------------------------

const withDeclarations = (symbols: readonly (NativeSymbol | undefined)[]): readonly NativeSymbol[] =>
  symbols.filter((symbol): symbol is NativeSymbol => symbol !== undefined && symbol.declarations.length > 0);

/** What the first pass learned about one property-position request. */
interface Looked {
  readonly symbols: readonly (NativeSymbol | undefined)[];
  readonly holders: readonly Type[];
  readonly own: NativeSymbol | undefined;
  readonly open: boolean;
  readonly untyped: boolean;
}

function* lookedUp(checker: Checker, name: string, lookups: readonly Lookup[]): APIRequestGenerator<Looked> {
  const symbols: (NativeSymbol | undefined)[] = [];
  const holders: Type[] = [];
  let own: NativeSymbol | undefined;
  for (const lookup of lookups) {
    const holder = yield* holderOf(checker, lookup);
    if (holder !== undefined) {
      holders.push(holder);
    }
    if (lookup.by === "symbol") {
      symbols.push(yield* checker.getSymbolAtLocation.gen(lookup.node));
    } else {
      symbols.push(...(holder === undefined ? [] : yield* propertiesNamed(checker, holder, name)));
    }
    if (lookup.by === "contextual" && lookup.literalKey !== null) {
      own = yield* checker.getSymbolAtLocation.gen(lookup.literalKey);
    }
  }
  const unnamed = symbols.every((symbol) => symbol === undefined);
  const opens = unnamed ? yield* all(...holders.map((holder) => isOpenType(checker, holder))) : [];
  const untyped = holders.some((holder) => hasFlag(holder.flags, TypeFlags.Any) || holder.isErrorType());
  return { symbols, holders, own, open: opens.some(Boolean), untyped };
}

// Step two: the property symbols find-references reports for a string key the checker gives no symbol.
function referencedMembers(world: NativeWorld, keys: readonly Node[]): readonly (readonly NativeSymbol[])[] {
  return world.batch(
    keys.map(function* (key): APIRequestGenerator<readonly NativeSymbol[]> {
      const groups = yield* world.referencedSymbolsOf(key);
      return withDeclarations(groups.map((group) => group.symbol)).filter(
        (symbol) => hasFlag(symbol.flags, SymbolFlags.PropertyOrAccessor) || hasFlag(symbol.flags, SymbolFlags.Method),
      );
    }),
  );
}

type Pending = Omit<ResolutionBase, "site" | "name"> & { readonly request: number; readonly name: string; readonly at: Node };

type Outcome = KeyResolution extends infer R ? (R extends KeyResolution ? Omit<R, keyof ResolutionBase> : never) : never;

type Place = (pending: Pending, outcome: Outcome) => void;

/** What one pass leaves for a later step. */
interface Left {
  /** String keys no step placed yet, for find-references. */
  readonly unnamed: Pending[];
  /** Declaration-less members, for the mapped walk and the row columns. */
  readonly synthetic: { readonly pending: Pending; readonly holders: readonly Type[]; readonly declared: readonly NativeSymbol[] }[];
}

interface Named {
  readonly at: number;
  readonly name: string;
  readonly node: Node;
  readonly lookups: readonly Lookup[];
}

function namedRequests(requests: readonly KeyRequest[]): readonly Named[] {
  return requests.flatMap((request, at): Named[] => {
    if ("key" in request) {
      return [{ at, name: request.key, node: request.at, lookups: [{ by: "contextual", node: request.holder, literalKey: null }] }];
    }
    const { node } = request;
    const lookups = isKeyName(node) ? lookupsOf(node) : [];
    return lookups.length > 0 && isKeyName(node) ? [{ at, name: node.text, node, lookups }] : [];
  });
}

// Step one for property-position names: the checker's symbol, or the holder's property of that name.
function propertyPass(world: NativeWorld, named: readonly Named[], place: Place, left: Left): void {
  const looked = world.batch(named.map(({ name, lookups }) => lookedUp(world.checker, name, lookups)));
  for (const [index, { at, name, node }] of named.entries()) {
    const { symbols, holders, own, open, untyped } = looked[index] as Looked;
    const pending: Pending = { request: at, name, at: node, own, holders, slotRole: null };
    const members = withDeclarations(symbols);
    const step = firstStep({ symbols, holders, own, open, untyped }, members, node);
    if (step === "synthetic") {
      left.synthetic.push({ pending, holders, declared: members });
    } else if (step === "unnamed") {
      left.unnamed.push(pending);
    } else {
      place(pending, step);
    }
  }
}

// Step one's answer for one name, or the later step that takes it over.
function firstStep(looked: Looked, members: readonly NativeSymbol[], node: Node): Outcome | "synthetic" | "unnamed" {
  const { symbols, holders, own, open, untyped } = looked;
  if (symbols.some((symbol) => symbol !== undefined && symbol.declarations.length === 0)) {
    return "synthetic";
  }
  if (members.length > 0) {
    return { outcome: "members", step: "symbol", members };
  }
  if (open) {
    return { outcome: "open" };
  }
  if (holders.length === 0) {
    // An object literal no type holds declares its own key: the literal is the key's home.
    return own === undefined ? { outcome: "unresolved", reason: "no-holder" } : { outcome: "members", step: "symbol", members: [own] };
  }
  if (untyped) {
    return { outcome: "unresolved", reason: "untyped" };
  }
  return isStringKey(node) ? "unnamed" : { outcome: "unresolved", reason: "absent" };
}

interface SlotAnswer {
  readonly step: ResolverStep;
  readonly holders: readonly Type[];
  readonly members: readonly NativeSymbol[] | null;
  readonly role: SyntaxRole;
}

// Steps four to six, in order, for one string key; null when its slot is no key slot.
function* slotAnswer(checker: Checker, key: StringLiteral | NoSubstitutionTemplateLiteral, slot: Slot): APIRequestGenerator<SlotAnswer | null> {
  const form = formPathOf(slot);
  const data = form === null ? undefined : yield* formData(checker, form.form);
  if (form !== null && data !== undefined) {
    return { step: "form-path", holders: [data], members: yield* walkPath(checker, data, key.text), role: form.role };
  }
  const generic = yield* genericTargets(checker, slot);
  if (generic !== null) {
    return { step: "generic", holders: generic, members: yield* namedOn(checker, generic, key.text), role: "read" };
  }
  const declared = yield* keyofTargets(checker, yield* declaredSlots(checker, slot));
  return declared.length === 0 ? null : { step: "keyof", holders: declared, members: yield* namedOn(checker, declared, key.text), role: "read" };
}

// String keys outside property positions, by the slot that types them. A key in no key slot is a plain value.
function slotPass(world: NativeWorld, requests: readonly { readonly at: number; readonly request: KeyRequest }[], place: Place, left: Left): void {
  for (const { request, at } of requests) {
    // A computed string key, `{ ["key"]: v }`, names no member the checker's walk reaches; find-references does.
    if ("node" in request && isStringKey(request.node) && isComputedPropertyName(request.node.parent)) {
      left.unnamed.push({ request: at, name: request.node.text, at: request.node, own: undefined, holders: [], slotRole: "write" });
    }
  }
  const slotted = requests.flatMap(({ request, at }) =>
    "node" in request && isStringKey(request.node) && !isComputedPropertyName(request.node.parent)
      ? [{ at, key: request.node, slot: slotOf(request.node) }]
      : [],
  );
  const answers = world.batch(slotted.map(({ key, slot }) => slotAnswer(world.checker, key, slot)));
  for (const [index, { at, key }] of slotted.entries()) {
    const answer = answers[index];
    if (answer === null || answer === undefined) {
      continue;
    }
    const pending: Pending = { request: at, name: key.text, at: key, own: undefined, holders: answer.holders, slotRole: answer.role };
    const members = answer.members === null ? [] : withDeclarations(answer.members);
    if (members.length > 0) {
      place(pending, { outcome: "members", step: answer.step, members });
    } else if (answer.step === "form-path") {
      place(pending, { outcome: "unresolved", reason: "path" });
    } else {
      left.unnamed.push(pending);
    }
  }
}

// Step two, for the string keys every other step left.
function referencesPass(world: NativeWorld, unnamed: readonly Pending[], place: Place): void {
  const referenced = referencedMembers(
    world,
    unnamed.map(({ at }) => at),
  );
  for (const [index, pending] of unnamed.entries()) {
    const members = referenced[index] ?? [];
    place(pending, members.length > 0 ? { outcome: "members", step: "references", members } : { outcome: "unresolved", reason: "absent" });
  }
}

// Step three: a declaration-less member through its mapped template, else a Drizzle row's column.
function syntheticPass(world: NativeWorld, synthetic: Left["synthetic"], place: Place): void {
  const origins = world.batch(
    synthetic.map(function* ({ pending, holders }): APIRequestGenerator<readonly NativeSymbol[]> {
      return (yield* all(...holders.map((holder) => mappedOrigins(world, holder, pending.name, 0)))).flat();
    }),
  );
  const rowless = synthetic.filter(({ declared }, index) => declared.length === 0 && (origins[index] ?? []).length === 0);
  const columns = world.batch(
    rowless.map(function* ({ pending, holders }): APIRequestGenerator<readonly NativeSymbol[]> {
      return (yield* all(...holders.map((holder) => rowColumns(world, holder, pending.name)))).flat();
    }),
  );
  // A union of a declared member and a mapped one keeps both.
  for (const [index, { pending, declared }] of synthetic.entries()) {
    const mapped = origins[index] ?? [];
    if (mapped.length > 0) {
      place(pending, { outcome: "members", step: "mapped", members: [...declared, ...mapped] });
    } else if (declared.length > 0) {
      place(pending, { outcome: "members", step: "symbol", members: declared });
    }
  }
  for (const [index, { pending }] of rowless.entries()) {
    const column = columns[index] ?? [];
    place(pending, column.length > 0 ? { outcome: "members", step: "row-column", members: column } : { outcome: "unresolved", reason: "synthetic" });
  }
}

/** Place every request, by position; a node that is neither a property-position name nor a string key in a key slot
 *  answers null. Every checker query goes through the world's batch, and each later step sees only what the steps
 *  before it left. */
export function resolveKeys(world: NativeWorld, requests: readonly KeyRequest[]): (KeyResolution | null)[] {
  const answers: (KeyResolution | null)[] = requests.map(() => null);
  const place: Place = (pending, outcome) => {
    const { request, at, ...base } = pending;
    answers[request] = { ...base, site: world.siteOf(at), ...outcome };
  };
  const left: Left = { unnamed: [], synthetic: [] };
  const properties = namedRequests(requests);
  propertyPass(world, properties, place, left);
  const named = new Set(properties.map(({ at }) => at));
  slotPass(
    world,
    requests.flatMap((request, at) => (named.has(at) ? [] : [{ at, request }])),
    place,
    left,
  );
  referencesPass(world, left.unnamed, place);
  syntheticPass(world, left.synthetic, place);
  return answers;
}
