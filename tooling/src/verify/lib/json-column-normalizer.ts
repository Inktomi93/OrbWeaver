// Bounded valid-row normalization proof for JSON write provenance. Schema output parity alone is not
// identity: transforms/custom parses refuse, and catch explicitly retains a historical-heal arm.

import { resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import { resolveCallableOrigin } from "@orb/tooling/floor/code-facts/reference-fact-call";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readFunctionBodyNodes } from "../../floor/code-facts/function-context.ts";
import type { ReferenceFact, UnresolvedReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import { readStaticAuthoredValue, resolveAuthoredComposite } from "../../floor/code-facts/static-authored-value.ts";
import { resolved, unresolved } from "../../floor/code-facts/type-member-origin-core.ts";
import { propertyValue } from "../../floor/code-facts/value-carrier.ts";
import type { JsonNormalizerProof } from "../contract/json-column-origin.ts";
import { unwrapExpression } from "./ast-read.ts";
import { jsonColumnSchemaFactoryProof } from "./json-column-schema-factory-proof.ts";

type SchemaBodyProof = ReferenceFact<boolean>;

function ready(historicalHeal: boolean, node: MorphNode): SchemaBodyProof {
  return resolved(historicalHeal, node, []);
}

function combine(proofs: readonly SchemaBodyProof[], node: MorphNode): SchemaBodyProof {
  const failure = proofs.find((proof) => proof.kind === "unresolved");
  return (
    failure ??
    ready(
      proofs.some((proof) => proof.kind === "resolved" && proof.value),
      node,
    )
  );
}

const ZOD_PACKAGE = "/node_modules/zod/";
// `default` fills only an undefined key, and a stored row is the schema's own output, so its keys are present.
const VALIDATORS = ["int", "min", "max", "nonnegative", "positive", "finite", "optional", "nullable", "default", "readonly", "strict", "strip"] as const;
const CONSTRUCTORS = ["object", "strictObject", "looseObject", "array", "record", "union", "enum", "literal", "number", "int", "string", "boolean"] as const;

function zodMethod(node: MorphNode, name: string): boolean {
  const member = staticMemberAccess(node);
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
  const size = staticMemberAccess(expression.getLeft());
  const length = staticMemberAccess(expression.getRight());
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

// Built-in reads a refinement may call: each is declared in TypeScript's own lib and never mutates its receiver.
const READ_ONLY_BUILTINS = ["includes", "has", "startsWith", "endsWith"] as const;
const TS_LIB = /\/typescript\/lib\/lib\.[^/]+\.d\.ts$/u;
const MUTATING_OPERATORS = new Set<SyntaxKind>([
  SyntaxKind.EqualsToken,
  SyntaxKind.PlusEqualsToken,
  SyntaxKind.MinusEqualsToken,
  SyntaxKind.AsteriskEqualsToken,
  SyntaxKind.SlashEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
]);

function refinementFunction(callback: MorphNode): MorphNode | undefined {
  const fn = unwrapExpression(callback);
  if (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) {
    return fn;
  }
  const declarations = Node.isIdentifier(fn) ? (fn.getSymbol()?.getDeclarations() ?? []) : [];
  return declarations.length === 1 && Node.isFunctionDeclaration(declarations[0]) ? declarations[0] : undefined;
}

function readOnlyBuiltinCall(call: import("ts-morph").CallExpression): boolean {
  const member = staticMemberAccess(call.getExpression());
  if (member === undefined || !READ_ONLY_BUILTINS.some((name) => name === member.name)) {
    return false;
  }
  // A type-only augmentation (ts-reset's `includes` overload) merges into the lib declaration without
  // changing what runs, so ambient `.d.ts` siblings are allowed beside the lib's own.
  const files = (member.receiver.getType().getNonNullableType().getProperty(member.name)?.getDeclarations() ?? []).map((declaration) =>
    declaration.getSourceFile().getFilePath().replaceAll("\\", "/"),
  );
  return files.some((file) => TS_LIB.test(file)) && files.every((file) => file.endsWith(".d.ts") || file.endsWith(".d.cts") || file.endsWith(".d.mts"));
}

// A superRefine that only reads its input and reports through `ctx.addIssue` cannot change the parsed value,
// so a valid row passes through it unchanged. Anything that could write (assignment, update, delete, `new`,
// a nested function, any other call) refuses.
function pureIssueRefinement(callback: MorphNode): boolean {
  const fn = refinementFunction(callback);
  if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isFunctionDeclaration(fn)) || fn.getParameters().length !== 2) {
    return false;
  }
  const ctx = fn.getParameters()[1];
  const body = fn.getBody();
  if (ctx === undefined || body === undefined || fn.getParameters().some((parameter) => !Node.isIdentifier(parameter.getNameNode()))) {
    return false;
  }
  return readFunctionBodyNodes(fn).every((node) => {
    if (Node.isBinaryExpression(node)) {
      return !MUTATING_OPERATORS.has(node.getOperatorToken().getKind());
    }
    if (
      Node.isPrefixUnaryExpression(node) ||
      Node.isPostfixUnaryExpression(node) ||
      Node.isDeleteExpression(node) ||
      Node.isNewExpression(node) ||
      Node.isAwaitExpression(node) ||
      Node.isArrowFunction(node) ||
      Node.isFunctionExpression(node)
    ) {
      return Node.isPrefixUnaryExpression(node) && ![SyntaxKind.PlusPlusToken, SyntaxKind.MinusMinusToken].includes(node.getOperatorToken());
    }
    if (Node.isCallExpression(node)) {
      const member = staticMemberAccess(node.getExpression());
      const issue = member?.name === "addIssue" && sameParameter(member.receiver, ctx);
      return issue || readOnlyBuiltinCall(node);
    }
    return true;
  });
}

