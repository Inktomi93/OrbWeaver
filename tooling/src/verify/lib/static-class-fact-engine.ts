// Final traversal-free class/JSX facts. One policy invocation owns one reader and streams shared-walk nodes.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ReferenceFact } from "../contract/reference-fact.ts";
import type { StaticAuthoredObjectValue, StaticAuthoredProperty, StaticAuthoredValue } from "../contract/static-authored-value.ts";
import type { Composer, RuntimeClassPrefix, StaticClassSegment, StaticValue } from "../contract/static-class-expression.ts";
import { inspectReferenceWrites, readMemberReference, resolveStableExpression } from "./reference-fact.ts";
import { resolveCallableOrigin } from "./reference-fact-call.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";

type ConcreteComposer = Extract<Composer, "join" | "tv" | "cva">;
type DiagnosticKind = "unresolved" | "opaque";

interface Evaluation {
  readonly values: readonly StaticValue[];
  readonly prefixes: readonly Omit<RuntimeClassPrefix, "consumers">[];
}

interface EvalState {
  readonly active: Set<object>;
  readonly diagnose: (kind: DiagnosticKind, node: MorphNode, reason: string) => void;
}

const COMPOSERS: Readonly<Record<string, Readonly<Record<string, ConcreteComposer>>>> = {
  clsx: { default: "join", clsx: "join" },
  "class-variance-authority": { cva: "cva" },
  "tailwind-variants": { cn: "join", cx: "join", clsx: "join", tv: "tv" },
  "tailwind-merge": { twJoin: "join", twMerge: "join" },
  "@orb/ui/lib": { cn: "join", tv: "tv" },
  "#lib": { cn: "join", tv: "tv" },
};

function empty(): Evaluation {
  return { values: [], prefixes: [] };
}

function literal(node: MorphNode): StaticValue | undefined {
  if (!(Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) {
    return;
  }
  const value = node.getLiteralText();
  return { value, segments: value.length === 0 ? [] : [{ node, valueStart: 0, valueEnd: value.length, sourceStart: node.getStart() + 1 }] };
}

function shifted(segments: readonly StaticClassSegment[], by: number): StaticClassSegment[] {
  return segments.map((segment) => ({ ...segment, valueStart: segment.valueStart + by, valueEnd: segment.valueEnd + by }));
}

function combine(left: StaticValue, right: StaticValue): StaticValue {
  return { value: left.value + right.value, segments: [...left.segments, ...shifted(right.segments, left.value.length)] };
}

function product(left: readonly StaticValue[], right: readonly StaticValue[]): StaticValue[] {
  return left.flatMap((a) => right.map((b) => combine(a, b)));
}

function merge(...evaluations: readonly Evaluation[]): Evaluation {
  return { values: evaluations.flatMap((item) => item.values), prefixes: evaluations.flatMap((item) => item.prefixes) };
}

function refusal(state: EvalState, fact: Extract<ReferenceFact<unknown>, { readonly kind: "unresolved" }>): Evaluation {
  const kind: DiagnosticKind = fact.reason === "dynamic" || fact.reason === "missing" ? "opaque" : "unresolved";
  state.diagnose(kind, fact.node, fact.detail);
  return empty();
}

function stableTerminal(node: MorphNode, state: EvalState): MorphNode | undefined {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    refusal(state, stable);
    return;
  }
  return stable.value;
}

function valueOfAuthored(value: StaticAuthoredValue): Evaluation {
  if (value.kind === "scalar") {
    const found = typeof value.value === "string" ? literal(value.node) : undefined;
    return found === undefined ? empty() : { values: [found], prefixes: [] };
  }
  if (value.kind === "tuple") {
    return merge(...value.elements.map(valueOfAuthored));
  }
  return empty();
}

function authored(node: MorphNode, state: EvalState): StaticAuthoredValue | undefined {
  const fact = readStaticAuthoredValue(node);
  if (fact.kind === "unresolved") {
    refusal(state, fact);
    return;
  }
  return fact.value;
}

function selectedProperties(object: StaticAuthoredObjectValue, names: ReadonlySet<string>): readonly StaticAuthoredProperty[] {
  const selected = new Map<string, StaticAuthoredProperty>();
  for (const property of object.properties) {
    if (names.has(property.key)) {
      selected.set(property.key, property);
    }
  }
  return [...selected.values()];
}

