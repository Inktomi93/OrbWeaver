// Raw SQL constructors and execution carriers are facts; column attribution and vocabulary remain consumer-owned.
import { existsSync, realpathSync } from "node:fs";
import { dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SQL } from "drizzle-orm";
import { and, eq, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, ne, not, notIlike, notInArray, notLike, or, sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { Node as MorphNode, SourceFile, TaggedTemplateExpression, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallBindings, readCallTarget, readFunctionReturnPaths } from "./call-returns.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { readPredicateArgument } from "./drizzle-predicate-argument.ts";
import { innerReadAnchorsOf } from "./drizzle-query.ts";
import type { ExecutedSqlInsert, SqlTemplateCarrier } from "./drizzle-sql-contract.ts";
import { readStatementOf } from "./drizzle-statement.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { enclosingFn } from "./function-context.ts";
import { inspectReferenceWrites, readMemberReference, resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { rawInsertHeaders } from "./sql-insert-header.ts";
import { sqliteFragmentContained } from "./sqlite-lexical.ts";
import { resolveTypeIdentityChain } from "./type-member-origin.ts";
import { referencesOf } from "./value-carrier.ts";

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

function driverParameter(type: Type): boolean {
  if (type.isUnion()) {
    return type.getUnionTypes().every(driverParameter);
  }
  if (type.isIntersection()) {
    return type.getIntersectionTypes().some(driverParameter);
  }
  const element = type.getArrayElementType();
  return element === undefined
    ? type.isString() ||
        type.isStringLiteral() ||
        type.isTemplateLiteral() ||
        type.isNumber() ||
        type.isNumberLiteral() ||
        type.isBoolean() ||
        type.isBooleanLiteral() ||
        type.isNull() ||
        type.isUndefined() ||
        type.isBigInt() ||
        type.isBigIntLiteral()
    : driverParameter(element);
}

function canonicalColumn(node: MorphNode): boolean {
  const identity = resolveTypeIdentityChain(node);
  return (
    identity.kind === "resolved" &&
    identity.value.some(
      (origin) =>
        (origin.name === "Column" || origin.name === "SQLiteColumn") &&
        origin.declarations.length > 0 &&
        origin.declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes("/drizzle-orm/")),
    )
  );
}

function sqlValue(type: Type): boolean {
  if (type.isUnion() || type.isIntersection()) {
    return [...type.getUnionTypes(), ...type.getIntersectionTypes()].some(sqlValue);
  }
  const symbol = type.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  return (
    (symbol?.getName() === "SQL" || symbol?.getName() === "Aliased") &&
    declarations.length > 0 &&
    declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes("/drizzle-orm/"))
  );
}

const CONTAINED_OPERATORS = [
  "and",
  "or",
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "isNull",
  "isNotNull",
  "inArray",
  "notInArray",
  "like",
  "notLike",
  "ilike",
  "notIlike",
  "not",
] as const;

function identityObservation(node: MorphNode | undefined): boolean {
  return (
    Node.isBinaryExpression(node) && [SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken].includes(node.getOperatorToken().getKind())
  );
}

function sqlAliasUseStable(use: MorphNode, active: ReadonlySet<object>): boolean {
  let value = use;
  let parent = value.getParent();
  while (
    parent !== undefined &&
    (Node.isParenthesizedExpression(parent) ||
      Node.isNonNullExpression(parent) ||
      Node.isAsExpression(parent) ||
      Node.isSatisfiesExpression(parent) ||
      (Node.isConditionalExpression(parent) && parent.getCondition() !== value))
  ) {
    value = parent;
    parent = value.getParent();
  }
  if (Node.isVariableDeclaration(parent) && parent.getInitializer() === value && Node.isIdentifier(parent.getNameNode())) {
    return sqlBindingStable(parent.getNameNode(), active);
  }
  if (identityObservation(parent)) {
    return true;
  }
  if (Node.isTemplateSpan(parent) && parent.getExpression() === value) {
    const tagged = parent.getParent().getParent();
    return (
      Node.isTaggedTemplateExpression(tagged) &&
      drizzleExportOf(tagged.getTag()) === "sql" &&
      runtimeDrizzleOrigin(tagged.getTag()) &&
      sqlAliasUseStable(tagged, active)
    );
  }
  if (!(Node.isCallExpression(parent) && parent.getArguments().includes(value))) {
    return false;
  }
  if (CONTAINED_OPERATORS.some((name) => callsDrizzleOperator(parent, name))) {
    return runtimeDrizzleOrigin(parent.getExpression()) && sqlAliasUseStable(parent, active);
  }
  const member = readCalledMember(parent);
  return member.kind === "resolved" && member.value.declarations.length > 0 && declaredInDrizzle(member.value.declarations);
}

