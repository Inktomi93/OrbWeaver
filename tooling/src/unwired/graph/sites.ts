// The syntactic half of the graph's walk: one pass over a file collects every site a later checker pass resolves (names,
// literal keys, hand-offs, flow sites, keyed reads, variant tables, JSX attributes, module specifiers, classes, doc
// names), the declarations it meets and the edges syntax alone decides. No checker call happens here.
//
// - A Drizzle write hands each stored value to its column (../boundaries.ts storeWritesAt, and insertSelectWritesAt for
//   an insert-select's field object): a read it copies into a key
//   gets no role and the stored value is not handed whole, so build.ts flows each member into its column instead. A
//   property read inside a table definition defines an index or a foreign key and reads no stored value.
import type {
  AsExpression,
  BindingElement,
  CallExpression,
  ClassDeclaration,
  EnumDeclaration,
  EnumMember,
  Expression,
  ExpressionWithTypeArguments,
  FunctionDeclaration,
  GetAccessorDeclaration,
  ImportDeclaration,
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
  ParameterDeclaration,
  PropertyAccessExpression,
  PropertyAssignment,
  PropertyDeclaration,
  PropertySignatureDeclaration,
  SetAccessorDeclaration,
  ShorthandPropertyAssignment,
  SourceFile,
  StringLiteral,
  TemplateExpression,
  TypeAliasDeclaration,
  TypeAssertion,
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
  isArrayTypeNode,
  isArrowFunction,
  isAsExpression,
  isAwaitExpression,
  isBinaryExpression,
  isBindingElement,
  isBlock,
  isCallExpression,
  isCatchClause,
  isClassDeclaration,
  isClassExpression,
  isComputedPropertyName,
  isConditionalExpression,
  isConditionalTypeNode,
  isConstructorDeclaration,
  isElementAccessExpression,
  isEnumDeclaration,
  isEnumMember,
  isExportDeclaration,
  isExportSpecifier,
  isExpressionWithTypeArguments,
  isExternalModuleReference,
  isForInStatement,
  isForOfStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionLikeDeclaration,
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
  isModuleBlock,
  isModuleDeclaration,
  isNamedImports,
  isNamespaceExport,
  isNamespaceImport,
  isNewExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isOmittedExpression,
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
  isTupleTypeNode,
  isTypeAliasDeclaration,
  isTypeAssertion,
  isTypeLiteralNode,
  isTypeOperatorNode,
  isTypeParameterDeclaration,
  isTypePredicateNode,
  isTypeQueryNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  ModifierFlags,
  NodeFlags,
  SyntaxKind,
} from "@typescript/native/ast";
import { editorLineOf } from "../../floor/typescript/editor-lines.ts";
import type { StoreWrite } from "../boundaries.ts";
import { copiedReads, insertSelectWritesAt, storeWritesAt } from "../boundaries.ts";
import { isParseCall } from "../handoffs.ts";
import { hasFlag } from "../native.ts";
import type { LibraryNames } from "./library-names.ts";
import {
  CREATE_REQUIRE,
  GLOBAL_OBJECTS,
  HONO_PACKAGE,
  INSPECT_CUSTOM,
  PAGED_QUERY,
  PLATFORM,
  REFLECTIVE_CALLS,
  ROUTE_METHODS,
  TRPC_QUERY,
  TV,
  URL_CONSTRUCTOR,
  WELL_KNOWN_SYMBOLS,
  ZOD_EXTENDERS,
  ZOD_LAZY,
  ZOD_OBJECT_BUILDERS,
  ZOD_OPTIONAL,
  ZOD_PACKAGE,
  ZOD_TYPE,
  ZOD_UNION_BUILDERS,
} from "./library-names.ts";
import type { DeclKey } from "./resolve.ts";
import { keyText, unparenType, unwrapExpression } from "./resolve.ts";
import type { Role } from "./roles.ts";
import { accessRoles, inAssignmentPattern, referenceRoles, sameNode, typeQueryRoles } from "./roles.ts";

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

/** The file a module node names. */
export const moduleFile = (key: ModuleKey): string => key.slice(MODULE_PREFIX.length);

/** Whether a graph node is a declaration, not a module. */
export const isDeclKey = (key: GraphKey): key is DeclKey => !key.startsWith(MODULE_PREFIX);

// Why a member is judged by nothing: `x?: never` closes a union arm against a sibling's field, a member of a type
// literal that only types a `satisfies` clause checks a value's shape, and a member keyed by a `declare const` unique
// symbol brands a type with a key no value has at run time. None holds data.
const SHAPE_ONLY = ["exclusion-marker", "satisfies-check", "brand-marker"] as const;
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
  /** A variable whose initializer runs a call, a construction or an await when its module loads. */
  readonly effect: boolean;
  readonly shapeOnly: ShapeOnly | null;
  /** A `?` member, or a schema key whose builder chain makes it optional or defaulted: a reader may see its default. */
  readonly optional: boolean;
  /** A key of a zod object schema's shape literal: it declares a member of the parsed value, and the literal writes none. */
  readonly schemaKey: boolean;
  /** A schema key's path between its holder and its shape literal, through object keys that declare nothing: the
   *  `applyAsCopy` of `router({ applyAsCopy: procedure.input(z.object({ name })) })`, so its home reads as the fields
   *  scan's `router.applyAsCopy`. */
  readonly via: readonly string[];
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

/** The name a declaration-like node declares: a unit's, a binding's, a parameter's or a literal key's, a shorthand
 *  key's included. A shorthand's name also reads the binding it names, so {@link declaresName} leaves it out. */
export const declarationNameOf = (node: Node): Node | undefined =>
  unitName(node) ?? namingName(node) ?? (isShorthandPropertyAssignment(node) ? node.name : undefined);

/** The declaration kinds of a member: what a type, a class or an enum holds. A zod shape key is a member too, marked
 *  {@link DeclInfo.schemaKey}, since its kind is every literal key's. */
export const MEMBER_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.PropertySignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.EnumMember,
]);

/** The name a declaration without one is labelled with. */
export const UNNAMED = "{…}";

// TypeScript's convention, kept by noUnusedLocals and Biome's noUnusedVariables: a leading underscore marks a binding
// never read on purpose (a compile-time pin, a disposal held by `using`).
const UNREAD_ON_PURPOSE = /^_/u;
const THIS_PARAMETER = "this";

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
  if (isPhantomKey(node)) {
    return "brand-marker";
  }
  return typesOnlyASatisfies(node) ? "satisfies-check" : null;
}

// `readonly [brand]: B` beside `declare const brand: unique symbol` in the same file: the key exists only in the type.
function isPhantomKey(node: PropertySignatureDeclaration): boolean {
  const { name } = node;
  if (!(isComputedPropertyName(name) && isIdentifier(name.expression))) {
    return false;
  }
  const key = name.expression.text;
  return node
    .getSourceFile()
    .statements.some(
      (statement) =>
        isVariableStatement(statement) &&
        (statement.modifiers ?? []).some(({ kind }) => kind === SyntaxKind.DeclareKeyword) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            isIdentifier(declaration.name) &&
            declaration.name.text === key &&
            declaration.type !== undefined &&
            isTypeOperatorNode(declaration.type) &&
            declaration.type.operator === SyntaxKind.UniqueKeyword,
        ),
    );
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
  /** The name a declaration, binding, parameter or import introduces: it uses nothing. */
  readonly declares: boolean;
}

/** What a binding is: the kinds binding-unread names. */
const BINDING_KINDS = ["local", "parameter", "import"] as const;
type BindingKind = (typeof BINDING_KINDS)[number];

