// Which tuples a string literal's slot takes its vocabulary from, read off what its declaration spells: a type annotation,
// or the schema value a type is inferred from. Types cannot say: a one-member union, an `Exclude` and a re-spelled
// subset all hold the same literals as the tuple. Each engine answers only the checker queries of `SlotOracle`.
import type { APIRequestGenerator } from "@typescript/native/sync";
import ts from "typescript";
import type { LiteralRole, Site, Sources } from "./classify.ts";
import { isProductionFile, nameAt, siteKey } from "./classify.ts";

/** What a slot's spellings reach: the tuples, as `file:NAME` keys, and the string literal types written on the way,
 *  each site key to its text. A literal type that re-spells a tuple member belongs to the tuple only where the scan
 *  links the two: the tuple `satisfies` a type that reaches it, or a value typed by it feeds the tuple's slot. */
export interface Spelled {
  readonly tuples: ReadonlySet<string>;
  readonly literals: ReadonlyMap<string, string>;
}

/** A slot's {@link Spelled} vocabulary; null when the slot's declaration cannot be read to the end, which no tuple may
 *  rule out. */
export type Origins = Spelled | null;

const NOTHING_SPELLED: Spelled = { tuples: new Set(), literals: new Map() };

// A value, or the requests that produce it: the native engine batches its questions, the TypeScript 6 engine answers at once.
type Answer<T> = T | APIRequestGenerator<T>;

const isRequests = <T>(answer: Answer<T>): answer is APIRequestGenerator<T> =>
  typeof answer === "object" && answer !== null && "next" in answer && "throw" in answer;

function* answered<T>(answer: Answer<T>): APIRequestGenerator<T> {
  return isRequests(answer) ? yield* answer : answer;
}

/** The compiler's answers about symbols, in each engine's own checker. A site is a declaration's name, or the start of
 *  the node asked about. A declaration outside the world's sources is reported, but never read. */
export interface SlotOracle {
  /** Where the symbol the name at `name` resolves to is declared, import aliases followed. */
  readonly declarationsOf: (name: Site) => Answer<readonly Site[]>;
  /** The parameter the signature chosen for the call argument starting at `argument` binds it to. */
  readonly parameterOf: (argument: Site) => Answer<Site | null>;
  /** The declarations of property `name` in the contextual type of the object literal starting at `object`. */
  readonly propertiesOf: (object: Site, name: string) => Answer<readonly Site[]>;
  /** Whether the call argument starting at `argument` binds a parameter typed by one of the callee's own type
   *  parameters, inferred at this call, whose constraint holds no literal type: the parameter's type is then the
   *  argument's own, a vocabulary of none of the tuples. */
  readonly infersFromArgument: (argument: Site) => Answer<boolean>;
  /** The declarations of property `name` in the slot the object literal starting at `object` fills inside a call
   *  argument, read from the callee's declared parameter type with its own type parameters at their constraints:
   *  what {@link SlotOracle.propertiesOf} answers when the call did not infer the type from the object itself. */
  readonly uninferredPropertiesOf: (object: Site, name: string) => Answer<readonly Site[]>;
}

// What a slot's declaration spells: type annotations, or the value expression a schema-inferred property is written from.
type Declared = readonly ts.Node[] | null;

/** The spellings read for one slot before it is called unreadable: a slot that reaches this many is a generated table or
 *  a whole schema, and ruling a tuple out of it would be a guess. */
const SPELLING_LIMIT = 2000;

/** Where the name at `site` is declared, in either engine. */
export function* declaredSites(oracle: SlotOracle, site: Site): APIRequestGenerator<readonly Site[]> {
  return yield* answered(oracle.declarationsOf(site));
}

/** Run a generator whose engine never issues a request. */
export function settled<T>(generator: APIRequestGenerator<T>): T {
  const step = generator.next();
  if (step.done !== true) {
    throw new Error("a synchronous engine issued an API request");
  }
  return step.value;
}

const siteOf = (node: ts.Node): Site => ({ file: node.getSourceFile().fileName, position: node.getStart() });

/** `as const`'s type, in the TypeScript 6 AST. */
export const isConstAssertion = (type: ts.TypeNode): boolean =>
  ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === "const";

const PASSING_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);

// The parent hands the value on whole, so the slot is the parent's.
function passesThrough(parent: ts.Node, node: ts.Node): boolean {
  return (
    ts.isParenthesizedExpression(parent) ||
    ts.isNonNullExpression(parent) ||
    ts.isArrayLiteralExpression(parent) ||
    (ts.isConditionalExpression(parent) && parent.condition !== node) ||
    (ts.isBinaryExpression(parent) && PASSING_OPERATORS.has(parent.operatorToken.kind)) ||
    (ts.isAsExpression(parent) && isConstAssertion(parent.type))
  );
}

const enclosingFunction = (node: ts.Node): ts.SignatureDeclaration | undefined => ts.findAncestor(node, ts.isFunctionLike);

