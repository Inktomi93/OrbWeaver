// RESOLUTION inside the loaded schema population: a node to the `SchemaTable`/`SchemaColumn` it denotes
// (module origin first, then the stable-binding trace), a column's `.references(…)` target to a population
// column or an external one, and a table's extras callback to its indexes. Every refusal is a
// `SchemaRefusal` the fact converts into a structured `unresolved` status. Split out of `schema-fact.ts` at
// the size cap (2026-09-18); one-way — this module imports nothing from it.
import { readMemberReference, resolveModuleMemberOrigin, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import type { ReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import type { CallExpression, Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { SchemaColumn, SchemaColumnIdentity, SchemaForeignKey, SchemaIndex, SchemaTable, SchemaTableIdentity } from "../contract/schema-fact.ts";
import type { ColumnDraft, TableDraft } from "./schema-fact-value.ts";
import {
  effectiveObjectProperty,
  exactDrizzleExport,
  guardCompositeBindings,
  operationChain,
  refuse,
  resolved,
  schemaDeclarationKey,
  schemaIndexKind,
  staticString,
  unresolved,
} from "./schema-fact-value.ts";

function returnedExpression(node: MorphNode, subject: string): MorphNode {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    return refuse({ ...stable, detail: `${subject}: ${stable.detail}` });
  }
  const callback = stable.value;
  if (!(Node.isArrowFunction(callback) || Node.isFunctionExpression(callback))) {
    return refuse(unresolved("unsupported", callback, `${subject} is not an authored callback`, stable.trace.declarations));
  }
  const body = callback.getBody();
  if (!Node.isBlock(body)) {
    return body;
  }
  const returned = body.getStatements().filter(Node.isReturnStatement);
  const expression = returned[0]?.getExpression();
  return returned.length === 1 && expression !== undefined
    ? expression
    : refuse(unresolved("dynamic", body, `${subject} must have exactly one explicit return expression`));
}

function arrayElements(node: MorphNode, subject: string, active = new Set<object>()): readonly MorphNode[] {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    return refuse({ ...stable, detail: `${subject}: ${stable.detail}` });
  }
  if (!Node.isArrayLiteralExpression(stable.value)) {
    return refuse(unresolved("unsupported", stable.value, `${subject} is not an authored array`, stable.trace.declarations));
  }
  guardCompositeBindings(stable.value, stable.trace.declarations, subject);
  if (active.has(stable.value.compilerNode)) {
    return refuse(unresolved("cycle", stable.value, `${subject} contains an array-spread cycle`));
  }
  active.add(stable.value.compilerNode);
  const elements: MorphNode[] = [];
  for (const element of stable.value.getElements()) {
    if (Node.isOmittedExpression(element)) {
      return refuse(unresolved("unsupported", element, `${subject} contains an array hole`));
    }
    elements.push(...(Node.isSpreadElement(element) ? arrayElements(element.getExpression(), subject, active) : [element]));
  }
  active.delete(stable.value.compilerNode);
  return elements;
}

export function tableFromReference(node: MorphNode, byDeclaration: ReadonlyMap<string, SchemaTable>): ReferenceFact<SchemaTable> {
  if (Node.isVariableDeclaration(node)) {
    const direct = byDeclaration.get(schemaDeclarationKey(node));
    return direct === undefined ? unresolved("missing", node, `${node.getText()} is not a resolved schema table`) : resolved(direct, node, [node]);
  }
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "resolved" && origin.value.canonical.kind === "project") {
    const table = byDeclaration.get(schemaDeclarationKey(origin.value.canonical.declaration));
    if (table !== undefined) {
      return resolved(table, origin.trace.origin, origin.trace.declarations);
    }
  }
  const stable = resolveStableExpression(node);
  const declaration = stable.trace.declarations.find((candidate) => byDeclaration.has(schemaDeclarationKey(candidate)));
  if (declaration !== undefined) {
    const table = byDeclaration.get(schemaDeclarationKey(declaration));
    if (table !== undefined) {
      return resolved(table, stable.trace.origin, stable.trace.declarations);
    }
  }
  if (origin.kind === "unresolved" && origin.reason !== "missing") {
    return origin;
  }
  return stable.kind === "unresolved" ? stable : unresolved("missing", node, `${node.getText()} does not resolve to a schema table`, stable.trace.declarations);
}

