// Complete SQL lexical composition is separate from native origins and mutable-carrier use facts.
import type { Node as MorphNode, SourceFile, TaggedTemplateExpression, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallBindings, readCallTarget, readFunctionReturnPaths } from "./call-returns.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { readPredicateArgument } from "./drizzle-predicate-argument.ts";
import { innerReadAnchorsOf } from "./drizzle-query.ts";
import { readDrizzleSelection } from "./drizzle-select.ts";
import { readNativeSqlConstructor } from "./drizzle-sql-constructors.ts";
import type { ExecutedSqlInsert, SqlTemplateCarrier } from "./drizzle-sql-contract.ts";
import { nativeOperatorFragment, runtimeDrizzleOrigin } from "./drizzle-sql-native.ts";
import { driverParameter, nativeArrayMap, nativeMappedCallback, nativeMappedInput, nativeTableFragment, sqlValue } from "./drizzle-sql-origin.ts";
import { readNativeColumnFragments, readSelectedSqlSource } from "./drizzle-sql-projection.ts";
import { CONTAINED_OPERATORS, sqlBindingStable } from "./drizzle-sql-stability.ts";
import { readStatementOf } from "./drizzle-statement.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { readMemberReference, resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { readSchemaObjectMembers } from "./schema-object.ts";
import { terminalCall } from "./schema-value.ts";
import { rawInsertHeaders } from "./sql-insert-header.ts";
import { sqliteFragmentContained } from "./sqlite-lexical.ts";

/** Const binds native SQL carriers, not frozen queryChunks. */
export function readSqlAliasStability(node: MorphNode, active: ReadonlySet<object> = new Set()): boolean {
  return !(Node.isIdentifier(node) && sqlValue(node.getType())) || sqlBindingStable(node, active);
}

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

function mappedFragments(
  value: MorphNode,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  const input = readPredicateArgument(value, bindings);
  if (input.kind !== "resolved" || !Node.isCallExpression(input.value) || !nativeArrayMap(input.value)) {
    return;
  }
  const callback = input.value.getArguments()[0];
  const receiver = staticMemberAccess(input.value.getExpression())?.receiver;
  if (receiver === undefined || !nativeMappedInput(receiver, bindings) || !nativeMappedCallback(callback)) {
    return;
  }
  const paths = callback === undefined ? undefined : readFunctionReturnPaths(callback);
  return paths?.kind === "resolved" ? fragmentsOfAlternatives(paths.value, bindings, active) : undefined;
}

function optionalNativeOperator(call: import("ts-morph").CallExpression): boolean {
  return callsDrizzleOperator(call, "and") || callsDrizzleOperator(call, "or");
}

function operatorFragments(
  value: import("ts-morph").CallExpression,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  let combinations: readonly (readonly (string | undefined)[])[] = [[]];
  for (const argument of value.getArguments()) {
    if (Node.isSpreadElement(argument)) {
      if (!optionalNativeOperator(value)) {
        return;
      }
      const mapped = mappedFragments(argument.getExpression(), bindings, active);
      if (mapped === undefined || !mapped.every((fragment) => fragment !== undefined && sqliteFragmentContained(fragment))) {
        return;
      }
      const present = mapped.filter((fragment) => fragment !== undefined);
      const prior = combinations;
      // Native AND/OR emit nothing, one bare child, or a parenthesized multi-child expression.
      combinations = [
        ...prior,
        ...prior.flatMap((items) => present.map((fragment) => [...items, fragment])),
        ...prior.flatMap((items) => present.flatMap((first) => present.map((second) => [...items, first, second]))),
      ];
      continue;
    }
    const fragments = sqlOperandFragments(argument, bindings, active);
    if (fragments === undefined) {
      return;
    }
    combinations = combinations.flatMap((prior) => fragments.map((fragment) => [...prior, fragment]));
  }
  const rendered = combinations.map((combination) => nativeOperatorFragment(value, combination));
  const omitsAbsent = optionalNativeOperator(value);
  return rendered.some((fragment) => fragment === undefined) && !omitsAbsent ? undefined : rendered;
}