function sqlBindingStable(node: MorphNode, active: ReadonlySet<object>): boolean {
  if (!Node.isIdentifier(node)) {
    return false;
  }
  if (active.has(node.getSymbol()?.compilerSymbol ?? node.compilerNode)) {
    return false;
  }
  const declaration = node.getSymbol()?.getValueDeclaration();
  if (!Node.isVariableDeclaration(declaration)) {
    return false;
  }
  const name = declaration.getNameNode();
  if (!Node.isIdentifier(name) || inspectReferenceWrites(name).kind === "unresolved") {
    return false;
  }
  const stable = resolveStableExpression(name);
  if (stable.kind === "unresolved" && stable.reason !== "dynamic") {
    return false;
  }
  const next = new Set(active).add(node.getSymbol()?.compilerSymbol ?? node.compilerNode);
  return referencesOf(name, enclosingFn(name) ?? name.getSourceFile()).every((use) => sqlAliasUseStable(use, next));
}

/** Const binds an SQL object, not frozen queryChunks. Only native read-only composition uses preserve it. */
export function readSqlAliasStability(node: MorphNode, active: ReadonlySet<object> = new Set()): boolean {
  return !(Node.isIdentifier(node) && sqlValue(node.getType())) || sqlBindingStable(node, active);
}

function templateFragments(
  node: TaggedTemplateExpression,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly string[] | undefined {
  if (drizzleExportOf(node.getTag()) !== "sql" || !runtimeDrizzleOrigin(node.getTag())) {
    return;
  }
  const template = node.getTemplate();
  if (Node.isNoSubstitutionTemplateLiteral(template)) {
    const literal = template.getLiteralText();
    return literal.includes("«") || literal.includes("»") || literal.includes("${") ? undefined : [literal];
  }
  const spans = template.getTemplateSpans();
  const literals = [template.getHead().getLiteralText(), ...spans.map((span) => span.getLiteral().getLiteralText())];
  if (literals.some((literal) => literal.includes("«") || literal.includes("»") || literal.includes("${"))) {
    return;
  }
  let texts = [template.getHead().getLiteralText()];
  for (const span of spans) {
    const fragments = sqlOperandFragments(span.getExpression(), bindings, active);
    if (fragments === undefined) {
      return;
    }
    texts = texts.flatMap((text) => fragments.map((fragment) => text + (fragment ?? "") + span.getLiteral().getLiteralText()));
  }
  return [...new Set(texts)];
}

function templateContained(node: TaggedTemplateExpression, bindings: ReadonlyMap<MorphNode, MorphNode>, active: ReadonlySet<object>): boolean {
  const fragments = templateFragments(node, bindings, active);
  return fragments !== undefined && fragments.every(sqliteFragmentContained);
}

const sqlDialect = new SQLiteSyncDialect();
const runtimeDrizzleRoot = dirname(fileURLToPath(import.meta.resolve("drizzle-orm")));
const BINARY_OPERATORS = { eq, ne, gt, gte, lt, lte, inArray, notInArray, like, notLike, ilike, notIlike } as const;
const UNARY_OPERATORS = { isNull, isNotNull, not } as const;

function runtimeDrizzleOrigin(node: MorphNode): boolean {
  const declarations = node
    .getType()
    .getCallSignatures()
    .map((signature) => signature.getDeclaration());
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => {
      const path = declaration.getSourceFile().getFilePath();
      return existsSync(path) && realpathSync(path).startsWith(runtimeDrizzleRoot + sep);
    })
  );
}

function fixedOperator(call: import("ts-morph").CallExpression, chunks: readonly SQL[]): SQL | undefined {
  const first = chunks[0];
  const second = chunks[1];
  if (chunks.length === 2 && first !== undefined && second !== undefined) {
    const name = (Object.keys(BINARY_OPERATORS) as (keyof typeof BINARY_OPERATORS)[]).find((key) => callsDrizzleOperator(call, key));
    if (name === undefined) {
      return;
    }
    const binary: (left: SQL, right: SQL) => SQL = BINARY_OPERATORS[name];
    return binary(first, second);
  }
  const name = (Object.keys(UNARY_OPERATORS) as (keyof typeof UNARY_OPERATORS)[]).find((key) => callsDrizzleOperator(call, key));
  return chunks.length === 1 && first !== undefined && name !== undefined ? UNARY_OPERATORS[name](first) : undefined;
}

