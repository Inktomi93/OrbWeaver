// Static object provenance shared by class-member access, join maps, and variant configurations.
// Object KEYS become classes only in join semantics; ordinary member access evaluates selected VALUES.
import { Node } from "ts-morph";
import type { StaticClassSourceIndex, StaticValue } from "./static-class-expression-model.ts";
import { dedupeValues, exportedDeclarations, importedSource, literalValue, localDeclarations, unwrap } from "./static-class-expression-model.ts";

export interface CollectionHost {
  readonly sourceIndex: StaticClassSourceIndex;
  diagnose: (kind: "unresolved" | "opaque", node: Node, reason: string) => void;
  evalClass: (node: Node, path: Set<Node>) => StaticValue[];
  evalIdentifier: (node: import("ts-morph").Identifier, path: Set<Node>) => StaticValue[];
  identifierDeclarations: (node: import("ts-morph").Identifier) => Node[];
}

interface ImportedObjectTarget {
  readonly from: import("ts-morph").SourceFile;
  readonly moduleName: string;
  readonly imported: string;
}

export function staticScalars(host: CollectionHost, raw: Node, path: Set<Node>): string[] {
  const node = unwrap(raw);
  const literal = literalValue(node);
  if (literal !== undefined) {
    return [literal.value];
  }
  if (Node.isConditionalExpression(node)) {
    return [...new Set([...staticScalars(host, node.getWhenTrue(), path), ...staticScalars(host, node.getWhenFalse(), path)])];
  }
  return Node.isIdentifier(node) ? identifierScalars(host, node, path) : [];
}

function identifierScalars(host: CollectionHost, node: import("ts-morph").Identifier, path: Set<Node>): string[] {
  if (path.has(node)) {
    return [];
  }
  path.add(node);
  const values: string[] = [];
  const symbol = node.getSymbol();
  const declarations = [...host.identifierDeclarations(node), ...(symbol?.getAliasedSymbol()?.getDeclarations() ?? [])];
  for (const declaration of new Set(declarations)) {
    if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer();
      if (initializer !== undefined) {
        values.push(...staticScalars(host, initializer, path));
      }
    }
  }
  path.delete(node);
  return [...new Set(values)];
}

export function propertyName(host: CollectionHost, node: Node, path: Set<Node>): string | undefined {
  const literal = literalValue(node);
  if (literal !== undefined) {
    return literal.value;
  }
  if (Node.isIdentifier(node) || Node.isNumericLiteral(node)) {
    return node.getText();
  }
  if (Node.isComputedPropertyName(node)) {
    const values = staticScalars(host, node.getExpression(), new Set(path));
    return values.length === 1 ? values[0] : undefined;
  }
  return void 0;
}

export function resolveObjects(host: CollectionHost, raw: Node, path: Set<Node>): import("ts-morph").ObjectLiteralExpression[] {
  const node = unwrap(raw);
  if (path.has(node)) {
    host.diagnose("unresolved", node, "static object-expression cycle");
    return [];
  }
  path.add(node);
  try {
    if (Node.isObjectLiteralExpression(node)) {
      return [node];
    }
    if (Node.isIdentifier(node)) {
      return resolveIdentifierObjects(host, node, path);
    }
    if (Node.isConditionalExpression(node)) {
      return [...resolveObjects(host, node.getWhenTrue(), path), ...resolveObjects(host, node.getWhenFalse(), path)];
    }
    return [];
  } finally {
    path.delete(node);
  }
}

function resolveIdentifierObjects(host: CollectionHost, node: import("ts-morph").Identifier, path: Set<Node>): import("ts-morph").ObjectLiteralExpression[] {
  const resolved = host.identifierDeclarations(node).flatMap((declaration) => resolveDeclarationObjects(host, declaration, path));
  return [...new Set(resolved)];
}

function resolveDeclarationObjects(host: CollectionHost, declaration: Node, path: Set<Node>): import("ts-morph").ObjectLiteralExpression[] {
  if (Node.isVariableDeclaration(declaration) || Node.isPropertyAssignment(declaration)) {
    const initializer = declaration.getInitializer();
    return initializer === undefined ? [] : resolveObjects(host, initializer, path);
  }
  if (Node.isImportSpecifier(declaration)) {
    return resolveImportedObjects(
      host,
      {
        from: declaration.getSourceFile(),
        moduleName: declaration.getImportDeclaration().getModuleSpecifierValue(),
        imported: declaration.getNameNode().getText(),
      },
      path,
    );
  }
  return resolveExportedObjects(host, declaration, path);
}

