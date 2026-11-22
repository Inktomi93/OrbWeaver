// The syntactic half of the graph's walk: one pass over a file collects every site a later checker pass resolves (names,
// literal keys, hand-offs, flow sites, keyed reads, variant tables, JSX attributes, module specifiers, classes, doc
// names), the declarations it meets and the edges syntax alone decides. No checker call happens here.
import type {
  BindingElement,
  CallExpression,
  ClassDeclaration,
  EnumDeclaration,
  EnumMember,
  Expression,
  ExpressionWithTypeArguments,
  FunctionDeclaration,
  GetAccessorDeclaration,
  InterfaceDeclaration,
  JsxAttributes,
  MethodDeclaration,
  MethodSignatureDeclaration,
  ModuleDeclaration,
  NewExpression,
  Node,
  NoSubstitutionTemplateLiteral,
  ObjectBindingPattern,
  ObjectLiteralExpression,
  PropertyDeclaration,
  PropertySignatureDeclaration,
  SetAccessorDeclaration,
  ShorthandPropertyAssignment,
  SourceFile,
  StringLiteral,
  TemplateExpression,
  TypeAliasDeclaration,
  TypeLiteralNode,
  TypeNode,
  TypeReferenceNode,
  UnionTypeNode,
  VariableDeclaration,
} from "@typescript/native/ast";
import {
  getCombinedModifierFlags,
  isArrayBindingPattern,
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isBlock,
  isCallExpression,
  isClassDeclaration,
  isComputedPropertyName,
  isConditionalExpression,
  isConstructorDeclaration,
  isElementAccessExpression,
  isEnumDeclaration,
  isEnumMember,
  isExportDeclaration,
  isExportSpecifier,
  isExpressionWithTypeArguments,
  isExternalModuleReference,
  isForOfStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionTypeNode,
  isGetAccessorDeclaration,
  isIdentifier,
  isImportClause,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportSpecifier,
  isIndexedAccessTypeNode,
  isInterfaceDeclaration,
  isIntersectionTypeNode,
  isJSDocLink,
  isJSDocLinkCode,
  isJSDocLinkPlain,
  isJSDocNameReference,
  isJSDocTypeExpression,
  isJsxAttribute,
  isJsxAttributes,
  isJsxExpression,
  isJsxSpreadAttribute,
  isLiteralTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isModuleDeclaration,
  isNamespaceExport,
  isNamespaceImport,
  isNewExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPrivateIdentifier,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isReturnStatement,
  isSatisfiesExpression,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isSourceFile,
  isSpreadAssignment,
  isSpreadElement,
  isStringLiteral,
  isTemplateExpression,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isTypeParameterDeclaration,
  isTypeQueryNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  ModifierFlags,
  SyntaxKind,
} from "@typescript/native/ast";
import { hasFlag } from "../native.ts";
import type { DeclKey } from "./resolve.ts";
import { keyText, unparenType, unwrapExpression } from "./resolve.ts";
import type { Role } from "./roles.ts";
import { inAssignmentPattern, referenceRoles, sameNode } from "./roles.ts";

/** A module's node in the graph: a use of it runs the module. */
export type ModuleKey = `M:${string}`;
/** A node of the graph: a declaration or a module. */
export type GraphKey = DeclKey | ModuleKey;

// A step from a pattern's source type down to a nested pattern: a property key, or an array element's index.
type PatternStep = string | number;

/** Where a destructuring pattern's keys read from: the type at `source`, its element type when `iterated` (a for-of
 *  target), then each step in turn. */
export interface PatternRoute {
  readonly source: Node;
  readonly iterated: boolean;
  readonly steps: readonly PatternStep[];
}

// One step up a pattern: the key or index the node sits at and the literal holding it; null at the pattern's root.
function stepUp(at: Node): { readonly step: PatternStep; readonly up: Node } | null {
  const { parent } = at;
  if (isPropertyAssignment(parent) && sameNode(parent.initializer, at) && isObjectLiteralExpression(parent.parent)) {
    const key = keyText(parent.name);
    return key === undefined ? null : { step: key, up: parent.parent };
  }
  return isArrayLiteralExpression(parent) ? { step: parent.elements.findIndex((element) => sameNode(element, at)), up: parent } : null;
}

// The route from an assignment pattern's literal up to the expression it destructures; null where no expression is
// destructured (a default value, a spread, a for-in target, which reads keys, not members).
function patternRoute(literal: ObjectLiteralExpression): PatternRoute | null {
  const steps: PatternStep[] = [];
  let at: Node = literal;
  for (let next = stepUp(at); next !== null; next = stepUp(at)) {
    steps.unshift(next.step);
    at = next.up;
  }
  const { parent } = at;
  if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.EqualsToken && sameNode(parent.left, at)) {
    return { source: parent.right, iterated: false, steps };
  }
  return isForOfStatement(parent) && sameNode(parent.initializer, at) ? { source: parent.expression, iterated: true, steps } : null;
}

const MODULE_PREFIX = "M:";

export const moduleKey = (file: string): ModuleKey => `${MODULE_PREFIX}${file}`;

/** Whether a graph node is a declaration, not a module. */
export const isDeclKey = (key: GraphKey): key is DeclKey => !key.startsWith(MODULE_PREFIX);

// Why a member is judged by nothing: `x?: never` closes a union arm against a sibling's field, and a member of a type
// literal that only types a `satisfies` clause checks a value's shape. Neither holds data.
const SHAPE_ONLY = ["exclusion-marker", "satisfies-check"] as const;
type ShapeOnly = (typeof SHAPE_ONLY)[number];

/** One declaration the walk met. */
export interface DeclInfo {
  readonly file: string;
  readonly kind: SyntaxKind;
  readonly name: string;
  /** The declaration or module that holds this one. */
  readonly holder: GraphKey;
  /** The type path that holds a member, in the plugin surface's spelling: `Home.fn(0)` for a member of the first
   *  parameter's literal, `Home.fn()` for one of the return type's (tooling/src/unwired/plugin-surface.ts). */
  readonly surfacePath: string;
  readonly top: boolean;
  readonly line: number;
  readonly shapeOnly: ShapeOnly | null;
  docTags: readonly string[];
}

