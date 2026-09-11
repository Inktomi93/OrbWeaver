// Declaration-proven tailwind-variants result provenance. A recipe call is trusted only when its
// defining initializer calls a composer already proven to be the real tv export.
import { Node } from "ts-morph";
import type { ComposerResolver } from "./static-class-composer.ts";
import type { StaticClassSourceIndex } from "./static-class-expression-model.ts";
import { exportedDeclarations, importedSource, literalValue, localDeclarations, uniqueNodes, unwrap } from "./static-class-expression-model.ts";

export class StaticVariantResolver {
  private readonly cache = new Map<Node, readonly import("ts-morph").CallExpression[]>();
  private readonly sourceIndex: StaticClassSourceIndex;
  private readonly composers: ComposerResolver;

  constructor(sourceIndex: StaticClassSourceIndex, composers: ComposerResolver) {
    this.sourceIndex = sourceIndex;
    this.composers = composers;
  }

  definitionsOf(raw: Node, path: Set<Node> = new Set()): readonly import("ts-morph").CallExpression[] {
    const node = unwrap(raw);
    const cached = this.cache.get(node);
    if (cached !== undefined) {
      return cached;
    }
    if (path.has(node)) {
      return [];
    }
    path.add(node);
    try {
      const definitions = uniqueNodes(this.expressionDefinitions(node, path)).filter(Node.isCallExpression);
      this.cache.set(node, definitions);
      return definitions;
    } finally {
      path.delete(node);
    }
  }

  private expressionDefinitions(node: Node, path: Set<Node>): Node[] {
    if (Node.isIdentifier(node)) {
      return this.identifierDeclarations(node).flatMap((declaration) => this.declarationDefinitions(declaration, path));
    }
    if (Node.isPropertyAccessExpression(node)) {
      return this.memberDefinitions(node.getExpression(), node.getName(), path);
    }
    if (Node.isElementAccessExpression(node)) {
      const argument = node.getArgumentExpression();
      const name = argument === undefined ? undefined : this.staticName(argument, new Set());
      return name === undefined ? [] : this.memberDefinitions(node.getExpression(), name, path);
    }
    if (Node.isConditionalExpression(node)) {
      return [...this.definitionsOf(node.getWhenTrue(), path), ...this.definitionsOf(node.getWhenFalse(), path)];
    }
    return [];
  }

  private declarationDefinitions(declaration: Node, path: Set<Node>): Node[] {
    if (path.has(declaration)) {
      return [];
    }
    path.add(declaration);
    try {
      return this.declarationDefinitionsInner(declaration, path);
    } finally {
      path.delete(declaration);
    }
  }

  private declarationDefinitionsInner(declaration: Node, path: Set<Node>): Node[] {
    if (Node.isVariableDeclaration(declaration) || Node.isPropertyAssignment(declaration)) {
      const initializer = declaration.getInitializer();
      return initializer === undefined ? [] : this.initializerDefinitions(initializer, path);
    }
    if (Node.isShorthandPropertyAssignment(declaration)) {
      return [...this.definitionsOf(declaration.getNameNode(), path)];
    }
    if (Node.isBindingElement(declaration)) {
      const variable = declaration.getFirstAncestor(Node.isVariableDeclaration);
      const initializer = variable?.getInitializer();
      return initializer === undefined ? [] : this.initializerDefinitions(initializer, path);
    }
    if (Node.isImportSpecifier(declaration)) {
      return this.importedDefinitions(
        declaration.getSourceFile(),
        declaration.getImportDeclaration().getModuleSpecifierValue(),
        declaration.getNameNode().getText(),
        path,
      );
    }
    if (Node.isExportSpecifier(declaration)) {
      return this.exportedSpecifierDefinitions(declaration, path);
    }
    if (Node.isExportAssignment(declaration)) {
      return [...this.definitionsOf(declaration.getExpression(), path)];
    }
    if (declaration.getKindName() === "ImportClause") {
      const importDeclaration = declaration.getFirstAncestor(Node.isImportDeclaration);
      return importDeclaration === undefined
        ? []
        : this.importedDefinitions(declaration.getSourceFile(), importDeclaration.getModuleSpecifierValue(), "default", path);
    }
    return [];
  }