// The annotation the parent spells for `node`, if the parent spells one.
function spelledFor(parent: ts.Node, node: ts.Node): ts.TypeNode | undefined {
  if (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
    return parent.type;
  }
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isPropertyDeclaration(parent)) && parent.initializer === node) {
    return parent.type;
  }
  if (ts.isReturnStatement(parent)) {
    return enclosingFunction(parent)?.type;
  }
  return ts.isArrowFunction(parent) && parent.body === node ? parent.type : undefined;
}

function annotationOf(declaration: ts.Node | null): ts.TypeNode | undefined {
  const typed =
    declaration !== null &&
    (ts.isParameter(declaration) || ts.isVariableDeclaration(declaration) || ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration));
  return typed ? declaration.type : undefined;
}

// What a property's declaration spells: its annotation, or, when a schema shape declares it, the value it is written from.
function propertySpelling(declaration: ts.Node): ts.Node | undefined {
  if (ts.isPropertyAssignment(declaration)) {
    return declaration.initializer;
  }
  return ts.isShorthandPropertyAssignment(declaration) ? declaration.name : annotationOf(declaration);
}

// The declaration a name site belongs to, or null for one outside the production sources.
function declarationAt(sources: Sources, site: Site): ts.Node | null {
  return isProductionFile(site.file) ? (nameAt(sources.get(site.file), site.position)?.parent ?? null) : null;
}

function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : null;
}

const declaresWithin = (sites: readonly Site[], node: ts.Node): boolean =>
  sites.length > 0 && sites.every((site) => site.file === node.getSourceFile().fileName && site.position >= node.getStart() && site.position < node.getEnd());

// The spellings of the declarations of property `name` in the object's contextual type; undefined when it has none to
// read, so the object's own slot decides. A property the object itself declares is a type a generic call inferred from
// the object, so the callee's declared parameter is the slot when it has the property.
function* propertySpellings(
  oracle: SlotOracle,
  sources: Sources,
  name: string | null,
  object: ts.ObjectLiteralExpression,
): APIRequestGenerator<Declared | undefined> {
  const contextual = name === null ? [] : yield* answered(oracle.propertiesOf(siteOf(object), name));
  const uninferred = name !== null && declaresWithin(contextual, object) ? yield* answered(oracle.uninferredPropertiesOf(siteOf(object), name)) : [];
  const sites = uninferred.length > 0 ? uninferred : contextual;
  const spellings: ts.Node[] = [];
  for (const site of sites) {
    const declaration = declarationAt(sources, site);
    if (declaration === null) {
      return null;
    }
    const spelling = propertySpelling(declaration);
    if (spelling !== undefined) {
      spellings.push(spelling);
    }
  }
  return spellings.length === 0 ? undefined : spellings;
}

// A parameter the call types by the argument itself spells no vocabulary: the argument builds nothing there.
function* parameterSpellings(oracle: SlotOracle, sources: Sources, argument: ts.Node): APIRequestGenerator<Declared> {
  if (yield* answered(oracle.infersFromArgument(siteOf(argument)))) {
    return [];
  }
  const site = yield* answered(oracle.parameterOf(siteOf(argument)));
  const type = annotationOf(site === null ? null : declarationAt(sources, site));
  return type === undefined ? null : [type];
}

const isArgument = (parent: ts.Node, node: ts.Node): boolean =>
  (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && (parent.arguments?.some((argument) => argument === node) ?? false);

const EQUALITY_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

// A read of a constant that only inspects it: the value goes into no slot.
function inspectsOnly(use: ts.Node): boolean {
  const { parent } = use;
  return (
    (ts.isBinaryExpression(parent) && EQUALITY_OPERATORS.has(parent.operatorToken.kind)) ||
    ts.isCaseClause(parent) ||
    ts.isTemplateSpan(parent) ||
    (ts.isSwitchStatement(parent) && parent.expression === use) ||
    ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === use)
  );
}

const isUnannotatedConstant = (declaration: ts.VariableDeclaration): boolean =>
  declaration.type === undefined && ts.isIdentifier(declaration.name) && declaration.parent.getFirstToken()?.kind === ts.SyntaxKind.ConstKeyword;

/** How the literal at `site` initialises an unannotated `const`: `direct` as its whole value, `nested` under a
 *  property of its object; null when it initialises none. Either way it holds its own text, and its slot is wherever
 *  the constant, or the constant's property, is read. An element of a constant array is no constant: the array is a
 *  tuple or a list production enumerates. */
export function constantDepth(sources: Sources, site: Site): "direct" | "nested" | null {
  let at = nameAt(sources.get(site.file), site.position);
  let nested = false;
  let inArray = false;
  while (at !== undefined) {
    const { parent } = at;
    if (passesThrough(parent, at)) {
      inArray ||= ts.isArrayLiteralExpression(parent);
      at = parent;
    } else if (ts.isPropertyAssignment(parent) && parent.initializer === at && ts.isObjectLiteralExpression(parent.parent)) {
      nested = true;
      at = parent.parent;
    } else {
      break;
    }
  }
  const parent = at?.parent;
  if (!(parent !== undefined && ts.isVariableDeclaration(parent) && parent.initializer === at && isUnannotatedConstant(parent))) {
    return null;
  }
  if (nested) {
    return "nested";
  }
  return inArray ? null : "direct";
}