/** A declaration that names a unit of code a use can keep alive. */
export type UnitDeclaration =
  | FunctionDeclaration
  | MethodDeclaration
  | ClassDeclaration
  | VariableDeclaration
  | PropertyDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration
  | InterfaceDeclaration
  | TypeAliasDeclaration
  | EnumDeclaration
  | ModuleDeclaration
  | PropertySignatureDeclaration
  | MethodSignatureDeclaration
  | EnumMember;

const isUnitDeclaration = (node: Node): node is UnitDeclaration =>
  isFunctionDeclaration(node) ||
  isMethodDeclaration(node) ||
  isClassDeclaration(node) ||
  isVariableDeclaration(node) ||
  isPropertyDeclaration(node) ||
  isGetAccessorDeclaration(node) ||
  isSetAccessorDeclaration(node) ||
  isInterfaceDeclaration(node) ||
  isTypeAliasDeclaration(node) ||
  isEnumDeclaration(node) ||
  isModuleDeclaration(node) ||
  isPropertySignatureDeclaration(node) ||
  isMethodSignatureDeclaration(node) ||
  isEnumMember(node);

// The name of a unit declaration, or undefined for any other node.
const unitName = (node: Node): Node | undefined => (isUnitDeclaration(node) ? node.name : undefined);

/** The name a declaration-like node declares: a unit's, a binding's, a parameter's or a literal key's. */
export const declarationNameOf = (node: Node): Node | undefined => unitName(node) ?? namingName(node);

/** The name a declaration without one is labelled with. */
export const UNNAMED = "{…}";

// TypeScript's convention, kept by noUnusedLocals and Biome's noUnusedVariables: a leading underscore marks a binding
// never read on purpose (a compile-time pin, a disposal held by `using`).
const UNREAD_ON_PURPOSE = /^_/u;

// An identifier in these positions binds or forwards a name; its use is the later reference, resolved through the alias.
const forwards = (parent: Node): boolean =>
  isImportSpecifier(parent) ||
  isImportClause(parent) ||
  isNamespaceImport(parent) ||
  isExportSpecifier(parent) ||
  isNamespaceExport(parent) ||
  isImportEqualsDeclaration(parent);

// A name that introduces a declaration (its own name, a binding, a parameter) reads nothing; a shorthand's name also
// reads the binding it names, so it is not one.
function declaresName(name: Node): boolean {
  const { parent } = name;
  const own = unitName(parent) ?? namingName(parent);
  return sameNode(own, name);
}

function namingName(parent: Node): Node | undefined {
  if (
    isBindingElement(parent) ||
    isParameterDeclaration(parent) ||
    isPropertyAssignment(parent) ||
    isImportSpecifier(parent) ||
    isExportSpecifier(parent) ||
    isTypeParameterDeclaration(parent)
  ) {
    return parent.name;
  }
  return undefined;
}

// A type literal inside these wrappers types whatever the wrapper types.
const wrapsType = (node: Node): boolean =>
  isTypeLiteralNode(node) ||
  node.kind === SyntaxKind.ArrayType ||
  node.kind === SyntaxKind.TypeOperator ||
  node.kind === SyntaxKind.TupleType ||
  node.kind === SyntaxKind.UnionType ||
  node.kind === SyntaxKind.IntersectionType ||
  node.kind === SyntaxKind.ParenthesizedType ||
  isTypeReferenceNode(node);

// Whether a member's type literal, through array, tuple, union, operator and parenthesis wrappers, is a `satisfies`
// clause's type: `[…] satisfies readonly { value: V; label: string }[]`.
function typesOnlyASatisfies(member: Node): boolean {
  for (let at = member.parent; wrapsType(at); at = at.parent) {
    if (isSatisfiesExpression(at.parent) && sameNode(at.parent.type, at)) {
      return true;
    }
  }
  return false;
}

// A property signature's annotation: the AST types it as always present, but `{ x; }` parses with none.
const signatureType = (node: PropertySignatureDeclaration): TypeNode | undefined => node.type;

function shapeOnlyOf(node: Node): ShapeOnly | null {
  if (!isPropertySignatureDeclaration(node)) {
    return null;
  }
  if (signatureType(node)?.kind === SyntaxKind.NeverKeyword) {
    return "exclusion-marker";
  }
  return typesOnlyASatisfies(node) ? "satisfies-check" : null;
}

const isTypePosition = (node: Node): boolean =>
  (node.kind >= SyntaxKind.FirstTypeNode && node.kind <= SyntaxKind.LastTypeNode) ||
  isInterfaceDeclaration(node) ||
  isTypeAliasDeclaration(node) ||
  (isImportDeclaration(node) && node.importClause?.phaseModifier === SyntaxKind.TypeKeyword) ||
  (isExportDeclaration(node) && node.isTypeOnly) ||
  ((isImportSpecifier(node) || isExportSpecifier(node)) && node.isTypeOnly);

// The named declaration or signature slot a type literal's member sits in, outermost first: a home's name, a member's
// name, `(i)` for a signature's parameter and `()` for its return. Unions, lists, parentheses and holder generics are
// transparent, as the surface walk reads through them.
function surfacePathOf(member: Node): string {
  const steps: string[] = [];
  for (let child = member, at = member.parent; !isSourceFile(at); child = at, at = at.parent) {
    if (isInterfaceDeclaration(at) || isTypeAliasDeclaration(at)) {
      steps.unshift(at.name.text);
      break;
    }
    const step = slotStep(at, child);
    if (step !== null) {
      steps.unshift(step);
    }
  }
  return steps.reduce((path, step) => (path === "" || step.startsWith("(") ? `${path}${step}` : `${path}.${step}`), "");
}

function slotStep(at: Node, child: Node): string | null {
  if (isPropertySignatureDeclaration(at)) {
    return keyText(at.name) ?? null;
  }
  if (isMethodSignatureDeclaration(at)) {
    const name = keyText(at.name);
    return name === undefined ? null : `${name}${sameNode(at.type, child) ? "()" : ""}`;
  }
  if (isParameterDeclaration(at) && (isMethodSignatureDeclaration(at.parent) || isFunctionTypeNode(at.parent))) {
    return `(${String(at.parent.parameters.findIndex((parameter) => sameNode(parameter, at)))})`;
  }
  return isFunctionTypeNode(at) && sameNode(at.type, child) ? "()" : null;
}

/** One name occurrence the checker resolves, with the declaration it sits in and what syntax says it does. */
export interface NameSite {
  readonly node: Node;
  readonly from: GraphKey;
  readonly inType: boolean;
  /** A value position that hands the named value on (not `new X`, `X.member`, a heritage clause or its own name). */
  readonly handed: boolean;
  readonly roles: readonly Role[];
}

