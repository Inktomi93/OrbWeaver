// One declaration living under a second name: `import { X as Y }`, `export { X as Y }`, a bare `type Y = X` and a
// `const Y = X`. The authored syntax is the subject, never a resolved origin. `pnpm ast aliases` lists every one;
// `no-vanity-alias` judges the import, export and type arms against its sanctioned-rename rules.
import type { Node } from "ts-morph";
import { Node as N, SyntaxKind, VariableDeclarationKind } from "ts-morph";

const RENAME_BINDING_KINDS = ["rename-import", "rename-export", "type-rename", "const-rename"] as const;
export type RenameBindingKind = (typeof RENAME_BINDING_KINDS)[number];

/** One rename: the node that carries it, the original name or type text, and the new name. */
export interface RenameBinding {
  readonly kind: RenameBindingKind;
  readonly node: Node;
  readonly original: string;
  readonly alias: string;
  /** The import or export declaration's module specifier, for a specifier rename. */
  readonly moduleSpecifier: string | undefined;
  /** A type rename's target name node: an identifier, or a qualified name. */
  readonly targetName: Node | undefined;
}

function specifierRename(node: Node): RenameBinding | undefined {
  const isImport = N.isImportSpecifier(node);
  if (!(isImport || N.isExportSpecifier(node))) {
    return;
  }
  const aliasNode = node.getAliasNode();
  const declaration = isImport ? node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) : node.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);
  if (aliasNode === undefined || declaration === undefined) {
    return;
  }
  return {
    kind: isImport ? "rename-import" : "rename-export",
    node,
    original: node.getName(),
    alias: aliasNode.getText(),
    moduleSpecifier: declaration.getModuleSpecifierValue(),
    targetName: undefined,
  };
}

/** The rename one node authors, or undefined: an aliased import or export specifier, a type alias whose whole body
 *  is an argument-free type reference, or a `const` of a plain name whose initializer is a bare identifier. */
export function renameBindingOf(node: Node): RenameBinding | undefined {
  if (N.isTypeAliasDeclaration(node)) {
    const typeNode = node.getTypeNode();
    if (typeNode === undefined || !N.isTypeReference(typeNode) || typeNode.getTypeArguments().length > 0) {
      return;
    }
    return { kind: "type-rename", node, original: typeNode.getText(), alias: node.getName(), moduleSpecifier: undefined, targetName: typeNode.getTypeName() };
  }
  if (N.isVariableDeclaration(node)) {
    const initializer = node.getInitializer();
    // A `let`/`var` is a new variable and a destructuring pattern binds several names; neither is a second name for one.
    const isConst = node.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const;
    return isConst && N.isIdentifier(node.getNameNode()) && initializer !== undefined && N.isIdentifier(initializer)
      ? { kind: "const-rename", node, original: initializer.getText(), alias: node.getName(), moduleSpecifier: undefined, targetName: undefined }
      : undefined;
  }
  return specifierRename(node);
}