function evalTemplate(node: import("ts-morph").TemplateExpression, state: EvalState): Evaluation {
  const head = node.getHead();
  const headValue = head.getLiteralText();
  let values: StaticValue[] = [
    { value: headValue, segments: headValue.length === 0 ? [] : [{ node: head, valueStart: 0, valueEnd: headValue.length, sourceStart: head.getStart() + 1 }] },
  ];
  const prefixes: Omit<RuntimeClassPrefix, "consumers">[] = [];
  for (const span of node.getTemplateSpans()) {
    const expression = evaluate(span.getExpression(), state);
    if (expression.values.length === 0) {
      for (const prefix of values) {
        if (prefix.value.length > 0) {
          prefixes.push({ prefix: prefix.value, segments: prefix.segments });
        }
      }
      state.diagnose("opaque", span.getExpression(), "runtime template interpolation");
      return { values: [], prefixes: [...prefixes, ...expression.prefixes] };
    }
    values = product(values, expression.values);
    const tail = span.getLiteral();
    const tailValue = tail.getLiteralText();
    const tailStatic: StaticValue = {
      value: tailValue,
      segments: tailValue.length === 0 ? [] : [{ node: tail, valueStart: 0, valueEnd: tailValue.length, sourceStart: tail.getStart() + 1 }],
    };
    values = values.map((value) => combine(value, tailStatic));
  }
  return { values, prefixes };
}

function evalMember(node: MorphNode, state: EvalState): Evaluation {
  const member = readMemberReference(node);
  if (member.kind === "unresolved") {
    return refusal(state, member);
  }
  const receiver = authored(member.value.receiver, state);
  if (receiver === undefined || receiver.kind !== "object") {
    state.diagnose("opaque", member.value.receiver, "class member receiver is not one static authored object");
    return empty();
  }
  const property = selectedProperties(receiver, new Set([member.value.name]))[0];
  if (property === undefined) {
    state.diagnose("unresolved", member.value.nameNode, `static object has no ${member.value.name} member`);
    return empty();
  }
  return valueOfAuthored(property.value);
}

function identifierInitializer(identifier: import("ts-morph").Identifier, state: EvalState): MorphNode | undefined {
  const write = inspectReferenceWrites(identifier);
  if (write.kind === "unresolved") {
    refusal(state, write);
    return;
  }
  const symbol = identifier.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  const aliased = symbol?.getAliasedSymbol()?.getDeclarations() ?? [];
  const candidates = [...declarations, ...aliased].filter(Node.isVariableDeclaration);
  if (candidates.length !== 1) {
    return;
  }
  return candidates[0]?.getInitializer();
}

function evalBinary(raw: import("ts-morph").BinaryExpression, state: EvalState): Evaluation {
  const operator = raw.getOperatorToken().getText();
  if (operator === "+") {
    const left = evaluate(raw.getLeft(), state);
    const right = evaluate(raw.getRight(), state);
    return { values: product(left.values, right.values), prefixes: [...left.prefixes, ...right.prefixes] };
  }
  if (operator === "&&") {
    return evaluate(raw.getRight(), state);
  }
  if (operator === "||" || operator === "??") {
    return merge(evaluate(raw.getLeft(), state), evaluate(raw.getRight(), state));
  }
  state.diagnose("unresolved", raw, `unsupported class binary operator ${operator}`);
  return empty();
}

function evalKnown(raw: MorphNode, state: EvalState): Evaluation | undefined {
  const direct = literal(raw);
  if (direct !== undefined) {
    return { values: [direct], prefixes: [] };
  }
  if (Node.isTemplateExpression(raw)) {
    return evalTemplate(raw, state);
  }
  if (Node.isConditionalExpression(raw)) {
    return merge(evaluate(raw.getWhenTrue(), state), evaluate(raw.getWhenFalse(), state));
  }
  if (Node.isBinaryExpression(raw)) {
    return evalBinary(raw, state);
  }
  if (Node.isArrayLiteralExpression(raw)) {
    return merge(...raw.getElements().map((element) => evaluate(Node.isSpreadElement(element) ? element.getExpression() : element, state)));
  }
  const member = Node.isPropertyAccessExpression(raw) || Node.isElementAccessExpression(raw) ? evalMember(raw, state) : undefined;
  return member;
}

