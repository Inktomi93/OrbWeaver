// Drizzle table/column authored-value extraction for the invocation-scoped schema query.
import type { CallExpression, Node as MorphNode, Type, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type {
  ModuleMemberOrigin,
  ReferenceFact,
  ReferenceUnresolvedReason,
  ResolvedReferenceFact,
  UnresolvedReferenceFact,
} from "../contract/reference-fact.ts";
import type { SchemaColumn, SchemaColumnIdentity, SchemaJsonShape, SchemaQueryOptions, SchemaTable, SchemaTableIdentity } from "../contract/schema-fact.ts";
import { canonicalIdBrand } from "./id-brand.ts";
import { inspectReferenceWrites, readMemberReference, resolveModuleMemberOrigin, resolveStableExpression } from "./reference-fact.ts";
import { resolveCallableOrigin } from "./reference-fact-call.ts";
import { invokedMemberThroughAliases } from "./reference-fact-writes.ts";
import { readStaticAuthoredScalar } from "./static-authored-value.ts";

export const DRIZZLE_SQLITE = "drizzle-orm/sqlite-core";
export const SQLITE_TABLE = "sqliteTable";

export interface ColumnDraft extends Omit<SchemaColumn, "foreignKey"> {
  readonly operations: ReadonlyMap<string, readonly CallExpression[]>;
}

export interface TableDraft extends Omit<SchemaTable, "columns" | "indexes"> {
  readonly columns: readonly ColumnDraft[];
  readonly extra: MorphNode | null;
}

export class SchemaRefusal extends Error {
  readonly fact: UnresolvedReferenceFact;

  constructor(fact: UnresolvedReferenceFact) {
    super(fact.detail);
    this.fact = fact;
  }
}

export function unresolved(
  reason: ReferenceUnresolvedReason,
  node: MorphNode,
  detail: string,
  declarations: readonly MorphNode[] = [],
): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations, origin: node } };
}

export function resolved<T>(value: T, node: MorphNode, declarations: readonly MorphNode[] = []): ResolvedReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations, origin: node } };
}

export function refuse(fact: UnresolvedReferenceFact): never {
  throw new SchemaRefusal(fact);
}

export function exactDrizzleExport(
  call: CallExpression,
  exportedName?: string,
): ReferenceFact<{ readonly moduleSpecifier: string; readonly exportedName: string }> {
  const origin = resolveCallableOrigin(call);
  if (origin.kind === "unresolved") {
    return origin;
  }
  const target = origin.value.target;
  if (target.kind !== "module") {
    return unresolved("missing", call, `${call.getExpression().getText()} is not imported from the Drizzle SQLite module`, origin.trace.declarations);
  }
  return resolvedDrizzleTarget(call, target, exportedName, origin.trace.declarations);
}

function customTypeFactory(target: ModuleMemberOrigin): CallExpression | null {
  const canonical = target.canonical;
  if (canonical.kind !== "project" || !Node.isVariableDeclaration(canonical.declaration)) {
    return null;
  }
  const initializer = canonical.declaration.getInitializer();
  const factory = initializer === undefined ? null : terminalCall(initializer);
  return factory?.kind === "resolved" ? factory.value : null;
}

function resolvedDrizzleTarget(
  call: CallExpression,
  target: ModuleMemberOrigin,
  exportedName: string | undefined,
  declarations: readonly MorphNode[],
): ReferenceFact<{ readonly moduleSpecifier: string; readonly exportedName: string }> {
  const factory = customTypeFactory(target);
  if (factory !== null) {
    const custom = exactDrizzleExport(factory, "customType");
    if (custom.kind === "resolved" && (exportedName === undefined || exportedName === custom.value.exportedName)) {
      return custom;
    }
  }
  const canonical = target.canonical;
  const moduleSpecifier = canonical.kind === "external-door" ? canonical.moduleSpecifier : target.moduleSpecifier;
  const name = canonical.exportedName;
  if (moduleSpecifier !== DRIZZLE_SQLITE || (exportedName !== undefined && name !== exportedName)) {
    return unresolved("missing", call, `${call.getExpression().getText()} is not Drizzle ${exportedName ?? "SQLite"}`, declarations);
  }
  return resolved({ moduleSpecifier, exportedName: name }, call, declarations);
}

