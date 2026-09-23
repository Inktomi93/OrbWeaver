// Neutral entrypoint for static class-expression provenance. The pass-owned Project is the only graph;
// evaluator caches and cycle fences live for one walk and never leak across conformance phases.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { evalComposerCall } from "./static-class-collections.ts";
import { ComposerResolver } from "./static-class-composer.ts";
import type {
  Composer,
  RuntimeClassPrefix,
  StaticClassCandidate,
  StaticClassEvaluation,
  StaticClassWalk,
  StaticObjectPropertyEvaluation,
  StaticValue,
} from "./static-class-expression-model.ts";
import { staticClassSourceIndex } from "./static-class-expression-model.ts";
import { evalLucideIconTerminal } from "./static-class-external-terminals.ts";
import { JsxBindingResolver } from "./static-class-jsx.ts";
import { findObjectProperties, propertyName } from "./static-class-object.ts";
import type { StaticClassResolvers } from "./static-class-value.ts";
import { StaticClassEvaluator } from "./static-class-value.ts";
import { StaticVariantResolver } from "./static-class-variant.ts";

export type {
  RuntimeClassPrefix,
  StaticClassCandidate,
  StaticClassEvaluation,
  StaticClassSegment,
  StaticClassWalk,
  StaticObjectPropertyEvaluation,
} from "../contract/static-class-expression.ts";

interface WalkState {
  readonly evaluator: StaticClassEvaluator;
  readonly candidateByKey: Map<string, { readonly value: string; readonly segments: StaticValue["segments"]; readonly consumers: Node[] }>;
  readonly prefixByKey: Map<string, { readonly prefix: string; readonly segments: StaticValue["segments"]; readonly consumers: Node[] }>;
  roots: number;
}

export interface StaticClassWork {
  readonly evaluators: number;
  readonly dispatchedNodes: number;
  readonly rootEvaluations: number;
}

interface MutableWork {
  evaluators: number;
  dispatchedNodes: number;
  rootEvaluations: number;
}

/** HOW MANY COLLECTORS HAVE BEEN BUILT IN THIS PROCESS — the one thing an instance-level counter cannot
 *  say (#2305, the 2026-09-13 CSS-family verifier review ledger row 1).
 *
 *  `StaticClassCollector` already publishes `work.evaluators`, and that reads off ONE instance. A second
 *  collector built beside it therefore has the same `work`, produces byte-identical findings, and is
 *  INVISIBLE — measured: handing `createSelectorWriterPass` its own `ClassCollector` left the
 *  css-hook-provenance suite green and `check:structure` byte-identical. Verdict-neutral and purely a cost
 *  regression, which matters exactly here: the `defineFact`-over-`create` deviation was priced on NOT
 *  duplicating a ~14 s walk, and that was the one property with no pin.
 *
 *  A MODULE COUNTER IS THE ONLY THING THAT SEES IT, because the duplicate is a different object. It counts
 *  CONSTRUCTIONS, never mutation of a shared value, so it is an instrument rather than state a verdict
 *  depends on — nothing in this module reads it. Its test seam is `__resetStaticClassCollectorMints`. */
let collectorMints = 0;

/** Constructions so far. A pass that claims "one collector, N consumers" asserts this moved by exactly 1. */
export function staticClassCollectorMints(): number {
  return collectorMints;
}

/** Test seam: zero the construction counter before a measured pass. */
export function __resetStaticClassCollectorMints(): void {
  collectorMints = 0;
}

/** One resolver graph over an exact source set; callers either stream nodes through visit or call walk. */
export class StaticClassCollector {
  private readonly files: readonly SourceFile[];
  private readonly sourceIndex: ReturnType<typeof staticClassSourceIndex>;
  private readonly resolvers: StaticClassResolvers;
  private readonly mutableWork: MutableWork = { evaluators: 0, dispatchedNodes: 0, rootEvaluations: 0 };
  private readonly sourceSet: ReadonlySet<SourceFile>;
  private readonly visited = new WeakSet<Node>();
  private readonly indexed = new WeakSet<Node>();
  private readonly state: WalkState;
  private walked: StaticClassWalk | undefined;