// A module-private constant's reads are all in its file; an exported one is read where the scan cannot follow.
function isFileLocal(declaration: ts.VariableDeclaration): boolean {
  const statement = declaration.parent.parent;
  return ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) !== true;
}

// The spellings of every slot a constant is read into; null when one cannot be read or a read leaves the file. `path`
// names the properties, outermost first, from the constant's object down to the literal asked about: a read of that
// property (`ROOT.carriers`) or a spread of the object is the literal's slot.
function* constantSpellings(oracle: SlotOracle, sources: Sources, declaration: ts.VariableDeclaration, path: readonly string[]): APIRequestGenerator<Declared> {
  if (!(isFileLocal(declaration) && isUnannotatedConstant(declaration))) {
    return null;
  }
  const home = siteOf(declaration.name);
  const spellings: ts.Node[] = [];
  for (const use of referencedNames(declaration.getSourceFile()).filter((name) => name.text === declaration.name.getText() && name !== declaration.name)) {
    const sites = yield* answered(oracle.declarationsOf(siteOf(use)));
    const { parent } = use;
    const readsPath = path.length > 0 && ts.isPropertyAccessExpression(parent) && parent.expression === use && parent.name.text === path[0];
    if (!sites.some((site) => site.file === home.file && site.position === home.position) || (!readsPath && inspectsOnly(use))) {
      continue;
    }
    const declared = readsPath ? yield* receivingSpellings(oracle, sources, parent, path.slice(1)) : yield* receivingSpellings(oracle, sources, use, path);
    if (declared === null) {
      return null;
    }
    spellings.push(...declared);
  }
  return spellings;
}

// One step up from a value toward its slot: the slot's spellings when this parent decides them, else the node and
// property path to climb from next.
type Step = { readonly done: Declared } | { readonly node: ts.Node; readonly path: readonly string[] };

function* receivingStep(oracle: SlotOracle, sources: Sources, node: ts.Node, path: readonly string[]): APIRequestGenerator<Step> {
  const { parent } = node;
  if (passesThrough(parent, node)) {
    return { node: parent, path };
  }
  const spelled = spelledFor(parent, node);
  if (spelled !== undefined) {
    return { done: [spelled] };
  }
  if (isArgument(parent, node)) {
    return { done: yield* parameterSpellings(oracle, sources, node) };
  }
  if (ts.isVariableDeclaration(parent)) {
    return { done: yield* constantSpellings(oracle, sources, parent, path) };
  }
  return yield* objectStep(oracle, sources, node, path);
}

// A value written into an object literal: a property's declared spelling, or the object's own slot further up.
function* objectStep(oracle: SlotOracle, sources: Sources, node: ts.Node, path: readonly string[]): APIRequestGenerator<Step> {
  const { parent } = node;
  if (ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isObjectLiteralExpression(parent.parent)) {
    const name = propertyName(parent.name);
    const declared = yield* propertySpellings(oracle, sources, name, parent.parent);
    return declared === undefined ? { node: parent.parent, path: name === null ? path : [name, ...path] } : { done: declared };
  }
  // `{ ...ROOT }`: the spread object's properties become the outer object's, so the path's first property is the slot.
  if (ts.isSpreadAssignment(parent) && path.length > 0) {
    const declared = yield* propertySpellings(oracle, sources, path[0] ?? null, parent.parent);
    if (declared === undefined) {
      return { node: parent.parent, path };
    }
    return { done: path.length === 1 ? declared : null };
  }
  return { done: null };
}

// The spellings of the slot a value flows into. `path` names the properties, outermost first, from `start` down to the
// value asked about, when that value sits inside an unannotated object.
function* receivingSpellings(oracle: SlotOracle, sources: Sources, start: ts.Node, path: readonly string[] = []): APIRequestGenerator<Declared> {
  let step: Step = { node: start, path };
  while (!("done" in step)) {
    step = yield* receivingStep(oracle, sources, step.node, step.path);
  }
  return step.done;
}

// The annotations of the declaration an operand reads: a name, or a member access.
function* operandSpellings(oracle: SlotOracle, sources: Sources, operand: ts.Node): APIRequestGenerator<Declared> {
  let node = operand;
  while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
    node = node.expression;
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return [node.type];
  }
  const name = ts.isPropertyAccessExpression(node) ? node.name : node;
  if (!ts.isIdentifier(name)) {
    return null;
  }
  const types: ts.TypeNode[] = [];
  for (const site of yield* answered(oracle.declarationsOf(siteOf(name)))) {
    const type = annotationOf(declarationAt(sources, site));
    if (type === undefined) {
      return null;
    }
    types.push(type);
  }
  return types.length === 0 ? null : types;
}