function resolveExportedObjects(host: CollectionHost, declaration: Node, path: Set<Node>): import("ts-morph").ObjectLiteralExpression[] {
  if (Node.isExportSpecifier(declaration)) {
    const moduleName = declaration.getExportDeclaration().getModuleSpecifierValue();
    if (moduleName === undefined) {
      return localDeclarations(declaration.getSourceFile(), declaration.getNameNode().getText())
        .filter((target) => target !== declaration)
        .flatMap((target) => resolveDeclarationObjects(host, target, path));
    }
    return resolveImportedObjects(host, { from: declaration.getSourceFile(), moduleName, imported: declaration.getNameNode().getText() }, path);
  }
  if (Node.isExportAssignment(declaration)) {
    return resolveObjects(host, declaration.getExpression(), path);
  }
  if (declaration.getKindName() === "ImportClause") {
    const importDeclaration = declaration.getFirstAncestor(Node.isImportDeclaration);
    return importDeclaration === undefined
      ? []
      : resolveImportedObjects(host, { from: declaration.getSourceFile(), moduleName: importDeclaration.getModuleSpecifierValue(), imported: "default" }, path);
  }
  return [];
}

function resolveImportedObjects(host: CollectionHost, target: ImportedObjectTarget, path: Set<Node>): import("ts-morph").ObjectLiteralExpression[] {
  const source = importedSource(host.sourceIndex, target.from, target.moduleName);
  return source === undefined
    ? []
    : exportedDeclarations(host.sourceIndex, source, target.imported).flatMap((declaration) => resolveDeclarationObjects(host, declaration, path));
}

export function evalObjectMember(host: CollectionHost, raw: Node, names: readonly string[] | undefined, path: Set<Node>): StaticValue[] {
  if (names !== undefined) {
    const properties = findObjectProperties(host, raw, new Set(names), path);
    if (properties.length === 0) {
      host.diagnose("opaque", raw, `static class member ${names.join("|")} is absent`);
    }
    return dedupeValues(properties.flatMap((property) => host.evalClass(property.value, path)));
  }
  const objects = resolveObjects(host, raw, new Set(path));
  if (objects.length === 0) {
    host.diagnose("opaque", raw, "runtime object under dynamic class index");
    return [];
  }
  return dedupeValues(objects.flatMap((object) => objectMemberValues(host, object, names, path)));
}

function objectMemberValues(
  host: CollectionHost,
  object: import("ts-morph").ObjectLiteralExpression,
  names: readonly string[] | undefined,
  path: Set<Node>,
): StaticValue[] {
  const values: StaticValue[] = [];
  let found = false;
  for (const member of object.getProperties()) {
    if (Node.isSpreadAssignment(member)) {
      values.push(...resolveObjects(host, member.getExpression(), new Set(path)).flatMap((spread) => objectMemberValues(host, spread, names, path)));
      continue;
    }
    const read = readObjectMember(host, member, names, path);
    found ||= read.matched;
    values.push(...read.values);
  }
  if (!found && names !== undefined) {
    host.diagnose("opaque", object, `static class member ${names.join("|")} is absent`);
  }
  return values;
}

function readObjectMember(
  host: CollectionHost,
  member: Node,
  names: readonly string[] | undefined,
  path: Set<Node>,
): { readonly matched: boolean; readonly values: readonly StaticValue[] } {
  if (Node.isPropertyAssignment(member)) {
    const name = propertyName(host, member.getNameNode(), path);
    if (name === undefined) {
      host.diagnose("unresolved", member.getNameNode(), "computed static object key is unresolved");
      return { matched: false, values: [] };
    }
    const initializer = member.getInitializer();
    const matched = names === undefined || names.includes(name);
    return { matched, values: matched && initializer !== undefined ? host.evalClass(initializer, path) : [] };
  }
  if (Node.isShorthandPropertyAssignment(member)) {
    const matched = names === undefined || names.includes(member.getName());
    return { matched, values: matched ? host.evalIdentifier(member.getNameNode(), path) : [] };
  }
  return { matched: false, values: [] };
}

export interface ResolvedObjectProperty {
  readonly name: string;
  readonly node: Node;
  readonly value: Node;
}

interface SelectedPropertyDiagnostic {
  readonly kind: "opaque" | "unresolved";
  readonly node: Node;
  readonly reason: string;
}

type SelectedPropertySlot = { readonly property: ResolvedObjectProperty } | { readonly diagnostic: SelectedPropertyDiagnostic };
type SelectedPropertyState = Map<string, SelectedPropertySlot>;

