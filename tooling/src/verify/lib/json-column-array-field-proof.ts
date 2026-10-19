// Stored-array remaps retain field provenance only through installed array methods and pure callbacks.
// Caller snapshots, opaque callbacks and member writes do not acquire provenance from the base array.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { traceJsonColumnValue } from "../../floor/code-facts/drizzle-value-origin.ts";
import { ORDINARY_ARRAY_REMAPS } from "../../floor/code-facts/ordinary-observations-contract.ts";
import type { NativePrimitiveFlags, NativeSelectedType } from "../../floor/code-facts/type-projection-contract.ts";
import { selectedTypeRelation } from "../../floor/code-facts/type-projection-contract.ts";
import type { JsonColumnMergeProof, JsonColumnOriginContext, JsonColumnTarget } from "../contract/json-column-origin.ts";
import { unwrapExpression } from "./ast-read.ts";

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
const PURE_MEMBERS = new Set(["filter", "map", "includes", "has"]);
const ARRAY_OWNERS = new Set(["Array", "ReadonlyArray"]);
const SET_OWNERS = new Set(["Set", "ReadonlySet"]);

function primitive(flags: NativePrimitiveFlags): boolean {
  return flags.string || flags.stringLiteral || flags.number || flags.numberLiteral || flags.boolean || flags.booleanLiteral || flags.null || flags.undefined;
}

function plainValue(type: NativeSelectedType): boolean {
  return type.arms.every((arm) => primitive(arm.arrayElement ?? arm.flags));
}

function installedMember(receiver: MorphNode, name: string, context: JsonColumnOriginContext): boolean {
  const declarations = context.schemaReaders.propertyDeclarations(receiver, name, true);
  const owners = name === "has" ? SET_OWNERS : ARRAY_OWNERS;
  return (
    PURE_MEMBERS.has(name) &&
    declarations.some((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes("/node_modules/typescript/lib/lib.")) &&
    declarations.every((declaration) => {
      const owner = declaration.getParentIfKind(SyntaxKind.InterfaceDeclaration);
      if (owner === undefined) {
        return false;
      }
      const origin = context.schemaReaders.global(owner.getNameNode());
      return origin.kind === "resolved" && origin.value.memberPath.length === 0 && owners.has(origin.value.globalName);
    })
  );
}

function pureCallback(node: MorphNode, seen: ReadonlySet<object>, context: JsonColumnOriginContext): boolean {
  const value = unwrapExpression(node);
  if (!(Node.isArrowFunction(value) || Node.isFunctionExpression(value)) || value.isAsync()) {
    return false;
  }
  const body = value.getBody();
  const expression =
    Node.isBlock(body) && body.getStatements().length === 1 ? body.getStatements()[0]?.asKind(SyntaxKind.ReturnStatement)?.getExpression() : body;
  return expression !== undefined && pureExpression(expression, seen, context);
}

function pureCall(call: import("ts-morph").CallExpression, seen: ReadonlySet<object>, context: JsonColumnOriginContext): boolean {
  const member = context.schemaReaders.member(call.getExpression());
  if (
    member === undefined ||
    !PURE_MEMBERS.has(member.name) ||
    !installedMember(member.receiver, member.name, context) ||
    !pureExpression(member.receiver, seen, context)
  ) {
    return false;
  }
  const args = call.getArguments();
  return (
    args.length === 1 &&
    (ORDINARY_ARRAY_REMAPS.has(member.name) ? pureCallback(args[0] ?? call, seen, context) : pureExpression(args[0] ?? call, seen, context))
  );
}

function pureIdentifier(node: import("ts-morph").Identifier, seen: ReadonlySet<object>, context: JsonColumnOriginContext): boolean {
  const lexical = context.schemaReaders.lexical(node).value;
  const declaration = lexical.kind === "resolved" ? lexical.value : undefined;
  if (Node.isParameterDeclaration(declaration)) {
    const selected = context.typeSelections({ selectors: [{ base: { kind: "node", node }, steps: [], displayAt: null }], relations: [] }).values[0];
    if (selected === undefined || selected === null) {
      throw new Error("native array callback Type was not captured");
    }
    return plainValue(selected);
  }
  const binding = context.schemaReaders.stable(node);
  const terminal = binding.kind === "resolved" ? binding.value : binding.node;
  return terminal.compilerNode !== node.compilerNode && Node.isExpression(terminal) && pureExpression(terminal, seen, context);
}

function pureExpression(raw: MorphNode, seen: ReadonlySet<object>, context: JsonColumnOriginContext): boolean {
  const node = unwrapExpression(raw);
  if (seen.has(node.compilerNode)) {
    return false;
  }
  const next = new Set(seen).add(node.compilerNode);
  if (Node.isIdentifier(node)) {
    return pureIdentifier(node, next, context);
  }
  if (Node.isBinaryExpression(node)) {
    return (
      PURE_OPERATORS.has(node.getOperatorToken().getKind()) && pureExpression(node.getLeft(), next, context) && pureExpression(node.getRight(), next, context)
    );
  }
  if (Node.isPrefixUnaryExpression(node)) {
    return (
      [SyntaxKind.ExclamationToken, SyntaxKind.MinusToken, SyntaxKind.PlusToken].includes(node.getOperatorToken()) &&
      pureExpression(node.getOperand(), next, context)
    );
  }
  if (Node.isCallExpression(node)) {
    return pureCall(node, next, context);
  }
  if (Node.isNewExpression(node)) {
    const origin = context.schemaReaders.callable(node);
    return (
      origin.kind === "resolved" &&
      origin.value.target.kind === "global" &&
      origin.value.target.globalName === "Set" &&
      node.getArguments().length === 1 &&
      pureExpression(node.getArguments()[0] ?? node, next, context)
    );
  }
  const member = context.schemaReaders.member(node);
  return member === undefined
    ? Node.isNumericLiteral(node) ||
        Node.isStringLiteral(node) ||
        Node.isNoSubstitutionTemplateLiteral(node) ||
        [SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword, SyntaxKind.NullKeyword].includes(node.getKind())
    : member.name === "length" && pureExpression(member.receiver, next, context);
}

/** Prove an actual same-field array remap, not arbitrary dependence on a stored spread. */
export function jsonColumnArrayFieldProof(
  node: MorphNode,
  target: JsonColumnTarget,
  field: string,
  context: JsonColumnOriginContext,
): JsonColumnMergeProof | undefined {
  const value = unwrapExpression(node);
  const member = Node.isCallExpression(value) ? context.schemaReaders.member(value.getExpression()) : undefined;
  if (
    !Node.isCallExpression(value) ||
    member === undefined ||
    !ORDINARY_ARRAY_REMAPS.has(member.name) ||
    !installedMember(member.receiver, member.name, context)
  ) {
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
  const types = context.typeSelections({
    selectors: [
      { base: { kind: "node", node: value }, steps: [], displayAt: null },
      {
        base: { kind: "schema-column", column: target.column.identity.key },
        steps: [{ kind: "property", name: field, at: value }, { kind: "nonnullable" }],
        displayAt: null,
      },
    ],
    relations: [{ left: 0, right: 1 }],
  });
  const callback = value.getArguments()[0];
  if (callback === undefined || !pureCallback(callback, new Set(), context) || selectedTypeRelation(types, 0)?.leftToRight !== true) {
    throw new Error(`json-column-writes: cannot prove pure same-field array remap at ${value.getSourceFile().getFilePath()}:${value.getStartLineNumber()}`);
  }
  return { keywise: true, historicalHeal: prior?.historicalHeal === true || origins.some((origin) => origin.kind === "column" && origin.historicalHeal) };
}