// A name a declaration or a member access introduces, not one that refers to something.
function introducesName(parent: ts.Node, name: ts.Identifier): boolean {
  if (ts.isPropertyAccessExpression(parent)) {
    return parent.name === name;
  }
  const declares =
    ts.isPropertyAssignment(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isParameter(parent) ||
    ts.isVariableDeclaration(parent) ||
    ts.isBindingElement(parent) ||
    ts.isTypeParameterDeclaration(parent) ||
    ts.isFunctionDeclaration(parent) ||
    ts.isEnumMember(parent);
  return declares && parent.name === name;
}

// A name in a type position: a failure to resolve it leaves the type unread, where an unresolved value name is a global.
const namesType = (parent: ts.Node): boolean =>
  ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent) || ts.isQualifiedName(parent) || ts.isExpressionWithTypeArguments(parent);

function referencedNames(root: ts.Node): readonly ts.Identifier[] {
  const found: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && !introducesName(node.parent, node)) {
      found.push(node);
    }
    // `as const` names no declaration
    if (ts.isAsExpression(node) && isConstAssertion(node.type)) {
      visit(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

interface Expansion {
  /** The tuple key a variable declares. */
  readonly tuple: string | null;
  /** What else the declaration spells that a slot can take its vocabulary from. */
  readonly into: readonly (ts.Node | undefined)[];
  /** The declaration is a type parameter, which a caller instantiates with a vocabulary this slot does not spell. */
  readonly opaque: boolean;
}

const NOTHING: Expansion = { tuple: null, into: [], opaque: false };

// What one declaration of a referenced name adds: a variable is a tuple and spells its annotation and value, an alias its
// type, a function its body, a property or parameter its annotation or value, an interface what it extends and holds.
function expansion(site: Site, declaration: ts.Node | null): Expansion {
  if (declaration === null) {
    return NOTHING;
  }
  if (ts.isVariableDeclaration(declaration)) {
    const tuple = ts.isIdentifier(declaration.name) ? `${site.file}:${declaration.name.text}` : null;
    return { tuple, into: [declaration.type, declaration.initializer], opaque: false };
  }
  if (ts.isTypeAliasDeclaration(declaration)) {
    return { tuple: null, into: [declaration.type], opaque: false };
  }
  if (ts.isTypeParameterDeclaration(declaration)) {
    // A mapped type's key ranges over its constraint and no caller instantiates it, so the constraint is the vocabulary.
    return { tuple: null, into: [declaration.constraint], opaque: !ts.isMappedTypeNode(declaration.parent) };
  }
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
    return { tuple: null, into: [declaration], opaque: false };
  }
  if (ts.isInterfaceDeclaration(declaration)) {
    // A member's type is what an indexed access (`Interface["member"]`) reads.
    return { tuple: null, into: [...(declaration.heritageClauses ?? []), ...declaration.members.map(annotationOf)], opaque: false };
  }
  const written = ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration) ? declaration.initializer : undefined;
  return { tuple: null, into: [annotationOf(declaration), written], opaque: false };
}

// Every declaration a name resolves to, expanded; null when a type name resolves to none.
function* expansionsOf(oracle: SlotOracle, sources: Sources, name: ts.Identifier): APIRequestGenerator<readonly Expansion[] | null> {
  const sites = yield* answered(oracle.declarationsOf(siteOf(name)));
  if (sites.length === 0 && namesType(name.parent)) {
    return null;
  }
  return sites.map((site) => expansion(site, declarationAt(sources, site)));
}

// A spelling still to read: `property` scopes a type to one of its properties, as `T["p"]` does, and `collect` says
// whether its literal types re-spell the slot. A property that cannot be found is read whole for its tuples only.
interface Reach {
  readonly node: ts.Node;
  readonly property: string | null;
  readonly collect: boolean;
}

interface Read {
  readonly tuples: readonly string[];
  readonly next: readonly ts.Node[];
  /** The `T["p"]` accesses in the spelling, each read as `T` scoped to `p`. */
  readonly scoped: readonly { readonly node: ts.Node; readonly property: string }[];
}

// How a reading treats a name it cannot settle: `slot` gives up, since the slot may then be any tuple's; `links` reads
// on past it, since a reading that only adds links to a tuple is sound with any part of them.
type Reading = "slot" | "links";

// The property an indexed access with a string literal index names: `T["p"]` gives `p`.
function indexedProperty(node: ts.Node): string | null {
  return ts.isIndexedAccessTypeNode(node) && ts.isLiteralTypeNode(node.indexType) && ts.isStringLiteral(node.indexType.literal)
    ? node.indexType.literal.text
    : null;
}