/** A property an object literal writes: the literal, the key's text and the value written, if any. */
export interface LiteralProperty {
  readonly literal: ObjectLiteralExpression;
  readonly name: string;
  readonly value: Node | undefined;
}

/** A value handed on whole: a call argument, a spread, or a value published to a global our own declarations name. */
export interface HandedWhole {
  readonly node: Expression;
  readonly spread: boolean;
  readonly door: boolean;
  /** The call the value is an argument of, and its argument index: a zod validator's call hands its argument on, and a
   *  library signature's bare type parameter takes it whole. */
  readonly call?: { readonly node: CallExpression | NewExpression; readonly index: number };
}

/** A whole value flowing into a typed slot: the slot is a variable's annotation, the value's contextual type, or the
 *  contextual type of the literal a spread copies into (tooling/src/eslint/port-ownership/restated-port.ts flowsAt). */
export type FlowSite =
  | { readonly slot: "declared"; readonly value: Expression; readonly holder: Node }
  | { readonly slot: "contextual"; readonly value: Expression }
  | { readonly slot: "holder"; readonly value: Expression; readonly holder: Expression };

/** `x[k]`: the receiver, the literal keys `k` can be (null for a computed key) and the key's expression. */
export interface ElementKey {
  readonly receiver: Node;
  readonly keys: readonly string[] | null;
  readonly argument: Node;
}

/** `T[K]`: the object type, the literal keys `K` spells and the index type node. */
export interface IndexedKey {
  readonly object: TypeNode;
  readonly keys: readonly string[];
  readonly index: TypeNode;
}

/** A class the walk met, with its members by name and the heritage types they may fill. */
export interface ClassFacts {
  readonly key: DeclKey;
  readonly members: Map<string, DeclKey>;
  readonly statics: Map<string, DeclKey>;
  /** Every heritage clause's type: the instance types its members may fill. */
  readonly heritage: readonly Node[];
  /** The `extends` clause's base: its value side holds the statics its static members may fill. */
  readonly bases: readonly ExpressionWithTypeArguments[];
}

/** An object literal's methods and accessors by name, with the declaration holding the literal. */
export interface LiteralMembers {
  readonly node: ObjectLiteralExpression;
  readonly container: GraphKey;
  readonly members: Map<string, DeclKey>;
}

/** A read of a published global spelled in script text: `window.X.a.b`, and whether a computed key follows. */
export interface ScriptGlobalRead {
  readonly global: string;
  readonly chain: readonly string[];
  readonly dynamic: boolean;
}

/** Everything one file's walk collected. */
export class FileSites {
  readonly file: string;
  readonly product: boolean;
  readonly names: NameSite[] = [];
  readonly literalProperties: LiteralProperty[] = [];
  readonly hookTuples: { readonly call: CallExpression; readonly elements: readonly Node[] }[] = [];
  readonly zodTwins: { readonly shape: TypeNode; readonly keys: readonly { readonly name: string; readonly decl: DeclKey }[] }[] = [];
  readonly handedWhole: HandedWhole[] = [];
  readonly globalAssigns: { readonly target: Node; readonly value: Expression }[] = [];
  readonly flowSites: FlowSite[] = [];
  readonly pickKeys: { readonly target: TypeNode; readonly keys: readonly string[] }[] = [];
  readonly indexedKeys: IndexedKey[] = [];
  readonly elementKeys: ElementKey[] = [];
  /** Members a lib arm selector's pattern names: `Extract<T, { k: … }>`. */
  readonly armSelectorMembers: DeclKey[] = [];
  readonly tvCalls: CallExpression[] = [];
  readonly jsxAttributes: { readonly attributes: JsxAttributes; readonly name: string; readonly value: Node | undefined }[] = [];
  readonly specifiers: { readonly node: StringLiteral | NoSubstitutionTemplateLiteral; readonly from: GraphKey; readonly inType: boolean }[] = [];
  readonly urlModules: { readonly target: string; readonly from: GraphKey }[] = [];
  readonly shorthands: { readonly node: ShorthandPropertyAssignment; readonly from: GraphKey }[] = [];
  /** Destructuring patterns, a declaration's or an assignment's, with the route to the type their keys read. */
  readonly patterns: ({
    readonly pattern: ObjectBindingPattern | ObjectLiteralExpression;
    readonly names: readonly string[];
    readonly from: GraphKey;
  } & PatternRoute)[] = [];
  readonly classes: ClassFacts[] = [];
  readonly newExpressions: NewExpression[] = [];
  readonly literals: LiteralMembers[] = [];
  readonly tagged: UnitDeclaration[] = [];
  readonly docNames: { readonly node: Node; readonly from: GraphKey }[] = [];
  /** A property whose value is a custom property's name, and the record entry holding it, if any. */
  readonly cssNames: { readonly holder: DeclKey; readonly entry: DeclKey | null; readonly name: string }[] = [];
  readonly scriptGlobalReads: ScriptGlobalRead[] = [];
  /** The spans of this file's `tv(…)` calls: a write inside one is the table itself, never a use. */
  readonly tvSpans: (readonly [number, number])[] = [];
  /** Calls handed one value that is no object literal (`recipe(bag)`): a variant recipe's whole-bag selection, once the
   *  resolved signature confirms the callee is a recipe. */
  readonly bagCalls: { readonly call: CallExpression; readonly bag: Expression }[] = [];
  /** A product file's string-literal unions and `as const` string tuples: an axis's homes and its inline spellings. */
  readonly stringUnions: { readonly node: UnionTypeNode; readonly members: readonly string[]; readonly from: GraphKey }[] = [];
  readonly constTuples: { readonly node: VariableDeclaration; readonly members: readonly string[] }[] = [];

  readonly #source: SourceFile;

  constructor(source: SourceFile, file: string, product: boolean) {
    this.#source = source;
    this.file = file;
    this.product = product;
  }

  /** The 1-based line a node's own text starts on. */
  lineOf(node: Node): number {
    return this.#source.getLineAndCharacterOfPosition(node.getStart(this.#source)).line + 1;
  }
}

