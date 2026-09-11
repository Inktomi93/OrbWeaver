// Declaration-proven class-composer identity. Textual callee names never grant authority: imports,
// namespaces, aliases, re-exports, createTV/merge factories, and simple parameter-forwarding wrappers do.
import type { ArrowFunction, FunctionDeclaration, FunctionExpression, ImportDeclaration } from "ts-morph";
import { Node } from "ts-morph";
import type { Composer, StaticClassSourceIndex } from "./static-class-expression-model.ts";
import { exportedDeclarations, importedSource, literalValue, localDeclarations, uniqueNodes, unwrap } from "./static-class-expression-model.ts";

type FunctionLike = FunctionDeclaration | FunctionExpression | ArrowFunction;

const MODULE_COMPOSERS: Readonly<Record<string, Readonly<Record<string, Composer>>>> = {
  clsx: { default: "join", clsx: "join" },
  "class-variance-authority": { cva: "cva" },
  "tailwind-variants": { cn: "join", cx: "join", clsx: "join", tv: "tv", createTV: "tv-factory" },
  "tailwind-merge": {
    twJoin: "join",
    twMerge: "join",
    extendTailwindMerge: "join-factory",
    createTailwindMerge: "join-factory",
  },
  "@orb/ui/lib": { cn: "join", tv: "tv" },
  "#lib": { cn: "join", tv: "tv" },
};

const RETURN_WRAPPERS = new Set(["ParenthesizedExpression", "AsExpression", "SatisfiesExpression", "NonNullExpression", "TypeAssertionExpression"]);
const RETURN_BINARY_OPERATORS = new Set(["+", "||", "??"]);

function moduleComposer(moduleName: string, exportName: string): Composer | undefined {
  return MODULE_COMPOSERS[moduleName]?.[exportName];
}

export class ComposerResolver {
  private readonly sourceIndex: StaticClassSourceIndex;
  private readonly expressionCache = new Map<Node, Composer | null>();
  private readonly declarationCache = new Map<Node, Composer | null>();
  private readonly callsByFunction = new Map<FunctionLike, import("ts-morph").CallExpression[]>();
  private readonly identifiersByCall = new Map<import("ts-morph").CallExpression, import("ts-morph").Identifier[]>();

  constructor(sourceIndex: StaticClassSourceIndex) {
    this.sourceIndex = sourceIndex;
  }

  visit(node: Node): void {
    if (Node.isCallExpression(node)) {
      const owner = node.getFirstAncestor(this.isFunctionLike);
      if (owner !== undefined) {
        const calls = this.callsByFunction.get(owner) ?? [];
        calls.push(node);
        this.callsByFunction.set(owner, calls);
      }
      return;
    }
    if (!Node.isIdentifier(node)) {
      return;
    }
    const call = node.getFirstAncestor(Node.isCallExpression);
    if (call === undefined || !call.getArguments().some((argument) => node.getStart() >= argument.getStart() && node.getEnd() <= argument.getEnd())) {
      return;
    }
    const identifiers = this.identifiersByCall.get(call) ?? [];
    identifiers.push(node);
    this.identifiersByCall.set(call, identifiers);
  }

  composerOf(raw: Node, path: Set<Node> = new Set()): Composer | undefined {
    const node = unwrap(raw);
    const cached = this.expressionCache.get(node);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    if (path.has(node)) {
      return;
    }
    path.add(node);
    try {
      const composer = this.composerInner(node, path);
      this.expressionCache.set(node, composer ?? null);
      return composer;
    } finally {
      path.delete(node);
    }
  }