// The `T["p"]` accesses under `root`, by their object type: their names are read scoped, never whole.
function scopedAccesses(root: ts.Node): readonly { readonly node: ts.Node; readonly property: string }[] {
  const found: { readonly node: ts.IndexedAccessTypeNode; readonly property: string }[] = [];
  const visit = (node: ts.Node): void => {
    const property = indexedProperty(node);
    if (property !== null && ts.isIndexedAccessTypeNode(node)) {
      found.push({ node, property });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found.map(({ node, property }) => ({ node: node.objectType, property }));
}

const isUnder = (node: ts.Node, ancestors: ReadonlySet<ts.Node>): boolean => {
  for (let at = node; !ts.isSourceFile(at); at = at.parent) {
    if (ancestors.has(at)) {
      return true;
    }
  }
  return false;
};

// The tuples one spelling names and the further spellings it leads to; null when it cannot be read to the end.
function* readSpelling(oracle: SlotOracle, sources: Sources, root: ts.Node, reading: Reading): APIRequestGenerator<Read | null> {
  const tuples: string[] = [];
  const next: ts.Node[] = [];
  const scoped = scopedAccesses(root);
  const objects = new Set(scoped.map(({ node }) => node));
  for (const name of referencedNames(root).filter((candidate) => !isUnder(candidate, objects))) {
    const reached = yield* expansionsOf(oracle, sources, name);
    if (reading === "slot" && (reached === null || reached.some(({ opaque }) => opaque))) {
      return null;
    }
    for (const expanded of reached ?? []) {
      if (expanded.tuple !== null) {
        tuples.push(expanded.tuple);
      }
      next.push(...expanded.into.filter((spelling): spelling is ts.Node => spelling !== undefined));
    }
  }
  return { tuples, next, scoped };
}

// The members named `property` in an interface or a type literal, and what an interface extends, still scoped to it.
function memberSteps(members: readonly ts.Node[], property: string): readonly Scoped[] {
  return members.flatMap((member) =>
    ts.isPropertySignature(member) && member.type !== undefined && propertyName(member.name) === property ? [{ node: member.type, property: null }] : [],
  );
}

interface Scoped {
  readonly node: ts.Node;
  readonly property: string | null;
}

// The name a type reference or a heritage entry refers to.
function referredName(node: ts.Node): ts.Identifier | null {
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    return node.typeName;
  }
  return ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression) ? node.expression : null;
}

// A named type scoped to one property: each interface's member of that name and what it extends, each alias's type.
function* declaredPropertySteps(oracle: SlotOracle, sources: Sources, name: ts.Identifier, property: string): APIRequestGenerator<readonly Scoped[] | null> {
  const sites = yield* answered(oracle.declarationsOf(siteOf(name)));
  const steps: Scoped[] = [];
  for (const declaration of sites.map((site) => declarationAt(sources, site))) {
    if (declaration !== null && ts.isInterfaceDeclaration(declaration)) {
      const bases = (declaration.heritageClauses ?? []).flatMap((clause) => clause.types.map((type) => ({ node: type, property })));
      steps.push(...memberSteps(declaration.members, property), ...bases);
    } else if (declaration !== null && ts.isTypeAliasDeclaration(declaration)) {
      steps.push({ node: declaration.type, property });
    } else {
      return null;
    }
  }
  return sites.length === 0 ? null : steps;
}

// One step of reading a type scoped to one property; null when the type is not one a property can be found in.
function* propertyStep(oracle: SlotOracle, sources: Sources, node: ts.Node, property: string): APIRequestGenerator<readonly Scoped[] | null> {
  if (ts.isParenthesizedTypeNode(node)) {
    return [{ node: node.type, property }];
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return node.types.map((type) => ({ node: type, property }));
  }
  if (ts.isTypeLiteralNode(node)) {
    return memberSteps(node.members, property);
  }
  const name = referredName(node);
  return name === null ? null : yield* declaredPropertySteps(oracle, sources, name, property);
}