  constructor(files: readonly SourceFile[]) {
    collectorMints += 1;
    this.files = files;
    this.sourceSet = new Set(files);
    this.sourceIndex = staticClassSourceIndex(files);
    const composers = new ComposerResolver(this.sourceIndex);
    this.resolvers = {
      composers,
      jsxBindings: new JsxBindingResolver(this.sourceIndex),
      variants: new StaticVariantResolver(this.sourceIndex, composers),
    };
    this.state = { evaluator: new StaticClassEvaluator(this.sourceIndex, files, this.resolvers), candidateByKey: new Map(), prefixByKey: new Map(), roots: 0 };
    this.mutableWork.evaluators += 1;
  }

  get work(): StaticClassWork {
    return { ...this.mutableWork };
  }

  private evaluator(): StaticClassEvaluator {
    this.mutableWork.evaluators += 1;
    return new StaticClassEvaluator(this.sourceIndex, this.files, this.resolvers);
  }

  walk(): StaticClassWalk {
    if (this.walked !== undefined) {
      return this.walked;
    }
    this.walked = {
      roots: this.state.roots,
      candidates: [...this.state.candidateByKey.values()],
      runtimePrefixes: [...this.state.prefixByKey.values()],
      unresolved: this.state.evaluator.unresolved,
      opaque: this.state.evaluator.opaque,
    };
    return this.walked;
  }

  visit(node: Node): void {
    if (this.walked !== undefined) {
      throw new Error("static class collector received a node after its result was read");
    }
    if (!this.sourceSet.has(node.getSourceFile()) || this.visited.has(node)) {
      return;
    }
    this.visited.add(node);
    this.index(node);
    this.mutableWork.dispatchedNodes += 1;
    const before = this.state.roots;
    walkNode(this.state, node);
    this.mutableWork.rootEvaluations += this.state.roots - before;
  }

  index(node: Node): void {
    if (!this.sourceSet.has(node.getSourceFile()) || this.indexed.has(node)) {
      return;
    }
    this.indexed.add(node);
    this.resolvers.composers.visit(node);
    this.resolvers.jsxBindings.visit(node);
  }

  evaluate(expression: Node, consumer: Node): StaticClassEvaluation {
    const evaluator = this.evaluator();
    return evaluation(evaluator, evaluator.evalClass(expression, new Set()), consumer);
  }

  evaluateClassProperties(expression: Node, consumer: Node): StaticClassEvaluation {
    const evaluator = this.evaluator();
    const properties = findObjectProperties(evaluator, expression, new Set(["class", "className"]), new Set());
    return evaluation(
      evaluator,
      properties.flatMap((property) => evaluator.evalClass(property.value, new Set())),
      consumer,
    );
  }

  evaluateObjectProperties(expression: Node, consumer: Node, names: readonly string[]): StaticObjectPropertyEvaluation {
    const evaluator = this.evaluator();
    const properties = findObjectProperties(evaluator, expression, new Set(names), new Set()).map((property) => ({ ...property, consumer }));
    return { properties, unresolved: evaluator.unresolved, opaque: evaluator.opaque };
  }

  composerOf(call: import("ts-morph").CallExpression): Exclude<Composer, "tv-factory" | "join-factory"> | undefined {
    const composer = this.state.evaluator.composers.composerOf(call.getExpression());
    if (concreteComposer(composer)) {
      return composer;
    }
    return this.state.evaluator.variants.definitionsOf(call.getExpression()).length > 0 ? "tv" : undefined;
  }
}

function staticClassCollector(files: readonly SourceFile[]): StaticClassCollector {
  return new StaticClassCollector(files);
}

