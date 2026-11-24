// `pnpm unwired params` as a query over the reference graph (D357): optional parameters and optional props no product
// call or JSX element supplies, and parameters every product call passes the same literal. The callables are the
// graph's declarations; their calls come from the session's merged program (getSignatureUsage), and a reference that is
// no call is judged by the graph's value-use reader (roles.ts valueUse).
//
// - A callable whose value escapes in product code (handed on, stored, exported as a default, read by a namespace
//   member as a dynamic import's loader does) is never judged: a call the scan cannot see may supply anything.
// - A usage counts for a callable only where the checker resolves its name to that callable's own declaration, so a
//   sibling or base member find-references groups with it neither calls nor escapes it.
// - A shorthand key (`{ listed }`) hands on the binding it names, so it is resolved through that binding.
// - A prop belongs to its declaration, not to one callable: a product construction anywhere in find-references' own
//   group for the prop (a sibling callee's argument, a spread a pipeline adds) supplies it for every callable whose
//   parameter carries it. Find-references does not search a literal whose slot is a generic parameter, so every product
//   write the graph kept for the prop (GraphFacts.roleSites, kept for {@link PARAMS_HOMES}) is judged as a construction too. A construction whose value
//   reads the same prop only relays it, and a literal that reaches no call or JSX attribute (a callee's own default
//   fill, a constant nothing passes) supplies nothing.
// - The buckets are the engine scan's, less its `disagreements` list: the graph is the one engine.
import type {
  Expression,
  JsxAttributeLike,
  MethodSignatureDeclaration,
  Node,
  ObjectLiteralElementLike,
  ParameterDeclaration,
  PropertySignatureDeclaration,
} from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isBigIntLiteral,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isConditionalExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionTypeNode,
  isIdentifier,
  isInterfaceDeclaration,
  isJsxAttribute,
  isJsxAttributes,
  isJsxElement,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isJsxSpreadAttribute,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isSpreadElement,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, NodeHandle } from "@typescript/native/sync";
import { SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { DeliberateEntry } from "../deliberate.ts";
import { sortRows } from "../deliberate.ts";
import type { JudgedEntry, JudgedSplit } from "../judged.ts";
import type { NativeWorld } from "../native.ts";
import { declarationKeys, hasFlag } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { Graph } from "./build.ts";
import { nodeAt } from "./declared.ts";
import type { DeclKey } from "./resolve.ts";
import { answer, declKeyParts, keyText, Resolver } from "./resolve.ts";
import type { ValueUse } from "./roles.ts";
import { occurrenceRoles, sameNode, valueUse } from "./roles.ts";
import { declarationNameOf } from "./sites.ts";
import { unwrapValue } from "./slots.ts";
import type { RoleSite } from "./state.ts";

const PARAM_KINDS = ["unsupplied", "same-literal", "unsupplied-prop"] as const;
/** `unsupplied`: an optional parameter no product call passes. `same-literal`: every product call passes the same
 *  literal. `unsupplied-prop`: an optional property of a parameter's type no product call or JSX element sets. */
type ParamKind = (typeof PARAM_KINDS)[number];

interface UnwiredParam {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  /** The callable: a function, or `Home.member` for a method of a named type or class. */
  readonly home: string;
  /** The parameter, or `parameter.prop` for an unsupplied prop. */
  readonly member: string;
  readonly kind: ParamKind;
  /** The literal every call passes, for `same-literal`. */
  readonly literal: string | null;
  readonly calls: number;
  /** Test calls that supply what the product never does. */
  readonly tests: number;
}

/** The root and the deliberate and judged lists a params report sorts its rows by. */
export interface ParamsLists {
  readonly root: string;
  readonly deliberate: readonly DeliberateEntry[];
  readonly judged?: readonly JudgedEntry[] | undefined;
}

/** The params report: its rows split by the deliberate and judged lists, and what the scan cannot see. */
export interface ParamsReport {
  readonly scanned: number;
  readonly unwired: readonly UnwiredParam[];
  readonly deliberate: readonly (UnwiredParam & { readonly reason: string })[];
  /** Rows a board item owns, with the item. */
  readonly judged: JudgedSplit<UnwiredParam>["judged"];
  /** Judged entries whose row no longer reports or whose item is no longer open. */
  readonly staleJudged: JudgedSplit<UnwiredParam>["staleJudged"];
  readonly limits: readonly string[];
}

/** What the params scan cannot see, printed with every run. */
const PARAM_LIMITS: readonly string[] = [
  "A callable whose value escapes (handed on, stored in a registry or object, exported as a default, read through a namespace) is never judged: a call the scan cannot see may supply anything.",
  "A call through a computed name (obj[name](...)) or from outside the tree (a plugin guest, the published SDK, a script) is not seen; a callable only such a caller reaches reports its options unsupplied.",
  "Only a file the graph walks (knip's project population) declares a callable.",
  "A spread argument or a spread inside an argument object literal supplies every prop; a non-literal argument supplies every prop of its type.",
  "A call counts only where its name resolves to the callable's own declaration: a call through an interface a class implements is the interface member's, not the class method's.",
  "A value supplied only from a JSON or scenario file is not a supply; a reference in a type position is neither a call nor an escape.",
  "A prop any product construction of its declaration sets is supplied for every callable that takes it, so a callable whose own callers never set a shared prop keeps its default path unreported.",
  "A construction supplies a prop only when its literal reaches a call argument or is a JSX attribute, and its value does not read the same prop: a literal stored in a local or a constant and later handed to a sibling callee by name is not seen as that sibling's supply.",
  "Two declarations of one concept are separate homes: a prop supplied only through a restated options type reports on the other; judge it with the shapes scan.",
  "A parameter typed by a single literal is never same-literal: its type, not its callers, fixes the value, as in a structural view of a platform method.",
];

/** The declaration files whose role sites the build keeps for params: every product package, so each product write of
 *  a prop is judged. */
export const PARAMS_HOMES = ["packages/"] as const;

// The minimum calls before an identical literal says more than "it has one caller".
const SAME_LITERAL_CALLS = 2;

// The declaration kinds a callable can be, before its syntax is read.
const CALLABLE_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.VariableDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.PropertySignature,
]);