// Every string literal type a spelling writes, by site key; a `T["p"]` access is read scoped, so its literals are not
// the spelling's own.
function collectLiteralTypes(root: ts.Node, into: Map<string, string>): void {
  const visit = (node: ts.Node): void => {
    if (indexedProperty(node) !== null) {
      return;
    }
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
      into.set(siteKey(siteOf(node.literal)), node.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
}

// What a reach scoped to `property` leads to; a type the property cannot be found in is read whole, for its tuples only.
function* scopedReaches(oracle: SlotOracle, sources: Sources, reach: Reach, property: string): APIRequestGenerator<readonly Reach[]> {
  const steps = yield* propertyStep(oracle, sources, reach.node, property);
  return steps === null ? [{ node: reach.node, property: null, collect: false }] : steps.map((step) => ({ ...step, collect: reach.collect }));
}

// Whether `reach` is new, recording it.
function firstVisit(seen: Map<ts.Node, Set<string>>, reach: Reach): boolean {
  const key = `${reach.property ?? ""}:${String(reach.collect)}`;
  const held = seen.get(reach.node) ?? new Set<string>();
  if (held.has(key)) {
    return false;
  }
  held.add(key);
  seen.set(reach.node, held);
  return true;
}

// The tuples a slot's spellings reach, and the literal types written on the way: a variable reached through `typeof` or
// by name is a tuple, and aliases, schema values, constraints and function bodies are read through. `T["p"]` reads only
// `T`'s property `p`, so a sibling property's literals never re-spell the slot. Null when a type name has no
// declaration, a type parameter stands in for the vocabulary, or the reading outgrows the limit: in each the slot may be
// any tuple's.
function* originsOf(oracle: SlotOracle, sources: Sources, spellings: readonly ts.Node[], reading: Reading = "slot"): APIRequestGenerator<Origins> {
  const into: Spelled & { readonly tuples: Set<string>; readonly literals: Map<string, string> } = { tuples: new Set(), literals: new Map() };
  const seen = new Map<ts.Node, Set<string>>();
  const pending: Reach[] = spellings.map((node) => ({ node, property: null, collect: true }));
  let visits = 0;
  for (let reach = pending.pop(); reach !== undefined; reach = pending.pop()) {
    if (!firstVisit(seen, reach)) {
      continue;
    }
    visits += 1;
    const next = visits > SPELLING_LIMIT ? null : yield* readReach(oracle, sources, { reach, reading }, into);
    if (next === null) {
      return null;
    }
    pending.push(...next);
  }
  return into;
}

// Read one reach into `into`: the reaches it leads to, or null when the slot reading gives up.
function* readReach(
  oracle: SlotOracle,
  sources: Sources,
  { reach, reading }: { readonly reach: Reach; readonly reading: Reading },
  into: { readonly tuples: Set<string>; readonly literals: Map<string, string> },
): APIRequestGenerator<readonly Reach[] | null> {
  const { node, property, collect } = reach;
  if (property !== null) {
    return yield* scopedReaches(oracle, sources, reach, property);
  }
  const read = yield* readSpelling(oracle, sources, node, reading);
  if (read === null) {
    return null;
  }
  for (const tuple of read.tuples) {
    into.tuples.add(tuple);
  }
  if (collect) {
    collectLiteralTypes(node, into.literals);
  }
  return [...read.next.map((next) => ({ node: next, property: null, collect })), ...read.scoped.map((scoped) => ({ ...scoped, collect }))];
}

function* declaredAt(oracle: SlotOracle, sources: Sources, node: ts.Node, role: LiteralRole | "record-key"): APIRequestGenerator<Declared> {
  const { parent } = node;
  switch (role) {
    case "construct":
      return yield* receivingSpellings(oracle, sources, node);
    case "record-key":
      return ts.isObjectLiteralExpression(parent.parent) ? yield* receivingSpellings(oracle, sources, parent.parent) : null;
    case "case":
      return ts.isCaseClause(parent) && ts.isSwitchStatement(parent.parent.parent)
        ? yield* operandSpellings(oracle, sources, parent.parent.parent.expression)
        : null;
    case "compare":
      return ts.isBinaryExpression(parent) ? yield* operandSpellings(oracle, sources, parent.left === node ? parent.right : parent.left) : null;
    case "key":
    case "type":
    case "module":
      return null;
  }
}

/** What the type a tuple declared at `name` satisfies is spelled from, so `["a"] as const satisfies readonly P[]`
 *  reaches the tuples `P` derives from and theirs in turn, and the literal types `P` writes, which re-spell the
 *  tuple's members. Empty for a tuple with no `satisfies`, or one that cannot be read to the end. Spelled from is not
 *  subset of: a `keyof` or an indexed access reaches tuples it never holds. */
export function* satisfiedOrigins(oracle: SlotOracle, sources: Sources, name: Site): APIRequestGenerator<Spelled> {
  const declaration = declarationAt(sources, name);
  const spellings: ts.TypeNode[] = [];
  let node = declaration !== null && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
  while (node !== undefined && (ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node))) {
    if (ts.isSatisfiesExpression(node)) {
      spellings.push(node.type);
    }
    node = node.expression;
  }
  const origins = spellings.length === 0 ? null : yield* originsOf(oracle, sources, spellings, "links");
  return origins ?? NOTHING_SPELLED;
}

/** The tuples the slot of the literal or key at `site` derives from. */
export function* slotOrigins(oracle: SlotOracle, sources: Sources, site: Site, role: LiteralRole | "record-key"): APIRequestGenerator<Origins> {
  const node = nameAt(sources.get(site.file), site.position);
  const spellings = node === undefined ? null : yield* declaredAt(oracle, sources, node, role);
  return spellings === null ? null : yield* originsOf(oracle, sources, spellings);
}

/** The slot a non-literal value at `site` flows into: a name, or the property a member access at `site` names, read
 *  into an argument, a property, a return or a binding, or used as the key of an element access. */
export function* valueSlotOrigins(oracle: SlotOracle, sources: Sources, site: Site): APIRequestGenerator<Origins> {
  const node = nameAt(sources.get(site.file), site.position);
  if (node === undefined) {
    return null;
  }
  const value = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : node;
  const { parent } = value;
  const spellings =
    ts.isElementAccessExpression(parent) && parent.argumentExpression === value
      ? yield* operandSpellings(oracle, sources, parent.expression)
      : yield* receivingSpellings(oracle, sources, value);
  return spellings === null ? null : yield* originsOf(oracle, sources, spellings);
}

/** The vocabulary of the value a switch at a name or member access reads: what its declaration is annotated with. */
export function* subjectOrigins(oracle: SlotOracle, sources: Sources, site: Site): APIRequestGenerator<Origins> {
  const node = nameAt(sources.get(site.file), site.position);
  if (node === undefined) {
    return null;
  }
  const operand = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : node;
  const spellings = yield* operandSpellings(oracle, sources, operand);
  return spellings === null ? null : yield* originsOf(oracle, sources, spellings);
}

/** The property signature a string literal type at `site` annotates, through a union of literals (`kind: "a" | "b"`):
 *  the site and text of its name. */
export function respelledProperty(sources: Sources, site: Site): { readonly site: Site; readonly name: string } | null {
  let at = nameAt(sources.get(site.file), site.position)?.parent;
  if (at === undefined || !ts.isLiteralTypeNode(at)) {
    return null;
  }
  while (ts.isUnionTypeNode(at.parent) || ts.isParenthesizedTypeNode(at.parent)) {
    at = at.parent;
  }
  const { parent } = at;
  return ts.isPropertySignature(parent) && parent.type === at && ts.isIdentifier(parent.name) ? { site: siteOf(parent.name), name: parent.name.text } : null;
}

/** A switch on a name or a member access whose clause hands the switched value on: the string labels of the clause and
 *  the ones that fall into it, and each place the clause body reads the same value, by the site of its last name. */
export interface PassThrough {
  readonly labels: readonly string[];
  readonly value: Site;
  /** The switch subject, by the site of its last name. */
  readonly subject: Site;
}

const isNamePath = (node: ts.Expression): boolean => ts.isIdentifier(node) || (ts.isPropertyAccessExpression(node) && isNamePath(node.expression));

// Reads in `body` spelled `text` that hand the whole value on, not the object of a deeper access.
function sameValueReads(body: readonly ts.Statement[], text: string): readonly Site[] {
  const found: Site[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) && isNamePath(node) && node.getText() === text) {
      const { parent } = node;
      const deeper = (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node;
      if (!deeper) {
        found.push(siteOf(ts.isPropertyAccessExpression(node) ? node.name : node));
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of body) {
    visit(statement);
  }
  return found;
}

/** The clauses of the switch at `site` that hand the switched value on, each with the labels that narrow it there. */
export function switchPassThroughs(sources: Sources, site: Site): readonly PassThrough[] {
  const node = nameAt(sources.get(site.file), site.position);
  if (node === undefined || !ts.isSwitchStatement(node)) {
    return [];
  }
  let subject: ts.Expression = node.expression;
  while (ts.isParenthesizedExpression(subject)) {
    subject = subject.expression;
  }
  if (!isNamePath(subject)) {
    return [];
  }
  const text = subject.getText();
  const subjectSite = siteOf(ts.isPropertyAccessExpression(subject) ? subject.name : subject);
  const found: PassThrough[] = [];
  let labels: string[] = [];
  for (const clause of node.caseBlock.clauses) {
    if (ts.isDefaultClause(clause)) {
      labels = [];
      continue;
    }
    if (ts.isStringLiteral(clause.expression)) {
      labels.push(clause.expression.text);
    }
    if (clause.statements.length > 0) {
      const narrowed = labels;
      found.push(...sameValueReads(clause.statements, text).map((value) => ({ labels: narrowed, value, subject: subjectSite })));
      labels = [];
    }
  }
  return found;
}

// Type names every lib declares that select keys: `Pick<T, K>` and `Omit<T, K>` take the keys second, and
// `Exclude<keyof T, K>` and `Extract<keyof T, K>` filter a key set by them.
const KEY_SELECTORS: ReadonlySet<string> = new Set(["Pick", "Omit"]);
const KEY_FILTERS: ReadonlySet<string> = new Set(["Exclude", "Extract"]);

/** Whether a type name is one of the lib key selections {@link keyListTuples} reads. */
export const isKeyTypeName = (name: string): boolean => KEY_SELECTORS.has(name) || KEY_FILTERS.has(name);

const isKeyof = (node: ts.TypeNode | undefined): boolean => node !== undefined && ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword;

// A lib type reference: no declaration of its name lies in the production sources. An engine may report a lib
// declaration or none at all, so only a production declaration rules the name out.
function* isLibReference(oracle: SlotOracle, name: ts.Identifier): APIRequestGenerator<boolean> {
  const sites = yield* answered(oracle.declarationsOf(siteOf(name)));
  return sites.every((site) => !isProductionFile(site.file));
}

// The key set a key position spells, reduced to the type nodes that name its keys.
function* keyNodes(oracle: SlotOracle, node: ts.TypeNode): APIRequestGenerator<readonly ts.TypeNode[]> {
  if (ts.isUnionTypeNode(node)) {
    return node.types;
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return [node.type];
  }
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && KEY_FILTERS.has(node.typeName.text) && (yield* isLibReference(oracle, node.typeName))) {
    const [from, by] = node.typeArguments ?? [];
    const kept = isKeyof(from) ? by : from;
    return kept === undefined ? [] : [kept];
  }
  return [];
}

// The tuples `(typeof T)[number]` reads: each variable `T` resolves to.
function* queriedTuples(oracle: SlotOracle, sources: Sources, name: ts.Identifier): APIRequestGenerator<readonly string[]> {
  const tuples: string[] = [];
  for (const site of yield* answered(oracle.declarationsOf(siteOf(name)))) {
    const declaration = declarationAt(sources, site);
    if (declaration !== null && ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
      tuples.push(`${site.file}:${declaration.name.text}`);
    }
  }
  return tuples;
}

// The type nodes of the aliases a type name resolves to.
function* aliasedTypes(oracle: SlotOracle, sources: Sources, name: ts.Identifier): APIRequestGenerator<readonly ts.TypeNode[]> {
  const aliases: ts.TypeNode[] = [];
  for (const site of yield* answered(oracle.declarationsOf(siteOf(name)))) {
    const declaration = declarationAt(sources, site);
    if (declaration !== null && ts.isTypeAliasDeclaration(declaration)) {
      aliases.push(declaration.type);
    }
  }
  return aliases;
}

function unparenthesized(node: ts.TypeNode): ts.TypeNode {
  let at = node;
  while (ts.isParenthesizedTypeNode(at)) {
    at = at.type;
  }
  return at;
}

// One key-position node: the tuples `(typeof T)[number]` names, added to `tuples`, or the nodes it reads through.
function* keyStep(oracle: SlotOracle, sources: Sources, node: ts.TypeNode, tuples: Set<string>): APIRequestGenerator<readonly ts.TypeNode[]> {
  const queried = ts.isIndexedAccessTypeNode(node) ? unparenthesized(node.objectType) : undefined;
  if (queried !== undefined && ts.isTypeQueryNode(queried) && ts.isIdentifier(queried.exprName)) {
    for (const tuple of yield* queriedTuples(oracle, sources, queried.exprName)) {
      tuples.add(tuple);
    }
    return [];
  }
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && !KEY_FILTERS.has(node.typeName.text)) {
    return yield* aliasedTypes(oracle, sources, node.typeName);
  }
  return yield* keyNodes(oracle, node);
}

