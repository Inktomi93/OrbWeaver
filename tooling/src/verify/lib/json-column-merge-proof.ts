// This is the accepted JSON-write grammar, not a generic AST evaluator: actual same-column bases,
// object spreads, known schema validation and field fallbacks when the client omits a member.
import { resolveModuleMemberOrigin, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import { lexicalReferenceSymbol } from "@orb/tooling/_shared/reference-fact-alias";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { JsonColumnMergeProof, JsonColumnOrigin, JsonColumnOriginContext, JsonColumnTarget } from "../contract/json-column-origin.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readCallReturns } from "./authored-key-set.ts";
import { jsonColumnArrayFieldProof } from "./json-column-array-field-proof.ts";
import { jsonColumnNormalizer, jsonColumnPropertyValue } from "./json-column-normalizer.ts";
import { jsonColumnCallContext, jsonStoredColumnReference, traceJsonColumnValue } from "./json-column-value-origin.ts";

const WHOLE: JsonColumnMergeProof = { keywise: false, historicalHeal: false };

function refusal(node: MorphNode, detail: string): never {
  throw new Error(`json-column-writes: cannot prove omission merge at ${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}: ${detail}`);
}

function matching(origin: JsonColumnOrigin, target: JsonColumnTarget, field?: string): boolean {
  return origin.kind === "column" && origin.table === target.table && origin.column === target.column && origin.field === field;
}

function direct(node: MorphNode, target: JsonColumnTarget, context: JsonColumnOriginContext, field?: string): JsonColumnMergeProof {
  const origins = traceJsonColumnValue(node, [], context).filter((origin) => origin.kind !== "missing");
  return {
    keywise: origins.length > 0 && origins.every((origin) => matching(origin, target, field)),
    historicalHeal: origins.some((origin) => origin.kind === "column" && origin.historicalHeal),
  };
}

function stable(node: MorphNode, context: JsonColumnOriginContext, seen = new Set<object>()): MorphNode {
  const current = unwrapExpression(node);
  if (seen.has(current.compilerNode)) {
    return refusal(current, "stable binding cycle");
  }
  seen.add(current.compilerNode);
  const declaration = Node.isIdentifier(current) ? lexicalReferenceSymbol(current)?.getValueDeclaration() : undefined;
  const bound = declaration === undefined ? undefined : context.bindings.get(declaration);
  if (bound !== undefined) {
    return stable(bound, context, seen);
  }
  const binding = resolveStableExpression(current);
  if (binding.kind === "resolved") {
    return binding.value;
  }
  return binding.reason === "dynamic" ? binding.node : current;
}

function omittedCondition(node: MorphNode, field: string, context: JsonColumnOriginContext): boolean | undefined {
  const condition = unwrapExpression(node);
  if (!Node.isBinaryExpression(condition)) {
    return;
  }
  const operator = condition.getOperatorToken().getKind();
  const leftNode = condition.getLeft();
  const left = traceJsonColumnValue(condition.getLeft(), [], context);
  const right = traceJsonColumnValue(condition.getRight(), [], context);
  if (
    operator === SyntaxKind.InKeyword &&
    Node.isStringLiteral(leftNode) &&
    leftNode.getLiteralText() === field &&
    right.every((origin) => origin.kind === "caller" || origin.kind === "missing")
  ) {
    return false;
  }
  const omitted = (values: readonly JsonColumnOrigin[]): boolean => values.every((value) => value.kind === "caller" || value.kind === "missing");
  return (operator === SyntaxKind.EqualsEqualsEqualsToken || operator === SyntaxKind.ExclamationEqualsEqualsToken) &&
    omitted(left) &&
    right.every((origin) => origin.kind === "missing")
    ? operator === SyntaxKind.EqualsEqualsEqualsToken
    : undefined;
}

function fallback(node: MorphNode, field: string, target: JsonColumnTarget, context: JsonColumnOriginContext): JsonColumnMergeProof {
  const current = stable(node, context);
  const derived = jsonColumnArrayFieldProof(current, target, field, context);
  if (derived !== undefined) {
    return derived;
  }
  const found = direct(current, target, context, field);
  if (found.keywise) {
    return found;
  }
  if (Node.isBinaryExpression(current) && current.getOperatorToken().getKind() === SyntaxKind.QuestionQuestionToken) {
    const left = traceJsonColumnValue(current.getLeft(), [], context);
    if (left.every((value) => value.kind === "caller" || value.kind === "missing")) {
      return fallback(current.getRight(), field, target, context);
    }
  }
  if (Node.isConditionalExpression(current)) {
    const condition = omittedCondition(current.getCondition(), field, context);
    if (condition !== undefined) {
      return fallback(condition ? current.getWhenTrue() : current.getWhenFalse(), field, target, context);
    }
  }
  return WHOLE;
}

function optionalSpreadField(spread: MorphNode, field: string, target: JsonColumnTarget, context: JsonColumnOriginContext): JsonColumnMergeProof {
  const current = stable(spread, context);
  if (!Node.isConditionalExpression(current)) {
    return WHOLE;
  }
  const condition = unwrapExpression(current.getCondition());
  if (
    !Node.isBinaryExpression(condition) ||
    condition.getOperatorToken().getKind() !== SyntaxKind.EqualsEqualsEqualsToken ||
    !traceJsonColumnValue(condition.getRight(), [], context).every((origin) => origin.kind === "missing")
  ) {
    return WHOLE;
  }
  const base = fallback(condition.getLeft(), field, target, context);
  const absent = unwrapExpression(current.getWhenTrue());
  const present = unwrapExpression(current.getWhenFalse());
  const property = Node.isObjectLiteralExpression(present) ? present.getProperty(field) : undefined;
  const value = jsonColumnPropertyValue(property);
  const kept = value === undefined ? WHOLE : fallback(value, field, target, context);
  return base.keywise && Node.isObjectLiteralExpression(absent) && absent.getProperties().length === 0 && kept.keywise
    ? { keywise: true, historicalHeal: base.historicalHeal || kept.historicalHeal }
    : WHOLE;
}

interface FieldCarrier {
  readonly proof: JsonColumnMergeProof;
  readonly value: MorphNode | undefined;
}

interface ObjectCarriers {
  readonly fields: Map<string, FieldCarrier>;
  readonly keys: readonly string[] | undefined;
  readonly seen: Set<object>;
  openBase: JsonColumnMergeProof | undefined;
  unknownSpread: MorphNode | undefined;
}

function propertyKey(property: MorphNode): string {
  const name = Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property) ? property.getNameNode() : undefined;
  if (Node.isStringLiteral(name)) {
    return name.getLiteralText();
  }
  return Node.isIdentifier(name) ? name.getText() : refusal(property, "computed/method object member has no proved field identity");
}