/** A local binding, parameter or import binding, by the key its references resolve to. */
export interface LocalBinding {
  readonly key: DeclKey;
  /** The declaration the binding sits in, or its module. */
  readonly holder: GraphKey;
  readonly name: string;
  readonly kind: BindingKind;
  readonly line: number;
}

/** A property an object literal writes: the literal, the key's text, where the key sits and the value written, if any. A
 *  zod shape literal's keys, a twinned `extend` literal's too, name the parsed value's members and write nothing. */
export interface LiteralProperty {
  readonly literal: ObjectLiteralExpression;
  readonly property: PropertyAssignment | ShorthandPropertyAssignment | MethodDeclaration | GetAccessorDeclaration | SetAccessorDeclaration;
  readonly name: string;
  readonly at: number;
  readonly value: Node | undefined;
  readonly schema: boolean;
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

/** A call, a construction or a generic type reference with explicit type arguments. */
export interface TypeArgumentSite {
  readonly call: CallExpression | NewExpression | TypeReferenceNode;
  readonly arguments: readonly TypeNode[];
}

/** `x[k]`: the receiver, the literal keys `k` can be (null for a computed key) and the key's expression. */
export interface ElementKey {
  readonly receiver: Node;
  readonly keys: readonly string[] | null;
  readonly argument: Node;
}

/** An `x[k]` access with the roles its position gives (roles.ts accessRoles): a store, a bump, a delete or a read. */
export interface KeyedAccess extends ElementKey {
  readonly roles: readonly Role[];
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
  /** The position of the string that holds the script. */
  readonly at: number;
}

/** Everything one file's walk collected. */
export class FileSites {
  readonly file: string;
  readonly product: boolean;
  readonly names: NameSite[] = [];
  /** The file's local bindings, parameters and import bindings: what binding-unread judges. */
  readonly bindings: LocalBinding[] = [];
  /** The local names the file's own export specifiers forward (`export { a, b as c }`). */
  readonly exportedLocals = new Set<string>();
  readonly literalProperties: LiteralProperty[] = [];
  /** The Drizzle writes by their syntax: each stored value and the table it lands in; build.ts confirms each by its
   *  declaration. */
  readonly stores: StoreWrite[] = [];
  /** The type names a production parameter is annotated with: a home whose optional members a caller may leave unset. */
  readonly parameterTypes: Node[] = [];
  readonly hookTuples: { readonly call: CallExpression; readonly elements: readonly Node[] }[] = [];
  /** Each `satisfies X<T>` over a schema expression: the build keeps those whose `type` names zod's `ZodType`. */
  readonly zodTwins: { readonly type: Node; readonly shape: TypeNode; readonly keys: readonly { readonly name: string; readonly decl: DeclKey }[] }[] = [];
  /** Each schema expression checked against `X<T>` (a `satisfies`, an annotated binding, a declared return): the build
   *  keeps those whose `type` names zod's `ZodType` and twins the schema's output with T at every depth. */
  readonly zodChecks: { readonly type: Node; readonly shape: TypeNode; readonly schema: Node }[] = [];
  readonly handedWhole: HandedWhole[] = [];
  readonly globalAssigns: { readonly target: Node; readonly value: Expression }[] = [];
  readonly flowSites: FlowSite[] = [];
  readonly pickKeys: { readonly target: TypeNode; readonly keys: readonly string[] }[] = [];
  readonly indexedKeys: IndexedKey[] = [];
  readonly elementKeys: KeyedAccess[] = [];
  /** `row["k"]`: a literal key the resolver places like a name; keys.ts also reads it through a string-indexed type a
   *  typed value was handed into. */
  readonly literalKeyReads: KeyedAccess[] = [];
  /** The values a reflective call or a `for…in` loop takes every member of: `Object.entries(x)` and `structuredClone(x)`
   *  read each value, `Object.keys(x)` and a loop list each key; the callee, which keys.ts confirms is the platform's,
   *  or null for a loop. */
  readonly reflectiveReads: { readonly value: Expression; readonly callee: Expression | null; readonly role: ReflectiveRole }[] = [];
  /** `"k" in x`: a key test touches the member it names without reading its value. */
  readonly keyTests: ElementKey[] = [];
  /** Members a lib arm selector's pattern names: `Extract<T, { k: … }>`. */
  readonly armSelectorMembers: { readonly key: DeclKey; readonly at: number }[] = [];
  readonly tvCalls: CallExpression[] = [];
  readonly jsxAttributes: { readonly attributes: JsxAttributes; readonly name: string; readonly value: Node | undefined }[] = [];
  readonly specifiers: { readonly node: StringLiteral | NoSubstitutionTemplateLiteral; readonly from: GraphKey; readonly inType: boolean }[] = [];
  readonly urlModules: { readonly target: string; readonly from: GraphKey }[] = [];
  /** A file a createRequire function loads by its literal relative path: it runs as an import's module does. */
  readonly requiredModules: { readonly target: string; readonly from: GraphKey }[] = [];
  /** Calls and constructions with explicit type arguments: constraints.ts keys what each argument's constraint names. */
  readonly typeArguments: TypeArgumentSite[] = [];
  /** Calls inside a generic function, which may hand its type parameters to another generic's. */
  readonly genericCalls: CallExpression[] = [];
  /** Product calls with arguments and no explicit type arguments: constraints.ts pairs each value a generic callee's
   *  type parameter is inferred from with that parameter's constraint. */
  readonly inferredCalls: CallExpression[] = [];
  /** String literal arguments, which name a member where the parameter is `keyof` a type. */
  readonly keyArguments: Expression[] = [];
  /** A method call's template first argument, which a form write method takes as a field path. */
  readonly templatePaths: TemplateExpression[] = [];
  /** A returned key literal, or a conditional of them, with its function's declared return type. */
  readonly keyReturns: { readonly value: Expression; readonly type: TypeNode }[] = [];
  /** Declarations whose declared type fills another's: an overload's parameter fills its implementation's. */
  readonly typePairs: { readonly value: Node; readonly slot: Node }[] = [];
  /** The input of each `procedure.infiniteQueryOptions(input, …)` call, with the verb's position: TanStack Query fills
   *  the input's cursor from `getNextPageParam` on every page, so the call writes that member though no caller names it. */
  readonly pagedQueries: { readonly input: Expression; readonly at: number }[] = [];
  /** `value satisfies T` over a binding or a literal: the value fills `T`, and a read of its members reads `T`'s. A zod
   *  schema, a builder call, twins through build.ts `#zodTwins` instead. */
  readonly checkedValues: { readonly value: Expression; readonly type: TypeNode }[] = [];
  /** Product `x as T` and `<T>x` assertions: the operand is handed to the asserted type (flows.ts `#assertions`). */
  readonly assertions: (AsExpression | TypeAssertion)[] = [];
  /** `import(x)` or a createRequire function's call whose argument is not a literal path: a load no edge follows. */
  readonly computedLoads: CallExpression[] = [];
  /** Calls of a method a Hono app registers routes with; routes.ts confirms each by its declaration. */
  readonly routeCalls: CallExpression[] = [];
  readonly shorthands: { readonly node: ShorthandPropertyAssignment; readonly from: GraphKey }[] = [];
  /** Destructuring patterns, a declaration's or an assignment's, with the route to the type their keys read. */
  readonly patterns: ({
    readonly pattern: ObjectBindingPattern | ObjectLiteralExpression;
    readonly names: readonly string[];
    readonly from: GraphKey;
  } & PatternRoute)[] = [];
  readonly classes: ClassFacts[] = [];
  /** Interfaces with an `extends` clause: a member that redeclares an extended type's member is one field with it. */
  readonly extendingInterfaces: InterfaceDeclaration[] = [];
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
  /** Schema parse calls by their syntax; build.ts confirms each is zod's. */
  readonly parses: CallExpression[] = [];