export function terminalCall(node: MorphNode): ReferenceFact<CallExpression> {
  const fact = resolveStableExpression(node);
  if (fact.kind === "resolved") {
    return Node.isCallExpression(fact.value)
      ? resolved(fact.value, fact.trace.origin, fact.trace.declarations)
      : unresolved("unsupported", fact.value, `${fact.value.getKindName()} is not a Drizzle builder call`, fact.trace.declarations);
  }
  if (fact.reason === "dynamic" && Node.isCallExpression(fact.node)) {
    return resolved(fact.node, fact.node, fact.trace.declarations);
  }
  const origin = resolveModuleMemberOrigin(node);
  const declaration = origin.kind === "resolved" && origin.value.canonical.kind === "project" ? origin.value.canonical.declaration : undefined;
  const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  return initializer === undefined ? fact : terminalCall(initializer);
}

export function operationChain(expression: MorphNode): {
  readonly root: CallExpression;
  readonly operations: ReadonlyMap<string, readonly CallExpression[]>;
} {
  const terminal = terminalCall(expression);
  if (terminal.kind === "unresolved") {
    return refuse(terminal);
  }
  let call = terminal.value;
  const operations = new Map<string, CallExpression[]>();
  for (;;) {
    if (exactDrizzleExport(call).kind === "resolved") {
      break;
    }
    const member = readMemberReference(call.getExpression());
    if (member.kind === "unresolved") {
      return refuse({ ...member, detail: `Drizzle builder root ${call.getExpression().getText()} is unresolved: ${member.detail}` });
    }
    const receiver = terminalCall(member.value.receiver);
    if (receiver.kind === "unresolved") {
      return refuse(receiver);
    }
    operations.set(member.value.name, [...(operations.get(member.value.name) ?? []), call]);
    call = receiver.value;
  }
  return { root: call, operations };
}

export function staticString(node: MorphNode, subject: string): string {
  const fact = readStaticAuthoredScalar(node);
  if (fact.kind === "unresolved") {
    return refuse({ ...fact, detail: `${subject}: ${fact.detail}` });
  }
  return typeof fact.value === "string"
    ? fact.value
    : refuse(unresolved("unsupported", fact.trace.origin, `${subject}: authored scalar is not a string`, fact.trace.declarations));
}

function importedObjectLiteral(node: MorphNode, subject: string): import("ts-morph").ObjectLiteralExpression | null {
  const origin = resolveModuleMemberOrigin(node);
  const declaration = origin.kind === "resolved" && origin.value.canonical.kind === "project" ? origin.value.canonical.declaration : undefined;
  const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  return initializer === undefined ? null : objectLiteral(initializer, subject);
}

function bindingIdentifier(declaration: MorphNode): import("ts-morph").Identifier | null {
  let name: MorphNode | undefined;
  if (Node.isVariableDeclaration(declaration) || Node.isBindingElement(declaration) || Node.isNamespaceImport(declaration)) {
    name = declaration.getNameNode();
  } else if (Node.isImportSpecifier(declaration)) {
    name = declaration.getAliasNode() ?? declaration.getNameNode();
  } else if (Node.isImportClause(declaration)) {
    name = declaration.getDefaultImport();
  }
  return name !== undefined && Node.isIdentifier(name) ? name : null;
}

export function guardCompositeBindings(composite: MorphNode, declarations: readonly MorphNode[], subject: string): void {
  const owner = composite.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const bindings = [...declarations, ...(owner === undefined ? [] : [owner])].map(bindingIdentifier).filter((identifier) => identifier !== null);
  const invoked = new Map<object, ReadonlyMap<object, MorphNode>>();
  for (const binding of bindings) {
    const writes = inspectReferenceWrites(binding);
    if (writes.kind === "unresolved" && writes.reason === "write") {
      refuse({ ...writes, detail: `${subject}: ${writes.detail}` });
    }
    const call = invokedMemberThroughAliases(binding, invoked);
    if (call !== undefined) {
      refuse(unresolved("dynamic", call, `${subject}: an invoked member can change the authored composite`));
    }
  }
}

function objectLiteral(node: MorphNode, subject: string): import("ts-morph").ObjectLiteralExpression {
  const terminal = resolveStableExpression(node);
  if (terminal.kind === "resolved" && Node.isObjectLiteralExpression(terminal.value)) {
    guardCompositeBindings(terminal.value, terminal.trace.declarations, subject);
    return terminal.value;
  }
  const imported = importedObjectLiteral(node, subject);
  if (imported !== null) {
    return imported;
  }
  if (terminal.kind === "unresolved") {
    return refuse({ ...terminal, detail: `${subject}: ${terminal.detail}` });
  }
  return refuse(unresolved("unsupported", terminal.value, `${subject} is not an authored object`, terminal.trace.declarations));
}