interface Prop {
  readonly name: string;
  /** The declaration keys of the property symbol: a find-references group is this prop's when its symbol shares one. */
  readonly keys: readonly string[];
  /** The product declarations, the first of which find-references is asked at. */
  readonly declarations: readonly NodeHandle[];
}

interface Parameter {
  readonly name: string;
  readonly optional: boolean;
  readonly rest: boolean;
  /** Its declared type admits one literal, so every call passes that literal whatever its caller wants. */
  readonly unit: boolean;
  /** Optional properties of its type that the product declares. */
  readonly props: readonly Prop[];
}

/** One argument a call passes: its literal text, and the keys it supplies when it is an object literal or a JSX
 *  element's attributes. `keys` is null when a spread or a non-literal may supply any key. */
interface ArgumentShape {
  readonly literal: string | null;
  readonly keys: readonly string[] | null;
}

/** A call, `new` or JSX element that invokes the callable. `arguments` is null when a spread hides them. */
interface CallShape {
  readonly arguments: readonly ArgumentShape[] | null;
}

/** A callable as written: its declarations (overloads and merged declarations share one row) and their syntax. */
interface Written {
  readonly key: string;
  readonly decls: readonly DeclKey[];
  readonly file: string;
  readonly line: number;
  readonly home: string;
  /** The node getSignatureUsage is asked about. */
  readonly declaration: Node;
  readonly declared: readonly ParameterDeclaration[];
}

interface Callable extends Omit<Written, "declared"> {
  readonly parameters: readonly Parameter[];
}

interface Calls {
  readonly production: readonly CallShape[];
  readonly tests: readonly CallShape[];
  /** Product references that hand the value on, so a call the scan cannot see may supply anything. */
  readonly escapes: number;
}

// A method signature's parameters, or those of a function type written on a property; a property typed any other way
// names no parameters of its own.
function signatureParameters(node: MethodSignatureDeclaration | PropertySignatureDeclaration): readonly ParameterDeclaration[] {
  if (isMethodSignatureDeclaration(node)) {
    return node.parameters;
  }
  return isFunctionTypeNode(node.type) ? node.type.parameters : [];
}