function fragmentsOfAlternatives(
  nodes: readonly MorphNode[],
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  const fragments = nodes.map((node) => sqlOperandFragments(node, bindings, active));
  return fragments.length === 0 || fragments.some((fragment) => fragment === undefined) ? undefined : fragments.flatMap((fragment) => fragment ?? []);
}

function nativeSelectCall(call: import("ts-morph").CallExpression): boolean {
  const member = readCalledMember(call);
  return member.kind === "resolved" && declaredInDrizzle(member.value.declarations) && innerReadAnchorsOf(call).length > 0;
}

function callFragments(
  value: import("ts-morph").CallExpression,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  const constructed = readNativeSqlConstructor(
    value,
    bindings,
    (node) => sqlOperandFragments(node, bindings, active),
    (node) => mappedFragments(node, bindings, active),
  );
  if (constructed !== undefined) {
    return constructed;
  }
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
  if (nativeSelectCall(value)) {
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
  const column = readNativeColumnFragments(
    value,
    bindings,
    (node) => sqlOperandFragments(node, bindings, active),
    (node) => selectContained(node, bindings, active),
  );
  if (column !== undefined) {
    return column;
  }
  const table = nativeTableFragment(value, bindings, new Set());
  if (table !== undefined) {
    return [table];
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
  const terminal = Node.isIdentifier(operand.value) && sqlValue(operand.value.getType()) ? terminalCall(operand.value) : undefined;
  const value = terminal?.kind === "resolved" ? terminal.value : operand.value;
  const receiver = staticMemberAccess(value)?.receiver;
  if (receiver !== undefined && !readSqlAliasStability(receiver)) {
    return;
  }
  return active.has(value.compilerNode) ? undefined : valueFragments(value, bindings, new Set(active).add(value.compilerNode));
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
      const derived = readSqlAliasStability(anchor.table) ? readSelectedSqlSource(anchor.table, bindings) : undefined;
      const nativeSource =
        nativeTableFragment(anchor.table, bindings, new Set()) !== undefined ||
        (derived !== undefined && !active.has(derived.compilerNode) && selectContained(derived, bindings, new Set(active).add(derived.compilerNode)));
      return (
        nativeSource &&
        !statement.escapes &&
        [anchor.kind === "join" ? anchor.on : undefined, ...statement.innerOns, ...statement.wheres].every(
          (predicate) => predicate === undefined || sqlOperandContained(predicate, bindings, active),
        )
      );
    }) &&
    selectionContained(node, bindings, active) &&
    node.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression).every((template) => templateContained(template, bindings, active)) &&
    node.getDescendantsOfKind(SyntaxKind.CallExpression).every((call) => !sqlValue(call.getType()) || sqlOperandContained(call, bindings, active))
  );
}

function selectionContained(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode>, active: ReadonlySet<object>): boolean {
  const selection = readDrizzleSelection(node);
  if (
    selection === undefined ||
    !selection.calls.every((call) => runtimeDrizzleOrigin(call.getExpression())) ||
    !selection.sqlOperands.every((operand) => sqlOperandContained(operand, bindings, active))
  ) {
    return false;
  }
  if (selection.projection === undefined) {
    return true;
  }
  const fields = readSchemaObjectMembers(selection.projection);
  return fields.kind === "resolved" && fields.value.entries.every((field) => sqlOperandContained(field.value, bindings, active));
}

function sqlOperandContained(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode>, active: ReadonlySet<object>): boolean {
  const fragments = sqlOperandFragments(node, bindings, active);
  return fragments !== undefined && fragments.every((fragment) => fragment === undefined || sqliteFragmentContained(fragment));
}

/** Complete literal containment plus primitive-driver/column provenance. Unknown SQL-producing values refuse;
 * contained SQL still carries no owner or FK authorization. */
export function readSqlOperandContainment(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode> = new Map()): boolean {
  if (node.wasForgotten()) {
    return false;
  }
  const program = node.getProject().getProgram().compilerObject;
  if (
    [...bindings].some(([parameter, value]) =>
      [parameter, value].some((bound) => bound.wasForgotten() || bound.getProject().getProgram().compilerObject !== program),
    )
  ) {
    return false;
  }
  return sqlOperandContained(node, bindings, new Set());
}