function indexedStaticClassCollector(files: readonly SourceFile[]): StaticClassCollector {
  const collector = staticClassCollector(files);
  for (const source of files) {
    source.forEachDescendant((node) => collector.index(node));
  }
  return collector;
}

export const STATIC_CLASS_KINDS = [
  SyntaxKind.JsxAttribute,
  SyntaxKind.JsxSpreadAttribute,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.CallExpression,
  SyntaxKind.BinaryExpression,
  SyntaxKind.Identifier,
  SyntaxKind.JsxOpeningElement,
  SyntaxKind.JsxSelfClosingElement,
] as const;

function candidateKey(value: StaticValue): string {
  const anchor = value.segments[0];
  return `${value.value}|${anchor?.node.getSourceFile().getFilePath() ?? ""}:${anchor?.sourceStart ?? -1}`;
}

function prefixKey(value: Omit<RuntimeClassPrefix, "consumers">): string {
  const anchor = value.segments[0];
  return `${value.prefix}|${anchor?.node.getSourceFile().getFilePath() ?? ""}:${anchor?.sourceStart ?? -1}`;
}

function addValues(state: WalkState, values: readonly StaticValue[], consumer: Node): void {
  for (const value of values) {
    const key = candidateKey(value);
    const candidate = state.candidateByKey.get(key);
    if (candidate === undefined) {
      state.candidateByKey.set(key, { ...value, consumers: [consumer] });
    } else if (!candidate.consumers.includes(consumer)) {
      candidate.consumers.push(consumer);
    }
  }
}

function addPrefixes(state: WalkState, prefixes: readonly Omit<RuntimeClassPrefix, "consumers">[], consumer: Node): void {
  for (const prefix of prefixes) {
    const key = prefixKey(prefix);
    const before = state.prefixByKey.get(key);
    if (before === undefined) {
      state.prefixByKey.set(key, { ...prefix, consumers: [consumer] });
    } else if (!before.consumers.includes(consumer)) {
      before.consumers.push(consumer);
    }
  }
}

function evaluateRoot(state: WalkState, consumer: Node, evaluate: () => readonly StaticValue[]): void {
  const before = state.evaluator.runtimePrefixes.length;
  addValues(state, evaluate(), consumer);
  addPrefixes(state, state.evaluator.runtimePrefixes.slice(before), consumer);
}

function concreteComposer(composer: Composer | undefined): composer is Exclude<Composer, "tv-factory" | "join-factory"> {
  return composer !== undefined && composer !== "tv-factory" && composer !== "join-factory";
}

function jsxRoot(state: WalkState, node: import("ts-morph").JsxAttribute): boolean {
  if (node.getNameNode().getText() !== "className") {
    return false;
  }
  const initializer = node.getInitializer();
  if (initializer === undefined) {
    return true;
  }
  state.roots += 1;
  const value = Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer;
  if (value !== undefined) {
    evaluateRoot(state, node, () => state.evaluator.evalClass(value, new Set()));
  }
  return true;
}

function spreadRoot(state: WalkState, node: import("ts-morph").JsxSpreadAttribute): void {
  const properties = findObjectProperties(state.evaluator, node.getExpression(), new Set(["class", "className"]), new Set());
  if (properties.length === 0) {
    return;
  }
  state.roots += 1;
  evaluateRoot(state, node, () => properties.flatMap((property) => state.evaluator.evalClass(property.value, new Set())));
}

function propertyRoot(state: WalkState, node: import("ts-morph").PropertyAssignment): boolean {
  if (propertyName(state.evaluator, node.getNameNode(), new Set()) !== "className") {
    return false;
  }
  // Array-contained objects are not class carriers by themselves. Package-specific call terminals own
  // the positional proof (for example IconNode tuple index 1); composer roots own their array configs.
  if (node.getFirstAncestorByKind(SyntaxKind.ArrayLiteralExpression) !== undefined) {
    return true;
  }
  const initializer = node.getInitializer();
  if (initializer !== undefined) {
    state.roots += 1;
    evaluateRoot(state, node, () => state.evaluator.evalClass(initializer, new Set()));
  }
  return true;
}

