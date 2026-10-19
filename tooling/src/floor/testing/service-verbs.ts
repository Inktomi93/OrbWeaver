// Every verb an exported domain `*Service` interface exposes, resolved from its member to the function that
// implements it. A spelling the shared readers cannot follow is an unjudged verb with its reason, never a pass.
import type {
  BindingElement,
  FunctionDeclaration,
  InterfaceDeclaration,
  ObjectLiteralElementLike,
  ObjectLiteralExpression,
  Project,
  SourceFile,
  Type,
} from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { readCallReturns } from "../code-facts/call-returns.ts";
import { unwrapExpression } from "../code-facts/expression-value.ts";
import { readStaticString, resolveGlobalMemberOrigin, resolveStableExpression, staticMemberAccess } from "../code-facts/reference-fact.ts";

const SERVICE_CONTRACT_RE = /^(?<root>.*\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/)contract\/service\.ts$/u;
const SERVICE_SUFFIX = "Service";
const BIND_MEMBER = "bind";
const GLOBAL_SYMBOL = "Symbol";
/** D328 bound: each value step is one hop; a verb still unresolved past it is unjudged. */
const SERVICE_VERB_HOPS = 10;

export interface ServiceVerb {
  readonly domain: string;
  readonly service: string;
  readonly verb: string;
  /** The interface that DECLARES the member, which differs from `service` for an inherited verb. */
  readonly declaredIn: string;
}

/** A verb and the function-like nodes that implement it; any of them executing proves the verb ran. */
export interface ResolvedServiceVerb extends ServiceVerb {
  readonly functions: readonly Node[];
}

export interface UnjudgedServiceVerb extends ServiceVerb {
  readonly reason: string;
}

export interface ServiceVerbCensus {
  readonly resolved: readonly ResolvedServiceVerb[];
  readonly unjudged: readonly UnjudgedServiceVerb[];
}

type Step<T> = { readonly kind: "resolved"; readonly value: readonly T[] } | { readonly kind: "unjudged"; readonly reason: string };

const unjudged = (reason: string): { readonly kind: "unjudged"; readonly reason: string } => ({ kind: "unjudged", reason });
const found = <T>(...value: T[]): Step<T> => ({ kind: "resolved", value });
const at = (node: Node): string => `${node.getSourceFile().getBaseName()}:${String(node.getStartLineNumber())}`;

function isVerbDeclaration(declaration: Node): boolean {
  if (Node.isMethodSignature(declaration)) {
    return true;
  }
  const typeNode = Node.isPropertySignature(declaration) ? declaration.getTypeNode() : undefined;
  return typeNode !== undefined && Node.isFunctionTypeNode(typeNode);
}

function isFunctionValue(node: Node): boolean {
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node);
}

function all<T, U>(values: readonly T[], each: (value: T) => Step<U>): Step<U> {
  const out: U[] = [];
  for (const value of values) {
    const step = each(value);
    if (step.kind === "unjudged") {
      return step;
    }
    out.push(...step.value);
  }
  return { kind: "resolved", value: out };
}

function then<T, U>(step: Step<T>, each: (value: T) => Step<U>): Step<U> {
  return step.kind === "resolved" ? all(step.value, each) : step;
}

function beyondBound(node: Node, hops: number): Step<never> | undefined {
  return hops > SERVICE_VERB_HOPS ? unjudged(`past the ${String(SERVICE_VERB_HOPS)}-hop resolution bound at ${at(node)}`) : undefined;
}

function stable(node: Node, hops: number): Step<Node> {
  const fact = resolveStableExpression(node);
  if (fact.kind === "resolved") {
    return found(fact.value);
  }
  // The stable reader stops at a function declaration (not a const alias) and at a call (a runtime value);
  // both are terminals this walk continues from.
  if (Node.isFunctionDeclaration(fact.node) || (fact.reason === "dynamic" && Node.isCallExpression(fact.node))) {
    return found<Node>(fact.node);
  }
  return Node.isBindingElement(fact.node) ? destructured(fact.node, hops) : unjudged(`${fact.detail} at ${at(node)}`);
}

/** `const { verb } = factory(...)`: the member the const object pattern reads from its initializer. */
function destructured(element: BindingElement, hops: number): Step<Node> {
  const pattern = element.getParent();
  const declaration = pattern.getParent();
  const initializer =
    Node.isVariableDeclaration(declaration) &&
    declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() === VariableDeclarationKind.Const
      ? declaration.getInitializer()
      : undefined;
  if (!(Node.isObjectBindingPattern(pattern) && initializer !== undefined) || element.getDotDotDotToken() !== undefined) {
    return unjudged(`destructured binding ${element.getText()} at ${at(element)} has no const object initializer`);
  }
  const key = element.getPropertyNameNode() ?? element.getNameNode();
  if (!Node.isIdentifier(key)) {
    return unjudged(`destructured key ${key.getText()} at ${at(element)} is not a plain name`);
  }
  return then(objectsOf(initializer, hops + 1), (object) => memberValues(object, key.getText(), hops + 1));
}

