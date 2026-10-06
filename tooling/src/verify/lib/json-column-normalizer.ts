// Bounded valid-row normalization proof for JSON write provenance. Schema output parity alone is not
// identity: transforms/custom parses refuse, and catch explicitly retains a historical-heal arm.
import { resolveModuleMemberOrigin, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import { resolveCallableOrigin } from "@orb/tooling/_shared/reference-fact-call";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { JsonNormalizerProof } from "../contract/json-column-origin.ts";
import { unwrapExpression } from "./ast-read.ts";
import { jsonColumnSchemaFactoryProof } from "./json-column-schema-factory-proof.ts";
import { readStaticAuthoredValue, resolveAuthoredComposite } from "./static-authored-value.ts";
import { readMemberAccess } from "./symbol-reference.ts";

type SchemaBodyProof = Pick<JsonNormalizerProof, "historicalHeal">;

export function jsonColumnPropertyValue(property: MorphNode | undefined): MorphNode | undefined {
  if (Node.isPropertyAssignment(property)) {
    return property.getInitializer();
  }
  return Node.isShorthandPropertyAssignment(property) ? property.getNameNode() : undefined;
}

const ZOD_PACKAGE = "/node_modules/zod/";
const VALIDATORS = ["int", "min", "max", "nonnegative", "positive", "finite", "optional", "nullable", "readonly", "strict", "strip"] as const;
const CONSTRUCTORS = ["object", "strictObject", "array", "record", "union", "enum", "literal", "number", "string", "boolean"] as const;

function zodMethod(node: MorphNode, name: string): boolean {
  const member = readMemberAccess(node);
  if (member === undefined) {
    return false;
  }
  const declarations = member.receiver.getType().getProperty(name)?.getDeclarations() ?? [];
  return declarations.length > 0 && declarations.every((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes(ZOD_PACKAGE));
}

function sameParameter(node: MorphNode, parameter: MorphNode): boolean {
  return (
    node
      .getSymbol()
      ?.getDeclarations()
      .some((declaration) => declaration.compilerNode === parameter.compilerNode) === true
  );
}

function pureUniqueness(callback: MorphNode): boolean {
  const fn = unwrapExpression(callback);
  if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) || fn.getParameters().length !== 1) {
    return false;
  }
  const parameter = fn.getParameters()[0];
  const body = fn.getBody();
  const expression =
    Node.isBlock(body) && body.getStatements().length === 1 ? body.getStatements()[0]?.asKind(SyntaxKind.ReturnStatement)?.getExpression() : body;
  if (
    parameter === undefined ||
    expression === undefined ||
    !Node.isBinaryExpression(expression) ||
    expression.getOperatorToken().getKind() !== SyntaxKind.EqualsEqualsEqualsToken
  ) {
    return false;
  }
  const size = readMemberAccess(expression.getLeft());
  const length = readMemberAccess(expression.getRight());
  if (size?.name !== "size" || length?.name !== "length" || !sameParameter(length.receiver, parameter) || !Node.isNewExpression(size.receiver)) {
    return false;
  }
  const construct = size.receiver;
  const origin = resolveCallableOrigin(construct);
  return (
    construct.getArguments().length === 1 &&
    sameParameter(construct.getArguments()[0] ?? construct, parameter) &&
    origin.kind === "resolved" &&
    origin.value.target.kind === "global" &&
    origin.value.target.globalName === "Set"
  );
}

function refusal(node: MorphNode, detail: string): never {
  throw new Error(`json-column-writes: cannot prove normalizer at ${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}: ${detail}`);
}

function collectionConstructorProof(call: import("ts-morph").CallExpression, name: string, seen: ReadonlySet<object>): SchemaBodyProof {
  const arguments_ = call.getArguments();
  if (name === "record") {
    if (arguments_.length !== 2) {
      return refusal(call, "record needs both authored key and value schemas");
    }
    const proofs = arguments_.map((item) => schemaProof(item, seen));
    return { historicalHeal: proofs.some((proof) => proof.historicalHeal) };
  }
  const argument = arguments_[0];
  const members = argument === undefined ? undefined : resolveAuthoredComposite(argument);
  if (members?.kind !== "resolved" || !Node.isArrayLiteralExpression(members.value) || members.value.getElements().length === 0) {
    return refusal(call, "union members are not a nonempty immutable authored array");
  }
  const proofs = members.value.getElements().map((member) => schemaProof(member, seen));
  return { historicalHeal: proofs.some((proof) => proof.historicalHeal) };
}

