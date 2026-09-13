// Invocation-local adapter from the mature evaluator to final traversal-free class/JSX facts.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { StaticAuthoredObjectValue, StaticAuthoredValue } from "../contract/static-authored-value.ts";
import type {
  StaticClassCarrierFact,
  StaticClassFactResult,
  StaticClassSegment,
  StaticClassTokenFact,
  StaticJsxStylePropertyFact,
  StaticValue,
} from "../contract/static-class-expression.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";
import { StaticClassCollector } from "./static-class-expression.ts";

export interface StaticClassFactReader {
  readonly visit: (node: MorphNode) => void;
  readonly finish: () => StaticClassFactResult;
}

function selectedProperties(value: StaticAuthoredObjectValue, names: ReadonlySet<string>): readonly StaticAuthoredObjectValue["properties"][number][] {
  const selected = new Map(value.properties.filter((property) => names.has(property.key)).map((property) => [property.key, property]));
  return [...selected.values()];
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

function sliceSegments(segments: readonly StaticClassSegment[], start: number, end: number): StaticClassSegment[] {
  return segments.flatMap((segment): StaticClassSegment[] => {
    const from = Math.max(start, segment.valueStart);
    const to = Math.min(end, segment.valueEnd);
    return from >= to
      ? []
      : [{ node: segment.node, valueStart: from - start, valueEnd: to - start, sourceStart: segment.sourceStart + from - segment.valueStart }];
  });
}

function tokenSlices(value: StaticValue): StaticValue[] {
  const tokens: StaticValue[] = [];
  let start = -1;
  let depth = 0;
  for (let index = 0; index <= value.value.length; index += 1) {
    const char = value.value[index];
    const separator = char === undefined || (depth === 0 && isWhitespace(char));
    if (start === -1 && !separator) {
      start = index;
    }
    if (char === "[" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === ")") {
      depth = Math.max(0, depth - 1);
    }
    if (separator && start !== -1) {
      const end = index;
      const tokenStart = start;
      const segments = sliceSegments(value.segments, tokenStart, end);
      tokens.push({ value: value.value.slice(start, end), segments });
      start = -1;
    }
  }
  return tokens;
}

interface Diagnostic {
  readonly node: MorphNode;
  readonly reason: string;
}
type Diagnose = (kind: "unresolved" | "opaque", node: MorphNode, reason: string) => void;

interface FactTargets {
  readonly admitted: ReadonlySet<object>;
  readonly carriers: StaticClassCarrierFact[];
  readonly diagnose: Diagnose;
  readonly styleProperties: StaticJsxStylePropertyFact[];
}

function authoredNodes(value: StaticAuthoredValue): MorphNode[] {
  if (value.kind === "scalar") {
    return [value.node];
  }
  if (value.kind === "tuple") {
    return [value.node, ...value.elements.flatMap(authoredNodes)];
  }
  return [value.node, ...value.properties.flatMap((property) => [property.keyNode, ...authoredNodes(property.value)])];
}

function authoredObject(expression: MorphNode, admitted: ReadonlySet<object>, diagnose: Diagnose): StaticAuthoredObjectValue | undefined {
  const fact = readStaticAuthoredValue(expression);
  if (fact.kind === "unresolved") {
    diagnose(fact.reason === "dynamic" || fact.reason === "missing" ? "opaque" : "unresolved", fact.node, fact.detail);
    return;
  }
  if (fact.value.kind !== "object") {
    return;
  }
  const escaped = authoredNodes(fact.value).find((node) => !admitted.has(node.getSourceFile().compilerNode));
  if (escaped !== undefined) {
    diagnose("unresolved", escaped, "authored JSX value resolves outside the exact static-class population");
    return;
  }
  return fact.value;
}

function appendStyleProperties(target: StaticJsxStylePropertyFact[], attribute: MorphNode, object: StaticAuthoredObjectValue): void {
  for (const property of object.properties) {
    target.push({ attribute, name: property.key, nameNode: property.keyNode, value: property.value });
  }
}

function recordJsxAttribute(node: import("ts-morph").JsxAttribute, target: FactTargets): void {
  const initializer = node.getInitializer();
  const expression = Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer;
  const name = node.getNameNode().getText();
  if (name === "className") {
    target.carriers.push({ kind: "jsx-class", node });
  } else if (name === "style" && expression !== undefined) {
    const object = authoredObject(expression, target.admitted, target.diagnose);
    if (object !== undefined) {
      appendStyleProperties(target.styleProperties, node, object);
    }
  }
}

function recordJsxSpread(node: import("ts-morph").JsxSpreadAttribute, rooted: boolean, target: FactTargets): void {
  if (rooted) {
    target.carriers.push({ kind: "jsx-spread", node });
  }
  const object = authoredObject(node.getExpression(), target.admitted, target.diagnose);
  const style = object === undefined ? undefined : selectedProperties(object, new Set(["style"]))[0];
  if (style?.value.kind === "object") {
    appendStyleProperties(target.styleProperties, node, style.value);
  }
}

function recordRootCarrier(node: MorphNode, rooted: boolean, carriers: StaticClassCarrierFact[], collector: StaticClassCollector): void {
  if (!rooted) {
    return;
  }
  if (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) {
    carriers.push({ kind: "class-property", node });
  } else if (Node.isCallExpression(node)) {
    const composer = collector.composerOf(node);
    if (composer !== undefined) {
      carriers.push({ kind: "composer", node, composer });
    }
  }
}

/** Allocate inside one shared fact provider; feed only nodes delivered by the shared dispatcher. */
export function createStaticClassFactReader(files: readonly SourceFile[]): StaticClassFactReader {
  if (files.length === 0) {
    throw new Error("static class fact reader requires a nonempty exact source population");
  }
  const admitted = new Set(files.map((file) => file.compilerNode));
  const collector = new StaticClassCollector(files);
  const nodes: MorphNode[] = [];
  const carriers: StaticClassCarrierFact[] = [];
  const styleProperties: StaticJsxStylePropertyFact[] = [];
  const supplementalUnresolved: Diagnostic[] = [];
  const supplementalOpaque: Diagnostic[] = [];
  let finished = false;
  const diagnose: Diagnose = (kind, node, reason) => {
    const target = kind === "unresolved" ? supplementalUnresolved : supplementalOpaque;
    if (!target.some((item) => item.node.compilerNode === node.compilerNode && item.reason === reason)) {
      target.push({ node, reason });
    }
  };
  const targets = { admitted, carriers, diagnose, styleProperties } satisfies FactTargets;
  const visit = (node: MorphNode): void => {
    if (finished) {
      throw new Error("static class fact reader received a node after finish");
    }
    if (!admitted.has(node.getSourceFile().compilerNode)) {
      throw new Error(`static class fact reader received an out-of-population node: ${node.getSourceFile().getFilePath()}`);
    }
    nodes.push(node);
    collector.index(node);
  };
  return {
    visit,
    finish: (): StaticClassFactResult => {
      finished = true;
      for (const node of nodes) {
        const rootsBefore = collector.work.rootEvaluations;
        collector.visit(node);
        const rooted = collector.work.rootEvaluations > rootsBefore;
        if (Node.isJsxAttribute(node)) {
          recordJsxAttribute(node, targets);
        } else if (Node.isJsxSpreadAttribute(node)) {
          recordJsxSpread(node, rooted, targets);
        } else {
          recordRootCarrier(node, rooted, carriers, collector);
        }
      }
      const walked = collector.walk();
      const tokens: StaticClassTokenFact[] = walked.candidates.flatMap((candidate) =>
        tokenSlices(candidate).map((token) => ({ ...token, consumers: candidate.consumers })),
      );
      return {
        ...walked,
        classUnresolved: walked.unresolved,
        carriers,
        tokens,
        styleProperties,
        unresolved: [...walked.unresolved, ...supplementalUnresolved],
        opaque: [...walked.opaque, ...supplementalOpaque],
      };
    },
  };
}