// The named object type a type member belongs to, as `Home` or `Home.nested`; null for a member of any other type
// literal (a parameter's, a return's), which the scan does not judge as a callable.
function memberHome(member: Node): string | null {
  const owner = member.parent;
  if (isInterfaceDeclaration(owner)) {
    return owner.name.text;
  }
  if (!isTypeLiteralNode(owner)) {
    return null;
  }
  const holder = owner.parent;
  if (isTypeAliasDeclaration(holder)) {
    return holder.name.text;
  }
  if (isPropertySignatureDeclaration(holder) && isIdentifier(holder.name)) {
    const outer = memberHome(holder);
    return outer === null ? null : `${outer}.${holder.name.text}`;
  }
  return null;
}

// A function as a value: a declaration, or a variable holding an arrow or function expression.
function valueCallable(node: Node): Pick<Written, "home" | "declared"> | null {
  if (isFunctionDeclaration(node) && node.name !== undefined) {
    return { home: node.name.text, declared: node.parameters };
  }
  if (!(isVariableDeclaration(node) && isIdentifier(node.name))) {
    return null;
  }
  const value = unwrapValue(node.initializer);
  return value !== undefined && (isArrowFunction(value) || isFunctionExpression(value)) ? { home: node.name.text, declared: value.parameters } : null;
}

// A member reached as a property: a class method, or a callable member of a named object type that takes parameters.
function memberCallable(node: Node): Pick<Written, "home" | "declared"> | null {
  const owner = node.parent;
  if (isMethodDeclaration(node) && isIdentifier(node.name) && (isClassDeclaration(owner) || isClassExpression(owner))) {
    return { home: `${owner.name?.text ?? "<class>"}.${node.name.text}`, declared: node.parameters };
  }
  if (!((isMethodSignatureDeclaration(node) || isPropertySignatureDeclaration(node)) && isIdentifier(node.name))) {
    return null;
  }
  const home = memberHome(node);
  const declared = signatureParameters(node);
  return home === null || declared.length === 0 ? null : { home: `${home}.${node.name.text}`, declared };
}

// The graph's product declarations that are callables, one row per `file:home`; the first declaration speaks for its
// overloads.
function writtenCallables(graph: Graph, world: NativeWorld): readonly Written[] {
  const rows = new Map<string, { written: Written; decls: DeclKey[] }>();
  const keys = [...graph.facts.decls]
    .filter(([, info]) => CALLABLE_KINDS.has(info.kind) && isProduction(info.file))
    .toSorted(([a], [b]) => {
      const left = declKeyParts(a);
      const right = declKeyParts(b);
      return left.file === right.file ? left.pos - right.pos : left.file.localeCompare(right.file);
    });
  for (const [key, info] of keys) {
    const source = world.source(info.file);
    const node = source === undefined ? undefined : nodeAt(source, declKeyParts(key));
    const shape = node === undefined ? null : (valueCallable(node) ?? memberCallable(node));
    if (node === undefined || shape === null) {
      continue;
    }
    const row = `${info.file}:${shape.home}`;
    const known = rows.get(row);
    if (known === undefined) {
      rows.set(row, { written: { key: row, decls: [], file: info.file, line: info.line, declaration: node, ...shape }, decls: [key] });
    } else {
      known.decls.push(key);
    }
  }
  return [...rows.values()].map(({ written, decls }) => ({ ...written, decls }));
}

// A destructured parameter has no name of its own; its position stands in.
const parameterName = (parameter: ParameterDeclaration, index: number): string => (isIdentifier(parameter.name) ? parameter.name.text : `#${String(index)}`);

