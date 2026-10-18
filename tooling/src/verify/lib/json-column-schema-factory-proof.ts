// A validating string factory preserves values only through the installed TypeID contract and the
// exact Zod failure channel. Function names and output annotations never establish that fact.
import type { CallExpression, Node as MorphNode, ParameterDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { declaredByPackage } from "../../floor/code-facts/type-member-origin.ts";
import type { JsonColumnSchemaReaders } from "../contract/json-column-origin.ts";
import { unwrapExpression } from "./ast-read.ts";
import { nativeJsonColumnSchemaReaders } from "./json-column-native-readers.ts";
import { declaredByZod } from "./zod-origin.ts";

const TYPE_ID_PACKAGE = "typeid-js";

function zodExport(node: MorphNode, exportedName: string, readers: JsonColumnSchemaReaders): boolean {
  const origin = readers.module(node);
  return (
    origin.kind === "resolved" &&
    origin.value.moduleSpecifier === "zod" &&
    (origin.value.memberPath.at(-1) ?? origin.value.exportedName) === exportedName &&
    origin.value.canonical.kind === "project" &&
    declaredByZod([origin.value.canonical.declaration])
  );
}

function unboxedFromString(node: MorphNode, readers: JsonColumnSchemaReaders): boolean {
  const origin = readers.module(node);
  return (
    origin.kind === "resolved" &&
    origin.value.moduleSpecifier === TYPE_ID_PACKAGE &&
    origin.value.memberPath.length === 0 &&
    origin.value.canonical.kind === "project" &&
    origin.value.canonical.exportedName === "fromString" &&
    declaredByPackage([origin.value.canonical.declaration], TYPE_ID_PACKAGE)
  );
}

function staticPrefix(node: MorphNode, readers: JsonColumnSchemaReaders): boolean {
  const direct = readers.string(node);
  if (direct.kind === "resolved") {
    return true;
  }
  const member = direct.reason === "dynamic" ? readers.member(direct.node) : undefined;
  const authored = member === undefined ? undefined : readers.authored(member.receiver);
  if (member === undefined || authored?.kind !== "resolved" || authored.value.kind !== "object") {
    return false;
  }
  const properties = authored.value.properties.filter((property) => property.key === member.name);
  const value = properties[0]?.value;
  return properties.length === 1 && value?.kind === "scalar" && typeof value.value === "string";
}

function sameParameter(node: MorphNode, parameter: ParameterDeclaration, readers: JsonColumnSchemaReaders): boolean {
  const fact = readers.lexical(unwrapExpression(node)).value;
  return fact.kind === "resolved" && fact.value.compilerNode === parameter.compilerNode;
}

function zodMember(node: MorphNode, name: string, readers: JsonColumnSchemaReaders): boolean {
  const member = readers.member(node);
  return member?.name === name && declaredByZod(readers.propertyDeclarations(member.receiver, name, false));
}

function issueMessage(node: MorphNode | undefined, prefix: ParameterDeclaration, readers: JsonColumnSchemaReaders): boolean {
  if (!Node.isTemplateExpression(node) || node.getHead().getLiteralText() !== "Invalid ") {
    return false;
  }
  const spans = node.getTemplateSpans();
  const span = spans[0];
  return spans.length === 1 && span !== undefined && sameParameter(span.getExpression(), prefix, readers) && span.getLiteral().getLiteralText() === " id";
}

function errorChannel(block: import("ts-morph").Block, context: ParameterDeclaration, prefix: ParameterDeclaration, readers: JsonColumnSchemaReaders): boolean {
  const statements = block.getStatements();
  const first = statements[0];
  const last = statements[1];
  const issue = Node.isExpressionStatement(first) ? unwrapExpression(first.getExpression()) : undefined;
  const member = Node.isCallExpression(issue) ? readers.member(issue.getExpression()) : undefined;
  const argument = Node.isCallExpression(issue) ? issue.getArguments()[0] : undefined;
  const code = Node.isObjectLiteralExpression(argument) ? argument.getProperty("code")?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() : undefined;
  const message = Node.isObjectLiteralExpression(argument)
    ? argument.getProperty("message")?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()
    : undefined;
  const returned = Node.isReturnStatement(last) ? last.getExpression() : undefined;
  return (
    statements.length === 2 &&
    Node.isCallExpression(issue) &&
    issue.getArguments().length === 1 &&
    member !== undefined &&
    sameParameter(member.receiver, context, readers) &&
    zodMember(issue.getExpression(), "addIssue", readers) &&
    Node.isObjectLiteralExpression(argument) &&
    argument.getProperties().length === 2 &&
    Node.isStringLiteral(code) &&
    code.getLiteralText() === "custom" &&
    issueMessage(message, prefix, readers) &&
    returned !== undefined &&
    zodExport(unwrapExpression(returned), "NEVER", readers)
  );
}

function validatingTransform(call: CallExpression, prefix: ParameterDeclaration, readers: JsonColumnSchemaReaders): boolean {
  const member = readers.member(call.getExpression());
  const base = member === undefined ? undefined : unwrapExpression(member.receiver);
  const callback = call.getArguments()[0];
  if (
    call.getArguments().length !== 1 ||
    !zodMember(call.getExpression(), "transform", readers) ||
    !Node.isCallExpression(base) ||
    base.getArguments().length > 0 ||
    !zodExport(base.getExpression(), "string", readers) ||
    !(Node.isArrowFunction(callback) || Node.isFunctionExpression(callback)) ||
    callback.isAsync()
  ) {
    return false;
  }
  const parameters = callback.getParameters();
  const value = parameters[0];
  const context = parameters[1];
  const body = callback.getBody();
  const statement = Node.isBlock(body) && body.getStatements().length === 1 ? body.getStatements()[0] : undefined;
  if (
    parameters.length !== 2 ||
    value === undefined ||
    context === undefined ||
    parameters.some((parameter) => !Node.isIdentifier(parameter.getNameNode()) || parameter.getInitializer() !== undefined || parameter.isRestParameter()) ||
    !Node.isTryStatement(statement) ||
    statement.getFinallyBlock() !== undefined
  ) {
    return false;
  }
  const returns = statement.getTryBlock().getStatements();
  const returned = returns.length === 1 ? returns[0]?.asKind(SyntaxKind.ReturnStatement)?.getExpression() : undefined;
  const validated = returned === undefined ? undefined : unwrapExpression(returned);
  const arguments_ = Node.isCallExpression(validated) ? validated.getArguments() : [];
  const catchClause = statement.getCatchClause();
  // Installed fromString validates and reconstructs its supplied ID unchanged on success; declaration
  // ownership identifies that semantic contract but is not itself an arbitrary identity proof.
  return (
    Node.isCallExpression(validated) &&
    unboxedFromString(validated.getExpression(), readers) &&
    arguments_.length === 2 &&
    arguments_[0] !== undefined &&
    sameParameter(arguments_[0], value, readers) &&
    arguments_[1] !== undefined &&
    sameParameter(arguments_[1], prefix, readers) &&
    catchClause !== undefined &&
    catchClause.getVariableDeclaration() === undefined &&
    errorChannel(catchClause.getBlock(), context, prefix, readers)
  );
}

/** Prove a complete authored string-validator factory, not a factory-name or ZodType annotation allowance. */
export function jsonColumnSchemaFactoryProof(call: CallExpression, readers: JsonColumnSchemaReaders = nativeJsonColumnSchemaReaders): boolean {
  const target = readers.declaration(call);
  const argument = call.getArguments()[0];
  if (target.kind !== "resolved" || call.getArguments().length !== 1 || argument === undefined || !staticPrefix(argument, readers)) {
    return false;
  }
  const owner = target.value.declaration;
  if (!Node.isFunctionDeclaration(owner) || owner.isAsync()) {
    return false;
  }
  const parameters = owner.getParameters();
  const prefix = parameters[0];
  const body = owner.getBody();
  const returned =
    Node.isBlock(body) && body.getStatements().length === 1 ? body.getStatements()[0]?.asKind(SyntaxKind.ReturnStatement)?.getExpression() : undefined;
  const value = returned === undefined ? undefined : unwrapExpression(returned);
  return (
    parameters.length === 1 &&
    prefix !== undefined &&
    Node.isIdentifier(prefix.getNameNode()) &&
    prefix.getInitializer() === undefined &&
    !prefix.isRestParameter() &&
    Node.isCallExpression(value) &&
    validatingTransform(value, prefix, readers)
  );
}