export function columnFromReference(
  node: MorphNode,
  byDeclaration: ReadonlyMap<string, SchemaTable>,
  byKey: ReadonlyMap<string, SchemaColumn>,
): ReferenceFact<SchemaColumn> {
  const member = readMemberReference(node);
  if (member.kind === "unresolved") {
    return member;
  }
  const table = tableFromReference(member.value.receiver, byDeclaration);
  if (table.kind === "unresolved") {
    return table;
  }
  const column = byKey.get(`${table.value.identity.key}.${member.value.name}`);
  return column === undefined
    ? unresolved("missing", member.value.nameNode, `${table.value.identity.key} has no column ${member.value.name}`, table.trace.declarations)
    : resolved(column, member.trace.origin, [...table.trace.declarations, ...member.trace.declarations]);
}

function callbackColumn(
  node: MorphNode,
  parameter: MorphNode | null,
  table: SchemaTableIdentity,
  columns: ReadonlyMap<string, SchemaColumnIdentity>,
): SchemaColumnIdentity | null {
  if (parameter === null) {
    return null;
  }
  const member = readMemberReference(node);
  if (member.kind === "unresolved") {
    if (member.reason === "unsupported") {
      return null;
    }
    return refuse(member);
  }
  const receiver = resolveStableExpression(member.value.receiver);
  const parameterSymbol = Node.isIdentifier(parameter) ? parameter.getSymbol() : undefined;
  const receiverSymbol = Node.isIdentifier(member.value.receiver) ? member.value.receiver.getSymbol() : undefined;
  const isParameter = parameterSymbol !== undefined && receiverSymbol?.compilerSymbol === parameterSymbol.compilerSymbol;
  if (!isParameter || (receiver.kind === "unresolved" && receiver.reason !== "missing")) {
    return null;
  }
  return columns.get(member.value.name) ?? refuse(unresolved("missing", member.value.nameNode, `${table.key} has no column ${member.value.name}`));
}

export function foreignKeyOf(
  column: ColumnDraft,
  tables: ReadonlyMap<string, SchemaTable>,
  columns: ReadonlyMap<string, SchemaColumn>,
  canonicalPath: (sourceFile: SourceFile) => string,
): SchemaForeignKey | null {
  const calls = column.operations.get("references") ?? [];
  if (calls.length === 0) {
    return null;
  }
  const call = calls[0];
  if (call === undefined || calls.length !== 1) {
    return refuse(unresolved("ambiguous", column.expression, `${column.identity.key} has multiple references operations`));
  }
  const targetArg = call.getArguments()[0];
  if (targetArg === undefined) {
    return refuse(unresolved("missing", call, `${column.identity.key} references call has no target`));
  }
  const targetNode = returnedExpression(targetArg, `${column.identity.key} references target`);
  const target = foreignTarget(targetNode, tables, columns, canonicalPath);
  if (target.kind === "unresolved") {
    return refuse({ ...target, detail: `${column.identity.key} references target: ${target.detail}` });
  }
  const config = call.getArguments()[1];
  const onDeleteNode = config === undefined ? null : effectiveObjectProperty(config, "onDelete", `${column.identity.key} references config`);
  return {
    child: column.identity,
    parent: target.value,
    onDelete: onDeleteNode === null ? { kind: "unspecified" } : { kind: "specified", value: staticString(onDeleteNode, `${column.identity.key} onDelete`) },
    call,
  };
}

function foreignTarget(
  node: MorphNode,
  tables: ReadonlyMap<string, SchemaTable>,
  columns: ReadonlyMap<string, SchemaColumn>,
  canonicalPath: (sourceFile: SourceFile) => string,
): ReferenceFact<SchemaForeignKey["parent"]> {
  const local = columnFromReference(node, tables, columns);
  if (local.kind === "resolved") {
    return resolved({ kind: "population-column", column: local.value.identity }, local.trace.origin, local.trace.declarations);
  }
  const member = readMemberReference(node);
  if (member.kind === "unresolved") {
    return member;
  }
  const origin = resolveModuleMemberOrigin(member.value.receiver);
  if (origin.kind === "unresolved") {
    return local.reason === "missing" ? origin : local;
  }
  if (origin.value.canonical.kind !== "project") {
    return unresolved(
      "missing",
      member.value.receiver,
      `${member.value.receiver.getText()} has no resolved project table declaration`,
      origin.trace.declarations,
    );
  }
  const exportedTable = origin.value.canonical.exportedName;
  const moduleSpecifier = origin.value.moduleSpecifier;
  const sourcePath = canonicalPath(origin.value.canonical.sourceFile);
  const value: SchemaForeignKey["parent"] = {
    kind: "external-column",
    sourcePath,
    moduleSpecifier,
    exportedTable,
    propertyName: member.value.name,
    key: `${sourcePath}#${exportedTable}.${member.value.name}`,
  };
  return resolved(value, origin.trace.origin, [...origin.trace.declarations, ...member.trace.declarations]);
}

