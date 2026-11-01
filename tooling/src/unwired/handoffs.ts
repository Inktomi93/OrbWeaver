// Value flows no name shows: a value handed to a slot of a restated type carries its members across. A compiler-checked
// hand-off makes same-named members one value, so each pair is a flow, from the handed type's members to the slot's.
import type { Expression, Node } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isBlock,
  isCallExpression,
  isJsxExpression,
  isNewExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isReturnStatement,
  isShorthandPropertyAssignment,
  isSpreadElement,
  isStringLiteral,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, SignatureKind, TypeFlags } from "@typescript/native/sync";
import type { NativeWorld } from "./native.ts";
import { constituents, declarationKeys, hasFlag, propertiesNamed } from "./native.ts";
import { isProduction } from "./worlds.ts";

/** A value that moves from `source` members into `sink` members. A use downstream reads the source; a write upstream
 *  fills the sink. Neither holds the other way round. */
export interface Flow {
  readonly source: readonly string[];
  readonly sink: readonly string[];
}

// Enough to cross a function that returns options whose callback takes the twin, and one nested object inside it.
const MAX_DEPTH = 5;

interface TypePair {
  readonly source: Type;
  readonly sink: Type;
  readonly depth: number;
}

// An object literal has its keys resolved by name already.
const isPlainLiteral = (node: Node): boolean =>
  isObjectLiteralExpression(node) || isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) || isNumericLiteral(node);

const withoutSpreads = (nodes: Iterable<Node>): readonly Node[] => [...nodes].filter((node) => !isSpreadElement(node));

// The expression a node gives one slot: a returned value, a JSX value, an arrow's body, an annotated initializer or a key's value.
function givenAt(node: Node): Node | undefined {
  if (isReturnStatement(node) || isJsxExpression(node)) {
    return node.expression;
  }
  if (isArrowFunction(node)) {
    return isBlock(node.body) ? undefined : node.body;
  }
  if (isVariableDeclaration(node)) {
    return node.type === undefined ? undefined : node.initializer;
  }
  if (isPropertyAssignment(node)) {
    return node.initializer;
  }
  return isShorthandPropertyAssignment(node) ? node.name : undefined;
}

// The expressions a node hands to a typed slot.
function handedAt(node: Node): readonly Node[] {
  if (isCallExpression(node) || isNewExpression(node)) {
    return withoutSpreads(node.arguments ?? []);
  }
  if (isArrayLiteralExpression(node)) {
    return withoutSpreads(node.elements);
  }
  const given = givenAt(node);
  return given === undefined ? [] : [given];
}

// Only production hand-offs prove a production flow; a test world repeats those of its production files.
function handedValues(world: NativeWorld, home: ReadonlySet<string>): readonly Node[] {
  const found: Node[] = [];
  const visit = (node: Node): void => {
    found.push(...handedAt(node).filter((handed) => !isPlainLiteral(handed)));
    node.forEachChild(visit);
  };
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file) && home.has(world.siteOf(source).file))) {
    file.forEachChild(visit);
  }
  return found;
}

function* pairAt(world: NativeWorld, handed: Node): APIRequestGenerator<TypePair | null> {
  const sink = yield* world.checker.getContextualType.gen(handed as Expression);
  return sink === undefined ? null : { source: yield* world.checker.getTypeAtLocation.gen(handed), sink, depth: 0 };
}

const isObjectLike = (type: Type): boolean => hasFlag(type.flags, TypeFlags.Object) || hasFlag(type.flags, TypeFlags.Intersection);

function* objectMembers(world: NativeWorld, type: Type): APIRequestGenerator<readonly Type[]> {
  return (yield* constituents(yield* world.checker.getNonNullableType.gen(type))).filter(isObjectLike);
}

interface Compared {
  readonly flows: readonly Flow[];
  readonly next: readonly TypePair[];
}

const isDeclaredInTree = (world: NativeWorld, symbol: NativeSymbol): boolean => symbol.declarations.some((handle) => world.fileOf(handle) !== null);

// A generic of one library target, `Array<Row>` beside `Array<Twin>`: the element is the value, not its methods.
function* sameTargetArguments(world: NativeWorld, source: Type, sink: Type): APIRequestGenerator<readonly { readonly from: Type; readonly to: Type }[] | null> {
  if (!(source.isTypeReference() && sink.isTypeReference())) {
    return null;
  }
  const target = yield* source.getTarget.gen();
  if (target.id !== (yield* sink.getTarget.gen()).id) {
    return null;
  }
  const symbol = yield* target.getSymbol.gen();
  if (symbol === undefined || isDeclaredInTree(world, symbol)) {
    return null;
  }
  const into = yield* world.checker.getTypeArguments.gen(sink);
  return (yield* world.checker.getTypeArguments.gen(source)).flatMap((from, at) => {
    const to = into[at];
    return to === undefined ? [] : [{ from, to }];
  });
}