  private composerInner(node: Node, path: Set<Node>): Composer | undefined {
    if (Node.isIdentifier(node)) {
      return this.identifierComposer(node, path);
    }
    if (Node.isPropertyAccessExpression(node)) {
      return this.namespaceMemberComposer(node.getExpression(), node.getName(), path);
    }
    if (Node.isElementAccessExpression(node)) {
      return this.elementComposer(node, path);
    }
    if (Node.isCallExpression(node)) {
      return this.factoryResult(node.getExpression(), path);
    }
    if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
      return this.forwardedComposer(node, path);
    }
    return void 0;
  }

  private identifierComposer(node: import("ts-morph").Identifier, path: Set<Node>): Composer | undefined {
    for (const declaration of this.identifierDeclarations(node)) {
      const found = this.composerFromDeclaration(declaration, path);
      if (found !== undefined) {
        return found;
      }
    }
    return void 0;
  }

  private elementComposer(node: import("ts-morph").ElementAccessExpression, path: Set<Node>): Composer | undefined {
    const argument = node.getArgumentExpression();
    const names = argument === undefined ? [] : this.staticScalars(argument, new Set());
    return names.length === 1 ? this.namespaceMemberComposer(node.getExpression(), names[0] ?? "", path) : undefined;
  }

  private factoryResult(expression: Node, path: Set<Node>): Composer | undefined {
    const factory = this.composerOf(expression, path);
    if (factory === "tv-factory") {
      return "tv";
    }
    return factory === "join-factory" ? "join" : undefined;
  }

  private composerFromDeclaration(declaration: Node, path: Set<Node>): Composer | undefined {
    const cached = this.declarationCache.get(declaration);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    if (path.has(declaration)) {
      return;
    }
    path.add(declaration);
    try {
      const composer = this.declarationInner(declaration, path);
      this.declarationCache.set(declaration, composer ?? null);
      return composer;
    } finally {
      path.delete(declaration);
    }
  }

  private declarationInner(declaration: Node, path: Set<Node>): Composer | undefined {
    if (Node.isImportSpecifier(declaration)) {
      return this.importSpecifierComposer(declaration, path);
    }
    if (declaration.getKindName() === "ImportClause") {
      return this.defaultImportComposer(declaration);
    }
    if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer();
      return initializer === undefined ? undefined : this.composerOf(initializer, path);
    }
    if (Node.isFunctionDeclaration(declaration)) {
      return this.forwardedComposer(declaration, path);
    }
    if (Node.isBindingElement(declaration)) {
      return this.bindingComposer(declaration, path);
    }
    if (Node.isExportAssignment(declaration)) {
      return this.composerOf(declaration.getExpression(), path);
    }
    return Node.isExportSpecifier(declaration) ? this.exportSpecifierComposer(declaration, path) : undefined;
  }

  private importSpecifierComposer(specifier: import("ts-morph").ImportSpecifier, path: Set<Node>): Composer | undefined {
    const imported = specifier.getNameNode().getText();
    const importDeclaration = specifier.getImportDeclaration();
    const moduleName = importDeclaration.getModuleSpecifierValue();
    const direct = moduleComposer(moduleName, imported);
    if (direct !== undefined) {
      return direct;
    }
    const source = importedSource(this.sourceIndex, specifier.getSourceFile(), moduleName);
    return source === undefined ? undefined : this.firstDeclarationComposer(exportedDeclarations(this.sourceIndex, source, imported), path);
  }

  private defaultImportComposer(declaration: Node): Composer | undefined {
    const importDeclaration = declaration.getFirstAncestor(Node.isImportDeclaration) as ImportDeclaration | undefined;
    return importDeclaration === undefined ? undefined : moduleComposer(importDeclaration.getModuleSpecifierValue(), "default");
  }

  private bindingComposer(binding: import("ts-morph").BindingElement, path: Set<Node>): Composer | undefined {
    const variable = binding.getFirstAncestor(Node.isVariableDeclaration);
    const initializer = variable?.getInitializer();
    const member = binding.getPropertyNameNode()?.getText() ?? binding.getNameNode().getText();
    return initializer === undefined ? undefined : this.namespaceMemberComposer(initializer, member, path);
  }

  private exportSpecifierComposer(specifier: import("ts-morph").ExportSpecifier, path: Set<Node>): Composer | undefined {
    const exportDeclaration = specifier.getExportDeclaration();
    const moduleName = exportDeclaration.getModuleSpecifierValue();
    const imported = specifier.getNameNode().getText();
    if (moduleName === undefined) {
      return this.firstDeclarationComposer(
        localDeclarations(specifier.getSourceFile(), imported).filter((target) => target !== specifier),
        path,
      );
    }
    const direct = moduleComposer(moduleName, imported);
    if (direct !== undefined) {
      return direct;
    }
    const source = importedSource(this.sourceIndex, specifier.getSourceFile(), moduleName);
    return source === undefined ? undefined : this.firstDeclarationComposer(exportedDeclarations(this.sourceIndex, source, imported), path);
  }

  private firstDeclarationComposer(declarations: readonly Node[], path: Set<Node>): Composer | undefined {
    for (const declaration of declarations) {
      const composer = this.composerFromDeclaration(declaration, path);
      if (composer !== undefined) {
        return composer;
      }
    }
    return void 0;
  }

  private namespaceMemberComposer(raw: Node, exportName: string, path: Set<Node>): Composer | undefined {
    const node = unwrap(raw);
    if (!Node.isIdentifier(node)) {
      return;
    }
    for (const declaration of this.identifierDeclarations(node)) {
      const composer = this.namespaceDeclarationComposer(declaration, exportName, path);
      if (composer !== undefined) {
        return composer;
      }
    }
    return void 0;
  }

  private namespaceDeclarationComposer(declaration: Node, exportName: string, path: Set<Node>): Composer | undefined {
    if (Node.isNamespaceImport(declaration)) {
      return this.namespaceImportComposer(declaration, exportName, path);
    }
    if (!Node.isVariableDeclaration(declaration) || path.has(declaration)) {
      return;
    }
    const initializer = declaration.getInitializer();
    if (initializer === undefined) {
      return;
    }
    path.add(declaration);
    try {
      return this.namespaceMemberComposer(initializer, exportName, path);
    } finally {
      path.delete(declaration);
    }
  }

  private namespaceImportComposer(declaration: import("ts-morph").NamespaceImport, exportName: string, path: Set<Node>): Composer | undefined {
    const moduleName = declaration.getFirstAncestor(Node.isImportDeclaration)?.getModuleSpecifierValue();
    if (moduleName === undefined) {
      return;
    }
    const direct = moduleComposer(moduleName, exportName);
    if (direct !== undefined) {
      return direct;
    }
    const source = importedSource(this.sourceIndex, declaration.getSourceFile(), moduleName);
    return source === undefined ? undefined : this.firstDeclarationComposer(exportedDeclarations(this.sourceIndex, source, exportName), path);
  }

  private staticScalars(raw: Node, path: Set<Node>): string[] {
    const node = unwrap(raw);
    const literal = literalValue(node);
    if (literal !== undefined) {
      return [literal.value];
    }
    if (Node.isConditionalExpression(node)) {
      return [...new Set([...this.staticScalars(node.getWhenTrue(), path), ...this.staticScalars(node.getWhenFalse(), path)])];
    }
    return Node.isIdentifier(node) ? this.identifierScalars(node, path) : [];
  }

  private identifierScalars(node: import("ts-morph").Identifier, path: Set<Node>): string[] {
    if (path.has(node)) {
      return [];
    }
    path.add(node);
    const values: string[] = [];
    for (const declaration of this.identifierDeclarations(node)) {
      if (Node.isVariableDeclaration(declaration)) {
        const initializer = declaration.getInitializer();
        if (initializer !== undefined) {
          values.push(...this.staticScalars(initializer, path));
        }
      }
    }
    path.delete(node);
    return [...new Set(values)];
  }

  private forwardedComposer(fn: FunctionLike, path: Set<Node>): Composer | undefined {
    const parameters = fn.getParameters().filter((parameter) => Node.isIdentifier(parameter.getNameNode()));
    if (parameters.length === 0) {
      return;
    }
    for (const call of this.callsByFunction.get(fn) ?? []) {
      if (!(this.isOwnedCall(call, fn) && this.isReturnedCall(call, fn))) {
        continue;
      }
      const composer = this.composerOf(call.getExpression(), path);
      if (composer !== undefined && composer !== "tv-factory" && composer !== "join-factory" && this.forwardsAll(call, parameters)) {
        return composer;
      }
    }
    return void 0;
  }

  private isReturnedCall(call: import("ts-morph").CallExpression, fn: FunctionLike): boolean {
    let current: Node = call;
    let parent = current.getParent();
    while (parent !== undefined) {
      if (Node.isReturnStatement(parent)) {
        return parent.getExpression() === current && parent.getFirstAncestor(this.isFunctionLike) === fn;
      }
      if (Node.isArrowFunction(parent)) {
        return parent === fn && parent.getBody() === current;
      }
      if (!this.isTransparentReturnParent(parent, current)) {
        return false;
      }
      current = parent;
      parent = current.getParent();
    }
    return false;
  }

  private isTransparentReturnParent(parent: Node, child: Node): boolean {
    if (RETURN_WRAPPERS.has(parent.getKindName()) && "getExpression" in parent) {
      return (parent as Node & { getExpression: () => Node }).getExpression() === child;
    }
    if (Node.isBinaryExpression(parent)) {
      return RETURN_BINARY_OPERATORS.has(parent.getOperatorToken().getText()) && (parent.getLeft() === child || parent.getRight() === child);
    }
    return Node.isConditionalExpression(parent) && (parent.getWhenTrue() === child || parent.getWhenFalse() === child);
  }

  private isFunctionLike(node: Node): node is FunctionLike {
    return Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isArrowFunction(node);
  }

  private isOwnedCall(call: import("ts-morph").CallExpression, fn: FunctionLike): boolean {
    return (
      call.getFirstAncestor((ancestor) => Node.isFunctionDeclaration(ancestor) || Node.isFunctionExpression(ancestor) || Node.isArrowFunction(ancestor)) === fn
    );
  }

  private forwardsAll(call: import("ts-morph").CallExpression, parameters: readonly import("ts-morph").ParameterDeclaration[]): boolean {
    const forwarded = new Set<Node>();
    for (const identifier of this.identifiersByCall.get(call) ?? []) {
      for (const declaration of this.identifierDeclarations(identifier)) {
        if (Node.isParameterDeclaration(declaration) && parameters.includes(declaration)) {
          forwarded.add(declaration);
        }
      }
    }
    return parameters.every((parameter) => forwarded.has(parameter));
  }

  private identifierDeclarations(node: import("ts-morph").Identifier): Node[] {
    const direct = node.getSymbol()?.getDeclarations() ?? [];
    return uniqueNodes(direct).filter(
      (declaration) => declaration !== node && !(Node.isShorthandPropertyAssignment(declaration) && declaration.getNameNode().getStart() === node.getStart()),
    );
  }
}
