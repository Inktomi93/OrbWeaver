// Raw SQL constructors and execution carriers are facts; column attribution and vocabulary remain consumer-owned.
import type { Node as MorphNode, SourceFile, TaggedTemplateExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExecutedSqlInsert, SqlTemplateCarrier } from "./drizzle-sql-contract.ts";
import { readMemberReference, resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { rawInsertHeaders } from "./sql-insert-header.ts";

/** Template carrier provenance; consumers choose the accepted constructor exports and the SQL obligation. */
export function readSqlTemplateCarrier(node: MorphNode): SqlTemplateCarrier | undefined {
  if (Node.isTaggedTemplateExpression(node)) {
    const callee = node.getTag();
    return { kind: "tagged", template: node.getTemplate(), callee, origin: resolveModuleMemberOrigin(callee) };
  }
  if (Node.isCallExpression(node)) {
    const template = node.getArguments()[0];
    const callee = node.getExpression();
    return template === undefined
      ? undefined
      : { kind: "call", template, callee, origin: resolveModuleMemberOrigin(callee), member: readMemberReference(callee) };
  }
  return Node.isNoSubstitutionTemplateLiteral(node) || Node.isTemplateExpression(node) ? { kind: "bare", template: node } : undefined;
}

/** Resolve a const-bound expression through symbol identity. An unresolved/dynamic value returns no nodes,
 *  which is the honest result for a producer audit: text construction alone is never execution evidence. */
function resolvedInitializers(node: MorphNode, seen: Set<MorphNode>): readonly MorphNode[] {
  if (!Node.isIdentifier(node) || seen.has(node)) {
    return [];
  }
  seen.add(node);
  const source = resolveStableExpression(node);
  if (source.kind === "resolved") {
    return source.value === node ? [] : [source.value];
  }
  return source.reason === "dynamic" && (Node.isCallExpression(source.node) || Node.isTaggedTemplateExpression(source.node)) ? [source.node] : [];
}

/** Static raw SQL constructors reachable from one executed statement expression. */
function rawSqlNodes(node: MorphNode, seen: Set<MorphNode>): readonly { node: MorphNode; text: string }[] {
  if (Node.isTaggedTemplateExpression(node)) {
    const tag = node.getTag();
    return Node.isIdentifier(tag) && tag.getText() === "sql" ? [{ node, text: node.getTemplate().getText() }] : [];
  }
  if (Node.isCallExpression(node)) {
    const expression = node.getExpression();
    const argument = node.getArguments()[0];
    return Node.isPropertyAccessExpression(expression) &&
      expression.getExpression().getText() === "sql" &&
      expression.getName() === "raw" &&
      (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument))
      ? [{ node, text: argument.getLiteralText() }]
      : [];
  }
  return resolvedInitializers(node, seen).flatMap((initializer) => rawSqlNodes(initializer, seen));
}

/** Statements passed to an executed batch, following the house `batchMany([…])` wrapper and const aliases. */
function batchStatements(node: MorphNode, seen: Set<MorphNode>): readonly MorphNode[] {
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements();
  }
  if (Node.isCallExpression(node) && Node.isIdentifier(node.getExpression()) && node.getExpression().getText() === "batchMany") {
    const argument = node.getArguments()[0];
    return argument === undefined ? [] : batchStatements(argument, seen);
  }
  const initializers = resolvedInitializers(node, seen);
  return initializers.length === 0 ? [] : initializers.flatMap((initializer) => batchStatements(initializer, seen));
}

function isDatabaseReceiver(node: MorphNode): boolean {
  return (Node.isIdentifier(node) && node.getText() === "db") || (Node.isPropertyAccessExpression(node) && node.getName() === "db");
}

/** Executed raw INSERT observations; inert constructors never produce a write fact. */
export function readExecutedSqlInserts(call: Node): readonly ExecutedSqlInsert[] {
  if (!Node.isCallExpression(call)) {
    return [];
  }
  const expression = call.getExpression();
  if (!(Node.isPropertyAccessExpression(expression) && isDatabaseReceiver(expression.getExpression()))) {
    return [];
  }
  const argument = call.getArguments()[0];
  if (argument === undefined) {
    return [];
  }
  const method = expression.getName();
  let statements: readonly MorphNode[] = [];
  if (method === "batch") {
    statements = batchStatements(argument, new Set<MorphNode>());
  } else if (method === "run" || method === "execute") {
    statements = [argument];
  }
  return statements.flatMap((statement) =>
    rawSqlNodes(statement, new Set<MorphNode>()).flatMap((raw) => rawInsertHeaders(raw.text).map((header) => ({ ...header, node: raw.node }))),
  );
}

/** Raw-SQL construction observations, including inert SQL; a lens decides whether to annotate them. */
export function rawSqlTextIn(source: SourceFile): readonly string[] {
  const texts: string[] = [];
  for (const tagged of source.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
    if (Node.isIdentifier(tagged.getTag()) && tagged.getTag().getText() === "sql") {
      texts.push(tagged.getTemplate().getText());
    }
  }
  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const member = staticMemberAccess(call.getExpression());
    if (member?.name === "raw" && member.receiver.getText() === "sql") {
      texts.push(
        call
          .getArguments()
          .map((argument) => argument.getText())
          .join(" "),
      );
    }
  }
  return texts;
}

/** Authored SQL text with interpolation holes, never interpolated expression text as SQL syntax. */
export function sqlTemplateText(template: TaggedTemplateExpression): string {
  const value = template.getTemplate();
  if (Node.isNoSubstitutionTemplateLiteral(value)) {
    return value.getLiteralText();
  }
  return (
    value.getHead().getLiteralText() +
    value
      .getTemplateSpans()
      .map((span) => `«${span.getExpression().getText()}»${span.getLiteral().getLiteralText()}`)
      .join("")
  );
}