function returnsOf(call: Node): Step<Node> {
  if (!Node.isCallExpression(call)) {
    return unjudged(`${call.getKindName()} at ${at(call)} is not a call`);
  }
  const returns = readCallReturns(call);
  return returns.kind === "resolved" ? found(...returns.value) : unjudged(`${returns.detail} at ${at(call)}`);
}

/** One value step shared by the object and function walks: a stable binding, a call's returns or an object member. */
function valuesOf(node: Node, hops: number): Step<Node> {
  if (Node.isIdentifier(node)) {
    return stable(node, hops);
  }
  if (Node.isCallExpression(node)) {
    return returnsOf(node);
  }
  const member = staticMemberAccess(node);
  if (member === undefined || !(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return unjudged(`${node.getKindName()} at ${at(node)} is not a value this reader follows`);
  }
  return then(objectsOf(node.getExpression(), hops + 1), (owner) => {
    const values = memberValues(owner, member.name, hops + 1);
    return values.kind === "resolved" && values.value.length === 0 ? unjudged(`no member ${member.name} on the object at ${at(owner)}`) : values;
  });
}

function objectsOf(raw: Node, hops: number): Step<ObjectLiteralExpression> {
  const node = unwrapExpression(raw);
  const bound = beyondBound(node, hops);
  if (bound !== undefined) {
    return bound;
  }
  return Node.isObjectLiteralExpression(node) ? found(node) : then(valuesOf(node, hops), (value) => objectsOf(value, hops + 1));
}

function functionsOf(raw: Node, hops: number): Step<Node> {
  const node = unwrapExpression(raw);
  const bound = beyondBound(node, hops);
  if (bound !== undefined) {
    return bound;
  }
  if (isFunctionValue(node)) {
    return found(node);
  }
  const callee = Node.isCallExpression(node) ? unwrapExpression(node.getExpression()) : undefined;
  if (
    callee !== undefined &&
    staticMemberAccess(callee)?.name === BIND_MEMBER &&
    (Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))
  ) {
    return functionsOf(callee.getExpression(), hops + 1);
  }
  return then(valuesOf(node, hops), (value) => functionsOf(value, hops + 1));
}

/** `undefined` when this property cannot define `name`; otherwise the value it binds, or why it is unreadable. */
function propertyValue(property: ObjectLiteralElementLike, name: string, hops: number): Step<Node> | undefined {
  if (Node.isSpreadAssignment(property)) {
    const values = then(objectsOf(property.getExpression(), hops + 1), (inner) => memberValues(inner, name, hops + 1));
    return values.kind === "resolved" && values.value.length === 0 ? undefined : values;
  }
  if (!(Node.isPropertyAssignment(property) || Node.isMethodDeclaration(property) || Node.isShorthandPropertyAssignment(property))) {
    return unjudged(`${property.getKindName()} at ${at(property)} may define ${name}`);
  }
  const nameNode = property.getNameNode();
  if (Node.isComputedPropertyName(nameNode)) {
    return computedKeyCannotDefine(nameNode.getExpression(), name) ? undefined : unjudged(`a computed key at ${at(property)} may define ${name}`);
  }
  if (property.getName() !== name) {
    return undefined;
  }
  if (Node.isMethodDeclaration(property)) {
    return found<Node>(property);
  }
  if (Node.isShorthandPropertyAssignment(property)) {
    return found<Node>(property.getNameNode());
  }
  return found(property.getInitializerOrThrow());
}

/** A well-known `Symbol` member key, or a static string key spelled otherwise, cannot define `name`. */
function computedKeyCannotDefine(key: Node, name: string): boolean {
  const text = readStaticString(key);
  if (text.kind === "resolved") {
    return text.value !== name;
  }
  const origin = resolveGlobalMemberOrigin(key);
  return origin.kind === "resolved" && origin.value.globalName === GLOBAL_SYMBOL;
}

/** The value an object exposes under `name`: the last authored property, shorthand, method or spread wins. */
function memberValues(object: ObjectLiteralExpression, name: string, hops: number): Step<Node> {
  for (const property of object.getProperties().toReversed()) {
    const value = propertyValue(property, name, hops);
    if (value !== undefined) {
      return value;
    }
  }
  return found();
}

function factoryReturns(fn: FunctionDeclaration): readonly Node[] {
  return fn
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter((statement) => statement.getFirstAncestor((ancestor) => Node.isFunctionLikeDeclaration(ancestor)) === fn)
    .flatMap((statement) => statement.getExpression() ?? []);
}