function callables(world: NativeWorld, written: readonly Written[]): readonly Callable[] {
  const { checker } = world;
  const product = (handle: NodeHandle): boolean => {
    const file = world.fileOf(handle);
    return file !== null && isProduction(file);
  };
  const facts = world.batch(
    written.map(function* ({ declared }) {
      const out: { readonly unit: boolean; readonly props: readonly Prop[] }[] = [];
      for (const parameter of declared) {
        const type = yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(parameter));
        const members = yield* checker.getPropertiesOfType.gen(type);
        out.push({
          unit: hasFlag(type.flags, TypeFlags.Literal),
          props: members.flatMap((member) => {
            const declarations = member.declarations.filter(product);
            return hasFlag(member.flags, SymbolFlags.Optional) && declarations.length > 0
              ? [{ name: member.name, keys: declarationKeys(member), declarations }]
              : [];
          }),
        });
      }
      return out;
    }),
  );
  return written.map(({ declared, ...callable }, at) => ({
    ...callable,
    parameters: declared.map((parameter, index) => ({
      name: parameterName(parameter, index),
      optional: parameter.questionToken !== undefined || parameter.initializer !== undefined,
      rest: parameter.dotDotDotToken !== undefined,
      unit: facts[at]?.[index]?.unit ?? false,
      props: facts[at]?.[index]?.props ?? [],
    })),
  }));
}

const LITERAL_KEYWORDS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword, SyntaxKind.NullKeyword]);

function literalText(node: Expression): string | null {
  if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) || isNumericLiteral(node) || isBigIntLiteral(node) || LITERAL_KEYWORDS.has(node.kind)) {
    return node.getText();
  }
  if (isIdentifier(node) && node.text === "undefined") {
    return "undefined";
  }
  return isPrefixUnaryExpression(node) && node.operator === SyntaxKind.MinusToken && isNumericLiteral(node.operand) ? node.getText() : null;
}

// An object literal's keys, or null when a spread or a computed key may supply any.
function literalKeys(node: Expression): readonly string[] | null {
  if (!isObjectLiteralExpression(node)) {
    return null;
  }
  const keys: string[] = [];
  for (const property of node.properties) {
    const name = isSpreadAssignment(property) ? undefined : keyText(property.name);
    if (name === undefined) {
      return null;
    }
    keys.push(name);
  }
  return keys;
}

function callShape(call: Node): CallShape | null {
  if (!(isCallExpression(call) || isNewExpression(call))) {
    return null;
  }
  const args = call.arguments ?? [];
  return { arguments: args.some(isSpreadElement) ? null : args.map((argument) => ({ literal: literalText(argument), keys: literalKeys(argument) })) };
}

// A JSX element whose tag is the name: its attributes are one props argument, children between the tags included.
function jsxShape(name: Node): CallShape | null {
  const tag = isPropertyAccessExpression(name.parent) && sameNode(name.parent.name, name) ? name.parent : name;
  const element = tag.parent;
  if (!((isJsxOpeningElement(element) || isJsxSelfClosingElement(element)) && sameNode(element.tagName, tag))) {
    return null;
  }
  const keys: string[] = [];
  for (const attribute of element.attributes.properties) {
    if (isJsxSpreadAttribute(attribute)) {
      return { arguments: [{ literal: null, keys: null }] };
    }
    keys.push(attribute.name.getText());
  }
  if (isJsxOpeningElement(element) && isJsxElement(element.parent) && element.parent.children.length > 0) {
    keys.push("children");
  }
  return { arguments: [{ literal: null, keys }] };
}

// Whether a product reference that is no call hands the value on, by the graph's value-use reader (roles.ts valueUse):
// a type position and a forwarding specifier only label it; a doc comment, which occurrenceRoles gives no role, is
// not code. A store into the callable's member (`o.send = f`, `[o.send] = list`) replaces its value and hands nothing
// on. An implementation supplying a member (`{ send: () => … }`) never reaches here, since its name resolves to the
// literal's own member.
const LABELLING_USES: ReadonlySet<ValueUse> = new Set<ValueUse>(["type", "store"]);
const escapes = (name: Node): boolean => !LABELLING_USES.has(valueUse(name)) && occurrenceRoles(name).length > 0;

function* noNode(): APIRequestGenerator<Node | undefined> {
  return yield* answer<Node | undefined>(undefined);
}

// What one usage does: a call or JSX element with its shape, a product reference that hands the value on, or nothing.
type Usage = { readonly kind: "call"; readonly shape: CallShape; readonly product: boolean } | { readonly kind: "escape" } | { readonly kind: "none" };