function optionalSpreadCarriers(node: MorphNode, target: JsonColumnTarget, context: JsonColumnOriginContext, carriers: ObjectCarriers): boolean {
  const current = stable(node, context);
  if (!Node.isConditionalExpression(current)) {
    return false;
  }
  const absent = unwrapExpression(current.getWhenTrue());
  const present = unwrapExpression(current.getWhenFalse());
  if (!Node.isObjectLiteralExpression(absent) || absent.getProperties().length > 0 || !Node.isObjectLiteralExpression(present)) {
    return false;
  }
  for (const property of present.getProperties()) {
    const field = propertyKey(property);
    const proof = optionalSpreadField(current, field, target, context);
    if (!proof.keywise) {
      return false;
    }
    carriers.fields.set(field, { proof, value: undefined });
  }
  return true;
}

function spreadCarriers(node: MorphNode, target: JsonColumnTarget, context: JsonColumnOriginContext, carriers: ObjectCarriers): void {
  const current = stable(node, context);
  if (Node.isObjectLiteralExpression(current)) {
    objectCarriers(current, target, context, carriers);
    return;
  }
  if (optionalSpreadCarriers(current, target, context, carriers)) {
    return;
  }
  const proof = direct(current, target, context);
  if (proof.keywise) {
    for (const key of carriers.keys ?? carriers.fields.keys()) {
      carriers.fields.set(key, { proof, value: undefined });
    }
    carriers.openBase = carriers.keys === undefined ? proof : undefined;
  } else {
    carriers.unknownSpread = current;
  }
}

function objectCarriers(
  object: import("ts-morph").ObjectLiteralExpression,
  target: JsonColumnTarget,
  context: JsonColumnOriginContext,
  carriers: ObjectCarriers,
): void {
  if (carriers.seen.has(object.compilerNode)) {
    refusal(object, "object spread cycle");
  }
  carriers.seen.add(object.compilerNode);
  for (const property of object.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      spreadCarriers(property.getExpression(), target, context, carriers);
    } else {
      const field = propertyKey(property);
      const value = jsonColumnPropertyValue(property);
      const proof = value === undefined ? WHOLE : fallback(value, field, target, context);
      carriers.fields.set(field, { proof, value });
    }
  }
  carriers.seen.delete(object.compilerNode);
}

function omittedOverride(carrier: FieldCarrier, context: JsonColumnOriginContext): boolean {
  if (carrier.proof.keywise || carrier.value === undefined) {
    return false;
  }
  const type = carrier.value.getType();
  if (type.isAny() || type.isUnknown()) {
    return refusal(carrier.value, "overridden field has an unknown omission contract");
  }
  const current = stable(carrier.value, context);
  const explicitClear =
    Node.isIdentifier(current) && current.getText() === "undefined" && traceJsonColumnValue(current, [], context).every((origin) => origin.kind === "missing");
  const arms = type.isUnion() ? type.getUnionTypes() : [type];
  return !explicitClear && arms.some((arm) => arm.isUndefined());
}