/** A factory's returned objects, followed down `path` to the object that carries the service's members. */
function serviceObjects(factory: FunctionDeclaration, path: readonly string[]): Step<ObjectLiteralExpression> {
  let objects = all(factoryReturns(factory), (value) => objectsOf(value, 1));
  for (const segment of path) {
    objects = then(objects, (object) => then(memberValues(object, segment, 1), (value) => objectsOf(value, 2)));
  }
  return objects;
}

function verbFunctions(builder: ServiceBuilder, verb: string): Step<Node> {
  return then(serviceObjects(builder.factory, builder.path), (object) => {
    const values = memberValues(object, verb, 1);
    return values.kind === "resolved" && values.value.length === 0
      ? unjudged(`${builder.factory.getName() ?? "the factory"} returns no member ${verb} at ${at(object)}`)
      : then(values, (value) => functionsOf(value, 2));
  });
}

interface ServiceBuilder {
  readonly factory: FunctionDeclaration;
  /** Property names from the returned value to the service object; empty when the factory returns the service. */
  readonly path: readonly string[];
}

function isOrExtends(type: Type, iface: InterfaceDeclaration, seen = new Set<Type>()): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);
  return type.getSymbol()?.getDeclarations().includes(iface) === true || type.getBaseTypes().some((base) => isOrExtends(base, iface, seen));
}

/** A factory whose declared return type is the service, extends it, or carries it under exactly one property. */
function serviceBuilder(factory: FunctionDeclaration, iface: InterfaceDeclaration): ServiceBuilder | undefined {
  if (factory.getReturnTypeNode() === undefined) {
    return undefined;
  }
  const type = factory.getReturnType();
  if (isOrExtends(type, iface)) {
    return { factory, path: [] };
  }
  const carriers = type.getProperties().filter((property) => isOrExtends(property.getTypeAtLocation(factory), iface));
  const carrier = carriers.length === 1 ? carriers[0] : undefined;
  return carrier === undefined ? undefined : { factory, path: [carrier.getName()] };
}

/** Named verb members with their declarations; a symbol-keyed member (`[Symbol.asyncDispose]`) is not a verb. */
function serviceVerbs(iface: InterfaceDeclaration, domain: string): readonly { readonly verb: ServiceVerb; readonly declaration: Node }[] {
  return iface
    .getType()
    .getProperties()
    .flatMap((property) => {
      const declaration = property.getDeclarations()[0];
      if (
        declaration === undefined ||
        !isVerbDeclaration(declaration) ||
        Node.isComputedPropertyName(declaration.getFirstChildByKind(SyntaxKind.ComputedPropertyName))
      ) {
        return [];
      }
      const parent = declaration.getParent();
      const declaredIn = parent !== undefined && Node.isInterfaceDeclaration(parent) ? parent.getName() : iface.getName();
      return [{ verb: { domain, service: iface.getName(), verb: property.getName(), declaredIn }, declaration }];
    });
}

function judgeInterface(iface: InterfaceDeclaration, domain: string, factories: readonly FunctionDeclaration[], census: ServiceVerbCensusBuilder): void {
  const builders = factories.flatMap((factory) => serviceBuilder(factory, iface) ?? []);
  for (const { verb, declaration } of serviceVerbs(iface, domain)) {
    // An interface that extends another judged service re-exposes its members; each declaration is judged once.
    if (census.seen.has(declaration)) {
      continue;
    }
    census.seen.add(declaration);
    const step: Step<Node> =
      builders.length === 0
        ? unjudged(`no function in domain/${domain} declares a return type that is or carries ${iface.getName()}`)
        : all(builders, (builder) => verbFunctions(builder, verb.verb));
    if (step.kind === "unjudged") {
      census.unjudged.push({ ...verb, reason: step.reason });
    } else {
      census.resolved.push({ ...verb, functions: step.value });
    }
  }
}

interface ServiceVerbCensusBuilder {
  readonly seen: Set<Node>;
  readonly resolved: ResolvedServiceVerb[];
  readonly unjudged: UnjudgedServiceVerb[];
}

/** Resolve every exported domain `*Service` verb in the program's sources. */
export function readServiceVerbs(project: Project): ServiceVerbCensus {
  const census: ServiceVerbCensusBuilder = { seen: new Set(), resolved: [], unjudged: [] };
  const sources: readonly SourceFile[] = project.getSourceFiles();
  for (const contract of sources) {
    const match = SERVICE_CONTRACT_RE.exec(contract.getFilePath())?.groups;
    const domain = match?.["domain"];
    const root = match?.["root"];
    if (domain === undefined || root === undefined) {
      continue;
    }
    const factories = sources.filter((source) => source.getFilePath().startsWith(root)).flatMap((source) => source.getFunctions());
    for (const iface of contract.getInterfaces()) {
      if (iface.getName().endsWith(SERVICE_SUFFIX) && iface.isExported()) {
        judgeInterface(iface, domain, factories, census);
      }
    }
  }
  return { resolved: census.resolved, unjudged: census.unjudged };
}
