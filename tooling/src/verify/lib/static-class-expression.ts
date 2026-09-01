// Neutral entrypoint for static class-expression provenance. The pass-owned Project is the only graph;
// evaluator caches and cycle fences live for one walk and never leak across conformance phases.
import type { Project, SourceFile } from "ts-morph";
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

/** One resolver graph over an exact source set; callers either stream nodes through visit or call walk. */
export class StaticClassCollector {
  private readonly project: Project;
  private readonly files: readonly SourceFile[];
  private readonly resolvers: StaticClassResolvers;
  private readonly mutableWork: MutableWork = { evaluators: 0, dispatchedNodes: 0, rootEvaluations: 0 };
  private readonly sourceSet: ReadonlySet<SourceFile>;
  private readonly visited = new WeakSet<Node>();
  private readonly state: WalkState;
  private readonly passOwned: boolean;
  private walked: StaticClassWalk | undefined;

  constructor(project: Project, files: readonly SourceFile[], passOwned = false) {
    this.project = project;
    this.files = files;
    this.sourceSet = new Set(files);
    this.passOwned = passOwned;
    const composers = new ComposerResolver(project);
    this.resolvers = {
      composers,
      jsxBindings: new JsxBindingResolver(project, files),
      variants: new StaticVariantResolver(project, composers),
    };
    this.state = { evaluator: this.evaluator(), candidateByKey: new Map(), prefixByKey: new Map(), roots: 0 };
  }

  get work(): StaticClassWork {
    return { ...this.mutableWork };
  }

  private evaluator(): StaticClassEvaluator {
    this.mutableWork.evaluators += 1;
    return new StaticClassEvaluator(this.project, this.files, this.resolvers);
  }

  walk(): StaticClassWalk {
    if (this.walked !== undefined) {
      return this.walked;
    }
    if (!this.passOwned) {
      for (const source of this.files) {
        source.forEachDescendant((node) => this.visit(node));
      }
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
    this.mutableWork.dispatchedNodes += 1;
    const before = this.state.roots;
    walkNode(this.state, node);
    this.mutableWork.rootEvaluations += this.state.roots - before;
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
}

function staticClassCollector(project: Project, files: readonly SourceFile[]): StaticClassCollector {
  return new StaticClassCollector(project, files);
}

export const STATIC_CLASS_KINDS = [
  SyntaxKind.JsxAttribute,
  SyntaxKind.JsxSpreadAttribute,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.CallExpression,
  SyntaxKind.BinaryExpression,
] as const;

function defaultCollector(project: Project): StaticClassCollector {
  return new StaticClassCollector(project, project.getSourceFiles());
}

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
export function walkStaticClassExpressions(project: Project, files: readonly SourceFile[]): StaticClassWalk {
  return staticClassCollector(project, files).walk();
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
export function evaluateStaticClassExpression(expression: Node, consumer: Node): StaticClassEvaluation {
  return defaultCollector(expression.getProject()).evaluate(expression, consumer);
}

/** Evaluate only class/className properties reachable from one proven rendered object-spread carrier. */
export function evaluateStaticClassProperties(expression: Node, consumer: Node): StaticClassEvaluation {
  return defaultCollector(expression.getProject()).evaluateClassProperties(expression, consumer);
}

/** Resolve exact property writes reachable from one proven object-spread carrier. */
export function evaluateStaticObjectProperties(expression: Node, consumer: Node, names: readonly string[]): StaticObjectPropertyEvaluation {
  return defaultCollector(expression.getProject()).evaluateObjectProperties(expression, consumer, names);
}