function objectProof(object: import("ts-morph").ObjectLiteralExpression, target: JsonColumnTarget, context: JsonColumnOriginContext): JsonColumnMergeProof {
  const shape = target.column.json?.shape;
  const keys = shape?.kind === "closed" ? shape.keys : undefined;
  const carriers: ObjectCarriers = { fields: new Map(), keys, seen: new Set(), openBase: undefined, unknownSpread: undefined };
  objectCarriers(object, target, context, carriers);
  const relevant = keys === undefined ? [...carriers.fields.values()] : keys.map((key) => carriers.fields.get(key));
  const kept = carriers.openBase?.keywise === true || relevant.some((carrier) => carrier?.proof.keywise === true);
  if (kept && carriers.unknownSpread !== undefined) {
    return refusal(carriers.unknownSpread, "dynamic spread can overwrite preserved fields");
  }
  const omitted = kept && relevant.some((carrier) => carrier === undefined || omittedOverride(carrier, context));
  return {
    keywise: kept && !omitted,
    historicalHeal: carriers.openBase?.historicalHeal === true || [...carriers.fields.values()].some((carrier) => carrier.proof.historicalHeal),
  };
}

function sqlProof(node: import("ts-morph").TaggedTemplateExpression, target: JsonColumnTarget, context: JsonColumnOriginContext): JsonColumnMergeProof {
  const origin = resolveModuleMemberOrigin(node.getTag());
  const source = origin.kind === "resolved" ? origin.value.canonical : undefined;
  const installed = source?.kind === "project" && source.sourceFile.getFilePath().replaceAll("\\", "/").includes("/drizzle-orm/");
  const template = node.getTemplate();
  if (!(installed && Node.isTemplateExpression(template) && /^\s*json_set\(\s*$/u.test(template.getHead().getLiteralText()))) {
    return WHOLE;
  }
  const input = template.getTemplateSpans()[0]?.getExpression();
  const stored = input === undefined ? undefined : jsonStoredColumnReference(input, context);
  return stored !== undefined && matching(stored, target) ? { keywise: true, historicalHeal: false } : WHOLE;
}

function callProof(call: import("ts-morph").CallExpression, target: JsonColumnTarget, context: JsonColumnOriginContext): JsonColumnMergeProof {
  const normalizer = jsonColumnNormalizer(call);
  if (normalizer !== undefined) {
    const input = call.getArguments()[0];
    if (input === undefined) {
      return refusal(call, "normalizer has no value");
    }
    const receiver = normalizer.schema;
    const output = receiver.getType().getProperty("_output")?.getTypeAtLocation(receiver);
    const override = target.column.typeOverride;
    if (override === null) {
      return refusal(call, "normalizer column has no declared shape owner");
    }
    const expected = override.type;
    if (output === undefined || !output.isAssignableTo(expected) || !expected.isAssignableTo(output)) {
      return refusal(call, "known normalizer does not own the same column shape");
    }
    const proof = proveJsonColumnMerge(input, target, context);
    return { keywise: proof.keywise, historicalHeal: proof.historicalHeal || normalizer.historicalHeal };
  }
  const returns = readCallReturns(call);
  if (returns.kind === "unresolved") {
    const origins = traceJsonColumnValue(call, [], context);
    return {
      keywise: origins.some((value) => matching(value, target)),
      historicalHeal: origins.some((value) => value.kind === "column" && value.historicalHeal),
    };
  }
  const next = jsonColumnCallContext(call, returns.trace.origin, context);
  const proofs = returns.value.map((value) => proveJsonColumnMerge(value, target, next));
  return { keywise: proofs.length > 0 && proofs.every((proof) => proof.keywise), historicalHeal: proofs.some((proof) => proof.historicalHeal) };
}

/** Complete reductions are whole replacements unless this real grammar proves preservation of this stored column. */
export function proveJsonColumnMerge(node: MorphNode, target: JsonColumnTarget, context: JsonColumnOriginContext): JsonColumnMergeProof {
  const current = stable(node, context);
  if (context.mergeActive.has(current.compilerNode)) {
    return refusal(current, "merge body cycle");
  }
  const next = { ...context, mergeActive: new Set(context.mergeActive).add(current.compilerNode) };
  if (Node.isAwaitExpression(current)) {
    return proveJsonColumnMerge(current.getExpression(), target, next);
  }
  if (Node.isObjectLiteralExpression(current)) {
    return objectProof(current, target, next);
  }
  if (Node.isTaggedTemplateExpression(current)) {
    return sqlProof(current, target, next);
  }
  if (Node.isCallExpression(current)) {
    return callProof(current, target, next);
  }
  if (Node.isConditionalExpression(current)) {
    const proofs = [current.getWhenTrue(), current.getWhenFalse()].map((value) => proveJsonColumnMerge(value, target, next));
    return { keywise: proofs.every((proof) => proof.keywise), historicalHeal: proofs.some((proof) => proof.historicalHeal) };
  }
  return direct(current, target, next);
}