  private initializerDefinitions(raw: Node, path: Set<Node>): Node[] {
    const initializer = unwrap(raw);
    if (Node.isCallExpression(initializer)) {
      if (this.composers.composerOf(initializer.getExpression()) === "tv") {
        return [initializer];
      }
      return [...this.definitionsOf(initializer.getExpression(), path)];
    }
    return [...this.definitionsOf(initializer, path)];
  }

  private importedDefinitions(from: import("ts-morph").SourceFile, moduleName: string, imported: string, path: Set<Node>): Node[] {
    const source = importedSource(this.sourceIndex, from, moduleName);
    return source === undefined
      ? []
      : exportedDeclarations(this.sourceIndex, source, imported).flatMap((declaration) => this.declarationDefinitions(declaration, path));
  }

  private exportedSpecifierDefinitions(specifier: import("ts-morph").ExportSpecifier, path: Set<Node>): Node[] {
    const moduleName = specifier.getExportDeclaration().getModuleSpecifierValue();
    const imported = specifier.getNameNode().getText();
    return moduleName === undefined
      ? localDeclarations(specifier.getSourceFile(), imported)
          .filter((declaration) => declaration !== specifier)
          .flatMap((declaration) => this.declarationDefinitions(declaration, path))
      : this.importedDefinitions(specifier.getSourceFile(), moduleName, imported, path);
  }

  private memberDefinitions(raw: Node, name: string, path: Set<Node>): Node[] {
    const node = unwrap(raw);
    if (Node.isCallExpression(node)) {
      return [...this.definitionsOf(node.getExpression(), path)];
    }
    if (!Node.isIdentifier(node)) {
      return [];
    }
    return this.identifierDeclarations(node).flatMap((declaration) => this.memberDeclarationDefinitions(declaration, name, path));
  }

  private memberDeclarationDefinitions(declaration: Node, name: string, path: Set<Node>): Node[] {
    if (Node.isNamespaceImport(declaration)) {
      const moduleName = declaration.getFirstAncestor(Node.isImportDeclaration)?.getModuleSpecifierValue();
      return moduleName === undefined ? [] : this.importedDefinitions(declaration.getSourceFile(), moduleName, name, path);
    }
    if (!Node.isVariableDeclaration(declaration)) {
      return [];
    }
    const initializer = declaration.getInitializer();
    if (initializer === undefined) {
      return [];
    }
    const unwrapped = unwrap(initializer);
    if (Node.isCallExpression(unwrapped)) {
      return [...this.definitionsOf(unwrapped.getExpression(), path)];
    }
    if (!Node.isObjectLiteralExpression(unwrapped)) {
      return this.memberDefinitions(unwrapped, name, path);
    }
    return unwrapped.getProperties().flatMap((property) => {
      if (!(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property))) {
        return [];
      }
      const propertyName = property
        .getNameNode()
        .getText()
        .replace(/^["']|["']$/gu, "");
      return propertyName === name ? this.declarationDefinitions(property, path) : [];
    });
  }

  private staticName(raw: Node, path: Set<Node>): string | undefined {
    const node = unwrap(raw);
    const literal = literalValue(node);
    if (literal !== undefined) {
      return literal.value;
    }
    if (!Node.isIdentifier(node) || path.has(node)) {
      return;
    }
    path.add(node);
    try {
      const names = this.identifierDeclarations(node).flatMap((declaration) => {
        if (!Node.isVariableDeclaration(declaration)) {
          return [];
        }
        const initializer = declaration.getInitializer();
        const value = initializer === undefined ? undefined : this.staticName(initializer, path);
        return value === undefined ? [] : [value];
      });
      return [...new Set(names)].length === 1 ? names[0] : undefined;
    } finally {
      path.delete(node);
    }
  }

  private identifierDeclarations(node: import("ts-morph").Identifier): Node[] {
    return uniqueNodes(node.getSymbol()?.getDeclarations() ?? []).filter((declaration) => declaration !== node);
  }
}
