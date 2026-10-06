// Stored-array remaps retain field provenance only through installed array methods and pure callbacks.
// Caller snapshots, opaque callbacks and member writes do not acquire provenance from the base array.
import { resolveGlobalMemberOrigin, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import { lexicalReferenceSymbol } from "@orb/tooling/_shared/reference-fact-alias";
import { resolveCallableOrigin } from "@orb/tooling/_shared/reference-fact-call";
import type { Node as MorphNode, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { JsonColumnMergeProof, JsonColumnOriginContext, JsonColumnTarget } from "../contract/json-column-origin.ts";
import type { SchemaColumnTypeOverride } from "../contract/schema-fact.ts";
import { unwrapExpression } from "./ast-read.ts";
import { traceJsonColumnValue } from "./json-column-value-origin.ts";
import { readMemberAccess } from "./symbol-reference.ts";

const PURE_OPERATORS = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.LessThanToken,
  SyntaxKind.LessThanEqualsToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.GreaterThanEqualsToken,
  SyntaxKind.PlusToken,
  SyntaxKind.MinusToken,
  SyntaxKind.AsteriskToken,
  SyntaxKind.SlashToken,
  SyntaxKind.PercentToken,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]);
const ARRAY_REMAPS = new Set(["filter", "map"]);
const PURE_MEMBERS = new Set(["filter", "map", "includes", "has"]);
const ARRAY_OWNERS = new Set(["Array", "ReadonlyArray"]);
const SET_OWNERS = new Set(["Set", "ReadonlySet"]);

function primitive(type: Type): boolean {
  return (
    type.isString() ||
    type.isStringLiteral() ||
    type.isNumber() ||
    type.isNumberLiteral() ||
    type.isBoolean() ||
    type.isBooleanLiteral() ||
    type.isNull() ||
    type.isUndefined()
  );
}

function plainValue(type: Type): boolean {
  if (type.isUnion()) {
    return type.getUnionTypes().every(plainValue);
  }
  const element = type.getArrayElementType();
  return element === undefined ? primitive(type) : primitive(element);
}

