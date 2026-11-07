// Which tuples a string literal's slot takes its vocabulary from, read off the type annotation its declaration spells.
// Types cannot say: a one-member union, an `Exclude` and a re-spelled subset all hold the same literals as the tuple.
// The syntax is read once from the standalone parse; each engine answers only the three symbol queries.
import type { APIRequestGenerator } from "@typescript/native/sync";
import ts from "typescript";
import type { LiteralRole, Site, Sources } from "./classify.ts";
import { isProductionFile, nameAt } from "./classify.ts";

/** The tuples a slot derives from, as `file:NAME` keys; null when the slot's declaration cannot be read, which no
 *  tuple may rule out. */
export type Origins = ReadonlySet<string> | null;

/** A value, or the requests that produce it: the native engine batches its questions, the TypeScript 6 engine answers at once. */
export type Answer<T> = T | APIRequestGenerator<T>;

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

type Declared = readonly ts.TypeNode[] | null;

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

// The declaration a name site belongs to, or null for one outside the production sources.
function declarationAt(sources: Sources, site: Site): ts.Node | null {
  return isProductionFile(site.file) ? (nameAt(sources.get(site.file), site.position)?.parent ?? null) : null;
}

function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : null;
}

// The annotations of the property's declarations; undefined when it has none to read, so the object's own slot decides.
function* propertyTypes(
  oracle: SlotOracle,
  sources: Sources,
  property: ts.PropertyAssignment,
  object: ts.ObjectLiteralExpression,
): APIRequestGenerator<Declared | undefined> {
  const name = propertyName(property.name);
  const sites = name === null ? [] : yield* answered(oracle.propertiesOf(siteOf(object), name));
  const types: ts.TypeNode[] = [];
  for (const site of sites) {
    const declaration = declarationAt(sources, site);
    if (declaration === null) {
      return null;
    }
    const type = annotationOf(declaration);
    if (type !== undefined) {
      types.push(type);
    }
  }
  return types.length === 0 ? undefined : types;
}

function* parameterTypes(oracle: SlotOracle, sources: Sources, argument: ts.Node): APIRequestGenerator<Declared> {
  const site = yield* answered(oracle.parameterOf(siteOf(argument)));
  const type = annotationOf(site === null ? null : declarationAt(sources, site));
  return type === undefined ? null : [type];
}

const isArgument = (parent: ts.Node, node: ts.Node): boolean =>
  (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && (parent.arguments?.some((argument) => argument === node) ?? false);

// The annotations of the slot a value flows into.
function* receivingTypes(oracle: SlotOracle, sources: Sources, start: ts.Node): APIRequestGenerator<Declared> {
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
      return yield* parameterTypes(oracle, sources, node);
    }
    if (ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isObjectLiteralExpression(parent.parent)) {
      const declared = yield* propertyTypes(oracle, sources, parent, parent.parent);
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
function* operandTypes(oracle: SlotOracle, sources: Sources, operand: ts.Node): APIRequestGenerator<Declared> {
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

type NamedType = ts.TypeReferenceNode | ts.TypeQueryNode;

function namedTypes(root: ts.TypeNode): readonly NamedType[] {
  const found: NamedType[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) || ts.isTypeQueryNode(node)) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

const rightmost = (name: ts.EntityName): ts.Identifier => (ts.isIdentifier(name) ? name : name.right);

// What one declaration of a named type adds: a tuple key (`typeof TUPLE`), or the type an alias or a type parameter's
// constraint spells. Null: a type parameter with no constraint, which can be anything. Undefined: nothing to read.
function expansion(named: NamedType, site: Site, declaration: ts.Node | null): ts.TypeNode | string | null | undefined {
  if (declaration === null) {
    return undefined;
  }
  if (ts.isTypeQueryNode(named)) {
    return ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) ? `${site.file}:${declaration.name.text}` : undefined;
  }
  if (ts.isTypeAliasDeclaration(declaration)) {
    return declaration.type;
  }
  return ts.isTypeParameterDeclaration(declaration) ? (declaration.constraint ?? null) : undefined;
}

interface Reached {
  readonly tuples: readonly string[];
  readonly types: readonly ts.TypeNode[];
}

// Everything one named type adds; null when its declaration cannot be read.
function* reach(oracle: SlotOracle, sources: Sources, named: NamedType): APIRequestGenerator<Reached | null> {
  const sites = yield* answered(oracle.declarationsOf(siteOf(rightmost(ts.isTypeQueryNode(named) ? named.exprName : named.typeName))));
  const tuples: string[] = [];
  const types: ts.TypeNode[] = [];
  for (const site of sites) {
    const next = expansion(named, site, declarationAt(sources, site));
    if (next === null) {
      return null;
    }
    if (typeof next === "string") {
      tuples.push(next);
    } else if (next !== undefined) {
      types.push(next);
    }
  }
  return sites.length === 0 ? null : { tuples, types };
}

// The tuples a type reaches, following aliases and constraints.
function* originsOf(oracle: SlotOracle, sources: Sources, types: readonly ts.TypeNode[]): APIRequestGenerator<Origins> {
  const found = new Set<string>();
  const seen = new Set<ts.Node>();
  const pending = [...types];
  for (let root = pending.pop(); root !== undefined; root = pending.pop()) {
    if (seen.has(root)) {
      continue;
    }
    seen.add(root);
    for (const named of namedTypes(root)) {
      const reached = yield* reach(oracle, sources, named);
      if (reached === null) {
        return null;
      }
      for (const tuple of reached.tuples) {
        found.add(tuple);
      }
      pending.push(...reached.types);
    }
  }
  return found;
}

function* declaredAt(oracle: SlotOracle, sources: Sources, node: ts.Node, role: LiteralRole | "record-key"): APIRequestGenerator<Declared> {
  const { parent } = node;
  switch (role) {
    case "construct":
      return yield* receivingTypes(oracle, sources, node);
    case "record-key":
      return ts.isObjectLiteralExpression(parent.parent) ? yield* receivingTypes(oracle, sources, parent.parent) : null;
    case "case":
      return ts.isCaseClause(parent) && ts.isSwitchStatement(parent.parent.parent)
        ? yield* operandTypes(oracle, sources, parent.parent.parent.expression)
        : null;
    case "compare":
      return ts.isBinaryExpression(parent) ? yield* operandTypes(oracle, sources, parent.left === node ? parent.right : parent.left) : null;
    case "key":
    case "type":
    case "module":
      return null;
  }
}

/** The tuples the slot of the literal or key at `site` derives from. */
export function* slotOrigins(oracle: SlotOracle, sources: Sources, site: Site, role: LiteralRole | "record-key"): APIRequestGenerator<Origins> {
  const node = nameAt(sources.get(site.file), site.position);
  const types = node === undefined ? null : yield* declaredAt(oracle, sources, node, role);
  return types === null ? null : yield* originsOf(oracle, sources, types);
}