// The tuples a key position names: `(typeof T)[number]`, an alias of one, a union of them and a filter of them.
function* keyTuples(oracle: SlotOracle, sources: Sources, start: ts.TypeNode): APIRequestGenerator<ReadonlySet<string>> {
  const tuples = new Set<string>();
  const seen = new Set<ts.Node>();
  const pending: ts.TypeNode[] = [start];
  for (let node = pending.pop(); node !== undefined && seen.size <= SPELLING_LIMIT; node = pending.pop()) {
    if (!seen.has(node)) {
      seen.add(node);
      pending.push(...(yield* keyStep(oracle, sources, node, tuples)));
    }
  }
  return tuples;
}

/** The tuples a lib key selection whose type name sits at `site` uses as keys: the `K` of `Pick<T, K>` or
 *  `Omit<T, K>`, or of `Exclude<keyof T, K>`. Such a tuple names property keys of a type, never a value. */
export function* keyListTuples(oracle: SlotOracle, sources: Sources, site: Site): APIRequestGenerator<ReadonlySet<string>> {
  const name = nameAt(sources.get(site.file), site.position);
  const reference = name?.parent;
  if (name === undefined || !ts.isIdentifier(name) || reference === undefined || !ts.isTypeReferenceNode(reference) || !(yield* isLibReference(oracle, name))) {
    return NOTHING_SPELLED.tuples;
  }
  const [first, key] = reference.typeArguments ?? [];
  const selects = KEY_SELECTORS.has(name.text);
  // `Pick<T, Exclude<keyof T, K>>` is read at its `Exclude`, which is a key filter of its own.
  const filtered = selects && key !== undefined && ts.isTypeReferenceNode(key) && isKeyof(key.typeArguments?.[0]);
  if (key === undefined || filtered || !(selects || isKeyof(first))) {
    return NOTHING_SPELLED.tuples;
  }
  return yield* keyTuples(oracle, sources, key);
}