/** A union's string-literal members, sorted; null when any member is something else. */
function stringLiteralTypes(node: UnionTypeNode): readonly string[] | null {
  const members = node.types.map((member) => (isLiteralTypeNode(member) && isStringLiteral(member.literal) ? member.literal.text : null));
  return members.every((member) => member !== null) ? members.toSorted() : null;
}

const CONST_ASSERTION = "const";

// An `as const` array of string literals, its members sorted; null for any other initializer.
function constStringTuple(initializer: Expression): readonly string[] | null {
  if (!(isAsExpression(initializer) && isTypeReferenceNode(initializer.type) && referenceName(initializer.type) === CONST_ASSERTION)) {
    return null;
  }
  const list = initializer.expression;
  if (!isArrayLiteralExpression(list) || list.elements.length === 0) {
    return null;
  }
  const members = list.elements.map((element) => (isStringLiteral(element) ? element.text : null));
  return members.every((member) => member !== null) ? members.toSorted() : null;
}

/** What the walk tells the graph as it meets declarations and syntax-decided edges. */
export interface WalkSink {
  readonly keyOf: (node: Node) => DeclKey;
  readonly declare: (key: DeclKey, info: DeclInfo) => void;
  readonly edge: (map: "run" | "typ", from: GraphKey, to: GraphKey) => void;
  readonly role: (key: DeclKey, role: Role, file: string, at: number) => void;
  readonly pin: (key: DeclKey) => void;
  /** A member the runtime calls by its well-known name. */
  readonly unseenCall: (key: DeclKey) => void;
  /** A module a `new URL("./x", import.meta.url)` names, if it is one of the tree's code files. */
  readonly urlModule: (fromFile: string, specifier: string) => string | null;
}

const CSS_NAME = /^--[\w-]+$/u;
const ZOD_TYPE = "ZodType";
const TV = "tv";
const URL_CONSTRUCTOR = "URL";
const WELL_KNOWN_SYMBOLS = "Symbol";
// Members the runtime calls by name: JSON.stringify's `toJSON`, coercion's `toString` and `valueOf`, `await`'s `then`.
const RUNTIME_PROTOCOL_NAMES: ReadonlySet<string> = new Set(["toJSON", "toString", "valueOf", "then"]);
const ARM_SELECTORS: ReadonlySet<string> = new Set(["Extract", "Exclude"]);
const MEMBER_SELECTORS: ReadonlySet<string> = new Set(["Pick", "Omit"]);
// A zod object schema's shape literal, through the chain it is built in (`z.strictObject({ … }).describe(…)`).
const ZOD_OBJECT_BUILDERS: ReadonlySet<string> = new Set(["object", "strictObject", "looseObject"]);
// An inline `z.union` or `z.discriminatedUnion` spells each arm; an arm held in a constant twins at its own `satisfies`.
const ZOD_UNION_BUILDERS: ReadonlySet<string> = new Set(["union", "discriminatedUnion"]);
const ZOD_EXTENDERS: ReadonlySet<string> = new Set(["extend", "safeExtend"]);
// A variable's JSDoc sits on its statement (`/** @public */ export const x = …`), two levels up from the declaration.
const hasJsDoc = (node: UnitDeclaration): boolean => {
  const holder = isVariableDeclaration(node) ? node.parent.parent : node;
  return (holder.jsDoc?.length ?? 0) > 0;
};
// Values whose own literal types are their whole meaning: a flow from one carries no member.
const isLiteralValue = (node: Node): boolean =>
  isObjectLiteralExpression(node) ||
  isStringLiteral(node) ||
  isNumericLiteral(node) ||
  isNoSubstitutionTemplateLiteral(node) ||
  isTemplateExpression(node) ||
  isArrayLiteralExpression(node) ||
  node.kind === SyntaxKind.TrueKeyword ||
  node.kind === SyntaxKind.FalseKeyword ||
  node.kind === SyntaxKind.NullKeyword;

// The string literals an element-access key can evaluate to, through parentheses and conditionals; null for a key
// computed any other way, which reads the table whole.
export function keyLiterals(node: Node | undefined): readonly string[] | null {
  if (node === undefined) {
    return null;
  }
  if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) || isNumericLiteral(node)) {
    return [node.text];
  }
  if (isParenthesizedExpression(node)) {
    return keyLiterals(node.expression);
  }
  if (isConditionalExpression(node)) {
    const whenTrue = keyLiterals(node.whenTrue);
    const whenFalse = keyLiterals(node.whenFalse);
    return whenTrue !== null && whenFalse !== null ? [...whenTrue, ...whenFalse] : null;
  }
  return null;
}

// The type literals a type argument spells, through unions, intersections and parentheses.
function typeLiteralsIn(node: TypeNode): readonly TypeLiteralNode[] {
  if (isTypeLiteralNode(node)) {
    return [node];
  }
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
    return node.types.flatMap(typeLiteralsIn);
  }
  return isParenthesizedTypeNode(node) ? typeLiteralsIn(node.type) : [];
}

// The string keys a key argument spells: a literal or a union of them.
function stringKeysIn(node: TypeNode): readonly string[] {
  if (isLiteralTypeNode(node) && isStringLiteral(node.literal)) {
    return [node.literal.text];
  }
  if (isUnionTypeNode(node)) {
    return node.types.flatMap(stringKeysIn);
  }
  return isParenthesizedTypeNode(node) ? stringKeysIn(node.type) : [];
}

const referenceName = (node: TypeReferenceNode): string => (isQualifiedName(node.typeName) ? node.typeName.right.text : node.typeName.text);

// Every object shape a zod schema expression spells: one `z.object` literal, each arm of an inline union, and each
// `base.extend({ … })` literal along the chain (the base keeps its own twin through its own `satisfies`).
function zodShapesOf(expression: Node): readonly ObjectLiteralExpression[] {
  const one = zodShapeOf(expression);
  if (one !== undefined) {
    return [one];
  }
  const shapes: ObjectLiteralExpression[] = [];
  for (let at: Node | undefined = unwrapExpression(expression); at !== undefined && isCallExpression(at); ) {
    const callee = at.expression;
    if (!isPropertyAccessExpression(callee)) {
      return shapes;
    }
    if (ZOD_UNION_BUILDERS.has(callee.name.text)) {
      const arms = at.arguments.find(isArrayLiteralExpression);
      return [...shapes, ...(arms?.elements ?? []).flatMap(zodShapesOf)];
    }
    const [added] = at.arguments;
    if (ZOD_EXTENDERS.has(callee.name.text) && added !== undefined && isObjectLiteralExpression(added)) {
      shapes.push(added);
    }
    const inner = zodShapeOf(callee.expression);
    if (inner !== undefined) {
      return [...shapes, inner];
    }
    at = unwrapExpression(callee.expression);
  }
  return shapes;
}