function evalTerminal(raw: MorphNode, state: EvalState): Evaluation {
  if (Node.isIdentifier(raw)) {
    const initializer = identifierInitializer(raw, state);
    if (initializer !== undefined) {
      return evaluate(initializer, state);
    }
  }
  const terminal = stableTerminal(raw, state);
  if (terminal === undefined) {
    return empty();
  }
  if (terminal !== raw) {
    return evaluate(terminal, state);
  }
  if (Node.isObjectLiteralExpression(terminal)) {
    state.diagnose("opaque", terminal, "object class value requires composer or JSX-spread semantics");
    return empty();
  }
  if (Node.isNullLiteral(terminal) || Node.isNumericLiteral(terminal) || terminal.isKind(SyntaxKind.TrueKeyword) || terminal.isKind(SyntaxKind.FalseKeyword)) {
    return empty();
  }
  state.diagnose("opaque", terminal, `runtime ${terminal.getKindName()} class value`);
  return empty();
}

function evaluate(raw: MorphNode, state: EvalState): Evaluation {
  const identity = raw.compilerNode;
  if (state.active.has(identity)) {
    state.diagnose("unresolved", raw, "static class expression cycle");
    return empty();
  }
  state.active.add(identity);
  try {
    return evalKnown(raw, state) ?? evalTerminal(raw, state);
  } finally {
    state.active.delete(identity);
  }
}

function composerOf(call: import("ts-morph").CallExpression): ConcreteComposer | undefined {
  const origin = resolveCallableOrigin(call);
  if (origin.kind === "unresolved" || origin.value.invocation !== "call" || origin.value.target.kind !== "module") {
    return;
  }
  return COMPOSERS[origin.value.target.moduleSpecifier]?.[origin.value.target.exportedName];
}

function classMap(object: StaticAuthoredObjectValue): Evaluation {
  const values = object.properties.flatMap((property): StaticValue[] => {
    const key = typeof property.key === "string" ? property.key : "";
    if (key.length === 0) {
      return [];
    }
    const literalKey = literal(property.keyNode);
    return [
      literalKey ?? { value: key, segments: [{ node: property.keyNode, valueStart: 0, valueEnd: key.length, sourceStart: property.keyNode.getStart() }] },
    ];
  });
  return { values, prefixes: [] };
}

function joinAuthored(value: StaticAuthoredValue): Evaluation {
  if (value.kind === "object") {
    return classMap(value);
  }
  if (value.kind === "tuple") {
    return merge(...value.elements.map(joinAuthored));
  }
  return valueOfAuthored(value);
}

function variantValue(value: StaticAuthoredValue): Evaluation {
  if (value.kind !== "object") {
    return valueOfAuthored(value);
  }
  return merge(...value.properties.map((property) => valueOfAuthored(property.value)));
}

function variantProperty(property: StaticAuthoredProperty): Evaluation[] {
  if (property.key === "base" || property.key === "class" || property.key === "className" || property.key === "slots") {
    return [variantValue(property.value)];
  }
  if (property.key === "variants" && property.value.kind === "object") {
    return property.value.properties.flatMap((axis) => (axis.value.kind === "object" ? axis.value.properties.map((option) => variantValue(option.value)) : []));
  }
  if ((property.key === "compoundVariants" || property.key === "compoundSlots") && property.value.kind === "tuple") {
    return property.value.elements.flatMap((item) =>
      item.kind === "object" ? selectedProperties(item, new Set(["class", "className"])).map((entry) => valueOfAuthored(entry.value)) : [],
    );
  }
  return [];
}

function variantConfig(object: StaticAuthoredObjectValue): Evaluation {
  return merge(...object.properties.flatMap(variantProperty));
}

function composerEvaluation(call: import("ts-morph").CallExpression, composer: ConcreteComposer, state: EvalState): Evaluation {
  const args = call.getArguments();
  if (composer === "join") {
    return merge(
      ...args.map((argument) => {
        const node = Node.isSpreadElement(argument) ? argument.getExpression() : argument;
        const value = authored(node, state);
        return value === undefined ? evaluate(node, state) : joinAuthored(value);
      }),
    );
  }
  const base = composer === "cva" && args[0] !== undefined ? evaluate(args[0], state) : empty();
  const configNode = composer === "cva" ? args[1] : args[0];
  if (configNode === undefined) {
    state.diagnose("unresolved", call, `${composer} composer has no configuration argument`);
    return base;
  }
  const config = authored(configNode, state);
  if (config === undefined || config.kind !== "object") {
    state.diagnose("unresolved", configNode, `${composer} configuration is not one static authored object`);
    return base;
  }
  return merge(base, variantConfig(config));
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

export const staticClassFactEngine = { authored, composerEvaluation, composerOf, evaluate, selectedProperties, tokenSlices, valueOfAuthored };
export type { DiagnosticKind, EvalState, Evaluation };
