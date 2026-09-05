// Invocation-local collector for traversal-free class/JSX facts; expression semantics live at the front door.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type {
  RuntimeClassPrefix,
  StaticClassCandidate,
  StaticClassCarrierFact,
  StaticClassFactResult,
  StaticClassTokenFact,
  StaticJsxStylePropertyFact,
  StaticValue,
} from "../contract/static-class-expression.ts";
import type { DiagnosticKind, EvalState, Evaluation } from "./static-class-fact-engine.ts";
import { staticClassFactEngine as engine } from "./static-class-fact-engine.ts";

export interface StaticClassFactReader {
  readonly visit: (node: MorphNode) => void;
  readonly finish: () => StaticClassFactResult;
}

type MutableCandidate = StaticClassCandidate & { consumers: MorphNode[] };
type MutablePrefix = RuntimeClassPrefix & { consumers: MorphNode[] };

function addCandidate(items: MutableCandidate[], value: StaticValue, consumer: MorphNode): void {
  const anchor = value.segments[0];
  const found = items.find((item) => item.value === value.value && item.segments[0]?.node.compilerNode === anchor?.node.compilerNode);
  if (found === undefined) {
    items.push({ ...value, consumers: [consumer] });
  } else if (!found.consumers.includes(consumer)) {
    found.consumers.push(consumer);
  }
}

/** Allocate inside GatePolicy.create; feed only nodes delivered by the shared dispatcher. */
export function createStaticClassFactReader(): StaticClassFactReader {
  const carriers: StaticClassCarrierFact[] = [];
  const candidates: MutableCandidate[] = [];
  const runtimePrefixes: MutablePrefix[] = [];
  const unresolved: Array<{ node: MorphNode; reason: string }> = [];
  const opaque: Array<{ node: MorphNode; reason: string }> = [];
  const styleProperties: StaticJsxStylePropertyFact[] = [];
  let finished = false;
  const diagnose = (kind: DiagnosticKind, node: MorphNode, reason: string): void => {
    const target = kind === "unresolved" ? unresolved : opaque;
    if (!target.some((item) => item.node.compilerNode === node.compilerNode && item.reason === reason)) {
      target.push({ node, reason });
    }
  };
  const state = (): EvalState => ({ active: new Set(), diagnose });
  const add = (evaluation: Evaluation, consumer: MorphNode): void => {
    for (const value of evaluation.values) {
      addCandidate(candidates, value, consumer);
    }
    for (const prefix of evaluation.prefixes) {
      runtimePrefixes.push({ ...prefix, consumers: [consumer] });
    }
  };
  const objectFacts = (expression: MorphNode, consumer: MorphNode): void => {
    const value = engine.authored(expression, state());
    if (value?.kind !== "object") {
      return;
    }
    for (const property of engine.selectedProperties(value, new Set(["class", "className"]))) {
      carriers.push({ kind: "jsx-spread", node: consumer });
      add(engine.valueOfAuthored(property.value), consumer);
    }
    const style = engine.selectedProperties(value, new Set(["style"]))[0];
    if (style?.value.kind === "object") {
      for (const property of style.value.properties) {
        styleProperties.push({ attribute: consumer, name: property.key, nameNode: property.keyNode, value: property.value });
      }
    }
  };
  const jsxFacts = (node: import("ts-morph").JsxAttribute): void => {
    const name = node.getNameNode().getText();
    const init = node.getInitializer();
    const expression = Node.isJsxExpression(init) ? init.getExpression() : init;
    if (name === "className") {
      carriers.push({ kind: "jsx-class", node });
      if (expression !== undefined) {
        add(engine.evaluate(expression, state()), node);
      }
      return;
    }
    if (name !== "style" || expression === undefined) {
      return;
    }
    const value = engine.authored(expression, state());
    if (value?.kind === "object") {
      for (const property of value.properties) {
        styleProperties.push({ attribute: node, name: property.key, nameNode: property.keyNode, value: property.value });
      }
    }
  };
  const propertyFacts = (node: import("ts-morph").PropertyAssignment): void => {
    if (node.getName() !== "className" && node.getName() !== "class") {
      return;
    }
    carriers.push({ kind: "class-property", node });
    const init = node.getInitializer();
    if (init !== undefined) {
      add(engine.evaluate(init, state()), node);
    }
  };
  const callFacts = (node: import("ts-morph").CallExpression): void => {
    const composer = engine.composerOf(node);
    if (composer === undefined) {
      return;
    }
    carriers.push({ kind: "composer", node, composer });
    add(engine.composerEvaluation(node, composer, state()), node);
  };
  const visit = (node: MorphNode): void => {
    if (finished) {
      throw new Error("static class fact reader received a node after finish");
    }
    if (Node.isJsxAttribute(node)) {
      jsxFacts(node);
      return;
    }
    if (Node.isJsxSpreadAttribute(node)) {
      objectFacts(node.getExpression(), node);
      return;
    }
    if (Node.isPropertyAssignment(node)) {
      propertyFacts(node);
      return;
    }
    if (Node.isShorthandPropertyAssignment(node) && (node.getName() === "className" || node.getName() === "class")) {
      carriers.push({ kind: "class-property", node });
      add(engine.evaluate(node.getNameNode(), state()), node);
      return;
    }
    if (Node.isCallExpression(node)) {
      callFacts(node);
    }
  };
  return {
    visit,
    finish: (): StaticClassFactResult => {
      finished = true;
      const tokens: StaticClassTokenFact[] = candidates.flatMap((candidate) =>
        engine.tokenSlices(candidate).map((token) => ({ ...token, consumers: candidate.consumers })),
      );
      return { carriers, candidates, tokens, runtimePrefixes, unresolved, opaque, styleProperties };
    },
  };
}
