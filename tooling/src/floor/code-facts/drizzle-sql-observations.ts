// Executed SQL and authored text observations; containment is judged by the canonical lexical reader.
import type { CallExpression, Node as MorphNode, SourceFile, TaggedTemplateExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExecutedSqlInsert } from "./drizzle-sql-contract.ts";
import { DRIZZLE_BATCH_VERB, DRIZZLE_SQL_EXPORT, DRIZZLE_SQL_RAW_MEMBER, DRIZZLE_STATEMENT_EXECUTE_VERBS } from "./drizzle-vocabulary.ts";
import { resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { rawInsertHeaders } from "./sql-insert-header.ts";

const STATEMENT_EXECUTE_VERBS: ReadonlySet<string> = new Set(DRIZZLE_STATEMENT_EXECUTE_VERBS);

/** An authored `sql` template by its tag spelling. Text observation only; native origin is `runtimeDrizzleOrigin`. */
export function isAuthoredSqlTemplate(template: TaggedTemplateExpression): boolean {
  const tag = template.getTag();
  return Node.isIdentifier(tag) && tag.getText() === DRIZZLE_SQL_EXPORT;
}

/** An authored `sql.raw(…)` call by its spelling, under the same text-only contract as {@link isAuthoredSqlTemplate}. */
function isAuthoredSqlRawCall(call: CallExpression): boolean {
  const member = staticMemberAccess(call.getExpression());
  return member?.name === DRIZZLE_SQL_RAW_MEMBER && member.receiver.getText() === DRIZZLE_SQL_EXPORT;
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
    return isAuthoredSqlTemplate(node) ? [{ node, text: node.getTemplate().getText() }] : [];
  }
  if (Node.isCallExpression(node)) {
    const argument = node.getArguments()[0];
    return isAuthoredSqlRawCall(node) && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument))
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
  if (method === DRIZZLE_BATCH_VERB) {
    statements = batchStatements(argument, new Set<MorphNode>());
  } else if (STATEMENT_EXECUTE_VERBS.has(method)) {
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
    if (isAuthoredSqlTemplate(tagged)) {
      texts.push(tagged.getTemplate().getText());
    }
  }
  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (isAuthoredSqlRawCall(call)) {
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