function zodShapeOf(expression: Node): ObjectLiteralExpression | undefined {
  for (let at: Node | undefined = unwrapExpression(expression); at !== undefined && isCallExpression(at); ) {
    const callee = at.expression;
    const [shape] = at.arguments;
    if (isPropertyAccessExpression(callee) && ZOD_OBJECT_BUILDERS.has(callee.name.text) && shape !== undefined && isObjectLiteralExpression(shape)) {
      return shape;
    }
    at = isPropertyAccessExpression(callee) ? unwrapExpression(callee.expression) : undefined;
  }
  return undefined;
}

// `window.X.a.b` / `globalThis.X.a` in a string: the global, the member chain, and whether a computed key follows it.
const GLOBAL_READ = /\b(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)((?:\??\.[A-Za-z_$][\w$]*)*)(\??\.\$\{|\[)?/gu;
// `const nav = window.__orb && window.__orb.nav;` names an alias the rest of the script reads through.
const GLOBAL_ALIAS =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[^;\n]*?(?:&&|\?\?|\|\|)\s*)?(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)((?:\??\.[A-Za-z_$][\w$]*)*)/gu;
const MEMBER_STEP = /\??\./u;

const chainOf = (text: string | undefined): readonly string[] => (text ?? "").split(MEMBER_STEP).filter((step) => step !== "");
const escapeName = (name: string): string => name.replaceAll("$", "\\$");

// The published globals a script's text reads by name, with each read's member chain.
function scriptGlobalReads(text: string): readonly ScriptGlobalRead[] {
  if (!text.includes(".")) {
    return [];
  }
  const out: ScriptGlobalRead[] = [...text.matchAll(GLOBAL_READ)].map((match) => ({
    global: match[1] ?? "",
    chain: chainOf(match[2]),
    dynamic: match[3] !== undefined,
  }));
  for (const alias of text.matchAll(GLOBAL_ALIAS)) {
    const name = escapeName(alias[1] ?? "");
    const base = { global: alias[2] ?? "", chain: chainOf(alias[3]) };
    const via = new RegExp(`\\b${name}((?:\\??\\.[A-Za-z_$][\\w$]*)+)(\\??\\.\\$\\{|\\[)?`, "gu");
    for (const read of text.slice(alias.index + alias[0].length).matchAll(via)) {
      out.push({ global: base.global, chain: [...base.chain, ...chainOf(read[1])], dynamic: read[2] !== undefined });
    }
    // `nav.${method}(…)` straight after the alias: a computed member of the alias itself
    if (new RegExp(`\\b${name}\\??\\.\\$\\{`, "u").test(text)) {
      out.push({ ...base, dynamic: true });
    }
  }
  return out;
}

// A template's literal text, each interpolation kept as a `${}` marker so a computed key after a chain is seen.
const templateText = (node: TemplateExpression): string => node.head.text + node.templateSpans.map((span) => `\${}${span.literal.text}`).join("");

const hasStatic = (node: MethodDeclaration | PropertyDeclaration | GetAccessorDeclaration | SetAccessorDeclaration): boolean =>
  hasFlag(getCombinedModifierFlags(node), ModifierFlags.Static);

interface Frame {
  readonly stack: GraphKey[];
  readonly literals: LiteralMembers[];
  readonly classes: ClassFacts[];
}

/** Walk one file: every site its checker passes need, with the declarations and syntax-decided edges told to `sink`. */
export function collectSites(source: SourceFile, file: string, product: boolean, sink: WalkSink): FileSites {
  const sites = new FileSites(source, file, product);
  const frame: Frame = { stack: [moduleKey(file)], literals: [], classes: [] };
  const walker = new Walker(source, sites, sink, frame);
  walker.visit(source, false);
  return sites;
}

class Walker {
  readonly #source: SourceFile;
  readonly #sites: FileSites;
  readonly #sink: WalkSink;
  readonly #frame: Frame;

  constructor(source: SourceFile, sites: FileSites, sink: WalkSink, frame: Frame) {
    this.#source = source;
    this.#sites = sites;
    this.#sink = sink;
    this.#frame = frame;
  }

  get #holder(): GraphKey {
    return this.#frame.stack.at(-1) ?? moduleKey(this.#sites.file);
  }

  visit(node: Node, typePosition: boolean): void {
    const pushed = this.#declaration(node);
    this.#docs(node);
    if (isConstructorDeclaration(node)) {
      this.#sink.edge("run", this.#holder, this.#sink.keyOf(node));
    }
    if (isBindingElement(node)) {
      this.#sink.edge("run", this.#sink.keyOf(node), this.#holder);
    }
    const literal = isObjectLiteralExpression(node) ? this.#literal(node) : undefined;
    if (isNewExpression(node)) {
      this.#sites.newExpressions.push(node);
    }
    const inType = typePosition || isTypePosition(node);
    this.#name(node, inType);
    this.#keyed(node, inType);
    this.#values(node, inType);
    this.#types(node);
    this.#strings(node, inType);
    this.#spellings(node);
    node.forEachChild((child) => this.visit(child, inType));
    if (pushed) {
      this.#frame.stack.pop();
      if (isClassDeclaration(node)) {
        this.#frame.classes.pop();
      }
    }
    if (literal !== undefined) {
      this.#frame.literals.pop();
    }
  }

  // A declaration: its facts, the edges that keep it and its holder alive together, and its place on the stack.
  #declaration(node: Node): boolean {
    const name = isUnitDeclaration(node) ? node.name : undefined;
    if (!isUnitDeclaration(node) || name === undefined) {
      return false;
    }
    const top = this.#frame.stack.length === 1;
    const holder = this.#holder;
    const key = this.#sink.keyOf(node);
    const line = this.#source.getLineAndCharacterOfPosition(name.getStart(this.#source)).line + 1;
    this.#sink.declare(key, {
      file: this.#sites.file,
      kind: node.kind,
      name: keyText(name) ?? UNNAMED,
      holder,
      surfacePath: surfacePathOf(node),
      top,
      line,
      shapeOnly: shapeOnlyOf(node),
      docTags: [],
    });
    if (hasJsDoc(node) && (top || isClassDeclaration(node.parent))) {
      this.#sites.tagged.push(node);
    }
    this.#declarationEdges(node, key, top);
    this.#member(node, key);
    if (isClassDeclaration(node)) {
      this.#class(node, key);
    }
    // a class field's initializer runs when the class is constructed, not when the field is read: its uses are the class's
    if (isPropertyDeclaration(node) && isClassDeclaration(node.parent)) {
      return false;
    }
    this.#frame.stack.push(key);
    return true;
  }

  // The edges that keep a declaration and its holder alive together, a pin on a binding unread on purpose, and a field
  // initializer's write.
  #declarationEdges(node: UnitDeclaration, key: DeclKey, top: boolean): void {
    const holder = this.#holder;
    // a used declaration keeps what holds it alive
    this.#sink.edge("run", key, holder);
    if (isVariableDeclaration(node) && !top) {
      // a local's initializer runs with its holder
      this.#sink.edge("run", holder, key);
    }
    if ((isPropertySignatureDeclaration(node) || isMethodSignatureDeclaration(node)) && !top) {
      // a used type keeps its members' types
      this.#sink.edge("typ", holder, key);
    }
    if (isVariableDeclaration(node) && top && UNREAD_ON_PURPOSE.test(bindingText(node.name))) {
      this.#sink.pin(key);
    }
    if (isPropertyDeclaration(node) && node.initializer !== undefined) {
      this.#sink.role(key, "write", this.#sites.file, node.pos);
    }
  }

  #member(node: Node, key: DeclKey): void {
    const name = keyText(unitName(node)) ?? UNNAMED;
    if (
      (isMethodDeclaration(node) || isPropertyDeclaration(node) || isGetAccessorDeclaration(node) || isSetAccessorDeclaration(node)) &&
      isClassDeclaration(node.parent)
    ) {
      const owner = this.#frame.classes.at(-1);
      (hasStatic(node) ? owner?.statics : owner?.members)?.set(name, key);
      if (owner !== undefined && isRuntimeProtocol(node.name)) {
        // the runtime calls it by its well-known name: JSON.stringify, coercion, `await`, `using`, for-of
        this.#sink.edge("run", owner.key, key);
        this.#sink.unseenCall(key);
      }
    }
    // a node's parent is a fresh wrapper on every read, so a member finds its literal by the walk's stack
    if ((isMethodDeclaration(node) || isGetAccessorDeclaration(node) || isSetAccessorDeclaration(node)) && isObjectLiteralExpression(node.parent)) {
      this.#frame.literals.at(-1)?.members.set(name, key);
    }
  }

  #class(node: ClassDeclaration, key: DeclKey): void {
    const clauses = node.heritageClauses ?? [];
    // an `implements` clause holds type references, an `extends` clause an expression with its type arguments
    const heritage = clauses.flatMap((clause): readonly Node[] => clause.types);
    const bases = clauses.flatMap((clause) => (clause.token === SyntaxKind.ExtendsKeyword ? clause.types.filter(isExpressionWithTypeArguments) : []));
    const facts: ClassFacts = { key, members: new Map(), statics: new Map(), heritage, bases };
    this.#sites.classes.push(facts);
    this.#frame.classes.push(facts);
  }

  // `({ a: x.n } = o)`, nested (`({ inner: { a: x } } = o)`, `[{ a: x }] = rows`) or a for-of target: the pattern
  // declares nothing and fills no slot; its keys read the members of the source's type at the pattern's path.
  #assignmentPattern(node: ObjectLiteralExpression): void {
    const names = node.properties.flatMap((property) => (isSpreadAssignment(property) ? [] : (keyText(property.name) ?? [])));
    const route = patternRoute(node);
    if (route !== null && names.length > 0) {
      this.#sites.patterns.push({ pattern: node, ...route, names, from: this.#holder });
    }
  }

  #literal(node: ObjectLiteralExpression): LiteralMembers {
    const literal = { node, container: this.#holder, members: new Map<string, DeclKey>() };
    if (inAssignmentPattern(node)) {
      this.#assignmentPattern(node);
      return literal;
    }
    this.#sites.literals.push(literal);
    this.#frame.literals.push(literal);
    for (const property of node.properties) {
      const name = isSpreadAssignment(property) ? undefined : keyText(property.name);
      if (name === undefined) {
        continue;
      }
      if (isPropertyAssignment(property)) {
        this.#sites.literalProperties.push({ literal: node, name, value: property.initializer });
      } else if (isShorthandPropertyAssignment(property)) {
        this.#sites.literalProperties.push({ literal: node, name, value: property.name });
      } else if (isMethodDeclaration(property)) {
        this.#sites.literalProperties.push({ literal: node, name, value: undefined });
      }
    }
    return literal;
  }

  // JSDoc is not a child in forEachChild's walk; its own tree holds the names a doc comment points at.
  #docs(node: Node): void {
    for (const doc of node.jsDoc ?? []) {
      this.#docNames(doc, false);
    }
  }

  #docNames(node: Node, inHolder: boolean): void {
    const holds = inHolder || isDocNameHolder(node);
    if (holds && (isIdentifier(node) || isPrivateIdentifier(node)) && !isQualifiedName(node.parent)) {
      this.#sites.docNames.push({ node, from: this.#holder });
    }
    if (holds && isQualifiedName(node)) {
      this.#sites.docNames.push({ node: node.right, from: this.#holder });
    }
    node.forEachChild((child) => this.#docNames(child, holds));
  }

  // A reference: an identifier or a private name (`this.#x`), two node kinds with one meaning; and `x["k"]`, the third
  // spelling of a member read beside `x.k` and `x?.k`.
  #name(node: Node, inType: boolean): void {
    if ((isIdentifier(node) || isPrivateIdentifier(node)) && !forwards(node.parent)) {
      const silent = inType || declaresName(node);
      this.#sites.names.push({ node, from: this.#holder, inType, handed: !inType && handsOn(node), roles: silent ? [] : referenceRoles(node) });
      if (isShorthandPropertyAssignment(node.parent)) {
        this.#sites.shorthands.push({ node: node.parent, from: this.#holder });
      }
      return;
    }
    if (
      (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) &&
      isElementAccessExpression(node.parent) &&
      sameNode(node.parent.argumentExpression, node)
    ) {
      this.#sites.names.push({ node, from: this.#holder, inType: false, handed: false, roles: referenceRoles(node) });
    }
  }

  // `table[cond ? "a" : "b"]` reads each literal the key can be; `table[k]` with a computed key is resolved later.
  #keyed(node: Node, inType: boolean): void {
    if (
      isElementAccessExpression(node) &&
      !inType &&
      !isStringLiteral(node.argumentExpression) &&
      !isNoSubstitutionTemplateLiteral(node.argumentExpression) &&
      !isNumericLiteral(node.argumentExpression)
    ) {
      this.#sites.elementKeys.push({ receiver: node.expression, keys: keyLiterals(node.argumentExpression), argument: node.argumentExpression });
    }
    // `T[K]`: a literal key names one member of T; a generic or union key reads T as a dispatch table
    if (isIndexedAccessTypeNode(node) && !isTypeQueryNode(unparenType(node.objectType))) {
      this.#sites.indexedKeys.push({ object: node.objectType, keys: stringKeysIn(node.indexType), index: node.indexType });
    }
    if (isObjectBindingPattern(node)) {
      const names = node.elements.flatMap((element) => (element.dotDotDotToken === undefined ? bindingKey(element) : []));
      if (names.length > 0) {
        this.#sites.patterns.push({ pattern: node, source: node, iterated: false, steps: [], names, from: this.#holder });
      }
    }
    if (
      isArrayBindingPattern(node) &&
      isVariableDeclaration(node.parent) &&
      node.parent.initializer !== undefined &&
      isCallExpression(node.parent.initializer)
    ) {
      this.#sites.hookTuples.push({ call: node.parent.initializer, elements: [...node.elements] });
    }
  }

  // Values handed on and values flowing into typed slots: product code only, since only a product site decides a bucket.
  #values(node: Node, inType: boolean): void {
    const { product } = this.#sites;
    if ((isCallExpression(node) || isNewExpression(node)) && !inType && product) {
      this.#arguments(node);
    }
    const [bag] = isCallExpression(node) ? node.arguments : [];
    if (isCallExpression(node) && node.arguments.length === 1 && bag !== undefined && !isObjectLiteralExpression(bag) && !inType && product) {
      this.#sites.bagCalls.push({ call: node, bag });
    }
    if (
      isBinaryExpression(node) &&
      node.operatorToken.kind === SyntaxKind.EqualsToken &&
      product &&
      (isPropertyAccessExpression(node.left) || isIdentifier(node.left))
    ) {
      this.#sites.globalAssigns.push({ target: node.left, value: node.right });
    }
    this.#libraryShapes(node);
    if (product) {
      const site = valueFlowSite(node) ?? copyFlowSite(node);
      if (site !== undefined) {
        this.#sites.flowSites.push(site);
      }
    }
  }

  // The library calls whose syntax the graph reads: a `tv()` table, a JSX attribute's value, a zod schema's twin keys.
  #libraryShapes(node: Node): void {
    if (isCallExpression(node) && isTvCallee(node.expression) && node.arguments[0] !== undefined && isObjectLiteralExpression(node.arguments[0])) {
      this.#sites.tvCalls.push(node);
      this.#sites.tvSpans.push([node.pos, node.end]);
    }
    if (isJsxAttribute(node) && isIdentifier(node.name) && isJsxAttributes(node.parent)) {
      const value = node.initializer !== undefined && isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      this.#sites.jsxAttributes.push({ attributes: node.parent, name: node.name.text, value });
    }
    if (isSatisfiesExpression(node) && isTypeReferenceNode(node.type) && referenceName(node.type) === ZOD_TYPE && node.type.typeArguments?.[0] !== undefined) {
      const [shape] = node.type.typeArguments;
      for (const literal of zodShapesOf(node.expression)) {
        this.#sites.zodTwins.push({ shape, keys: literal.properties.flatMap((property) => this.#twinKey(property)) });
      }
    }
  }

  #twinKey(property: Node): readonly { readonly name: string; readonly decl: DeclKey }[] {
    if (!((isPropertyAssignment(property) || isShorthandPropertyAssignment(property)) && (isIdentifier(property.name) || isStringLiteral(property.name)))) {
      return [];
    }
    return [{ name: property.name.text, decl: this.#sink.keyOf(property) }];
  }

  // Each argument: a function value flows into its parameter's slot; any other non-primitive value is handed on whole,
  // an object literal too, so its values escape into an opaque slot (its keys are written by the literal-key pass).
  #arguments(node: CallExpression | NewExpression): void {
    for (const [index, argument] of (node.arguments ?? []).entries()) {
      if (isArrowFunction(argument) || isFunctionExpression(argument)) {
        this.#sites.flowSites.push({ value: argument, slot: "contextual" });
      } else if (!(isStringLiteral(argument) || isNumericLiteral(argument))) {
        this.#sites.handedWhole.push({ node: argument, spread: isSpreadElement(argument), door: false, call: { node, index } });
      }
    }
  }

  // Lib selections: `Extract<T, { k: … }>` and `Exclude<…>` take a type literal that selects arms (its members are a
  // pattern, never data); `Pick<T, K>` and `Omit<T, K>` name T's members by key.
  #types(node: Node): void {
    if (!isTypeReferenceNode(node) || node.typeArguments === undefined || node.typeArguments.length === 0) {
      return;
    }
    const name = referenceName(node);
    const [target, keys] = node.typeArguments;
    if (ARM_SELECTORS.has(name)) {
      for (const literal of node.typeArguments.slice(1).flatMap(typeLiteralsIn)) {
        for (const member of literal.members.filter(isPropertySignatureDeclaration)) {
          this.#sites.armSelectorMembers.push(this.#sink.keyOf(member));
        }
      }
    }
    if (MEMBER_SELECTORS.has(name) && target !== undefined && keys !== undefined && stringKeysIn(keys).length > 0) {
      this.#sites.pickKeys.push({ target, keys: stringKeysIn(keys) });
    }
  }

  #spellings(node: Node): void {
    if (!this.#sites.product) {
      return;
    }
    const members = isUnionTypeNode(node) ? stringLiteralTypes(node) : null;
    if (isUnionTypeNode(node) && members !== null) {
      this.#sites.stringUnions.push({ node, members, from: this.#holder });
    }
    const tuple = isVariableDeclaration(node) && node.initializer !== undefined ? constStringTuple(node.initializer) : null;
    if (isVariableDeclaration(node) && tuple !== null) {
      this.#sites.constTuples.push({ node, members: tuple });
    }
  }

  #strings(node: Node, inType: boolean): void {
    if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) {
      this.#specifier(node, inType);
      this.#customProperty(node);
      this.#sites.scriptGlobalReads.push(...scriptGlobalReads(node.text));
    } else if (isTemplateExpression(node)) {
      this.#sites.scriptGlobalReads.push(...scriptGlobalReads(templateText(node)));
    }
  }

  // Module specifiers: an import runs its module; a re-export forwards names and runs nothing for the importer.
  // `new URL("./x", import.meta.url)` loads a module by path (a Worker, a child process) as its own entry.
  #specifier(node: StringLiteral | NoSubstitutionTemplateLiteral, inType: boolean): void {
    const { parent } = node;
    const specifies =
      ((isImportDeclaration(parent) || isExportDeclaration(parent)) && sameNode(parent.moduleSpecifier, node)) ||
      (isCallExpression(parent) && parent.expression.kind === SyntaxKind.ImportKeyword) ||
      isExternalModuleReference(parent);
    if (specifies) {
      this.#sites.specifiers.push({ node, from: this.#holder, inType });
      return;
    }
    if (
      isNewExpression(parent) &&
      isIdentifier(parent.expression) &&
      parent.expression.text === URL_CONSTRUCTOR &&
      sameNode(parent.arguments?.[0], node) &&
      node.text.startsWith(".")
    ) {
      const target = this.#sink.urlModule(this.#sites.file, node.text);
      if (target !== null) {
        this.#sites.urlModules.push({ target, from: this.#holder });
      }
    }
  }

  // `"--pigment-avatar-1"` as a property's value: the member that holds a custom property's name. A field of a record
  // entry (`"color.chart-1": { cssVar: "--color-chart-1" }`) is read for every entry at once, so the entry's own key is
  // recorded too.
  #customProperty(node: StringLiteral | NoSubstitutionTemplateLiteral): void {
    const { parent } = node;
    if (!(isStringLiteral(node) && CSS_NAME.test(node.text) && isPropertyAssignment(parent) && sameNode(parent.initializer, node))) {
      return;
    }
    const literal = parent.parent;
    const entry =
      isObjectLiteralExpression(literal) && isPropertyAssignment(literal.parent) && sameNode(literal.parent.initializer, literal) ? literal.parent : undefined;
    this.#sites.cssNames.push({ holder: this.#sink.keyOf(parent), entry: entry === undefined ? null : this.#sink.keyOf(entry), name: node.text });
  }
}

