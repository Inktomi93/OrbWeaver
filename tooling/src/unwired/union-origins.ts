// Which tuples a string literal's slot takes its vocabulary from, read off what its declaration spells: a type annotation,
// or the schema value a type is inferred from. Types cannot say: a one-member union, an `Exclude` and a re-spelled
// subset all hold the same literals as the tuple. Each engine answers only the three symbol queries.
import type { APIRequestGenerator } from "@typescript/native/sync";
import ts from "typescript";
import type { LiteralRole, Site, Sources } from "./classify.ts";
import { isProductionFile, nameAt } from "./classify.ts";

/** The tuples a slot derives from, as `file:NAME` keys; null when the slot's declaration cannot be read to the end,
 *  which no tuple may rule out. */
export type Origins = ReadonlySet<string> | null;

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
}

// What a slot's declaration spells: type annotations, or the value expression a schema-inferred property is written from.
type Declared = readonly ts.Node[] | null;

/** The spellings read for one slot before it is called unreadable: a slot that reaches this many is a generated table or
 *  a whole schema, and ruling a tuple out of it would be a guess. */
const SPELLING_LIMIT = 2000;

/** Run a generator whose engine never issues a request. */
export function settled<T>(generator: APIRequestGenerator<T>): T {
  const step = generator.next();
  if (step.done !== true) {
    throw new Error("a synchronous engine issued an API request");
  }
  return step.value;
}

const siteOf = (node: ts.Node): Site => ({ file: node.getSourceFile().fileName, position: node.getStart() });

const isConstAssertion = (type: ts.TypeNode): boolean => ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === "const";

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