function indexName(root: CallExpression, kind: SchemaIndex["kind"]): SchemaIndex["name"] {
  if (kind === "primary-key") {
    const config = root.getArguments()[0];
    const nameNode = config === undefined ? null : effectiveObjectProperty(config, "name", "primary key config");
    return nameNode === null ? { kind: "unnamed" } : { kind: "named", value: staticString(nameNode, "primary key name") };
  }
  const node = root.getArguments()[0];
  return node === undefined ? refuse(unresolved("missing", root, `${kind} has no name`)) : { kind: "named", value: staticString(node, `${kind} name`) };
}

interface IndexTermInput {
  readonly root: CallExpression;
  readonly operations: ReadonlyMap<string, readonly CallExpression[]>;
  readonly kind: SchemaIndex["kind"];
  readonly parameter: MorphNode | null;
  readonly table: SchemaTableIdentity;
  readonly columns: ReadonlyMap<string, SchemaColumnIdentity>;
}

function indexTerms(input: IndexTermInput): SchemaIndex["terms"] {
  let nodes: readonly MorphNode[];
  if (input.kind === "primary-key") {
    const config = input.root.getArguments()[0];
    const value = config === undefined ? null : effectiveObjectProperty(config, "columns", "primary key config");
    if (value === null) {
      return refuse(unresolved("missing", input.root, "primary key config has no columns"));
    }
    nodes = arrayElements(value, "primary key columns");
  } else {
    const onCalls = input.operations.get("on") ?? [];
    const on = onCalls[0];
    if (on === undefined || onCalls.length !== 1) {
      return refuse(unresolved("missing", input.root, `${input.kind} must have exactly one on(...) operation`));
    }
    nodes = on.getArguments();
  }
  return nodes.map((node) => {
    const column = callbackColumn(node, input.parameter, input.table, input.columns);
    return column === null ? { kind: "expression" as const, node } : { kind: "column" as const, column };
  });
}

export function indexesOf(table: TableDraft): readonly SchemaIndex[] {
  if (table.extra === null) {
    return [];
  }
  const callback = resolveStableExpression(table.extra);
  if (callback.kind === "unresolved") {
    return refuse({ ...callback, detail: `${table.identity.key} extras callback: ${callback.detail}` });
  }
  const functionNode = callback.value;
  if (!(Node.isArrowFunction(functionNode) || Node.isFunctionExpression(functionNode))) {
    return refuse(unresolved("unsupported", functionNode, `${table.identity.key} extras is not an authored callback`));
  }
  const parameters = functionNode.getParameters();
  const name = parameters[0]?.getNameNode();
  const parameter = name !== undefined && Node.isIdentifier(name) ? name : null;
  if (parameters.length > 1 || (parameters.length === 1 && parameter === null)) {
    return refuse(unresolved("unsupported", functionNode, `${table.identity.key} extras must have zero parameters or one identifier table parameter`));
  }
  const columns = new Map(table.columns.map((column) => [column.identity.propertyName, column.identity]));
  const indexes: SchemaIndex[] = [];
  for (const element of arrayElements(returnedExpression(functionNode, `${table.identity.key} extras`), `${table.identity.key} extras return`)) {
    const chain = operationChain(element);
    const builder = exactDrizzleExport(chain.root);
    if (builder.kind === "unresolved") {
      return refuse({ ...builder, detail: `${table.identity.key} extra: ${builder.detail}` });
    }
    const kind = schemaIndexKind(builder.value.exportedName);
    if (kind === null) {
      continue;
    }
    const terms = indexTerms({ root: chain.root, operations: chain.operations, kind, parameter, table: table.identity, columns });
    indexes.push({
      kind,
      name: indexName(chain.root, kind),
      terms,
      columns: terms.flatMap((term) => (term.kind === "column" ? [term.column] : [])),
      call: chain.root,
    });
  }
  return indexes;
}