// Names the runtime calls a member by: a well-known symbol (`[Symbol.dispose]`, `[Symbol.iterator]`) or one of
// RUNTIME_PROTOCOL_NAMES.
function isRuntimeProtocol(name: Node): boolean {
  if (isComputedPropertyName(name)) {
    const { expression } = name;
    return isPropertyAccessExpression(expression) && isIdentifier(expression.expression) && expression.expression.text === WELL_KNOWN_SYMBOLS;
  }
  return isIdentifier(name) && RUNTIME_PROTOCOL_NAMES.has(name.text);
}

const isDocNameHolder = (node: Node): boolean =>
  isJSDocLink(node) || isJSDocLinkCode(node) || isJSDocLinkPlain(node) || isJSDocNameReference(node) || isJSDocTypeExpression(node);

// A value written into a slot its position types: a declaration's annotation, a concise arrow body or a return (its
// function's return), or a literal property's value.
function valueFlowSite(node: Node): FlowSite | undefined {
  if (isVariableDeclaration(node) && node.type !== undefined && node.initializer !== undefined && !isLiteralValue(node.initializer)) {
    return { value: node.initializer, slot: "declared", holder: node.name };
  }
  if (isArrowFunction(node) && !isBlock(node.body) && !isLiteralValue(node.body)) {
    return { value: node.body, slot: "contextual" };
  }
  if (isReturnStatement(node) && node.expression !== undefined && !isLiteralValue(node.expression)) {
    return { value: node.expression, slot: "contextual" };
  }
  return isPropertyAssignment(node) && isObjectLiteralExpression(node.parent) && !isLiteralValue(node.initializer)
    ? { value: node.initializer, slot: "contextual" }
    : undefined;
}