function propertyName(node: MorphNode): string {
  if (Node.isIdentifier(node) || Node.isPrivateIdentifier(node)) {
    return node.getText();
  }
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  if (Node.isNumericLiteral(node)) {
    return String(node.getLiteralValue());
  }
  return Node.isComputedPropertyName(node)
    ? staticString(node.getExpression(), "computed schema member")
    : refuse(unresolved("unsupported", node, `${node.getKindName()} is not a static schema member name`));
}

export function objectEntries(
  node: MorphNode,
  subject: string,
  active = new Set<object>(),
): readonly { readonly name: string; readonly node: MorphNode; readonly value: MorphNode }[] {
  const object = objectLiteral(node, subject);
  if (active.has(object.compilerNode)) {
    return refuse(unresolved("cycle", object, `${subject} contains an object-spread cycle`));
  }
  active.add(object.compilerNode);
  const entries: { name: string; node: MorphNode; value: MorphNode }[] = [];
  for (const property of object.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      entries.push(...objectEntries(property.getExpression(), subject, active));
    } else if (Node.isPropertyAssignment(property)) {
      const value = property.getInitializer();
      if (value === undefined) {
        return refuse(unresolved("missing", property, `${subject} property has no initializer`));
      }
      entries.push({ name: propertyName(property.getNameNode()), node: property, value });
    } else if (Node.isShorthandPropertyAssignment(property)) {
      entries.push({ name: property.getName(), node: property, value: property.getNameNode() });
    } else {
      return refuse(unresolved("unsupported", property, `${subject} contains unsupported ${property.getKindName()}`));
    }
  }
  active.delete(object.compilerNode);
  return entries;
}

export function effectiveObjectProperty(node: MorphNode, key: string, subject: string): MorphNode | null {
  return objectEntries(node, subject).findLast((entry) => entry.name === key)?.value ?? null;
}

function isNoKeyType(type: Type): boolean {
  return type.isString() || type.isNumber() || type.isBoolean() || type.isLiteral() || type.isArray() || type.isTuple() || type.isNull() || type.isUndefined();
}

function isOpenType(type: Type): boolean {
  const name = type.getAliasSymbol()?.getName() ?? type.getSymbol()?.getName();
  return type.isAny() || type.isUnknown() || name === "JsonValue" || type.getStringIndexType() !== undefined;
}

function jsonShape(typeNode: MorphNode, options: SchemaQueryOptions): SchemaJsonShape {
  const type = options.checker().getTypeAtLocation(typeNode);
  const arms = type.isUnion() ? type.getUnionTypes() : [type];
  if (arms.some(isOpenType)) {
    return { kind: "open", typeNode };
  }
  const keyed = arms.filter((arm) => !isNoKeyType(arm));
  if (keyed.length === 0) {
    return { kind: "scalar", typeNode };
  }
  return { kind: "closed", keys: [...new Set(keyed.flatMap((arm) => arm.getProperties().map((property) => property.getName())))].toSorted(), typeNode };
}

function jsonColumn(root: CallExpression, operations: ReadonlyMap<string, readonly CallExpression[]>, options: SchemaQueryOptions): SchemaColumn["json"] {
  const config = root.getArguments()[1];
  if (config === undefined) {
    return null;
  }
  const mode = effectiveObjectProperty(config, "mode", "Drizzle column config");
  if (mode === null || staticString(mode, "Drizzle column mode") !== "json") {
    return null;
  }
  const typeCalls = operations.get("$type") ?? [];
  const typeCall = typeCalls.at(-1);
  if (typeCall === undefined) {
    return { mode: "json", shape: { kind: "open", typeNode: null } };
  }
  const typeNode = typeCall.getTypeArguments()[0];
  if (typeNode === undefined || typeCalls.length !== 1) {
    return refuse(unresolved("ambiguous", typeCall, "JSON column must carry exactly one $type<T>() operation and one type argument"));
  }
  return { mode: "json", shape: jsonShape(typeNode, options) };
}

function columnTypeOverride(operations: ReadonlyMap<string, readonly CallExpression[]>, options: SchemaQueryOptions): SchemaColumn["typeOverride"] {
  const calls = operations.get("$type") ?? [];
  if (calls.length === 0) {
    return null;
  }
  const call = calls[0];
  if (call === undefined) {
    return null;
  }
  const node = call.getTypeArguments()[0];
  if (node === undefined || calls.length !== 1 || call.getTypeArguments().length !== 1) {
    return refuse(unresolved("ambiguous", call, "Drizzle column must carry at most one $type<T>() operation with exactly one type argument"));
  }
  const type = options.checker().getTypeAtLocation(node);
  const idBrand = canonicalIdBrand(type, node, options.checker());
  return { node, type, display: type.getText(node), idBrand };
}