function usageOf(world: NativeWorld, name: Node, call: Node | undefined): Usage {
  const product = isProduction(world.fileOfSource(name.getSourceFile()));
  const shape = valueUse(name) === "call" ? ((call === undefined ? null : callShape(call)) ?? jsxShape(name)) : null;
  if (shape !== null) {
    return { kind: "call", shape, product };
  }
  return product && escapes(name) ? { kind: "escape" } : { kind: "none" };
}

function tally(usages: readonly Usage[]): Calls {
  const production: CallShape[] = [];
  const tests: CallShape[] = [];
  let escaped = 0;
  for (const usage of usages) {
    if (usage.kind === "call") {
      (usage.product ? production : tests).push(usage.shape);
    } else if (usage.kind === "escape") {
      escaped++;
    }
  }
  return { production, tests, escapes: escaped };
}

// Each callable's calls: getSignatureUsage's name-call pairs, each kept once and only where the name resolves to one of
// the callable's own declarations.
function callsOf(world: NativeWorld, resolver: Resolver, written: readonly Pick<Written, "declaration" | "decls">[]): readonly Calls[] {
  const usages = world.batch(written.map(({ declaration }) => world.signatureUsage(declaration)));
  const flat = usages.flatMap((list, x) => list.map((usage) => ({ usage, x })));
  const names = world.batch(flat.map(({ usage }) => usage.name.resolve.gen()));
  const invoked = world.batch(flat.map(({ usage }) => (usage.call === undefined ? noNode() : usage.call.resolve.gen())));
  const present = flat.flatMap(({ x }, y) => {
    const name = names[y];
    return name === undefined ? [] : [{ name, call: invoked[y], x }];
  });
  // A shorthand key's name resolves to the literal's own member; the value it hands on is the binding it names.
  const shorthand = present.flatMap(({ name }) => (isShorthandPropertyAssignment(name.parent) && sameNode(name.parent.name, name) ? [name.parent] : []));
  const values = world.shorthandValues(shorthand);
  const symbols = world.symbolsAt(present.map(({ name }) => name));
  let next = 0;
  const owners = resolver.declarations(
    present.map(({ name }, y) => (isShorthandPropertyAssignment(name.parent) && sameNode(name.parent.name, name) ? values[next++] : symbols[y])),
  );
  const byCallable = written.map(() => new Map<string, Usage>());
  for (const [y, { name, call, x }] of present.entries()) {
    const callable = written[x];
    const site = `${world.fileOfSource(name.getSourceFile())}:${String(name.pos)}`;
    const seen = byCallable[x];
    if (callable !== undefined && seen !== undefined && !seen.has(site) && (owners[y] ?? []).some((owner) => callable.decls.includes(owner))) {
      seen.set(site, usageOf(world, name, call));
    }
  }
  return byCallable.map((seen) => tally([...seen.values()]));
}

const passes = (call: CallShape, index: number): boolean => call.arguments === null || call.arguments.length > index;

function setsProp(call: CallShape, index: number, prop: string): boolean {
  if (call.arguments === null) {
    return true;
  }
  const argument = call.arguments[index];
  return argument !== undefined && (argument.keys === null || argument.keys.includes(prop));
}

function sameLiteral(calls: readonly CallShape[], index: number): string | null {
  const literals = new Set(calls.map((call) => call.arguments?.[index]?.literal ?? null));
  const [only] = literals;
  return calls.length >= SAME_LITERAL_CALLS && literals.size === 1 && only !== undefined ? only : null;
}

// The literal a construction sits in reaches a call or `new` argument, through nested literals, spreads, parentheses,
// assertions and conditional branches. A literal stored in a local or a module constant supplies nothing by itself:
// a callee's own default fill (`const filled = { ...options, color: options.color ?? "red" }`) is such a store, and a
// constant handed on by name already supplies every prop through its identifier argument.
function reachesCall(literal: Node): boolean {
  let at = literal;
  for (;;) {
    const { parent } = at;
    if (isParenthesizedExpression(parent) || isAsExpression(parent) || isSatisfiesExpression(parent) || isNonNullExpression(parent)) {
      at = parent;
    } else if (isConditionalExpression(parent) && !sameNode(parent.condition, at)) {
      at = parent;
    } else if ((isSpreadAssignment(parent) || isPropertyAssignment(parent)) && isObjectLiteralExpression(parent.parent)) {
      at = parent.parent;
    } else {
      const argument = at;
      return (isCallExpression(parent) || isNewExpression(parent)) && (parent.arguments ?? []).some((candidate) => sameNode(candidate, argument));
    }
  }
}