// The spellings of the property's declarations; undefined when it has none to read, so the object's own slot decides.
function* propertySpellings(
  oracle: SlotOracle,
  sources: Sources,
  property: ts.PropertyAssignment,
  object: ts.ObjectLiteralExpression,
): APIRequestGenerator<Declared | undefined> {
  const name = propertyName(property.name);
  const sites = name === null ? [] : yield* answered(oracle.propertiesOf(siteOf(object), name));
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

function* parameterSpellings(oracle: SlotOracle, sources: Sources, argument: ts.Node): APIRequestGenerator<Declared> {
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

/** Whether the literal at `site` initialises an unannotated `const`: it holds its own text, and its slot is wherever
 *  the constant is read. */
export function isNamedConstant(sources: Sources, site: Site): boolean {
  let at = nameAt(sources.get(site.file), site.position);
  while (at !== undefined && passesThrough(at.parent, at) && !ts.isArrayLiteralExpression(at.parent)) {
    at = at.parent;
  }
  const parent = at?.parent;
  return parent !== undefined && ts.isVariableDeclaration(parent) && parent.initializer === at && isUnannotatedConstant(parent);
}

// A module-private constant's reads are all in its file; an exported one is read where the scan cannot follow.
function isFileLocal(declaration: ts.VariableDeclaration): boolean {
  const statement = declaration.parent.parent;
  return ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) !== true;
}

// The spellings of every slot a constant is read into; null when one cannot be read or a read leaves the file.
function* constantSpellings(oracle: SlotOracle, sources: Sources, declaration: ts.VariableDeclaration): APIRequestGenerator<Declared> {
  if (!(isFileLocal(declaration) && isUnannotatedConstant(declaration))) {
    return null;
  }
  const home = siteOf(declaration.name);
  const spellings: ts.Node[] = [];
  for (const use of referencedNames(declaration.getSourceFile()).filter((name) => name.text === declaration.name.getText() && name !== declaration.name)) {
    const sites = yield* answered(oracle.declarationsOf(siteOf(use)));
    if (!sites.some((site) => site.file === home.file && site.position === home.position) || inspectsOnly(use)) {
      continue;
    }
    const declared = yield* receivingSpellings(oracle, sources, use);
    if (declared === null) {
      return null;
    }
    spellings.push(...declared);
  }
  return spellings;
}

// The spellings of the slot a value flows into.
function* receivingSpellings(oracle: SlotOracle, sources: Sources, start: ts.Node): APIRequestGenerator<Declared> {
  let node = start;
  for (;;) {
    const parent = node.parent;
    if (passesThrough(parent, node)) {
      node = parent;
      continue;
    }
    const spelled = spelledFor(parent, node);
    if (spelled !== undefined) {
      return [spelled];
    }
    if (isArgument(parent, node)) {
      return yield* parameterSpellings(oracle, sources, node);
    }
    if (ts.isVariableDeclaration(parent)) {
      return yield* constantSpellings(oracle, sources, parent);
    }
    if (ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isObjectLiteralExpression(parent.parent)) {
      const declared = yield* propertySpellings(oracle, sources, parent, parent.parent);
      if (declared !== undefined) {
        return declared;
      }
      node = parent.parent;
      continue;
    }
    return null;
  }
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
    return { tuple: null, into: [declaration.constraint], opaque: true };
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

interface Read {
  readonly tuples: readonly string[];
  readonly next: readonly ts.Node[];
}

// The tuples one spelling names and the further spellings it leads to; null when it cannot be read to the end.
function* readSpelling(oracle: SlotOracle, sources: Sources, root: ts.Node): APIRequestGenerator<Read | null> {
  const tuples: string[] = [];
  const next: ts.Node[] = [];
  for (const name of referencedNames(root)) {
    const reached = yield* expansionsOf(oracle, sources, name);
    if (reached === null || reached.some(({ opaque }) => opaque)) {
      return null;
    }
    for (const expanded of reached) {
      if (expanded.tuple !== null) {
        tuples.push(expanded.tuple);
      }
      next.push(...expanded.into.filter((spelling): spelling is ts.Node => spelling !== undefined));
    }
  }
  return { tuples, next };
}

// The tuples a slot's spellings reach: a variable reached through `typeof` or by name is a tuple, and aliases, schema
// values, constraints and function bodies are read through. Null when a type name has no declaration, a type parameter
// stands in for the vocabulary, or the reading outgrows the limit: in each the slot may be any tuple's.
function* originsOf(oracle: SlotOracle, sources: Sources, spellings: readonly ts.Node[]): APIRequestGenerator<Origins> {
  const found = new Set<string>();
  const seen = new Set<ts.Node>();
  const pending = [...spellings];
  for (let root = pending.pop(); root !== undefined; root = pending.pop()) {
    if (seen.has(root)) {
      continue;
    }
    seen.add(root);
    const read = seen.size > SPELLING_LIMIT ? null : yield* readSpelling(oracle, sources, root);
    if (read === null) {
      return null;
    }
    for (const tuple of read.tuples) {
      found.add(tuple);
    }
    pending.push(...read.next);
  }
  return found;
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

/** The tuples the type a tuple declared at `name` satisfies is spelled from, so `["a"] as const satisfies readonly P[]`
 *  reaches the tuples `P` derives from and theirs in turn. Empty for a tuple with no `satisfies`, or one that cannot be
 *  read to the end. Spelled from is not subset of: a `keyof` or an indexed access reaches tuples it never holds. */
export function* satisfiedOrigins(oracle: SlotOracle, sources: Sources, name: Site): APIRequestGenerator<ReadonlySet<string>> {
  const declaration = declarationAt(sources, name);
  const spellings: ts.TypeNode[] = [];
  let node = declaration !== null && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
  while (node !== undefined && (ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node))) {
    if (ts.isSatisfiesExpression(node)) {
      spellings.push(node.type);
    }
    node = node.expression;
  }
  const origins = spellings.length === 0 ? null : yield* originsOf(oracle, sources, spellings);
  return origins ?? new Set();
}

/** The tuples the slot of the literal or key at `site` derives from. */
export function* slotOrigins(oracle: SlotOracle, sources: Sources, site: Site, role: LiteralRole | "record-key"): APIRequestGenerator<Origins> {
  const node = nameAt(sources.get(site.file), site.position);
  const spellings = node === undefined ? null : yield* declaredAt(oracle, sources, node, role);
  return spellings === null ? null : yield* originsOf(oracle, sources, spellings);
}
