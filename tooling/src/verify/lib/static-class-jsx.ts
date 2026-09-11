// Bounded JSX custom-component binding. This resolves direct object-destructured props from JSX callsites
// into a class carrier; it does not guess component factories, render-prop calls, or arbitrary functions.
import type { ArrowFunction, FunctionDeclaration, FunctionExpression } from "ts-morph";
import { Node } from "ts-morph";
import type { StaticClassSourceIndex, StaticValue } from "./static-class-expression-model.ts";
import { exportedDeclarations, importedSource, localDeclarations, uniqueNodes, unwrap } from "./static-class-expression-model.ts";
import type { CollectionHost } from "./static-class-object.ts";
import { findObjectProperties } from "./static-class-object.ts";

type FunctionLike = FunctionDeclaration | FunctionExpression | ArrowFunction;
type JsxElement = import("ts-morph").JsxOpeningElement | import("ts-morph").JsxSelfClosingElement;

interface BindingQuery {
  readonly host: CollectionHost;
  readonly binding: import("ts-morph").BindingElement;
  readonly property: string;
  readonly path: Set<Node>;
}

function nodeKey(node: Node): string {
  return `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getKind()}`;
}

function componentTarget(fn: FunctionLike): Node | undefined {
  if (Node.isFunctionDeclaration(fn)) {
    return fn;
  }
  return fn.getFirstAncestor(Node.isVariableDeclaration) ?? fn.getFirstAncestor(Node.isExportAssignment);
}

function tagReference(element: JsxElement): import("ts-morph").Identifier | undefined {
  const tag = element.getTagNameNode();
  if (Node.isIdentifier(tag)) {
    return tag;
  }
  return Node.isPropertyAccessExpression(tag) ? tag.getNameNode() : undefined;
}

function jsxValue(host: CollectionHost, attribute: import("ts-morph").JsxAttribute, path: Set<Node>): StaticValue[] {
  const initializer = attribute.getInitializer();
  if (initializer === undefined) {
    return [];
  }
  if (Node.isJsxExpression(initializer)) {
    const expression = initializer.getExpression();
    return expression === undefined ? [] : host.evalClass(expression, path);
  }
  return host.evalClass(initializer, path);
}

export class JsxBindingResolver {
  private readonly sourceIndex: StaticClassSourceIndex;
  private readonly elementIndex = new Map<string, JsxElement[]>();

  constructor(sourceIndex: StaticClassSourceIndex) {
    this.sourceIndex = sourceIndex;
  }

