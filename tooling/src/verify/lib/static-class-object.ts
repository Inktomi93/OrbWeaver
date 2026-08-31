// Static object provenance shared by class-member access, join maps, and variant configurations.
// Object KEYS become classes only in join semantics; ordinary member access evaluates selected VALUES.
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import type { StaticValue } from "./static-class-expression-model.ts";
import { dedupeValues, exportedDeclarations, importedSource, literalValue, localDeclarations, unwrap } from "./static-class-expression-model.ts";

export interface CollectionHost {
  readonly project: Project;
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
  for (const declaration of host.identifierDeclarations(node)) {
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
  const source = importedSource(host.project, target.from, target.moduleName);
  return source === undefined
    ? []
    : exportedDeclarations(host.project, source, target.imported).flatMap((declaration) => resolveDeclarationObjects(host, declaration, path));
}

export function evalObjectMember(host: CollectionHost, raw: Node, names: readonly string[] | undefined, path: Set<Node>): StaticValue[] {
  const objects = resolveObjects(host, raw, new Set(path));
  if (objects.length === 0) {
    host.diagnose("opaque", raw, names === undefined ? "runtime object under dynamic class index" : "runtime object under class member access");
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
      return selectedProperties(host, object, names, path);
    } finally {
      path.delete(object);
    }
  });
}

function selectedProperties(
  host: CollectionHost,
  object: import("ts-morph").ObjectLiteralExpression,
  names: ReadonlySet<string>,
  path: Set<Node>,
): ResolvedObjectProperty[] {
  const selected = new Map<string, ResolvedObjectProperty>();
  for (const member of object.getProperties()) {
    if (Node.isSpreadAssignment(member)) {
      for (const property of findObjectProperties(host, member.getExpression(), names, path)) {
        selected.set(property.name, property);
      }
      continue;
    }
    const property = selectedProperty(host, member, names, path);
    if (property !== undefined) {
      selected.set(property.name, property);
    }
  }
  return [...selected.values()];
}

function selectedProperty(host: CollectionHost, member: Node, names: ReadonlySet<string>, path: Set<Node>): ResolvedObjectProperty | undefined {
  if (Node.isShorthandPropertyAssignment(member)) {
    const name = member.getName();
    return names.has(name) ? { name, node: member, value: member.getNameNode() } : undefined;
  }
  if (!Node.isPropertyAssignment(member)) {
    return;
  }
  const name = propertyName(host, member.getNameNode(), path);
  if (name === undefined) {
    host.diagnose("unresolved", member.getNameNode(), "computed selected-property key is unresolved");
    return;
  }
  const initializer = member.getInitializer();
  return names.has(name) && initializer !== undefined ? { name, node: member, value: initializer } : undefined;
}