function composerRoot(state: WalkState, node: import("ts-morph").CallExpression): boolean {
  const composer = state.evaluator.composers.composerOf(node.getExpression());
  if (concreteComposer(composer)) {
    state.roots += 1;
    evaluateRoot(state, node, () => evalComposerCall(state.evaluator, node, composer, new Set()));
    return true;
  }
  const variant = state.evaluator.evalVariantResult(node, new Set());
  if (variant === undefined) {
    return false;
  }
  state.roots += 1;
  evaluateRoot(state, node, () => variant);
  return true;
}

function externalTerminalRoot(state: WalkState, node: import("ts-morph").CallExpression): boolean {
  const values = evalLucideIconTerminal(state.evaluator, node);
  if (values === undefined) {
    return false;
  }
  state.roots += 1;
  evaluateRoot(state, node, () => values);
  return true;
}

function walkNode(state: WalkState, node: Node): void {
  if (Node.isJsxAttribute(node) && jsxRoot(state, node)) {
    return;
  }
  if (Node.isJsxSpreadAttribute(node)) {
    spreadRoot(state, node);
    return;
  }
  if (Node.isPropertyAssignment(node) && propertyRoot(state, node)) {
    return;
  }
  if (Node.isShorthandPropertyAssignment(node) && node.getName() === "className") {
    if (node.getFirstAncestorByKind(SyntaxKind.ArrayLiteralExpression) !== undefined) {
      return;
    }
    state.roots += 1;
    evaluateRoot(state, node, () => state.evaluator.evalClass(node.getNameNode(), new Set()));
    return;
  }
  if (Node.isCallExpression(node) && !externalTerminalRoot(state, node)) {
    composerRoot(state, node);
  }
}

/** Discover and evaluate all statically provable class expressions rooted in `files`. */
export function walkStaticClassExpressions(files: readonly SourceFile[]): StaticClassWalk {
  const collector = indexedStaticClassCollector(files);
  for (const source of files) {
    source.forEachDescendant((node) => collector.visit(node));
  }
  return collector.walk();
}

function evaluation(evaluator: StaticClassEvaluator, values: readonly StaticValue[], consumer: Node): StaticClassEvaluation {
  const candidates = new Map<string, StaticClassCandidate>();
  for (const value of values) {
    candidates.set(candidateKey(value), { ...value, consumers: [consumer] });
  }
  return {
    candidates: [...candidates.values()],
    runtimePrefixes: [...new Map(evaluator.runtimePrefixes.map((prefix) => [prefixKey(prefix), { ...prefix, consumers: [consumer] }])).values()],
    unresolved: evaluator.unresolved,
    opaque: evaluator.opaque,
  };
}

/** Evaluate one proven carrier expression without performing whole-file root discovery. */
export function evaluateStaticClassExpression(files: readonly SourceFile[], expression: Node, consumer: Node): StaticClassEvaluation {
  return indexedStaticClassCollector(files).evaluate(expression, consumer);
}

/** Evaluate only class/className properties reachable from one proven rendered object-spread carrier. */
export function evaluateStaticClassProperties(files: readonly SourceFile[], expression: Node, consumer: Node): StaticClassEvaluation {
  return indexedStaticClassCollector(files).evaluateClassProperties(expression, consumer);
}

/** Resolve exact property writes reachable from one proven object-spread carrier. */
export function evaluateStaticObjectProperties(
  files: readonly SourceFile[],
  expression: Node,
  consumer: Node,
  names: readonly string[],
): StaticObjectPropertyEvaluation {
  return indexedStaticClassCollector(files).evaluateObjectProperties(expression, consumer, names);
}