  visit(node: Node): void {
    if (!(Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node))) {
      return;
    }
    const reference = tagReference(node);
    if (reference === undefined || reference.getText()[0]?.toUpperCase() !== reference.getText()[0]) {
      return;
    }
    for (const target of this.elementTargets(node, new Set())) {
      const key = nodeKey(target);
      const elements = this.elementIndex.get(key) ?? [];
      elements.push(node);
      this.elementIndex.set(key, elements);
    }
  }

  values(host: CollectionHost, binding: import("ts-morph").BindingElement, path: Set<Node>): StaticValue[] | undefined {
    const parameter = binding.getFirstAncestor(Node.isParameterDeclaration);
    const fn = binding.getFirstAncestor(
      (ancestor) => Node.isFunctionDeclaration(ancestor) || Node.isFunctionExpression(ancestor) || Node.isArrowFunction(ancestor),
    ) as FunctionLike | undefined;
    if (parameter === undefined || fn === undefined || binding.getParent() !== parameter.getNameNode()) {
      return;
    }
    const target = componentTarget(fn);
    if (target === undefined) {
      return;
    }
    const property = binding.getPropertyNameNode()?.getText() ?? binding.getNameNode().getText();
    if (path.has(binding)) {
      host.diagnose("unresolved", binding, "static JSX component-prop cycle");
      return [];
    }
    path.add(binding);
    try {
      return this.bindingValues({ host, binding, property, path }, this.index().get(nodeKey(target)) ?? []);
    } finally {
      path.delete(binding);
    }
  }

  private bindingValues(query: BindingQuery, elements: readonly JsxElement[]): StaticValue[] {
    if (elements.length === 0) {
      query.host.diagnose("opaque", query.binding, "custom-component prop has no statically resolved JSX callsite");
      return [];
    }
    return elements.flatMap((element) => this.elementValues(query, element));
  }

  private elementValues(query: BindingQuery, element: JsxElement): StaticValue[] {
    let selected: StaticValue[] | undefined;
    for (const attribute of element.getAttributes()) {
      if (Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === query.property) {
        selected = jsxValue(query.host, attribute, query.path);
      } else if (Node.isJsxSpreadAttribute(attribute)) {
        const matches = findObjectProperties(query.host, attribute.getExpression(), new Set([query.property]), query.path);
        if (matches.length > 0) {
          selected = matches.flatMap((match) => query.host.evalClass(match.value, query.path));
        }
      }
    }
    if (selected !== undefined) {
      return selected;
    }
    const fallback = query.binding.getInitializer();
    return fallback === undefined ? [] : query.host.evalClass(fallback, query.path);
  }

  private index(): ReadonlyMap<string, readonly JsxElement[]> {
    return this.elementIndex;
  }

  private referenceTargets(reference: import("ts-morph").Identifier, path: Set<Node>): Node[] {
    return uniqueNodes(localDeclarations(reference.getSourceFile(), reference.getText()).flatMap((declaration) => this.declarationTargets(declaration, path)));
  }

  private elementTargets(element: JsxElement, path: Set<Node>): Node[] {
    const tag = element.getTagNameNode();
    if (Node.isIdentifier(tag)) {
      return this.referenceTargets(tag, path);
    }
    if (!Node.isPropertyAccessExpression(tag)) {
      return [];
    }
    const receiver = tag.getExpression();
    if (!Node.isIdentifier(receiver)) {
      return [];
    }
    const source = this.namespaceSource(receiver, path);
    return source === undefined
      ? []
      : exportedDeclarations(this.sourceIndex, source, tag.getName()).flatMap((declaration) => this.declarationTargets(declaration, path));
  }

  private namespaceSource(reference: import("ts-morph").Identifier, path: Set<Node>): import("ts-morph").SourceFile | undefined {
    let resolved: import("ts-morph").SourceFile | undefined;
    for (const declaration of localDeclarations(reference.getSourceFile(), reference.getText())) {
      const source = this.namespaceDeclarationSource(declaration, path);
      if (source !== undefined) {
        resolved = source;
        break;
      }
    }
    return resolved;
  }

  private namespaceDeclarationSource(declaration: Node, path: Set<Node>): import("ts-morph").SourceFile | undefined {
    if (Node.isNamespaceImport(declaration)) {
      const importDeclaration = declaration.getFirstAncestor(Node.isImportDeclaration);
      return importDeclaration === undefined
        ? undefined
        : importedSource(this.sourceIndex, declaration.getSourceFile(), importDeclaration.getModuleSpecifierValue());
    }
    if (!Node.isVariableDeclaration(declaration) || path.has(declaration)) {
      return;
    }
    const initializer = declaration.getInitializer();
    const reference = initializer === undefined ? undefined : unwrap(initializer);
    if (!Node.isIdentifier(reference)) {
      return;
    }
    path.add(declaration);
    const source = this.namespaceSource(reference, path);
    path.delete(declaration);
    return source;
  }

  private declarationTargets(declaration: Node, path: Set<Node>): Node[] {
    if (path.has(declaration)) {
      return [];
    }
    path.add(declaration);
    try {
      if (Node.isFunctionDeclaration(declaration)) {
        return [declaration];
      }
      if (Node.isVariableDeclaration(declaration)) {
        const initializer = declaration.getInitializer();
        const target = initializer === undefined ? undefined : unwrap(initializer);
        return target !== undefined && Node.isIdentifier(target) ? this.referenceTargets(target, path) : [declaration];
      }
      if (Node.isImportSpecifier(declaration)) {
        return this.importTargets(
          declaration.getSourceFile(),
          declaration.getImportDeclaration().getModuleSpecifierValue(),
          declaration.getNameNode().getText(),
          path,
        );
      }
      return this.moduleTargets(declaration, path);
    } finally {
      path.delete(declaration);
    }
  }

  private moduleTargets(declaration: Node, path: Set<Node>): Node[] {
    if (Node.isExportSpecifier(declaration)) {
      const moduleName = declaration.getExportDeclaration().getModuleSpecifierValue();
      const name = declaration.getNameNode().getText();
      return moduleName === undefined
        ? localDeclarations(declaration.getSourceFile(), name).flatMap((target) => this.declarationTargets(target, path))
        : this.importTargets(declaration.getSourceFile(), moduleName, name, path);
    }
    if (declaration.getKindName() === "ImportClause") {
      const importDeclaration = declaration.getFirstAncestor(Node.isImportDeclaration);
      return importDeclaration === undefined
        ? []
        : this.importTargets(declaration.getSourceFile(), importDeclaration.getModuleSpecifierValue(), "default", path);
    }
    if (Node.isExportAssignment(declaration)) {
      return [declaration];
    }
    return [];
  }

  private importTargets(from: import("ts-morph").SourceFile, moduleName: string, name: string, path: Set<Node>): Node[] {
    const source = importedSource(this.sourceIndex, from, moduleName);
    return source === undefined
      ? []
      : exportedDeclarations(this.sourceIndex, source, name).flatMap((declaration) => this.declarationTargets(declaration, path));
  }
}