// A value copied into a prop or a literal slot by name: a JSX attribute's value, as an argument is to a parameter; a
// shorthand's binding, into the slot of the same name; a spread's members, member by member.
function copyFlowSite(node: Node): FlowSite | undefined {
  if (isJsxAttribute(node) && node.initializer !== undefined && isJsxExpression(node.initializer)) {
    const { expression } = node.initializer;
    return expression === undefined || isLiteralValue(expression) ? undefined : { value: expression, slot: "contextual" };
  }
  if (isShorthandPropertyAssignment(node) && isObjectLiteralExpression(node.parent) && isIdentifier(node.name)) {
    return { value: node.name, slot: "contextual" };
  }
  return (isSpreadAssignment(node) || isJsxSpreadAttribute(node)) && (isObjectLiteralExpression(node.parent) || isJsxAttributes(node.parent))
    ? { value: node.expression, slot: "holder", holder: node.parent }
    : undefined;
}

const isTvCallee = (callee: Node): boolean => (isIdentifier(callee) && callee.text === TV) || (isPropertyAccessExpression(callee) && callee.name.text === TV);

// A value position that hands the name on: not `new X`, `X.member`, a member name, a heritage clause or its own name.
function handsOn(name: Node): boolean {
  const { parent } = name;
  if ((isNewExpression(parent) && sameNode(parent.expression, name)) || isPropertyAccessExpression(parent) || isExpressionWithTypeArguments(parent)) {
    return false;
  }
  return !sameNode(unitName(parent), name);
}

// A variable's name text, or its first destructured binding's.
function bindingText(name: Node): string {
  if (isIdentifier(name)) {
    return name.text;
  }
  const [first] = isObjectBindingPattern(name) || isArrayBindingPattern(name) ? name.elements : [];
  return first !== undefined && isBindingElement(first) && first.name !== undefined ? bindingText(first.name) : "";
}

// The property a destructuring element reads, when it names one.
function bindingKey(element: BindingElement): readonly string[] {
  const named = element.propertyName ?? element.name;
  return named !== undefined && isIdentifier(named) ? [named.text] : [];
}
