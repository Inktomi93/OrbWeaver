// Complete SQL lexical composition is separate from native origins and mutable-carrier use facts.
import type { Node as MorphNode, SourceFile, TaggedTemplateExpression, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallBindings, readCallReturnProgram, readCallTargets, readFunctionReturnPaths, readSuppliedParameter } from "./call-returns.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { readPredicateArgument } from "./drizzle-predicate-argument.ts";
import { innerReadAnchorsOf } from "./drizzle-query.ts";
import { readDrizzleSelection } from "./drizzle-select.ts";
import { readNativeSqlConstructor } from "./drizzle-sql-constructors.ts";
import type { ExecutedSqlInsert, SqlReadContext, SqlTemplateCarrier } from "./drizzle-sql-contract.ts";
import { nativeOperatorFragment, runtimeDrizzleOrigin } from "./drizzle-sql-native.ts";
import {
  rawSqlTextIn as authoredSqlText,
  sqlTemplateText as authoredTemplateText,
  readExecutedSqlInserts as executedInserts,
} from "./drizzle-sql-observations.ts";
import {
  driverParameter,
  nativeArrayMap,
  nativeMappedCallback,
  nativeMappedInput,
  nativeTableFragment,
  readSqlValueSources,
  sqlValue,
} from "./drizzle-sql-origin.ts";
import { readNativeColumnFragments, readSelectedSqlSource } from "./drizzle-sql-projection.ts";
import { CONTAINED_OPERATORS, sqlBindingStable } from "./drizzle-sql-stability.ts";
import { readStatementOf } from "./drizzle-statement.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { readMemberReference, resolveModuleMemberOrigin, staticMemberAccess } from "./reference-fact.ts";
import type { CallReturnObservations, CallReturnProgram } from "./reference-fact-contract.ts";
import { readSchemaObjectMembers } from "./schema-object.ts";
import { terminalCall } from "./schema-value.ts";
import { sqliteFragmentContained } from "./sqlite-lexical.ts";

/** Const binds native SQL carriers, not frozen queryChunks. */
export function readSqlAliasStability(node: MorphNode, active: ReadonlySet<object> = new Set(), program?: CallReturnProgram): boolean {
  return !(Node.isIdentifier(node) && sqlValue(node.getType())) || sqlBindingStable(node, active, program);
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

/** Executed INSERT source facts retain their existing public reader. */
export function readExecutedSqlInserts(call: MorphNode): readonly ExecutedSqlInsert[] {
  return executedInserts(call);
}

/** Raw construction text is an observation, not executable containment. */
export function rawSqlTextIn(source: SourceFile): readonly string[] {
  return authoredSqlText(source);
}

/** Template text retains interpolation holes rather than treating expressions as grammar. */
export function sqlTemplateText(template: TaggedTemplateExpression): string {
  return authoredTemplateText(template);
}

function templateFragments(node: TaggedTemplateExpression, context: SqlReadContext, active: ReadonlySet<object>): readonly string[] | undefined {
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
    const fragments = sqlOperandFragments(span.getExpression(), context, active);
    if (fragments === undefined) {
      return;
    }
    texts = texts.flatMap((text) => fragments.map((fragment) => text + (fragment ?? "") + span.getLiteral().getLiteralText()));
  }
  return [...new Set(texts)];
}

function templateContained(node: TaggedTemplateExpression, context: SqlReadContext, active: ReadonlySet<object>): boolean {
  const fragments = templateFragments(node, context, active);
  return fragments !== undefined && fragments.every(sqliteFragmentContained);
}

function mappedFragments(value: MorphNode, context: SqlReadContext, active: ReadonlySet<object>): readonly (string | undefined)[] | undefined {
  const input = readPredicateArgument(value, context.bindings);
  if (input.kind !== "resolved" || !Node.isCallExpression(input.value) || !nativeArrayMap(input.value)) {
    return;
  }
  const callback = input.value.getArguments()[0];
  const receiver = staticMemberAccess(input.value.getExpression())?.receiver;
  if (receiver === undefined || !nativeMappedInput(receiver, context.bindings) || !nativeMappedCallback(callback)) {
    return;
  }
  const paths = callback === undefined ? undefined : readFunctionReturnPaths(callback);
  return paths?.kind === "resolved" ? fragmentsOfAlternatives(paths.value, context, active) : undefined;
}

function optionalNativeOperator(call: import("ts-morph").CallExpression): boolean {
  return callsDrizzleOperator(call, "and") || callsDrizzleOperator(call, "or");
}

