// Neutral entrypoint for static class-expression provenance. The pass-owned Project is the only graph;
// evaluator caches and cycle fences live for one walk and never leak across conformance phases.
import type { Project, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { evalComposerCall } from "./static-class-collections.ts";
import type {
  Composer,
  StaticClassCandidate,
  StaticClassEvaluation,
  StaticClassWalk,
  StaticObjectPropertyEvaluation,
  StaticValue,
} from "./static-class-expression-model.ts";
import { findObjectProperties, propertyName } from "./static-class-object.ts";
import { StaticClassEvaluator } from "./static-class-value.ts";

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
  roots: number;
}

function candidateKey(value: StaticValue): string {
  const anchor = value.segments[0];
  return `${value.value}|${anchor?.node.getSourceFile().getFilePath() ?? ""}:${anchor?.sourceStart ?? -1}`;
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
    addValues(state, state.evaluator.evalClass(value, new Set()), node);
  }
  return true;
}

function propertyRoot(state: WalkState, node: import("ts-morph").PropertyAssignment): boolean {
  if (propertyName(state.evaluator, node.getNameNode(), new Set()) !== "className") {
    return false;
  }
  const initializer = node.getInitializer();
  if (initializer !== undefined) {
    state.roots += 1;
    addValues(state, state.evaluator.evalClass(initializer, new Set()), node);
  }
  return true;
}

function composerRoot(state: WalkState, node: import("ts-morph").CallExpression): boolean {
  const composer = state.evaluator.composers.composerOf(node.getExpression());
  if (!concreteComposer(composer)) {
    return false;
  }
  state.roots += 1;
  addValues(state, evalComposerCall(state.evaluator, node, composer, new Set()), node);
  return true;
}

function walkNode(state: WalkState, node: Node): void {
  if (Node.isJsxAttribute(node) && jsxRoot(state, node)) {
    return;
  }
  if (Node.isPropertyAssignment(node) && propertyRoot(state, node)) {
    return;
  }
  if (Node.isShorthandPropertyAssignment(node) && node.getName() === "className") {
    state.roots += 1;
    addValues(state, state.evaluator.evalClass(node.getNameNode(), new Set()), node);
    return;
  }
  if (Node.isCallExpression(node)) {
    composerRoot(state, node);
  }
}

/** Discover and evaluate all statically provable class expressions rooted in `files`. */
export function walkStaticClassExpressions(project: Project, files: readonly SourceFile[]): StaticClassWalk {
  const evaluator = new StaticClassEvaluator(project, files);
  const state: WalkState = { evaluator, candidateByKey: new Map(), roots: 0 };
  for (const source of files) {
    for (const node of source.getDescendants()) {
      walkNode(state, node);
    }
  }
  return {
    roots: state.roots,
    candidates: [...state.candidateByKey.values()],
    runtimePrefixes: evaluator.runtimePrefixes,
    unresolved: evaluator.unresolved,
    opaque: evaluator.opaque,
  };
}

function evaluation(evaluator: StaticClassEvaluator, values: readonly StaticValue[], consumer: Node): StaticClassEvaluation {
  const candidates = new Map<string, StaticClassCandidate>();
  for (const value of values) {
    candidates.set(candidateKey(value), { ...value, consumers: [consumer] });
  }
  return {
    candidates: [...candidates.values()],
    runtimePrefixes: evaluator.runtimePrefixes,
    unresolved: evaluator.unresolved,
    opaque: evaluator.opaque,
  };
}

/** Evaluate one proven carrier expression without performing whole-file root discovery. */
export function evaluateStaticClassExpression(expression: Node, consumer: Node): StaticClassEvaluation {
  const evaluator = new StaticClassEvaluator(expression.getProject());
  return evaluation(evaluator, evaluator.evalClass(expression, new Set()), consumer);
}

/** Evaluate only class/className properties reachable from one proven rendered object-spread carrier. */
export function evaluateStaticClassProperties(expression: Node, consumer: Node): StaticClassEvaluation {
  const evaluator = new StaticClassEvaluator(expression.getProject());
  const properties = findObjectProperties(evaluator, expression, new Set(["class", "className"]), new Set());
  return evaluation(
    evaluator,
    properties.flatMap((property) => evaluator.evalClass(property.value, new Set())),
    consumer,
  );
}

/** Resolve exact property writes reachable from one proven object-spread carrier. */
export function evaluateStaticObjectProperties(expression: Node, consumer: Node, names: readonly string[]): StaticObjectPropertyEvaluation {
  const evaluator = new StaticClassEvaluator(expression.getProject());
  const properties = findObjectProperties(evaluator, expression, new Set(names), new Set()).map((property) => ({ ...property, consumer }));
  return { properties, unresolved: evaluator.unresolved, opaque: evaluator.opaque };
}