function objectConstructorProof(call: import("ts-morph").CallExpression, seen: ReadonlySet<object>): SchemaBodyProof {
  const argument = call.getArguments()[0];
  const shape = argument === undefined ? undefined : resolveStableExpression(argument);
  if (shape?.kind !== "resolved" || !Node.isObjectLiteralExpression(shape.value)) {
    return refusal(call, "object shape is not an immutable authored literal");
  }
  const proofs = shape.value.getProperties().map((property) => {
    const value = jsonColumnPropertyValue(property);
    return value === undefined ? refusal(property, "computed/spread/method schema member is unsupported") : schemaProof(value, seen);
  });
  return { historicalHeal: proofs.some((proof) => proof.historicalHeal) };
}

function constructorProof(call: import("ts-morph").CallExpression, seen: ReadonlySet<object>): SchemaBodyProof | undefined {
  const origin = resolveModuleMemberOrigin(call.getExpression());
  if (origin.kind !== "resolved" || origin.value.moduleSpecifier !== "zod") {
    return;
  }
  const name = origin.value.memberPath.at(-1) ?? origin.value.exportedName;
  if (!CONSTRUCTORS.some((kind) => kind === name)) {
    return;
  }
  const argument = call.getArguments()[0];
  if (name === "record" || name === "union") {
    return collectionConstructorProof(call, name, seen);
  }
  if (name === "array") {
    return argument === undefined ? refusal(call, "array has no element schema") : schemaProof(argument, seen);
  }
  if (name === "object" || name === "strictObject") {
    return objectConstructorProof(call, seen);
  }
  return { historicalHeal: false };
}

function healProof(argument: MorphNode): void {
  const value = unwrapExpression(argument);
  if (Node.isObjectLiteralExpression(value)) {
    if (readStaticAuthoredValue(value).kind !== "resolved") {
      refusal(value, "historical-heal object contains runtime data");
    }
    return;
  }
  const authored = readStaticAuthoredValue(value);
  if (authored.kind === "resolved" && authored.value.kind === "object") {
    return;
  }
  if (!(Node.isArrowFunction(value) || Node.isFunctionExpression(value)) || value.getParameters().length > 0) {
    refusal(value, "catch fallback cannot read or mutate the input");
  }
  const body = value.getBody();
  const returns = Node.isBlock(body) ? body.getDescendantsOfKind(SyntaxKind.ReturnStatement).map((statement) => statement.getExpression()) : [body];
  const fallback = returns[0] === undefined ? undefined : unwrapExpression(returns[0]);
  const resolved = fallback === undefined ? undefined : readStaticAuthoredValue(fallback);
  if (returns.length !== 1 || resolved?.kind !== "resolved" || resolved.value.kind !== "object") {
    refusal(value, "catch fallback is not an explicit static historical-heal object");
  }
}

function schemaCallProof(call: import("ts-morph").CallExpression, seen: ReadonlySet<object>): SchemaBodyProof {
  const constructed = constructorProof(call, seen);
  if (constructed !== undefined) {
    return constructed;
  }
  if (jsonColumnSchemaFactoryProof(call)) {
    return { historicalHeal: false };
  }
  const member = readMemberAccess(call.getExpression());
  if (member === undefined || !zodMethod(call.getExpression(), member.name)) {
    return refusal(call, "schema operation is not the installed Zod method");
  }
  const base = schemaProof(member.receiver, seen);
  if (VALIDATORS.some((name) => name === member.name)) {
    return base;
  }
  if (member.name === "refine" && pureUniqueness(call.getArguments()[0] ?? call)) {
    return base;
  }
  if (member.name === "catch") {
    const argument = call.getArguments()[0];
    if (argument === undefined) {
      return refusal(call, "catch has no authored fallback");
    }
    healProof(argument);
    return { historicalHeal: true };
  }
  return refusal(call, `unsupported ${member.name}: output type is not proof of valid-row preservation`);
}

function schemaProof(node: MorphNode, seen: ReadonlySet<object>): SchemaBodyProof {
  const current = unwrapExpression(node);
  if (seen.has(current.compilerNode)) {
    return refusal(current, "schema binding cycle");
  }
  const next = new Set(seen).add(current.compilerNode);
  const binding = resolveStableExpression(current);
  if (binding.kind === "resolved" && binding.value.compilerNode !== current.compilerNode) {
    return schemaProof(binding.value, next);
  }
  if (Node.isCallExpression(current)) {
    return schemaCallProof(current, next);
  }
  if (binding.kind === "unresolved" && binding.reason === "dynamic" && Node.isCallExpression(binding.node)) {
    return schemaCallProof(binding.node, next);
  }
  return refusal(current, "schema constructor/body is opaque");
}

/** Prove the actual schema/body before treating parse as a valid-row normalizer, never as universal identity. */
export function jsonColumnNormalizer(call: import("ts-morph").CallExpression): JsonNormalizerProof | undefined {
  const member = readMemberAccess(call.getExpression());
  if (member?.name !== "parse") {
    return;
  }
  if (!zodMethod(call.getExpression(), member.name)) {
    return;
  }
  return { ...schemaProof(member.receiver, new Set()), schema: member.receiver };
}