interface Construction {
  readonly file: string;
  /** The span of the value the construction gives, so a read of the same prop inside it marks a relay. */
  readonly start: number;
  readonly end: number;
}

// The construction whose key is `node`: an object literal key whose literal reaches a call, or a JSX attribute. A store
// through an access (`options.x ??= fallback`) is a callee filling its own default, never a supply.
function constructionAt(node: Node, file: string): Construction | null {
  const { parent } = node;
  const source = node.getSourceFile();
  if (isJsxAttribute(parent) && sameNode(parent.name, node)) {
    return { file, start: parent.initializer?.getStart(source) ?? parent.end, end: parent.end };
  }
  if ((isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent)) && sameNode(parent.name, node) && reachesCall(parent.parent)) {
    const value = isPropertyAssignment(parent) ? parent.initializer : parent.name;
    return { file, start: value.getStart(source), end: value.end };
  }
  return null;
}

interface Reference {
  readonly node: Node;
  readonly file: string;
}

// Each prop's occurrences in find-references' group for its own symbol: a group another declaration heads is a base's
// or a sibling's, not this prop's.
function referencesOf(world: NativeWorld, props: readonly Prop[]): readonly (readonly Reference[])[] {
  const declarations = world.batch(props.map(({ declarations: [first] }) => (first === undefined ? noNode() : first.resolve.gen())));
  const names = declarations.map((node) => (node === undefined ? undefined : declarationNameOf(node)));
  const groups = world.batch(names.map((name) => (name === undefined ? noGroups() : world.referencedSymbolsOf(name))));
  const handles = props.map(({ keys }, x) =>
    (groups[x] ?? [])
      .filter(({ symbol }) => symbol !== undefined && declarationKeys(symbol).some((key) => keys.includes(key)))
      .flatMap(({ references }) => references.filter((handle) => world.fileOf(handle) !== null)),
  );
  const nodes = world.batch(handles.flat().map((handle) => handle.resolve.gen()));
  let at = 0;
  return handles.map((list) => {
    const found = nodes.slice(at, at + list.length).flatMap((node) => (node === undefined ? [] : [{ node, file: world.fileOfSource(node.getSourceFile()) }]));
    at += list.length;
    return found;
  });
}

// The key a slot write names. The graph records an object literal key's write at the full start of the key itself, and
// a JSX attribute's at the full start of the attribute list that holds it (./slots.ts), so the key is the property of
// the prop's name that starts there, or that list's attribute of the prop's name.
function writtenKey(world: NativeWorld, { file, at }: RoleSite, name: string): Reference | null {
  let found: Node | undefined;
  const keyNamed = (property: ObjectLiteralElementLike | JsxAttributeLike): Node | undefined =>
    isSpreadAssignment(property) || isJsxSpreadAttribute(property) || keyText(property.name) !== name ? undefined : property.name;
  const visit = (node: Node): void => {
    if (found !== undefined || node.pos > at || node.end <= at) {
      return;
    }
    if (isObjectLiteralExpression(node)) {
      found = node.properties.map(keyNamed).find((key) => key?.pos === at);
    } else if (isJsxAttributes(node) && node.pos === at) {
      found = node.properties.map(keyNamed).find((key) => key !== undefined);
    }
    if (found === undefined) {
      node.forEachChild(visit);
    }
  };
  world.source(file)?.forEachChild(visit);
  return found === undefined ? null : { node: found, file };
}