// Native constructors own their emitted delimiters: notably AND with one child adds no parentheses.
function nativeOperatorFragment(call: import("ts-morph").CallExpression, fragments: readonly (string | undefined)[]): string | undefined {
  if (!runtimeDrizzleOrigin(call.getExpression())) {
    return;
  }
  const chunks = fragments.map((fragment) => (fragment === undefined ? undefined : sql.raw(fragment)));
  let result: SQL | undefined;
  if (callsDrizzleOperator(call, "and")) {
    result = and(...chunks);
  } else if (callsDrizzleOperator(call, "or")) {
    result = or(...chunks);
  } else {
    result = chunks.some((chunk) => chunk === undefined)
      ? undefined
      : fixedOperator(
          call,
          chunks.filter((chunk) => chunk !== undefined),
        );
  }
  return result === undefined ? undefined : sqlDialect.sqlToQuery(result).sql;
}

function operatorFragments(
  value: import("ts-morph").CallExpression,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly string[] | undefined {
  let combinations: readonly (readonly (string | undefined)[])[] = [[]];
  for (const argument of value.getArguments()) {
    const fragments = sqlOperandFragments(argument, bindings, active);
    if (fragments === undefined) {
      return;
    }
    combinations = combinations.flatMap((prior) => fragments.map((fragment) => [...prior, fragment]));
  }
  const rendered = combinations.map((combination) => nativeOperatorFragment(value, combination));
  return rendered.some((fragment) => fragment === undefined) ? undefined : rendered.filter((fragment) => fragment !== undefined);
}

function fragmentsOfAlternatives(
  nodes: readonly MorphNode[],
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  const fragments = nodes.map((node) => sqlOperandFragments(node, bindings, active));
  return fragments.length === 0 || fragments.some((fragment) => fragment === undefined) ? undefined : fragments.flatMap((fragment) => fragment ?? []);
}

function callFragments(
  value: import("ts-morph").CallExpression,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  if (callsDrizzleOperator(value, "exists") || callsDrizzleOperator(value, "notExists")) {
    const select = value.getArguments()[0];
    const prefix = callsDrizzleOperator(value, "exists") ? "exists" : "not exists";
    return runtimeDrizzleOrigin(value.getExpression()) && select !== undefined && selectContained(select, bindings, active)
      ? [`${prefix} (SELECT ?)`]
      : undefined;
  }
  if (CONTAINED_OPERATORS.some((name) => callsDrizzleOperator(value, name))) {
    return operatorFragments(value, bindings, active);
  }
  const member = readCalledMember(value);
  if (member.kind === "resolved" && declaredInDrizzle(member.value.declarations) && innerReadAnchorsOf(value).length > 0) {
    return selectContained(value, bindings, active) ? ["(SELECT ?)"] : undefined;
  }
  const target = readCallTarget(value);
  if (target.kind === "unresolved" || target.value.getSourceFile().isDeclarationFile()) {
    return;
  }
  const paths = readFunctionReturnPaths(target.value);
  const supplied = readCallBindings(value, target.value, bindings);
  return paths.kind === "resolved" ? fragmentsOfAlternatives(paths.value, supplied, active) : undefined;
}

function primitiveFragments(type: Type): readonly (string | undefined)[] {
  if (type.isUnion()) {
    return [...new Set(type.getUnionTypes().flatMap(primitiveFragments))];
  }
  if (type.isUndefined()) {
    return [undefined];
  }
  return type.getArrayElementType() === undefined ? ["?"] : ["(?)"];
}

function valueFragments(
  value: MorphNode,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  if (canonicalColumn(value)) {
    return ['"column"'];
  }
  if (driverParameter(value.getType())) {
    return primitiveFragments(value.getType());
  }
  if (Node.isTaggedTemplateExpression(value)) {
    return templateFragments(value, bindings, active);
  }
  if (Node.isConditionalExpression(value)) {
    return fragmentsOfAlternatives([value.getWhenTrue(), value.getWhenFalse()], bindings, active);
  }
  if (Node.isBinaryExpression(value) && [SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(value.getOperatorToken().getKind())) {
    return fragmentsOfAlternatives([value.getLeft(), value.getRight()], bindings, active);
  }
  return Node.isCallExpression(value) ? callFragments(value, bindings, active) : undefined;
}

function sqlOperandFragments(
  node: MorphNode,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  if (!readSqlAliasStability(node)) {
    return;
  }
  const operand = readPredicateArgument(node, bindings);
  if (operand.kind === "unresolved" || active.has(operand.value.compilerNode)) {
    return;
  }
  return valueFragments(operand.value, bindings, new Set(active).add(operand.value.compilerNode));
}

function selectContained(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode>, active: ReadonlySet<object>): boolean {
  const anchors = innerReadAnchorsOf(node);
  if (anchors.length === 0) {
    return false;
  }
  return (
    anchors.every((anchor) => {
      const member = readCalledMember(anchor.call);
      if (
        anchor.kind === "relational" ||
        member.kind !== "resolved" ||
        member.value.declarations.length === 0 ||
        !declaredInDrizzle(member.value.declarations)
      ) {
        return false;
      }
      const statement = readStatementOf(anchor.call);
      return (
        !statement.escapes &&
        [anchor.kind === "join" ? anchor.on : undefined, ...statement.innerOns, ...statement.wheres].every(
          (predicate) => predicate === undefined || sqlOperandContained(predicate, bindings, active),
        )
      );
    }) &&
    node.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression).every((template) => templateContained(template, bindings, active)) &&
    node.getDescendantsOfKind(SyntaxKind.CallExpression).every((call) => !sqlValue(call.getType()) || sqlOperandContained(call, bindings, active))
  );
}

function callContained(value: import("ts-morph").CallExpression, bindings: ReadonlyMap<MorphNode, MorphNode>, active: ReadonlySet<object>): boolean {
  if (callsDrizzleOperator(value, "exists") || callsDrizzleOperator(value, "notExists")) {
    const select = value.getArguments()[0];
    return select !== undefined && selectContained(select, bindings, active);
  }
  if (CONTAINED_OPERATORS.some((name) => callsDrizzleOperator(value, name))) {
    return value.getArguments().every((argument) => sqlOperandContained(argument, bindings, active));
  }
  const member = readCalledMember(value);
  if (
    member.kind === "resolved" &&
    member.value.declarations.length > 0 &&
    declaredInDrizzle(member.value.declarations) &&
    innerReadAnchorsOf(value).length > 0
  ) {
    return selectContained(value, bindings, active);
  }
  const target = readCallTarget(value);
  if (target.kind === "unresolved" || target.value.getSourceFile().isDeclarationFile()) {
    return false;
  }
  const paths = readFunctionReturnPaths(target.value);
  const supplied = readCallBindings(value, target.value, bindings);
  return paths.kind === "resolved" && paths.value.every((path) => sqlOperandContained(path, supplied, active));
}

function sqlOperandContained(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode>, active: ReadonlySet<object>): boolean {
  if (!readSqlAliasStability(node)) {
    return false;
  }
  const operand = readPredicateArgument(node, bindings);
  if (operand.kind === "unresolved" || active.has(operand.value.compilerNode)) {
    return false;
  }
  const value = operand.value;
  const next = new Set(active).add(value.compilerNode);
  if (driverParameter(value.getType()) || canonicalColumn(value)) {
    return true;
  }
  if (Node.isTaggedTemplateExpression(value)) {
    return templateContained(value, bindings, next);
  }
  if (Node.isConditionalExpression(value)) {
    return sqlOperandContained(value.getWhenTrue(), bindings, next) && sqlOperandContained(value.getWhenFalse(), bindings, next);
  }
  if (Node.isBinaryExpression(value) && [SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(value.getOperatorToken().getKind())) {
    return sqlOperandContained(value.getLeft(), bindings, next) && sqlOperandContained(value.getRight(), bindings, next);
  }
  return Node.isCallExpression(value) && callContained(value, bindings, next);
}

/** Complete literal containment plus primitive-driver/column provenance. Unknown SQL-producing values refuse;
 * contained SQL still carries no owner or FK authorization. */
export function readSqlOperandContainment(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode> = new Map()): boolean {
  return sqlOperandContained(node, bindings, new Set());
}