  readonly #source: SourceFile;

  constructor(source: SourceFile, file: string, product: boolean) {
    this.#source = source;
    this.file = file;
    this.product = product;
  }

  /** The 1-based line a node's own text starts on. */
  lineOf(node: Node): number {
    return editorLineOf(this.#source, node.getStart(this.#source));
  }
}

/** A union's string-literal members, sorted; null when any member is something else. */
function stringLiteralTypes(node: UnionTypeNode): readonly string[] | null {
  const members = node.types.map((member) => (isLiteralTypeNode(member) && isStringLiteral(member.literal) ? member.literal.text : null));
  return members.every((member) => member !== null) ? members.toSorted() : null;
}

const CONST_ASSERTION = "const";

// `x as const` narrows a literal's type; it hands the value to no other type.
const isConstAssertion = (node: AsExpression | TypeAssertion): boolean => isTypeReferenceNode(node.type) && referenceName(node.type) === CONST_ASSERTION;

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
  /** Whether a node is a Drizzle table definition, by the checker's type of the call (../drizzle-rows.ts). */
  readonly isTable: (node: Node) => boolean;
  /** The world's library names, settled before the walk (./library-names.ts). */
  readonly names: LibraryNames;
}

const CSS_NAME = /^--[\w-]+$/u;
// The tRPC options-proxy verb for a paged query.
/** The input member a paged query's pages fill. */
export const PAGE_CURSOR = "cursor";
// Members the runtime calls by name: JSON.stringify's `toJSON`, coercion's `toString` and `valueOf`, `await`'s `then`.
const RUNTIME_PROTOCOL_NAMES: ReadonlySet<string> = new Set(["toJSON", "toString", "valueOf", "then"]);
const ARM_SELECTORS: ReadonlySet<string> = new Set(["Extract", "Exclude"]);
const MEMBER_SELECTORS: ReadonlySet<string> = new Set(["Pick", "Omit"]);
/** How a reflective use takes each member: `read` takes its value, `key` only its name, as an `in` test does. */
type ReflectiveRole = Extract<Role, "read" | "key">;
// The platform call that takes every member of its arguments (library-names.ts REFLECTIVE_CALLS), by its callee's name.
function reflectiveRole(callee: Node, names: LibraryNames): ReflectiveRole | undefined {
  const name = isPropertyAccessExpression(callee) ? callee.name : callee;
  const role = isIdentifier(name) ? REFLECTIVE_CALLS.get(name.text) : undefined;
  return role !== undefined && names.declaredBy(name, PLATFORM) ? role : undefined;
}
// The name a call's callee ends in, when it is one of zod's: `zod.object` and `z.object` alike.
const zodCallee = (
  call: Node,
  builders: ReadonlySet<string>,
  names: LibraryNames,
): call is CallExpression & { readonly expression: PropertyAccessExpression } =>
  isCallExpression(call) &&
  isPropertyAccessExpression(call.expression) &&
  builders.has(call.expression.name.text) &&
  names.declaredBy(call.expression.name, ZOD_PACKAGE);
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

// A pattern literal's members, a nested literal's too: `{ _: { name: infer N } }` matches by every key it spells.
function patternMembers(node: TypeNode): readonly PropertySignatureDeclaration[] {
  return typeLiteralsIn(node).flatMap(({ members }) =>
    members.filter(isPropertySignatureDeclaration).flatMap((member) => [member, ...patternMembers(member.type)]),
  );
}

// The type literals a type argument spells, through unions, intersections, tuples, lists and parentheses.
function typeLiteralsIn(node: TypeNode): readonly TypeLiteralNode[] {
  if (isTypeLiteralNode(node)) {
    return [node];
  }
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
    return node.types.flatMap(typeLiteralsIn);
  }
  if (isTupleTypeNode(node)) {
    return node.elements.flatMap(typeLiteralsIn);
  }
  if (isArrayTypeNode(node)) {
    return typeLiteralsIn(node.elementType);
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

// A schema expression checked against a type: `schema satisfies z.ZodType<T>`, `const schema: z.ZodType<T> = …`, or a
// value returned where the function declares `z.ZodType<T>`.
function checkedSchema(node: Node, names: LibraryNames): { readonly schema: Node; readonly type: TypeReferenceNode } | undefined {
  if (isSatisfiesExpression(node) && isTypeReferenceNode(node.type)) {
    return { schema: node.expression, type: node.type };
  }
  if (isVariableDeclaration(node) && node.type !== undefined && isTypeReferenceNode(node.type) && node.initializer !== undefined) {
    return { schema: node.initializer, type: node.type };
  }
  const returned = returnedValue(node);
  if (returned === undefined) {
    return undefined;
  }
  const declared = isArrowFunction(node) ? node.type : declaredReturnType(node);
  // a return is checked against every declared return type, so only one spelled `ZodType` is asked of the checker
  return declared !== undefined && isTypeReferenceNode(declared) && isZodType(declared, names) ? { schema: returned, type: declared } : undefined;
}

const referenceNameNode = (node: TypeReferenceNode): Node => (isQualifiedName(node.typeName) ? node.typeName.right : node.typeName);

const isZodType = (node: TypeReferenceNode, names: LibraryNames): boolean =>
  referenceName(node) === ZOD_TYPE && names.declaredBy(referenceNameNode(node), ZOD_PACKAGE);

// The schemas a zod builder wraps whole: each arm of `z.union([…])`, or the schema `z.lazy(() => schema)` returns;
// undefined for any other call.
function zodWrappedSchemas(call: CallExpression, names: LibraryNames): readonly Node[] | undefined {
  if (zodCallee(call, ZOD_UNION_BUILDERS, names)) {
    return call.arguments.find(isArrayLiteralExpression)?.elements ?? [];
  }
  const [made] = call.arguments;
  return zodCallee(call, ZOD_LAZY_BUILDER, names) && made !== undefined && isArrowFunction(made) && !isBlock(made.body) ? [made.body] : undefined;
}

const ZOD_LAZY_BUILDER: ReadonlySet<string> = new Set([ZOD_LAZY]);

// Every object shape a zod schema expression spells: one `z.object` literal, each arm of an inline union, each
// `base.extend({ … })` literal along the chain (the base keeps its own twin through its own `satisfies`), and the
// schema a `z.lazy(() => schema)` arrow returns.
function zodShapesOf(expression: Node, names: LibraryNames): readonly ObjectLiteralExpression[] {
  const one = zodShapeOf(expression, names);
  if (one !== undefined) {
    return [one];
  }
  const shapes: ObjectLiteralExpression[] = [];
  for (let at: Node | undefined = unwrapExpression(expression); at !== undefined && isCallExpression(at); ) {
    const callee = at.expression;
    if (!isPropertyAccessExpression(callee)) {
      return shapes;
    }
    const wrapped = zodWrappedSchemas(at, names);
    if (wrapped !== undefined) {
      return [...shapes, ...wrapped.flatMap((schema) => zodShapesOf(schema, names))];
    }
    const [added] = at.arguments;
    if (zodCallee(at, ZOD_EXTENDERS, names) && added !== undefined && isObjectLiteralExpression(added)) {
      shapes.push(added);
    }
    const inner = zodShapeOf(callee.expression, names);
    if (inner !== undefined) {
      return [...shapes, inner];
    }
    at = unwrapExpression(callee.expression);
  }
  return shapes;
}

// `z.object({ … })`: the literal a zod object builder takes as its shape. An `extend` literal is left out: its callee is
// any value's method, and the base's own keys are declared at the base.
const spanOf = (node: Node): string => `${String(node.pos)}:${String(node.end)}`;

/** Whether a declaration is a key of a zod shape literal: the declaration of a field the schema parses. */
export const isZodShapeKey = (node: Node, names: LibraryNames): node is PropertyAssignment | ShorthandPropertyAssignment =>
  (isPropertyAssignment(node) || isShorthandPropertyAssignment(node)) && isObjectLiteralExpression(node.parent) && isZodShape(node.parent, names);

// The names of the object keys a shape literal sits under, outermost first, up to its binding or to the schema key that
// holds it: each declares nothing, so the holder chain alone leaves it out of the home.
function schemaKeyPath(literal: Node, names: LibraryNames): readonly string[] {
  const path: string[] = [];
  for (let at: Node = literal.parent; !(isSourceFile(at) || isVariableDeclaration(at) || isZodShapeKey(at, names)); at = at.parent) {
    if (isPropertyAssignment(at) && isIdentifier(at.name)) {
      path.unshift(at.name.text);
    }
  }
  return path;
}

function isZodShape(literal: ObjectLiteralExpression, names: LibraryNames): boolean {
  const call = literal.parent;
  return zodCallee(call, ZOD_OBJECT_BUILDERS, names) && sameNode(call.arguments[0], literal);
}

// `z.string().optional()`: a builder method that makes a key optional or defaulted, anywhere on its initializer's chain.
function isOptionalSchema(node: Node, names: LibraryNames): boolean {
  for (let at: Node | undefined = unwrapExpression(node); at !== undefined && isCallExpression(at) && isPropertyAccessExpression(at.expression); ) {
    if (zodCallee(at, ZOD_OPTIONAL, names)) {
      return true;
    }
    at = unwrapExpression(at.expression.expression);
  }
  return false;
}

function zodShapeOf(expression: Node, names: LibraryNames): ObjectLiteralExpression | undefined {
  for (let at: Node | undefined = unwrapExpression(expression); at !== undefined && isCallExpression(at); ) {
    const callee = at.expression;
    const [shape] = at.arguments;
    if (zodCallee(at, ZOD_OBJECT_BUILDERS, names) && shape !== undefined && isObjectLiteralExpression(shape)) {
      return shape;
    }
    at = isPropertyAccessExpression(callee) ? unwrapExpression(callee.expression) : undefined;
  }
  return undefined;
}

// `window.X.a.b` / `globalThis.X.a` in a string: the global, the member chain, and whether a computed key follows it.
/** The global objects a published global is read off: `window.__orb`, `globalThis.__orb`, `self.__orb`. */
const GLOBAL_READ = new RegExp(`\\b(?:${GLOBAL_OBJECTS.join("|")})\\.([A-Za-z_$][\\w$]*)((?:\\??\\.[A-Za-z_$][\\w$]*)*)(\\??\\.\\$\\{|\\[)?`, "gu");
// `const nav = window.__orb && window.__orb.nav;` names an alias the rest of the script reads through.
const GLOBAL_ALIAS =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[^;\n]*?(?:&&|\?\?|\|\|)\s*)?(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)((?:\??\.[A-Za-z_$][\w$]*)*)/gu;
const MEMBER_STEP = /\??\./u;

const chainOf = (text: string | undefined): readonly string[] => (text ?? "").split(MEMBER_STEP).filter((step) => step !== "");
const escapeName = (name: string): string => name.replaceAll("$", "\\$");

// The published globals a script's text reads by name, with each read's member chain.
function scriptGlobalReads(text: string, at: number): readonly ScriptGlobalRead[] {
  if (!text.includes(".")) {
    return [];
  }
  const out: ScriptGlobalRead[] = [...text.matchAll(GLOBAL_READ)].map((match) => ({
    global: match[1] ?? "",
    chain: chainOf(match[2]),
    dynamic: match[3] !== undefined,
    at,
  }));
  for (const alias of text.matchAll(GLOBAL_ALIAS)) {
    const name = escapeName(alias[1] ?? "");
    const base = { global: alias[2] ?? "", chain: chainOf(alias[3]), at };
    const via = new RegExp(`\\b${name}((?:\\??\\.[A-Za-z_$][\\w$]*)+)(\\??\\.\\$\\{|\\[)?`, "gu");
    for (const read of text.slice(alias.index + alias[0].length).matchAll(via)) {
      out.push({ ...base, chain: [...base.chain, ...chainOf(read[1])], dynamic: read[2] !== undefined });
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
  /** The file's names for node:module's createRequire. */
  readonly createRequire: Set<string>;
  /** The file's bindings that hold a require function createRequire made. */
  readonly requires: Set<string>;
  /** The spans of the shape literals a `satisfies z.ZodType<T>` chain spells, its `extend` literals among them. */
  readonly twinShapes: Set<string>;
  /** How many generic functions enclose the walk. */
  generic: number;
  /** The property names a Drizzle write copies into a column, and the arguments a Drizzle write stores. */
  readonly copied: Set<Node>;
  readonly stored: Set<Node>;
  /** How many Drizzle table definitions enclose the walk. */
  tables: number;
}

/** Walk one file: every site its checker passes need, with the declarations and syntax-decided edges told to `sink`. */
export function collectSites(source: SourceFile, file: string, product: boolean, sink: WalkSink): FileSites {
  const sites = new FileSites(source, file, product);
  const frame: Frame = {
    stack: [moduleKey(file)],
    literals: [],
    classes: [],
    createRequire: new Set(),
    requires: new Set(),
    twinShapes: new Set(),
    generic: 0,
    copied: new Set(),
    stored: new Set(),
    tables: 0,
  };
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
    this.#binding(node);
    const pushed = this.#declaration(node) || this.#schemaKey(node);
    this.#parameterType(node);
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
    if (isImportDeclaration(node)) {
      this.#moduleImport(node);
    }
    this.#callSites(node);
    const inType = typePosition || isTypePosition(node);
    this.#name(node, inType);
    this.#keyed(node, inType);
    this.#values(node, inType);
    this.#types(node);
    this.#strings(node, inType);
    this.#spellings(node);
    this.#children(node, inType);
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

  // The children, counting the generic functions and the Drizzle table definitions that enclose them.
  #children(node: Node, inType: boolean): void {
    const generic = isFunctionLikeDeclaration(node) && (node.typeParameters?.length ?? 0) > 0 ? 1 : 0;
    const table = this.#sink.isTable(node) ? 1 : 0;
    this.#frame.generic += generic;
    this.#frame.tables += table;
    node.forEachChild((child) => this.visit(child, inType));
    this.#frame.generic -= generic;
    this.#frame.tables -= table;
  }

  // Sites a call or a callee decides: an implementation's overloads, type arguments and literal keys, a generic
  // hand-off, a module load and a route registration.
  #callSites(node: Node): void {
    if ((isFunctionDeclaration(node) || isMethodDeclaration(node)) && node.body !== undefined) {
      this.#overloads(node);
    }
    if ((isCallExpression(node) || isNewExpression(node)) && node.typeArguments !== undefined && node.typeArguments.length > 0) {
      this.#sites.typeArguments.push({ call: node, arguments: node.typeArguments });
    }
    if (!isCallExpression(node)) {
      return;
    }
    this.#sites.keyArguments.push(...node.arguments.filter((argument) => isStringLiteral(argument) || isNoSubstitutionTemplateLiteral(argument)));
    const [first] = node.arguments;
    if (first !== undefined && isTemplateExpression(first) && isPropertyAccessExpression(node.expression)) {
      this.#sites.templatePaths.push(first);
    }
    if (isParseCall(node)) {
      this.#sites.parses.push(node);
    }
    if (this.#frame.generic > 0) {
      this.#sites.genericCalls.push(node);
    }
    if (this.#sites.product && node.typeArguments === undefined && node.arguments.length > 0) {
      this.#sites.inferredCalls.push(node);
    }
    this.#moduleLoad(node);
    this.#stores(node);
    if (
      isPropertyAccessExpression(node.expression) &&
      ROUTE_METHODS.has(node.expression.name.text) &&
      this.#sink.names.declaredBy(node.expression.name, HONO_PACKAGE)
    ) {
      this.#sites.routeCalls.push(node);
    }
  }

  // A caller of an overload writes into the implementation's parameters through it: each overload's parameter fills
  // the implementation's at the same index.
  #overloads(implementation: FunctionDeclaration | MethodDeclaration): void {
    const name = keyText(implementation.name);
    const overloads = siblingsOf(implementation).filter(
      (sibling): sibling is FunctionDeclaration | MethodDeclaration =>
        (isFunctionDeclaration(sibling) || isMethodDeclaration(sibling)) && sibling.body === undefined && name !== undefined && keyText(sibling.name) === name,
    );
    for (const overload of overloads) {
      for (const [at, parameter] of overload.parameters.entries()) {
        const target = implementation.parameters[at];
        if (target !== undefined) {
          this.#sites.typePairs.push({ value: parameter, slot: target });
        }
      }
    }
  }