// Whether a product construction supplies each prop: an occurrence in its find-references group, or any product write
// the graph kept for it (GraphFacts.roleSites), which also reaches a literal whose slot is a generic parameter
// find-references does not search. Every write is judged, so the order the walk meets them in decides nothing.
// A construction whose value reads the same prop (`inner({ ...options, tone: options.tone ?? "flat" })`) only relays
// the value it was given, so it supplies nothing.
function constructed(world: NativeWorld, graph: Graph, resolver: Resolver, props: readonly Prop[]): ReadonlySet<string> {
  const unique = [...new Map(props.map((prop) => [prop.keys.join(","), prop])).values()];
  const references = referencesOf(world, unique);
  const supplied = new Set<string>();
  for (const [x, prop] of unique.entries()) {
    const own = references[x] ?? [];
    // A shorthand's value span is its own key: only another occurrence is a read.
    const relays = (made: Construction, key: Node): boolean =>
      own.some(
        ({ node, file }) =>
          !sameNode(node, key) && file === made.file && node.getStart(node.getSourceFile()) >= made.start && node.getStart(node.getSourceFile()) < made.end,
      );
    const supplies = ({ node, file }: Reference): boolean => {
      const made = isProduction(file) ? constructionAt(node, file) : null;
      return made !== null && !relays(made, node);
    };
    const writes = resolver
      .handleKeys(prop.declarations)
      .flatMap((key) => graph.facts.roleSites.get(key) ?? [])
      .filter((site) => site.role === "write" && isProduction(site.file));
    const written = writes.flatMap((site) => writtenKey(world, site, prop.name) ?? []);
    if (own.some(supplies) || written.some(supplies)) {
      supplied.add(prop.keys.join(","));
    }
  }
  return supplied;
}

function* noGroups(): ReturnType<NativeWorld["referencedSymbolsOf"]> {
  yield* [];
  return [];
}

const unsetProps = (callable: Callable, calls: Calls): readonly Prop[] =>
  calls.escapes > 0 || calls.production.length === 0
    ? []
    : callable.parameters.flatMap((parameter, index) =>
        parameter.rest || (parameter.optional && !calls.production.some((call) => passes(call, index)))
          ? []
          : parameter.props.filter((prop) => !calls.production.some((call) => setsProp(call, index, prop.name))),
      );

function judge(callable: Callable, calls: Calls, supplied: ReadonlySet<string>): readonly UnwiredParam[] {
  if (calls.escapes > 0 || calls.production.length === 0) {
    return [];
  }
  const { key, file, line, home } = callable;
  const finding = (member: string, kind: ParamKind, literal: string | null, supplying: number): UnwiredParam => ({
    key: `${key}:${member}:${kind}`,
    file,
    line,
    home,
    member,
    kind,
    literal,
    calls: calls.production.length,
    tests: supplying,
  });
  return callable.parameters.flatMap((parameter, index): UnwiredParam[] => {
    if (parameter.rest) {
      return [];
    }
    if (parameter.optional && !calls.production.some((call) => passes(call, index))) {
      return [finding(parameter.name, "unsupplied", null, calls.tests.filter((call) => passes(call, index)).length)];
    }
    const literal = parameter.unit ? null : sameLiteral(calls.production, index);
    const same = literal === null ? [] : [finding(parameter.name, "same-literal", literal, 0)];
    const props = parameter.props
      .filter((prop) => !(calls.production.some((call) => setsProp(call, index, prop.name)) || supplied.has(prop.keys.join(","))))
      .map((prop) => finding(`${parameter.name}.${prop.name}`, "unsupplied-prop", null, calls.tests.filter((call) => setsProp(call, index, prop.name)).length));
    return [...same, ...props];
  });
}

/** Judge every product callable the graph declares against its calls in the session's merged program. */
export function paramsPass(graph: Graph, world: NativeWorld, rows: ParamsLists): ParamsReport {
  const resolver = new Resolver(world);
  const found = callables(world, writtenCallables(graph, world));
  const calls = callsOf(world, resolver, found);
  const supplied = constructed(
    world,
    graph,
    resolver,
    found.flatMap((callable, at) => {
      const own = calls[at];
      return own === undefined ? [] : unsetProps(callable, own);
    }),
  );
  const findings = found.flatMap((callable, at) => {
    const own = calls[at];
    return own === undefined ? [] : judge(callable, own, supplied);
  });
  return { scanned: found.length, ...sortRows(findings, rows), limits: PARAM_LIMITS };
}