interface SelectedPropertyContext {
  readonly host: CollectionHost;
  readonly names: ReadonlySet<string>;
  readonly path: Set<Node>;
}

/** Resolve selected object properties in runtime overwrite order; later direct/spread writes win. */
export function findObjectProperties(host: CollectionHost, raw: Node, names: ReadonlySet<string>, path: Set<Node>): ResolvedObjectProperty[] {
  const objects = resolveObjects(host, raw, new Set(path));
  if (objects.length === 0) {
    host.diagnose("opaque", raw, "runtime object under selected-property carrier");
    return [];
  }
  return objects.flatMap((object) => {
    if (path.has(object)) {
      host.diagnose("unresolved", object, "static selected-property cycle");
      return [];
    }
    path.add(object);
    try {
      const properties = new Map<string, ResolvedObjectProperty>();
      for (const state of selectedPropertyStates({ host, names, path }, object, new Map())) {
        for (const [name, slot] of state) {
          if ("property" in slot) {
            const property = slot.property;
            properties.set(`${name}:${property.node.getSourceFile().getFilePath()}:${property.node.getStart()}`, property);
          } else {
            host.diagnose(slot.diagnostic.kind, slot.diagnostic.node, slot.diagnostic.reason);
          }
        }
      }
      return [...properties.values()];
    } finally {
      path.delete(object);
    }
  });
}

function selectedPropertyStates(
  context: SelectedPropertyContext,
  object: import("ts-morph").ObjectLiteralExpression,
  initial: SelectedPropertyState,
): SelectedPropertyState[] {
  let states: SelectedPropertyState[] = [new Map(initial)];
  for (const member of object.getProperties()) {
    states = applySelectedPropertyMember(context, member, states);
  }
  return states;
}

function applySelectedPropertyMember(context: SelectedPropertyContext, member: Node, states: SelectedPropertyState[]): SelectedPropertyState[] {
  if (Node.isSpreadAssignment(member)) {
    return applySelectedPropertySpread(context, member, states);
  }
  if (Node.isShorthandPropertyAssignment(member)) {
    const name = member.getName();
    if (context.names.has(name)) {
      overwriteWithProperty(states, { name, node: member, value: member.getNameNode() });
    }
    return states;
  }
  if (!Node.isPropertyAssignment(member)) {
    return states;
  }
  const name = propertyName(context.host, member.getNameNode(), context.path);
  if (name === undefined) {
    overwriteWithDiagnostic(states, context.names, { kind: "unresolved", node: member.getNameNode(), reason: "computed selected-property key is unresolved" });
    return states;
  }
  const initializer = member.getInitializer();
  if (context.names.has(name) && initializer !== undefined) {
    overwriteWithProperty(states, { name, node: member, value: initializer });
  }
  return states;
}

function applySelectedPropertySpread(
  context: SelectedPropertyContext,
  member: import("ts-morph").SpreadAssignment,
  states: readonly SelectedPropertyState[],
): SelectedPropertyState[] {
  const spreads = resolveObjects(context.host, member.getExpression(), new Set(context.path));
  if (spreads.length === 0) {
    overwriteWithDiagnostic(states, context.names, { kind: "opaque", node: member, reason: "runtime object spread under selected-property carrier" });
    return [...states];
  }
  return states.flatMap((state) => spreads.flatMap((spread) => selectedSpreadStates(context, spread, state)));
}

function selectedSpreadStates(
  context: SelectedPropertyContext,
  spread: import("ts-morph").ObjectLiteralExpression,
  state: SelectedPropertyState,
): SelectedPropertyState[] {
  if (context.path.has(spread)) {
    const cycle = new Map(state);
    overwriteWithDiagnostic([cycle], context.names, { kind: "unresolved", node: spread, reason: "static selected-property cycle" });
    return [cycle];
  }
  context.path.add(spread);
  try {
    return selectedPropertyStates(context, spread, state);
  } finally {
    context.path.delete(spread);
  }
}

function overwriteWithProperty(states: readonly SelectedPropertyState[], property: ResolvedObjectProperty): void {
  for (const state of states) {
    state.set(property.name, { property });
  }
}

function overwriteWithDiagnostic(states: readonly SelectedPropertyState[], names: ReadonlySet<string>, diagnostic: SelectedPropertyDiagnostic): void {
  for (const state of states) {
    for (const name of names) {
      state.set(name, { diagnostic });
    }
  }
}