function operatorFragments(
  value: import("ts-morph").CallExpression,
  context: SqlReadContext,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  let combinations: readonly (readonly (string | undefined)[])[] = [[]];
  for (const argument of value.getArguments()) {
    if (Node.isSpreadElement(argument)) {
      if (!optionalNativeOperator(value)) {
        return;
      }
      const mapped = mappedFragments(argument.getExpression(), context, active);
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
    const fragments = sqlOperandFragments(argument, context, active);
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
  context: SqlReadContext,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  const fragments = nodes.map((node) => sqlOperandFragments(node, context, active));
  return fragments.length === 0 || fragments.some((fragment) => fragment === undefined) ? undefined : fragments.flatMap((fragment) => fragment ?? []);
}

function nativeSelectCall(call: import("ts-morph").CallExpression): boolean {
  const member = readCalledMember(call);
  return member.kind === "resolved" && declaredInDrizzle(member.value.declarations) && innerReadAnchorsOf(call).length > 0;
}

function authoredCallFragments(
  value: import("ts-morph").CallExpression,
  context: SqlReadContext,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  const target = context.program?.byCall.get(value.compilerNode)?.targets ?? readCallTargets(value);
  if (target.kind === "unresolved" || target.value.some((fn) => fn.getSourceFile().isDeclarationFile())) {
    return;
  }
  const parts = target.value.map((fn) => {
    const paths = readFunctionReturnPaths(fn);
    const supplied = readCallBindings(value, fn, context.bindings);
    return paths.kind === "resolved" ? fragmentsOfAlternatives(paths.value, { ...context, bindings: supplied }, active) : undefined;
  });
  return parts.some((part) => part === undefined) ? undefined : parts.flatMap((part) => part ?? []);
}

function callFragments(
  value: import("ts-morph").CallExpression,
  context: SqlReadContext,
  active: ReadonlySet<object>,
): readonly (string | undefined)[] | undefined {
  const constructed = readNativeSqlConstructor(
    value,
    context.bindings,
    (node) => sqlOperandFragments(node, context, active),
    (node) => mappedFragments(node, context, active),
  );
  if (constructed !== undefined) {
    return constructed;
  }
  if (callsDrizzleOperator(value, "exists") || callsDrizzleOperator(value, "notExists")) {
    const select = value.getArguments()[0];
    const prefix = callsDrizzleOperator(value, "exists") ? "exists" : "not exists";
    return runtimeDrizzleOrigin(value.getExpression()) && select !== undefined && selectContained(select, context, active)
      ? [`${prefix} (SELECT ?)`]
      : undefined;
  }
  if (CONTAINED_OPERATORS.some((name) => callsDrizzleOperator(value, name))) {
    return operatorFragments(value, context, active);
  }
  if (nativeSelectCall(value)) {
    return selectContained(value, context, active) ? ["(SELECT ?)"] : undefined;
  }
  return authoredCallFragments(value, context, active);
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

function valueFragments(value: MorphNode, context: SqlReadContext, active: ReadonlySet<object>): readonly (string | undefined)[] | undefined {
  const column = readNativeColumnFragments(
    value,
    context,
    (node, bindings = context.bindings) => sqlOperandFragments(node, { ...context, bindings }, active),
    (node, bindings = context.bindings) => selectContained(node, { ...context, bindings }, active),
  );
  if (column !== undefined) {
    return column;
  }
  const table = nativeTableFragment(value, context.bindings, new Set());
  if (table !== undefined) {
    return [table];
  }
  if (driverParameter(value.getType())) {
    return primitiveFragments(value.getType());
  }
  if (Node.isTaggedTemplateExpression(value)) {
    return templateFragments(value, context, active);
  }
  if (Node.isConditionalExpression(value)) {
    return fragmentsOfAlternatives([value.getWhenTrue(), value.getWhenFalse()], context, active);
  }
  if (Node.isBinaryExpression(value) && [SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(value.getOperatorToken().getKind())) {
    return fragmentsOfAlternatives([value.getLeft(), value.getRight()], context, active);
  }
  return Node.isCallExpression(value) ? callFragments(value, context, active) : undefined;
}

function suppliedFragments(node: MorphNode, context: SqlReadContext, active: ReadonlySet<object>): readonly (string | undefined)[] | undefined {
  if (active.has(node.compilerNode) || !(context.program === undefined ? readSqlAliasStability(node) : sqlBindingStable(node, new Set(), context.program))) {
    return;
  }
  const supplied = readSuppliedParameter(node, context.bindings, context.program);
  if (supplied.kind === "unresolved") {
    return;
  }
  const parts = supplied.value.map((source) =>
    source.present ? sqlOperandFragments(source.value, { ...context, bindings: source.bindings }, new Set(active).add(node.compilerNode)) : [undefined],
  );
  return parts.some((part) => part === undefined) ? undefined : parts.flatMap((part) => part ?? []);
}

function sqlOperandFragments(node: MorphNode, context: SqlReadContext, active: ReadonlySet<object>): readonly (string | undefined)[] | undefined {
  const declaration = Node.isIdentifier(node) ? node.getSymbol()?.getValueDeclaration() : undefined;
  if (Node.isParameterDeclaration(declaration) && !driverParameter(node.getType())) {
    return suppliedFragments(node, context, active);
  }
  if (!readSqlAliasStability(node, new Set(), context.program)) {
    return;
  }
  const operand = readPredicateArgument(node, context.bindings);
  if (operand.kind === "unresolved" || active.has(operand.value.compilerNode)) {
    return;
  }
  const terminal = Node.isIdentifier(operand.value) && sqlValue(operand.value.getType()) ? terminalCall(operand.value) : undefined;
  const value = terminal?.kind === "resolved" ? terminal.value : operand.value;
  const receiver = staticMemberAccess(value)?.receiver;
  if (receiver !== undefined && !readSqlAliasStability(receiver, new Set(), context.program)) {
    return;
  }
  return active.has(value.compilerNode) ? undefined : valueFragments(value, context, new Set(active).add(value.compilerNode));
}

function selectContained(node: MorphNode, context: SqlReadContext, active: ReadonlySet<object>): boolean {
  if (readDrizzleSelection(node) === undefined) {
    const sources = readSqlValueSources(node, context);
    return (
      sources.kind === "resolved" &&
      sources.value.length > 0 &&
      sources.value.every(
        (source) =>
          source.present &&
          source.path.length === 0 &&
          source.value.compilerNode !== node.compilerNode &&
          !active.has(source.value.compilerNode) &&
          selectContained(source.value, { ...context, bindings: source.bindings }, new Set(active).add(source.value.compilerNode)),
      )
    );
  }
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
      const statement = readStatementOf(anchor.call, context.program === undefined ? undefined : { programs: [context.program] });
      const derived = readSqlAliasStability(anchor.table, new Set(), context.program) ? readSelectedSqlSource(anchor.table, context) : undefined;
      const nativeSource =
        nativeTableFragment(anchor.table, context.bindings, new Set()) !== undefined ||
        (derived !== undefined &&
          derived.length > 0 &&
          derived.every(
            (source) =>
              !active.has(source.value.compilerNode) &&
              selectContained(source.value, { ...context, bindings: source.bindings }, new Set(active).add(source.value.compilerNode)),
          ));
      return (
        nativeSource &&
        !statement.escapes &&
        [anchor.kind === "join" ? anchor.on : undefined, ...statement.innerOns, ...statement.wheres].every(
          (predicate) => predicate === undefined || sqlOperandContained(predicate, context, active),
        )
      );
    }) &&
    selectionContained(node, context, active) &&
    node.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression).every((template) => templateContained(template, context, active)) &&
    node.getDescendantsOfKind(SyntaxKind.CallExpression).every((call) => !sqlValue(call.getType()) || sqlOperandContained(call, context, active))
  );
}