// A parameter type that holds raw outside input: `string` or `unknown`, optionally with `undefined` or `null`.
const RAW_INPUT: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.StringKeyword, ts.SyntaxKind.UnknownKeyword]);
const ABSENT: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.UndefinedKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.LiteralType]);

function isRawInput(type: ts.TypeNode | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  const members = ts.isUnionTypeNode(type) ? type.types : [type];
  return members.some((member) => RAW_INPUT.has(member.kind)) && members.every((member) => RAW_INPUT.has(member.kind) || ABSENT.has(member.kind));
}

/** The tuples a type guard at `site` (`(value: string): value is T`) narrows a raw string or unknown parameter into:
 *  outside input can then produce any of their members. */
export function* predicateTuples(oracle: SlotOracle, sources: Sources, site: Site): APIRequestGenerator<ReadonlySet<string>> {
  const predicate = nameAt(sources.get(site.file), site.position)?.parent;
  if (predicate === undefined || !ts.isTypePredicateNode(predicate) || predicate.type === undefined || predicate.assertsModifier !== undefined) {
    return NOTHING_SPELLED.tuples;
  }
  const guarded = predicate.parameterName;
  const signature = predicate.parent;
  const parameter = ts.isFunctionLike(signature)
    ? signature.parameters.find((candidate) => ts.isIdentifier(candidate.name) && ts.isIdentifier(guarded) && candidate.name.text === guarded.text)
    : undefined;
  if (!isRawInput(parameter?.type)) {
    return NOTHING_SPELLED.tuples;
  }
  const origins = yield* originsOf(oracle, sources, [predicate.type]);
  return origins?.tuples ?? NOTHING_SPELLED.tuples;
}
