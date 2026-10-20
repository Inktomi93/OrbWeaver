// Declaration-granular consumption edges: which top-level declaration holds each consuming reference.
// Attribution is by name inside a file, so a shadow or a matching property tail adds an edge; extra edges only err alive.
import type { BindingElement, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ImportConsumption } from "./liveness-contract.ts";
import { INVENTORY_KEY_SEPARATOR } from "./semantic-inventory-contract.ts";
import { inventoryDeclarationKey } from "./semantic-inventory-reader.ts";

// A declaration key ends in a decimal offset, so this sentinel cannot collide with one.
const MODULE_SCOPE_MARK = "module";

/** The module-scope consumer key of a file, for a consumer no declaration of that file owns. */
export function moduleScopeKeyOf(filePath: string): string {
  return `${filePath}${INVENTORY_KEY_SEPARATOR}${MODULE_SCOPE_MARK}`;
}

/** A module-scope consumer is a side-effect position no declaration owns, so nothing can make it dead. */
export function isModuleScopeKey(key: string): boolean {
  return key.endsWith(`${INVENTORY_KEY_SEPARATOR}${MODULE_SCOPE_MARK}`);
}

/** The file half of a declaration key or of the module-scope sentinel. */
export function fileOfKey(key: string): string {
  const cut = key.lastIndexOf(INVENTORY_KEY_SEPARATOR);
  return cut < 0 ? key : key.slice(0, cut);
}

// Import and export declarations only move a name. `export default local` is the same declaration as `local`, but
// `export default { value: helper() }` consumes `helper`, so a non-identifier default stays a module-scope use.
function isBindingHopStatement(statement: MorphNode): boolean {
  if (Node.isExportAssignment(statement)) {
    return Node.isIdentifier(statement.getExpression());
  }
  return Node.isImportDeclaration(statement) || Node.isExportDeclaration(statement);
}

// A destructured export keys on the BindingElement `getExportedDeclarations()` returns, never on the declarator,
// whose name is the pattern text; keying the declarator would fork identity like a bare name does.
function boundElementsOf(declaration: MorphNode): BindingElement[] {
  if (!Node.isVariableDeclaration(declaration) || Node.isIdentifier(declaration.getNameNode())) {
    return [];
  }
  return declaration.getDescendantsOfKind(SyntaxKind.BindingElement).filter((element) => Node.isIdentifier(element.getNameNode()));
}

// An anonymous `export default function` or class declares no name and stays a module-scope position.
function declaredStatementName(statement: MorphNode): string | undefined {
  if (Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement)) {
    return statement.getName();
  }
  return Node.isEnumDeclaration(statement) || Node.isInterfaceDeclaration(statement) || Node.isTypeAliasDeclaration(statement)
    ? statement.getName()
    : undefined;
}

// The declarator is chosen by position, so `const a = 1, b = usesX()` attributes to `b`; a destructuring declarator
// attributes to every bound name, because any one of them keeps its initializer alive.
function topLevelDeclarationKeys(statement: MorphNode, at: MorphNode): string[] {
  if (Node.isVariableStatement(statement)) {
    const position = at.getStart();
    const declarations = statement.getDeclarations();
    const hit = declarations.find((declaration) => declaration.getStart() <= position && position < declaration.getEnd()) ?? declarations[0];
    if (hit === undefined) {
      return [];
    }
    const bound = boundElementsOf(hit);
    return bound.length > 0 ? bound.map(inventoryDeclarationKey) : [inventoryDeclarationKey(hit)];
  }
  return declaredStatementName(statement) === undefined ? [] : [inventoryDeclarationKey(statement)];
}

// The top-level declaration(s) holding `node`, the module-scope sentinel, or nothing for a binding hop.
function consumerKeysOf(node: MorphNode, sf: SourceFile): string[] {
  let statement: MorphNode = node;
  let parent = statement.getParent();
  while (parent !== undefined && !Node.isSourceFile(parent)) {
    statement = parent;
    parent = statement.getParent();
  }
  if (parent === undefined || isBindingHopStatement(statement)) {
    return [];
  }
  const keys = topLevelDeclarationKeys(statement, node);
  return keys.length > 0 ? keys : [moduleScopeKeyOf(sf.getFilePath())];
}

function consumerSitesOf(sf: SourceFile): Map<string, Set<string>> {
  const sites = new Map<string, Set<string>>();
  for (const identifier of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const text = identifier.getText();
    const set = sites.get(text) ?? new Set<string>();
    for (const key of consumerKeysOf(identifier, sf)) {
      set.add(key);
    }
    if (set.size > 0) {
      sites.set(text, set);
    }
  }
  return sites;
}

// A self-edge is dropped: a declaration cannot keep itself alive, which makes a self-recursive function terminate dead.
function addConsumerEdge(consumers: Map<string, Set<string>>, originKey: string, consumerKey: string): void {
  if (originKey === consumerKey) {
    return;
  }
  const set = consumers.get(originKey) ?? new Set<string>();
  set.add(consumerKey);
  consumers.set(originKey, set);
}

function variableStatementDeclarations(statement: MorphNode): { name: string; decl: MorphNode }[] {
  if (!Node.isVariableStatement(statement)) {
    return [];
  }
  return statement.getDeclarations().flatMap((declaration): { name: string; decl: MorphNode }[] => {
    const bound = boundElementsOf(declaration);
    return bound.length === 0 ? [{ name: declaration.getName(), decl: declaration }] : bound.map((element) => ({ name: element.getName(), decl: element }));
  });
}

/** Every top-level declaration of a file, exported or not: a chain that launders itself through a file-local helper
 *  is the same defect as one that exports it. */
export function* topLevelDeclarations(sf: SourceFile): Generator<{ name: string; decl: MorphNode }> {
  for (const statement of sf.getStatements()) {
    yield* variableStatementDeclarations(statement);
    const name = declaredStatementName(statement);
    if (name !== undefined) {
      yield { name, decl: statement };
    }
  }
}

/** Every edge one file contributes: each consumption attributed to the declarations spelling its local binding
 *  (or holding its `import()` call), plus same-file uses of the file's own top-level declarations. */
export function recordDeclarationEdges(sf: SourceFile, consumptions: readonly ImportConsumption[], consumers: Map<string, Set<string>>): void {
  const sites = consumerSitesOf(sf);
  for (const consumption of consumptions) {
    const keys = consumption.local === undefined ? consumerKeysOf(consumption.site, sf) : (sites.get(consumption.local) ?? []);
    for (const consumerKey of keys) {
      addConsumerEdge(consumers, consumption.originKey, consumerKey);
    }
  }
  for (const { name, decl } of topLevelDeclarations(sf)) {
    const originKey = inventoryDeclarationKey(decl);
    for (const consumerKey of sites.get(name) ?? []) {
      addConsumerEdge(consumers, originKey, consumerKey);
    }
  }
}