function selectionContained(node: MorphNode, context: SqlReadContext, active: ReadonlySet<object>): boolean {
  const selection = readDrizzleSelection(node);
  if (
    selection === undefined ||
    !selection.calls.every((call) => runtimeDrizzleOrigin(call.getExpression())) ||
    !selection.sqlOperands.every((operand) => sqlOperandContained(operand, context, active))
  ) {
    return false;
  }
  if (selection.projection === undefined) {
    return true;
  }
  const fields = readSchemaObjectMembers(selection.projection);
  return fields.kind === "resolved" && fields.value.entries.every((field) => sqlOperandContained(field.value, context, active));
}

function sqlOperandContained(node: MorphNode, context: SqlReadContext, active: ReadonlySet<object>): boolean {
  const fragments = sqlOperandFragments(node, context, active);
  return fragments !== undefined && fragments.every((fragment) => fragment === undefined || sqliteFragmentContained(fragment));
}

/** Complete literal containment plus primitive-driver/column provenance. Unknown SQL-producing values refuse;
 * contained SQL still carries no owner or FK authorization. */
export function readSqlOperandContainment(
  node: MorphNode,
  bindings: ReadonlyMap<MorphNode, MorphNode> = new Map(),
  observations?: CallReturnObservations,
): boolean {
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
  const captured = observations === undefined ? undefined : readCallReturnProgram(node, observations);
  return captured?.kind !== "unresolved" && sqlOperandContained(node, { bindings, program: captured?.value }, new Set());
}