function installedMember(receiver: MorphNode, name: string): boolean {
  const declarations = receiver.getType().getNonNullableType().getProperty(name)?.getDeclarations() ?? [];
  const owners = name === "has" ? SET_OWNERS : ARRAY_OWNERS;
  return (
    PURE_MEMBERS.has(name) &&
    declarations.some((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes("/node_modules/typescript/lib/lib.")) &&
    declarations.every((declaration) => {
      const owner = declaration.getParentIfKind(SyntaxKind.InterfaceDeclaration);
      if (owner === undefined) {
        return false;
      }
      const origin = resolveGlobalMemberOrigin(owner.getNameNode());
      return origin.kind === "resolved" && origin.value.memberPath.length === 0 && owners.has(origin.value.globalName);
    })
  );
}

function pureCallback(node: MorphNode, seen: ReadonlySet<object>): boolean {
  const value = unwrapExpression(node);
  if (!(Node.isArrowFunction(value) || Node.isFunctionExpression(value)) || value.isAsync()) {
    return false;
  }
  const body = value.getBody();
  const expression =
    Node.isBlock(body) && body.getStatements().length === 1 ? body.getStatements()[0]?.asKind(SyntaxKind.ReturnStatement)?.getExpression() : body;
  return expression !== undefined && pureExpression(expression, seen);
}

function pureCall(call: import("ts-morph").CallExpression, seen: ReadonlySet<object>): boolean {
  const member = readMemberAccess(call.getExpression());
  if (member === undefined || !PURE_MEMBERS.has(member.name) || !installedMember(member.receiver, member.name) || !pureExpression(member.receiver, seen)) {
    return false;
  }
  const args = call.getArguments();
  return args.length === 1 && (ARRAY_REMAPS.has(member.name) ? pureCallback(args[0] ?? call, seen) : pureExpression(args[0] ?? call, seen));
}

function pureIdentifier(node: import("ts-morph").Identifier, seen: ReadonlySet<object>): boolean {
  const declaration = lexicalReferenceSymbol(node)?.getValueDeclaration();
  if (Node.isParameterDeclaration(declaration)) {
    return plainValue(node.getType());
  }
  const binding = resolveStableExpression(node);
  const terminal = binding.kind === "resolved" ? binding.value : binding.node;
  return terminal.compilerNode !== node.compilerNode && Node.isExpression(terminal) && pureExpression(terminal, seen);
}

function pureExpression(raw: MorphNode, seen: ReadonlySet<object>): boolean {
  const node = unwrapExpression(raw);
  if (seen.has(node.compilerNode)) {
    return false;
  }
  const next = new Set(seen).add(node.compilerNode);
  if (Node.isIdentifier(node)) {
    return pureIdentifier(node, next);
  }
  if (Node.isBinaryExpression(node)) {
    return PURE_OPERATORS.has(node.getOperatorToken().getKind()) && pureExpression(node.getLeft(), next) && pureExpression(node.getRight(), next);
  }
  if (Node.isPrefixUnaryExpression(node)) {
    return (
      [SyntaxKind.ExclamationToken, SyntaxKind.MinusToken, SyntaxKind.PlusToken].includes(node.getOperatorToken()) && pureExpression(node.getOperand(), next)
    );
  }
  if (Node.isCallExpression(node)) {
    return pureCall(node, next);
  }
  if (Node.isNewExpression(node)) {
    const origin = resolveCallableOrigin(node);
    return (
      origin.kind === "resolved" &&
      origin.value.target.kind === "global" &&
      origin.value.target.globalName === "Set" &&
      node.getArguments().length === 1 &&
      pureExpression(node.getArguments()[0] ?? node, next)
    );
  }
  const member = readMemberAccess(node);
  return member === undefined
    ? Node.isNumericLiteral(node) ||
        Node.isStringLiteral(node) ||
        Node.isNoSubstitutionTemplateLiteral(node) ||
        [SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword, SyntaxKind.NullKeyword].includes(node.getKind())
    : member.name === "length" && pureExpression(member.receiver, next);
}

/** Prove an actual same-field array remap, not arbitrary dependence on a stored spread. */
export function jsonColumnArrayFieldProof(
  node: MorphNode,
  target: JsonColumnTarget,
  field: string,
  context: JsonColumnOriginContext,
): JsonColumnMergeProof | undefined {
  const value = unwrapExpression(node);
  const member = Node.isCallExpression(value) ? readMemberAccess(value.getExpression()) : undefined;
  if (!Node.isCallExpression(value) || member === undefined || !ARRAY_REMAPS.has(member.name) || !installedMember(member.receiver, member.name)) {
    return;
  }
  const prior = jsonColumnArrayFieldProof(member.receiver, target, field, context);
  const origins = prior === undefined ? traceJsonColumnValue(member.receiver, [], context).filter((origin) => origin.kind !== "missing") : [];
  const stored =
    prior?.keywise ??
    (origins.length > 0 &&
      origins.every((origin) => origin.kind === "column" && origin.table === target.table && origin.column === target.column && origin.field === field));
  if (!stored) {
    return { keywise: false, historicalHeal: false };
  }
  const override: SchemaColumnTypeOverride | null = target.column.typeOverride;
  const output = override === null ? undefined : override.type.getProperty(field)?.getTypeAtLocation(value).getNonNullableType();
  const callback = value.getArguments()[0];
  if (callback === undefined || !pureCallback(callback, new Set()) || output === undefined || !value.getType().isAssignableTo(output)) {
    throw new Error(`json-column-writes: cannot prove pure same-field array remap at ${value.getSourceFile().getFilePath()}:${value.getStartLineNumber()}`);
  }
  return { keywise: true, historicalHeal: prior?.historicalHeal === true || origins.some((origin) => origin.kind === "column" && origin.historicalHeal) };
}