function refusal(node: MorphNode, detail: string): UnresolvedReferenceFact {
  return unresolved(
    "unsupported",
    node,
    `json-column-writes: cannot prove normalizer at ${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}: ${detail}`,
  );
}

function collectionConstructorProof(call: import("ts-morph").CallExpression, name: string, seen: ReadonlySet<object>): SchemaBodyProof {
  const arguments_ = call.getArguments();
  if (name === "record") {
    if (arguments_.length !== 2) {
      return refusal(call, "record needs both authored key and value schemas");
    }
    const proofs = arguments_.map((item) => schemaProof(item, seen));
    return combine(proofs, call);
  }
  const argument = arguments_[0];
  const members = argument === undefined ? undefined : resolveAuthoredComposite(argument);
  if (members?.kind !== "resolved" || !Node.isArrayLiteralExpression(members.value) || members.value.getElements().length === 0) {
    return refusal(call, "union members are not a nonempty immutable authored array");
  }
  const proofs = members.value.getElements().map((member) => schemaProof(member, seen));
  return combine(proofs, call);
}

function objectConstructorProof(call: import("ts-morph").CallExpression, seen: ReadonlySet<object>): SchemaBodyProof {
  const argument = call.getArguments()[0];
  const shape = argument === undefined ? undefined : resolveStableExpression(argument);
  if (shape?.kind !== "resolved" || !Node.isObjectLiteralExpression(shape.value)) {
    return refusal(call, "object shape is not an immutable authored literal");
  }
  const proofs = shape.value.getProperties().map((property) => {
    const value = propertyValue(property);
    return value === undefined ? refusal(property, "computed/spread/method schema member is unsupported") : schemaProof(value, seen);
  });
  return combine(proofs, call);
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
  if (name === "object" || name === "strictObject" || name === "looseObject") {
    return objectConstructorProof(call, seen);
  }
  return ready(false, call);
}