  // A type literal that matches another type by shape keys that type's members: the extends pattern of a conditional
  // (`T extends { default: infer C } ? C : T`), and a literal intersected with a union to select its arm
  // (`Message & { subtype: "a" }`). The pattern's own members are key uses too: deleting one changes the match.
  #typePatterns(node: Node): void {
    const pairs: { readonly target: TypeNode; readonly pattern: TypeNode }[] = [];
    if (isConditionalTypeNode(node)) {
      pairs.push({ target: node.checkType, pattern: unparenType(node.extendsType) });
    }
    if (isIntersectionTypeNode(node)) {
      const literals = node.types.filter((type) => isTypeLiteralNode(unparenType(type)));
      for (const target of node.types.filter((type) => !isTypeLiteralNode(unparenType(type)))) {
        pairs.push(...literals.map((pattern) => ({ target, pattern: unparenType(pattern) })));
      }
    }
    // a type predicate's literal is matched against the parameter it narrows (`decl is { none: string }`): its members
    // key, while the parameter's own members stay as they are, since a wider parameter still admits the predicate
    if (isTypePredicateNode(node) && node.type !== undefined) {
      this.#keyMembers(patternMembers(unparenType(node.type)));
    }
    for (const { target, pattern } of pairs) {
      // a wrapped pattern (`[T] extends [{ b: string }]`) still matches by the keys its literals spell
      if (!isTypeLiteralNode(pattern)) {
        this.#keyMembers(patternMembers(pattern));
        continue;
      }
      const keys = pattern.members.flatMap((member) => {
        const name = keyText(unitName(member));
        return name === undefined ? [] : [name];
      });
      this.#sites.pickKeys.push({ target, keys });
      // a nested literal matches by its own keys: `{ _: { name: infer N } }` keys `name` as well as `_`
      this.#keyMembers([...pattern.members.filter((element) => !isPropertySignatureDeclaration(element)), ...patternMembers(pattern)]);
    }
  }

  // Each pattern member is a key use where it is declared.
  #keyMembers(members: readonly Node[]): void {
    for (const member of members) {
      this.#sink.role(this.#sink.keyOf(member), "key", this.#sites.file, member.pos);
    }
  }

  // A module loaded by a call: `import(x)`, or a require function node:module's createRequire makes. A literal relative
  // path loads that file as the import does; any other argument is a load the graph cannot follow, reported with its site.
  #moduleLoad(node: CallExpression): void {
    if (isImportDeclarationCall(node)) {
      const [specifier] = node.arguments;
      if (specifier !== undefined && !isStringLiteral(specifier) && !isNoSubstitutionTemplateLiteral(specifier)) {
        this.#sites.computedLoads.push(node);
      }
      return;
    }
    const { expression } = node;
    const makesRequire = (at: Node): boolean => isCallExpression(at) && this.#isCreateRequire(at.expression);
    if (this.#isCreateRequire(expression) && isVariableDeclaration(node.parent) && isIdentifier(node.parent.name)) {
      this.#frame.requires.add(node.parent.name.text);
      return;
    }
    if (!(makesRequire(expression) || (isIdentifier(expression) && this.#frame.requires.has(expression.text)))) {
      return;
    }
    const [specifier] = node.arguments;
    const literal = specifier !== undefined && (isStringLiteral(specifier) || isNoSubstitutionTemplateLiteral(specifier)) ? specifier.text : null;
    const target = literal?.startsWith(".") === true ? this.#sink.urlModule(this.#sites.file, literal) : null;
    if (target !== null) {
      this.#sites.requiredModules.push({ target, from: this.#holder });
    } else if (literal === null) {
      this.#sites.computedLoads.push(node);
    }
  }

  // An imported name that resolves to node:module's createRequire is it whatever the file calls it.
  #moduleImport(node: ImportDeclaration): void {
    const bindings = node.importClause?.namedBindings;
    for (const element of bindings !== undefined && isNamedImports(bindings) ? bindings.elements : []) {
      const imported = element.propertyName ?? element.name;
      if (imported.text === CREATE_REQUIRE && this.#sink.names.declaredBy(imported, PLATFORM)) {
        this.#frame.createRequire.add(element.name.text);
      }
    }
  }

  #isCreateRequire(callee: Node): boolean {
    if (isIdentifier(callee)) {
      return this.#frame.createRequire.has(callee.text);
    }
    return isPropertyAccessExpression(callee) && callee.name.text === CREATE_REQUIRE && this.#sink.names.declaredBy(callee.name, PLATFORM);
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
    const line = editorLineOf(this.#source, name.getStart(this.#source));
    this.#sink.declare(key, {
      file: this.#sites.file,
      kind: node.kind,
      name: keyText(name) ?? computedText(name) ?? UNNAMED,
      holder,
      surfacePath: surfacePathOf(node),
      top,
      line,
      effect: isVariableDeclaration(node) && runsOnLoad(node.initializer),
      shapeOnly: shapeOnlyOf(node),
      via: [],
      optional: (isPropertySignatureDeclaration(node) || isPropertyDeclaration(node)) && node.postfixToken?.kind === SyntaxKind.QuestionToken,
      schemaKey: false,
      docTags: [],
    });
    if (hasJsDoc(node) && (top || isClassDeclaration(node.parent))) {
      this.#sites.tagged.push(node);
    }
    this.#declarationEdges(node, key, top);
    this.#member(node, key);
    this.#heritage(node, key);
    // a class field's initializer runs when the class is constructed, not when the field is read: its uses are the class's
    if (isPropertyDeclaration(node) && isClassDeclaration(node.parent)) {
      return false;
    }
    this.#frame.stack.push(key);
    return true;
  }

  // A key of a zod shape literal declares a member of its schema, held by the schema's binding or by the key whose
  // nested schema it sits in, so its home reads `userSchema.inner` as the fields scan spells it.
  #schemaKey(node: Node): boolean {
    if (!isZodShapeKey(node, this.#sink.names)) {
      return false;
    }
    const name = keyText(node.name);
    if (name === undefined) {
      return false;
    }
    const key = this.#sink.keyOf(node);
    const holder = this.#holder;
    this.#sink.declare(key, {
      file: this.#sites.file,
      kind: node.kind,
      name,
      holder,
      surfacePath: "",
      top: false,
      line: editorLineOf(this.#source, node.name.getStart(this.#source)),
      effect: false,
      shapeOnly: null,
      optional: isPropertyAssignment(node) && isOptionalSchema(node.initializer, this.#sink.names),
      schemaKey: true,
      via: schemaKeyPath(node.parent, this.#sink.names),
      docTags: [],
    });
    // a literal key lives with its schema, which runs the key's builder chain; a read of the key keeps the schema too
    this.#sink.edge("run", holder, key);
    this.#sink.edge("run", key, holder);
    this.#frame.stack.push(key);
    return true;
  }

  #parameterType(node: Node): void {
    if (this.#sites.product && isParameterDeclaration(node) && node.type !== undefined && isTypeReferenceNode(node.type)) {
      this.#sites.parameterTypes.push(node.type.typeName);
    }
  }

  // The edges that keep a declaration and its holder alive together, a pin on a binding unread on purpose, and a field
  // initializer's write.
  #declarationEdges(node: UnitDeclaration, key: DeclKey, top: boolean): void {
    const holder = this.#holder;
    // a used declaration keeps what holds it alive
    this.#sink.edge("run", key, holder);
    if (isVariableDeclaration(node) && !top && node.initializer !== undefined) {
      // a local's initializer runs with its holder; an ambient `declare` variable has none to run
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

  // A binding binding-unread judges. Left out, as tsc's noUnusedLocals and noUnusedParameters leave them: a name read
  // never on purpose, a parameter of a signature with no body, a parameter property, `this`, a `using` declaration, a
  // catch binding and an object-pattern element whose rest sibling it is omitted from. A top-level variable is a unit
  // liveness judges.
  #binding(node: Node): void {
    if (isExportSpecifier(node) && !isExportDeclarationWithModule(node)) {
      this.#sites.exportedLocals.add((node.propertyName ?? node.name).text);
      return;
    }
    // tsc judges no binding in an ambient context: a declaration file, `declare module`, `declare global`
    const found = hasFlag(node.flags, NodeFlags.Ambient) ? null : bindingOf(node, this.#frame.stack.length === 1);
    if (found !== null && isIdentifier(found.name) && !UNREAD_ON_PURPOSE.test(found.name.text)) {
      const line = editorLineOf(this.#source, found.name.getStart(this.#source));
      this.#sites.bindings.push({ key: this.#sink.keyOf(node), holder: this.#holder, name: found.name.text, kind: found.kind, line });
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
      if (owner !== undefined && isRuntimeProtocol(node.name, this.#sink.names)) {
        // the runtime calls it by its well-known name: JSON.stringify, coercion, `await`, `using`, for-of
        this.#sink.edge("run", owner.key, key);
        this.#sink.unseenCall(key);
      }
    }
    // a node's parent is a fresh wrapper on every read, so a member finds its literal by the walk's stack
    if ((isMethodDeclaration(node) || isGetAccessorDeclaration(node) || isSetAccessorDeclaration(node)) && isObjectLiteralExpression(node.parent)) {
      this.#frame.literals.at(-1)?.members.set(name, key);
    }
    this.#protocolMember(node, key);
  }

  // A protocol member outside a class: a type's, which `using`, `await` or coercion calls on every value of that
  // type, and a literal's, which carries one without a class's heritage.
  #protocolMember(node: Node, key: DeclKey): void {
    if ((isPropertySignatureDeclaration(node) || isMethodSignatureDeclaration(node)) && isRuntimeProtocol(node.name, this.#sink.names)) {
      this.#sink.unseenCall(key);
    }
    if ((isMethodDeclaration(node) || isPropertyAssignment(node)) && isObjectLiteralExpression(node.parent) && isRuntimeProtocol(node.name, this.#sink.names)) {
      this.#sink.edge("run", this.#holder, key);
      this.#sink.unseenCall(key);
    }
  }

  // A class's heritage, whose members its own may fill, and an interface that extends another type.
  #heritage(node: Node, key: DeclKey): void {
    if (isClassDeclaration(node)) {
      this.#class(node, key);
    }
    if (isInterfaceDeclaration(node) && (node.heritageClauses?.length ?? 0) > 0) {
      this.#sites.extendingInterfaces.push(node);
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
    const schema = isZodShape(node, this.#sink.names) || this.#frame.twinShapes.has(spanOf(node));
    for (const property of node.properties) {
      const name = isSpreadAssignment(property) ? undefined : keyText(property.name);
      if (name === undefined) {
        continue;
      }
      if (isPropertyAssignment(property)) {
        this.#sites.literalProperties.push({ literal: node, property, name, at: property.name.pos, value: property.initializer, schema });
      } else if (isShorthandPropertyAssignment(property)) {
        this.#sites.literalProperties.push({ literal: node, property, name, at: property.name.pos, value: property.name, schema });
      } else if (isMethodDeclaration(property) || isGetAccessorDeclaration(property) || isSetAccessorDeclaration(property)) {
        this.#sites.literalProperties.push({ literal: node, property, name, at: property.name.pos, value: undefined, schema });
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
      const declares = declaresName(node);
      this.#sites.names.push({
        node,
        from: this.#holder,
        inType,
        handed: !inType && handsOn(node),
        roles: declares ? [] : this.#rolesOf(node, inType),
        declares,
      });
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
      this.#sites.names.push({ node, from: this.#holder, inType: false, handed: false, roles: referenceRoles(node), declares: false });
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
      this.#sites.elementKeys.push({
        receiver: node.expression,
        keys: keyLiterals(node.argumentExpression),
        argument: node.argumentExpression,
        roles: accessRoles(node),
      });
    }
    if (isElementAccessExpression(node) && !inType && (isStringLiteral(node.argumentExpression) || isNoSubstitutionTemplateLiteral(node.argumentExpression))) {
      this.#sites.literalKeyReads.push({
        receiver: node.expression,
        keys: [node.argumentExpression.text],
        argument: node.argumentExpression,
        roles: accessRoles(node),
      });
    }
    if (isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.InKeyword && !inType) {
      this.#sites.keyTests.push({ receiver: node.right, keys: keyLiterals(node.left), argument: node.left });
    }
    this.#typePatterns(node);
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
    this.#keyReturn(node);
    this.#pagedQuery(node);
    if (product) {
      this.#flowSite(node);
    }
  }

  // A product value handed into a slot: a typed position, a copy, or a `satisfies` check.
  #flowSite(node: Node): void {
    if (isSatisfiesExpression(node) && isCheckedValue(unwrapExpression(node.expression))) {
      this.#sites.checkedValues.push({ value: node.expression, type: node.type });
    }
    if ((isAsExpression(node) || isTypeAssertion(node)) && !isConstAssertion(node)) {
      this.#sites.assertions.push(node);
    }
    const site = valueFlowSite(node) ?? copyFlowSite(node);
    if (site !== undefined && !this.#frame.stored.has(site.value)) {
      this.#sites.flowSites.push(site);
    }
  }

  // A key literal a function returns, by a `return` or as a concise arrow body: the function's declared return type may
  // be a `keyof` that names a member by it.
  #keyReturn(node: Node): void {
    const returned = returnedValue(node);
    if (returned === undefined || keyLiterals(returned) === null) {
      return;
    }
    const declared = isArrowFunction(node) ? node.type : declaredReturnType(node);
    if (declared !== undefined) {
      this.#sites.keyReturns.push({ value: returned, type: declared });
    }
  }

  // The library calls whose syntax the graph reads: a `tv()` table, a JSX attribute's value, a zod schema's twin keys.
  #pagedQuery(node: Node): void {
    const [input] = isCallExpression(node) ? node.arguments : [];
    if (
      input !== undefined &&
      isCallExpression(node) &&
      isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === PAGED_QUERY &&
      this.#sink.names.declaredBy(node.expression.name, TRPC_QUERY)
    ) {
      this.#sites.pagedQueries.push({ input, at: node.expression.name.pos });
    }
  }

  #libraryShapes(node: Node): void {
    this.#reflective(node);
    if (isCallExpression(node) && isTvCallee(node.expression) && node.arguments[0] !== undefined && isObjectLiteralExpression(node.arguments[0])) {
      this.#sites.tvCalls.push(node);
      this.#sites.tvSpans.push([node.pos, node.end]);
    }
    if (isJsxAttribute(node) && isIdentifier(node.name) && isJsxAttributes(node.parent)) {
      const value = node.initializer !== undefined && isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      this.#sites.jsxAttributes.push({ attributes: node.parent, name: node.name.text, value });
    }
    const checked = checkedSchema(node, this.#sink.names);
    if (checked !== undefined && checked.type.typeArguments?.[0] !== undefined) {
      const [shape] = checked.type.typeArguments;
      const { typeName } = checked.type;
      const type = isQualifiedName(typeName) ? typeName.right : typeName;
      this.#sites.zodChecks.push({ type, shape, schema: checked.schema });
      for (const literal of zodShapesOf(checked.schema, this.#sink.names)) {
        this.#frame.twinShapes.add(spanOf(literal));
        this.#sites.zodTwins.push({ type, shape, keys: literal.properties.flatMap((property) => this.#twinKey(property)) });
      }
    }
  }

  // A call that reads its arguments' members by reflection, and a `for…in` loop over a value.
  #reflective(node: Node): void {
    if (isForInStatement(node)) {
      this.#sites.reflectiveReads.push({ value: node.expression, callee: null, role: "key" });
    }
    const role = isCallExpression(node) ? reflectiveRole(node.expression, this.#sink.names) : undefined;
    if (role !== undefined && isCallExpression(node)) {
      this.#sites.reflectiveReads.push(...node.arguments.map((value) => ({ value, callee: node.expression, role })));
    }
  }

  #twinKey(property: Node): readonly { readonly name: string; readonly decl: DeclKey }[] {
    if (!((isPropertyAssignment(property) || isShorthandPropertyAssignment(property)) && (isIdentifier(property.name) || isStringLiteral(property.name)))) {
      return [];
    }
    return [{ name: property.name.text, decl: this.#sink.keyOf(property) }];
  }

  // What a name does: in a type position only a `typeof` query's member is touched; in a value position its syntax decides,
  // except where a Drizzle write or a table definition takes the read over (the header's ruling; handedToColumn
  // asks the same rule from the name up, for the census).
  #rolesOf(node: Node, inType: boolean): readonly Role[] {
    if (inType) {
      return typeQueryRoles(node);
    }
    const handed = this.#frame.copied.has(node) || (this.#frame.tables > 0 && isPropertyAccessExpression(node.parent) && node.parent.name === node);
    return handed ? [] : referenceRoles(node);
  }

  // A Drizzle write's stored values, the reads its literal keys copy, and the argument it stores (the header's ruling).
  #stores(node: CallExpression): void {
    const stores = storesAt(node, this.#sink.names);
    if (stores.length === 0) {
      return;
    }
    this.#sites.stores.push(...stores);
    const [argument] = node.arguments;
    for (const stored of [...(argument === undefined ? [] : [argument]), ...stores.map(({ value }) => value)]) {
      this.#frame.stored.add(stored);
    }
    for (const read of copiedBy(stores)) {
      this.#frame.copied.add(read);
    }
  }

  // Each argument: a function value flows into its parameter's slot; any other non-primitive value is handed on whole,
  // an object literal too, so its values escape into an opaque slot (its keys are written by the literal-key pass).
  #arguments(node: CallExpression | NewExpression): void {
    for (const [index, argument] of (node.arguments ?? []).entries()) {
      if (isArrowFunction(argument) || isFunctionExpression(argument)) {
        this.#sites.flowSites.push({ value: argument, slot: "contextual" });
      } else if (!(isStringLiteral(argument) || isNumericLiteral(argument) || this.#frame.stored.has(argument))) {
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
    this.#sites.typeArguments.push({ call: node, arguments: node.typeArguments });
    const name = referenceName(node);
    const [target, keys] = node.typeArguments;
    if (ARM_SELECTORS.has(name)) {
      this.#sites.armSelectorMembers.push(
        ...node.typeArguments
          .slice(1)
          .flatMap(patternMembers)
          .map((member) => ({ key: this.#sink.keyOf(member), at: node.pos })),
      );
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
      this.#sites.scriptGlobalReads.push(...scriptGlobalReads(node.text, node.pos));
    } else if (isTemplateExpression(node)) {
      this.#sites.scriptGlobalReads.push(...scriptGlobalReads(templateText(node), node.pos));
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
      this.#sink.names.declaredBy(parent.expression, PLATFORM) &&
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
function isRuntimeProtocol(name: Node, names: LibraryNames): boolean {
  if (isComputedPropertyName(name)) {
    const { expression } = name;
    return isPropertyAccessExpression(expression) && (wellKnownSymbol(expression.expression, names) || inspectCustom(expression, names));
  }
  return isIdentifier(name) && RUNTIME_PROTOCOL_NAMES.has(name.text);
}

// The statements or class members a declaration sits among.
function siblingsOf(node: Node): readonly Node[] {
  const { parent } = node;
  if (isSourceFile(parent) || isBlock(parent) || isModuleBlock(parent)) {
    return parent.statements;
  }
  return isClassDeclaration(parent) || isClassExpression(parent) ? parent.members : [];
}

const isImportDeclarationCall = (node: CallExpression): boolean => node.expression.kind === SyntaxKind.ImportKeyword;

const wellKnownSymbol = (node: Node, names: LibraryNames): boolean =>
  isIdentifier(node) && node.text === WELL_KNOWN_SYMBOLS && names.declaredBy(node, PLATFORM);

// `[inspect.custom]` or `[util.inspect.custom]`: node:util's logging hook, whatever its holder is called.
const inspectCustom = (access: PropertyAccessExpression, names: LibraryNames): boolean =>
  access.name.text === INSPECT_CUSTOM && names.declaredBy(access.name, PLATFORM);

// A computed member name spelled as a dotted path, `[Symbol.iterator]`, so its label names it.
function computedText(name: Node | undefined): string | undefined {
  if (name === undefined || !isComputedPropertyName(name)) {
    return undefined;
  }
  const parts: string[] = [];
  let at: Node = name.expression;
  while (isPropertyAccessExpression(at)) {
    parts.unshift(at.name.text);
    at = at.expression;
  }
  return isIdentifier(at) ? `[${[at.text, ...parts].join(".")}]` : undefined;
}

// An initializer that does work when it runs: a call, a construction or an await, through parentheses and assertions.
function runsOnLoad(initializer: Node | undefined): boolean {
  let at = initializer;
  while (at !== undefined && (isParenthesizedExpression(at) || isAsExpression(at) || isSatisfiesExpression(at))) {
    at = at.expression;
  }
  return at !== undefined && (isCallExpression(at) || isNewExpression(at) || isAwaitExpression(at));
}

type JudgedBinding = { readonly name: Node; readonly kind: BindingKind } | null;

// The binding a node introduces, if binding-unread judges it.
function bindingOf(node: Node, top: boolean): JudgedBinding {
  if (isFunctionDeclaration(node) || isClassDeclaration(node)) {
    return localUnitOf(node, top);
  }
  return importOf(node) ?? declaredOf(node, top);
}

// A named function with a body or a class declared inside another declaration, as tsc's noUnusedLocals judges them; one a
// module's top level declares is a unit liveness judges, and an exported one belongs to its namespace's readers.
function localUnitOf(node: FunctionDeclaration | ClassDeclaration, top: boolean): JudgedBinding {
  const judged = !top && (isClassDeclaration(node) || node.body !== undefined) && !hasFlag(getCombinedModifierFlags(node), ModifierFlags.Export);
  return judged && node.name !== undefined ? { name: node.name, kind: "local" } : null;
}

function importOf(node: Node): JudgedBinding {
  if (isImportSpecifier(node) || isNamespaceImport(node)) {
    return { name: node.name, kind: "import" };
  }
  return isImportClause(node) && node.name !== undefined ? { name: node.name, kind: "import" } : null;
}

function declaredOf(node: Node, top: boolean): JudgedBinding {
  if (isParameterDeclaration(node)) {
    return judgedParameter(node) ? { name: node.name, kind: "parameter" } : null;
  }
  if (isVariableDeclaration(node)) {
    return top || heldOrCaught(node) ? null : { name: node.name, kind: "local" };
  }
  return isBindingElement(node) && node.name !== undefined && judgedElement(node) ? { name: node.name, kind: "local" } : null;
}

// A parameter of a function with a body, other than a parameter property or `this`.
function judgedParameter(node: ParameterDeclaration): boolean {
  const fn = node.parent;
  if (!("body" in fn) || fn.body === undefined || hasFlag(getCombinedModifierFlags(node), ModifierFlags.ParameterPropertyModifier)) {
    return false;
  }
  return !(isIdentifier(node.name) && node.name.text === THIS_PARAMETER);
}

// A `using` declaration holds its value for disposal; a catch binding is the error's slot.
const heldOrCaught = (node: VariableDeclaration): boolean =>
  isCatchClause(node.parent) || (isVariableDeclarationList(node.parent) && hasFlag(node.parent.flags, NodeFlags.Using));

// A pattern element, other than one a rest sibling omits on purpose or one an exported statement declares.
function judgedElement(node: BindingElement): boolean {
  const pattern = node.parent;
  const omitted =
    node.dotDotDotToken === undefined && isObjectBindingPattern(pattern) && pattern.elements.some((element) => element.dotDotDotToken !== undefined);
  return !(omitted || exportedStatement(node));
}

// `export { a } from "./x"` forwards another module's names; only an export with no module names a local.
const isExportDeclarationWithModule = (specifier: Node): boolean => {
  const declaration = specifier.parent.parent;
  return isExportDeclaration(declaration) && declaration.moduleSpecifier !== undefined;
};

// A binding element of an exported destructuring (`export const { a } = …`): only a module's statement exports.
function exportedStatement(node: Node): boolean {
  let at: Node = node;
  while (!(isVariableStatement(at) || isSourceFile(at))) {
    at = at.parent;
  }
  return isVariableStatement(at) && (at.modifiers ?? []).some(({ kind }) => kind === SyntaxKind.ExportKeyword);
}

const isDocNameHolder = (node: Node): boolean =>
  isJSDocLink(node) || isJSDocLinkCode(node) || isJSDocLinkPlain(node) || isJSDocNameReference(node) || isJSDocTypeExpression(node);

// The value a function hands back at `node`: a `return`'s expression or a concise arrow body.
function returnedValue(node: Node): Expression | undefined {
  if (isReturnStatement(node)) {
    return node.expression;
  }
  return isArrowFunction(node) && !isBlock(node.body) ? node.body : undefined;
}

// The return type the function holding a return statement declares.
function declaredReturnType(node: Node): TypeNode | undefined {
  let at: Node = node.parent;
  while (!(isFunctionLikeDeclaration(at) || isSourceFile(at))) {
    at = at.parent;
  }
  return isFunctionLikeDeclaration(at) ? at.type : undefined;
}

const storesAt = (node: Node, names: LibraryNames): readonly StoreWrite[] => [...storeWritesAt(node, names), ...insertSelectWritesAt(node, names)];

// The reads the literal keys of stored values copy into their columns.
const copiedBy = (stores: readonly StoreWrite[]): readonly Node[] =>
  stores.flatMap(({ value }) =>
    isObjectLiteralExpression(value) ? value.properties.flatMap((property) => (isPropertyAssignment(property) ? copiedReads(property.initializer) : [])) : [],
  );

/** Whether a Drizzle write copies the name's read into a column, or a table definition holds it: the reads the walk
 *  gives no role (the header's ruling), found from the name up through its enclosing calls. */
export function handedToColumn(name: Node, isTable: (node: Node) => boolean, names: LibraryNames): boolean {
  const inTable = isPropertyAccessExpression(name.parent) && sameNode(name.parent.name, name);
  for (let at = name.parent; !isSourceFile(at); at = at.parent) {
    if (copiedBy(storesAt(at, names)).some((read) => sameNode(read, name)) || (inTable && isTable(at))) {
      return true;
    }
  }
  return false;
}

// A value a `satisfies` holds to a type: a binding or a literal, never a builder call such as a zod schema.
const isCheckedValue = (value: Node | undefined): boolean =>
  value !== undefined && (isIdentifier(value) || isObjectLiteralExpression(value) || isArrayLiteralExpression(value));

// A value written into a slot its position types: a declaration's annotation, a concise arrow body or a return (its
// function's return), a literal property's value, or an array literal's element (`const all: Opts[] = [preset]`).
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
  // a source file is the one node with no parent
  const element = !isSourceFile(node) && isArrayLiteralExpression(node.parent) ? node.parent.elements.find((item) => sameNode(item, node)) : undefined;
  if (element !== undefined && !isSpreadElement(element) && !isOmittedExpression(element) && !isLiteralValue(element)) {
    return { value: element, slot: "contextual" };
  }
  return isPropertyAssignment(node) && isObjectLiteralExpression(node.parent) && !isLiteralValue(node.initializer)
    ? { value: node.initializer, slot: "contextual" }
    : undefined;
}

// A value copied into a prop or a literal slot by name: a JSX attribute's value, as an argument is to a parameter; a
// shorthand's binding, into the slot of the same name; a spread's members, member by member; an array spread's
// elements, into the array's element type.
function copyFlowSite(node: Node): FlowSite | undefined {
  if (isJsxAttribute(node) && node.initializer !== undefined && isJsxExpression(node.initializer)) {
    const { expression } = node.initializer;
    return expression === undefined || isLiteralValue(expression) ? undefined : { value: expression, slot: "contextual" };
  }
  if (isShorthandPropertyAssignment(node) && isObjectLiteralExpression(node.parent) && isIdentifier(node.name)) {
    return { value: node.name, slot: "contextual" };
  }
  if (isSpreadElement(node) && isArrayLiteralExpression(node.parent)) {
    return { value: node.expression, slot: "holder", holder: node.parent };
  }
  return (isSpreadAssignment(node) || isJsxSpreadAttribute(node)) && (isObjectLiteralExpression(node.parent) || isJsxAttributes(node.parent))
    ? { value: node.expression, slot: "holder", holder: node.parent }
    : undefined;
}

// A prefilter: the variants pass keeps a call only when its resolved signature is tailwind-variants' own, which also
// holds for a `tv` reached through a wrapper of ours (graph/variants.ts variantsDeclarations).
const isTvCallee = (callee: Node): boolean => {
  const name = isPropertyAccessExpression(callee) ? callee.name : callee;
  return isIdentifier(name) && name.text === TV;
};

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
// The member a pattern element names: `{ a }`, `{ a: b }` or a quoted `{ "aria-label": label }`.
function bindingKey(element: BindingElement): readonly string[] {
  const named = element.propertyName ?? element.name;
  if (named !== undefined && isIdentifier(named)) {
    return [named.text];
  }
  const quoted = element.propertyName === undefined ? undefined : keyText(element.propertyName);
  return quoted === undefined ? [] : [quoted];
}