// A callable's parameters flow against the hand-off: the caller of the slot supplies them. Its result flows with it.
function* signaturePairs(world: NativeWorld, source: Type, sink: Type, depth: number): APIRequestGenerator<readonly TypePair[]> {
  const { checker } = world;
  const [[from], [into]] = yield* all(checker.getSignaturesOfType.gen(source, SignatureKind.Call), checker.getSignaturesOfType.gen(sink, SignatureKind.Call));
  if (from === undefined || into === undefined) {
    return [];
  }
  const [returned, expected, own, theirs] = yield* all(from.getReturnType.gen(), into.getReturnType.gen(), from.getParameters.gen(), into.getParameters.gen());
  const shared = Math.min(own.length, theirs.length);
  const [supplied, taken] = yield* all(checker.getTypeOfSymbol.gen(theirs.slice(0, shared)), checker.getTypeOfSymbol.gen(own.slice(0, shared)));
  const pairs: TypePair[] = [{ source: returned, sink: expected, depth }];
  for (const [at, type] of supplied.entries()) {
    pairs.push({ source: type, sink: taken[at] as Type, depth });
  }
  return pairs;
}

function* propertyPairs(world: NativeWorld, source: Type, sink: Type, depth: number): APIRequestGenerator<Compared> {
  const { checker } = world;
  const properties = yield* checker.getPropertiesOfType.gen(source);
  const named = yield* all(...properties.map((property) => propertiesNamed(checker, sink, property.name)));
  const flows: Flow[] = [];
  const held: (readonly [NativeSymbol, NativeSymbol])[] = [];
  for (const [at, property] of properties.entries()) {
    const own = declarationKeys(property);
    for (const member of (named[at] ?? []).filter((candidate) => candidate !== undefined)) {
      // One generic's member under two instantiations is no flow by itself, but its types may still differ.
      if (isDeclaredInTree(world, property) && isDeclaredInTree(world, member) && !declarationKeys(member).every((key) => own.includes(key))) {
        flows.push({ source: own, sink: declarationKeys(member) });
      }
      held.push([property, member]);
    }
  }
  const [sources, sinks] = yield* all(
    checker.getTypeOfSymbol.gen(held.map(([property]) => property)),
    checker.getTypeOfSymbol.gen(held.map(([, member]) => member)),
  );
  return { flows, next: sources.map((type, at) => ({ source: type, sink: sinks[at] as Type, depth })) };
}

function* comparedMembers(world: NativeWorld, from: Type, into: Type, depth: number): APIRequestGenerator<Compared> {
  const elements = from.id === into.id ? [] : yield* sameTargetArguments(world, from, into);
  if (elements !== null) {
    return { flows: [], next: elements.map(({ from: element, to }) => ({ source: element, sink: to, depth: depth + 1 })) };
  }
  const [signatures, members] = yield* all(signaturePairs(world, from, into, depth + 1), propertyPairs(world, from, into, depth + 1));
  return { flows: members.flows, next: [...signatures, ...members.next] };
}

function* compared(world: NativeWorld, { source, sink, depth }: TypePair): APIRequestGenerator<Compared> {
  const [froms, intos] = yield* all(objectMembers(world, source), objectMembers(world, sink));
  const answers = yield* all(...froms.flatMap((from) => intos.map((into) => comparedMembers(world, from, into, depth))));
  return { flows: answers.flatMap((answer) => answer.flows), next: answers.flatMap((answer) => answer.next) };
}

/** Every member flow the production hand-offs of a world make, each distinct pair of types compared once. */
export function handoffFlows(world: NativeWorld, home: ReadonlySet<string>): readonly Flow[] {
  const flows: Flow[] = [];
  const seen = new Set<string>();
  let pending = world.batch(handedValues(world, home).map((handed) => pairAt(world, handed))).flatMap((pair) => (pair === null ? [] : [pair]));
  while (pending.length > 0) {
    const fresh = new Map(
      pending.filter(({ source, sink, depth }) => depth < MAX_DEPTH && source.id !== sink.id).map((pair) => [`${pair.source.id}|${pair.sink.id}`, pair]),
    );
    const unseen = [...fresh].filter(([key]) => !seen.has(key));
    for (const [key] of unseen) {
      seen.add(key);
    }
    const answers = world.batch(unseen.map(([, pair]) => compared(world, pair)));
    flows.push(...answers.flatMap((answer) => answer.flows));
    pending = answers.flatMap((answer) => answer.next);
  }
  return flows;
}