function healProof(argument: MorphNode): ReferenceFact<null> {
  const value = unwrapExpression(argument);
  if (Node.isObjectLiteralExpression(value)) {
    if (readStaticAuthoredValue(value).kind !== "resolved") {
      return refusal(value, "historical-heal object contains runtime data");
    }
    return resolved(null, value, []);
  }
  const authored = readStaticAuthoredValue(value);
  if (authored.kind === "resolved" && authored.value.kind === "object") {
    return resolved(null, value, []);
  }
  if (!(Node.isArrowFunction(value) || Node.isFunctionExpression(value)) || value.getParameters().length > 0) {
    return refusal(value, "catch fallback cannot read or mutate the input");
  }
  const body = value.getBody();
  const returns = Node.isBlock(body)
    ? readFunctionBodyNodes(value)
        .filter(Node.isReturnStatement)
        .map((statement) => statement.getExpression())
    : [body];
  const fallback = returns[0] === undefined ? undefined : unwrapExpression(returns[0]);
  const fallbackFact = fallback === undefined ? undefined : readStaticAuthoredValue(fallback);
  if (returns.length !== 1 || fallbackFact?.kind !== "resolved" || fallbackFact.value.kind !== "object") {
    return refusal(value, "catch fallback is not an explicit static historical-heal object");
  }
  return resolved(null, value, []);
}

function catchProof(call: import("ts-morph").CallExpression): SchemaBodyProof {
  const argument = call.getArguments()[0];
  if (argument === undefined) {
    return refusal(call, "catch has no authored fallback");
  }
  const heal = healProof(argument);
  return heal.kind === "unresolved" ? heal : ready(true, call);
}

function schemaCallProof(call: import("ts-morph").CallExpression, seen: ReadonlySet<object>): SchemaBodyProof {
  const constructed = constructorProof(call, seen);
  if (constructed !== undefined) {
    return constructed;
  }
  if (jsonColumnSchemaFactoryProof(call)) {
    return ready(false, call);
  }
  const member = staticMemberAccess(call.getExpression());
  if (member === undefined || !zodMethod(call.getExpression(), member.name)) {
    return refusal(call, "schema operation is not the installed Zod method");
  }
  const base = schemaProof(member.receiver, seen);
  if (base.kind === "unresolved") {
    return base;
  }
  if (VALIDATORS.some((name) => name === member.name)) {
    return base;
  }
  if (member.name === "refine" && pureUniqueness(call.getArguments()[0] ?? call)) {
    return base;
  }
  if (member.name === "superRefine" && pureIssueRefinement(call.getArguments()[0] ?? call)) {
    return base;
  }
  if (member.name === "catch") {
    return catchProof(call);
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
  if (binding.kind === "unresolved" && binding.reason === "write") {
    return refusal(current, binding.detail);
  }
  const origin = resolveModuleMemberOrigin(current);
  const declaration =
    origin.kind === "resolved" && origin.value.memberPath.length === 0 && origin.value.canonical.kind === "project"
      ? origin.value.canonical.declaration
      : undefined;
  if (Node.isVariableDeclaration(declaration) && declaration.getInitializer() !== undefined) {
    return schemaProof(declaration.getNameNode(), next);
  }
  return refusal(current, "schema constructor/body is opaque");
}

/** Normalizer judgment as data: unrelated candidates retain their failure without prematurely refusing a consumer. */
export function readJsonColumnNormalizer(call: import("ts-morph").CallExpression): ReferenceFact<JsonNormalizerProof | undefined> {
  const member = staticMemberAccess(call.getExpression());
  if (member?.name !== "parse" || !zodMethod(call.getExpression(), member.name)) {
    return resolved(undefined, call, []);
  }
  const proof = schemaProof(member.receiver, new Set());
  return proof.kind === "unresolved" ? proof : resolved({ historicalHeal: proof.value, schema: member.receiver }, call, proof.trace.declarations);
}

/** Preserve the existing consumer refusal at the call that actually needs valid-row normalization. */
export function jsonColumnNormalizer(call: import("ts-morph").CallExpression): JsonNormalizerProof | undefined {
  const fact = readJsonColumnNormalizer(call);
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  return fact.value;
}