function columnDraft(
  entry: { readonly name: string; readonly node: MorphNode; readonly value: MorphNode },
  table: SchemaTableIdentity,
  options: SchemaQueryOptions,
): ColumnDraft {
  const chain = operationChain(entry.value);
  const builder = exactDrizzleExport(chain.root);
  if (builder.kind === "unresolved") {
    return refuse({ ...builder, detail: `schema column ${table.key}.${entry.name}: ${builder.detail}` });
  }
  const sqlArg = chain.root.getArguments()[0];
  if (sqlArg === undefined) {
    return refuse(unresolved("missing", chain.root, `schema column ${table.key}.${entry.name} has no SQL name`));
  }
  const identity: SchemaColumnIdentity = { table, propertyName: entry.name, key: `${table.key}.${entry.name}` };
  return {
    identity,
    declaration: entry.node,
    expression: entry.value,
    sqlName: staticString(sqlArg, `schema column ${identity.key} SQL name`),
    builder: { ...builder.value, call: chain.root },
    typeOverride: columnTypeOverride(chain.operations, options),
    primaryKey: chain.operations.has("primaryKey"),
    unique: chain.operations.has("unique"),
    notNull: chain.operations.has("notNull"),
    json: jsonColumn(chain.root, chain.operations, options),
    operations: chain.operations,
  };
}

function effectiveColumnEntries(entries: ReturnType<typeof objectEntries>): ReturnType<typeof objectEntries> {
  const effective = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    effective.set(entry.name, entry);
  }
  return [...effective.values()];
}

export function tableDraft(declaration: VariableDeclaration, call: CallExpression, options: SchemaQueryOptions): TableDraft {
  const path = options.relativePath(declaration.getSourceFile());
  const identity: SchemaTableIdentity = { sourcePath: path, declarationName: declaration.getName(), key: `${path}#${declaration.getName()}` };
  const nameArg = call.getArguments()[0];
  const columnsArg = call.getArguments()[1];
  if (nameArg === undefined || columnsArg === undefined) {
    return refuse(unresolved("missing", call, `Drizzle table ${identity.key} is missing its SQL name or columns object`));
  }
  return {
    identity,
    declaration,
    call,
    sqlName: staticString(nameArg, `Drizzle table ${identity.key} SQL name`),
    columns: effectiveColumnEntries(objectEntries(columnsArg, `Drizzle table ${identity.key} columns`)).map((entry) => columnDraft(entry, identity, options)),
    extra: call.getArguments()[2] ?? null,
  };
}

/** Derive the repository root from effective source identities without exposing it through policy context. */
export function canonicalPathResolver(options: SchemaQueryOptions): (sourceFile: import("ts-morph").SourceFile) => string {
  const roots = options.files.map((sourceFile) => {
    const absolute = sourceFile.getFilePath().replaceAll("\\", "/");
    const relative = options.relativePath(sourceFile);
    if (!absolute.endsWith(`/${relative}`)) {
      throw new Error(`schema source path does not end with its repository identity: ${absolute}`);
    }
    return absolute.slice(0, -relative.length);
  });
  const root = roots[0] ?? "";
  if (roots.some((candidate) => candidate !== root)) {
    throw new Error("schema source population spans multiple repository roots");
  }
  return (sourceFile) => {
    const absolute = sourceFile.getFilePath().replaceAll("\\", "/");
    if (root.length === 0 || !absolute.startsWith(root)) {
      throw new Error(`resolved schema reference is outside the invocation repository: ${absolute}`);
    }
    return absolute.slice(root.length);
  };
}

export function schemaIndexKind(exportedName: string): import("../contract/schema-fact.ts").SchemaIndex["kind"] | null {
  if (exportedName === "index") {
    return "index";
  }
  if (exportedName === "uniqueIndex") {
    return "unique-index";
  }
  if (exportedName === "primaryKey") {
    return "primary-key";
  }
  return null;
}

export function schemaDeclarationKey(node: MorphNode): string {
  return `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}`;
}

export function unwrapSchemaExpression(node: MorphNode): MorphNode {
  let current = node;
  while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isNonNullExpression(current)) {
    current = current.getExpression();
  }
  return current;
}
