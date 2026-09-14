// Cycle-fenced static class VALUE evaluator. Exact values preserve producer segments; unsupported static
// shapes are unresolved, while genuine runtime leaves are counted opaque and partial templates retain
// the prefix proven before their first runtime substitution.

import { resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import type { ImportClause, ImportDeclaration, SourceFile } from "ts-morph";
import { Node, VariableDeclarationKind } from "ts-morph";
import { evalComposerCall } from "./static-class-collections.ts";
import { ComposerResolver } from "./static-class-composer.ts";
import type { RuntimeClassPrefix, StaticClassSourceIndex, StaticValue } from "./static-class-expression-model.ts";
import {
  combine,
  dedupeValues,
  exportedDeclarations,
  importedSource,
  literalValue,
  localDeclarations,
  sliceStaticValue,
  uniqueNodes,
  unwrap,
} from "./static-class-expression-model.ts";
import { JsxBindingResolver } from "./static-class-jsx.ts";
import type { CollectionHost } from "./static-class-object.ts";
import { evalObjectMember, propertyName, resolveObjects, staticScalars } from "./static-class-object.ts";
import { StaticVariantResolver } from "./static-class-variant.ts";

interface ImportTarget {
  readonly from: import("ts-morph").SourceFile;
  readonly moduleName: string;
  readonly imported: string;
  readonly anchor: Node;
}

export interface StaticClassResolvers {
  readonly composers: ComposerResolver;
  readonly jsxBindings: JsxBindingResolver;
  readonly variants: StaticVariantResolver;
}

export class StaticClassEvaluator implements CollectionHost {
  readonly runtimePrefixes: Omit<RuntimeClassPrefix, "consumers">[] = [];
  readonly unresolved: Array<{ readonly node: Node; readonly reason: string }> = [];
  readonly opaque: Array<{ readonly node: Node; readonly reason: string }> = [];
  readonly sourceIndex: StaticClassSourceIndex;
  readonly composers: ComposerResolver;
  readonly jsxBindings: JsxBindingResolver;
  readonly variants: StaticVariantResolver;

  private readonly diagnosticKeys = new Set<string>();
  private opaqueEvents = 0;
  private unresolvedEvents = 0;
  private readonly sourceSet: ReadonlySet<SourceFile>;
  private readonly importDefinitionCache = new Map<string, readonly Node[]>();

  constructor(sourceIndex: StaticClassSourceIndex, files: readonly import("ts-morph").SourceFile[], resolvers?: StaticClassResolvers) {
    this.sourceIndex = sourceIndex;
    this.sourceSet = new Set(files);
    if (resolvers === undefined) {
      this.composers = new ComposerResolver(sourceIndex);
      this.jsxBindings = new JsxBindingResolver(sourceIndex);
      this.variants = new StaticVariantResolver(sourceIndex, this.composers);
    } else {
      this.composers = resolvers.composers;
      this.jsxBindings = resolvers.jsxBindings;
      this.variants = resolvers.variants;
    }
  }

  diagnose = (kind: "unresolved" | "opaque", node: Node, reason: string): void => {
    if (kind === "opaque") {
      this.opaqueEvents += 1;
    } else {
      this.unresolvedEvents += 1;
    }
    const key = `${kind}|${node.getSourceFile().getFilePath()}:${node.getStart()}:${reason}`;
    if (this.diagnosticKeys.has(key)) {
      return;
    }
    this.diagnosticKeys.add(key);
    (kind === "unresolved" ? this.unresolved : this.opaque).push({ node, reason });
  };

  evalClass = (raw: Node, path: Set<Node>): StaticValue[] => {
    const node = unwrap(raw);
    if (path.has(node)) {
      this.diagnose("unresolved", node, "static class-expression cycle");
      return [];
    }
    path.add(node);
    try {
      return this.evalClassInner(node, path);
    } finally {
      path.delete(node);
    }
  };

  private evalClassInner(node: Node, path: Set<Node>): StaticValue[] {
    const literal = literalValue(node);
    if (literal !== undefined) {
      return [literal];
    }
    if (Node.isTemplateExpression(node)) {
      return this.evalTemplate(node, path);
    }
    if (Node.isBinaryExpression(node)) {
      return this.evalBinary(node, path);
    }
    if (Node.isConditionalExpression(node)) {
      return dedupeValues([...this.evalClass(node.getWhenTrue(), path), ...this.evalClass(node.getWhenFalse(), path)]);
    }
    if (Node.isArrayLiteralExpression(node)) {
      return node
        .getElements()
        .flatMap((element) => (Node.isSpreadElement(element) ? this.evalClass(element.getExpression(), path) : this.evalClass(element, path)));
    }
    return this.evalLeaf(node, path);
  }

  private evalBinary(node: import("ts-morph").BinaryExpression, path: Set<Node>): StaticValue[] {
    const operator = node.getOperatorToken().getText();
    if (operator === "+") {
      return this.product(this.evalClass(node.getLeft(), path), this.evalClass(node.getRight(), path));
    }
    if (operator === "&&") {
      return this.evalClass(node.getRight(), path);
    }
    if (operator === "||" || operator === "??") {
      return dedupeValues([...this.evalClass(node.getLeft(), path), ...this.evalClass(node.getRight(), path)]);
    }
    this.diagnose("unresolved", node, `unsupported static binary operator ${operator}`);
    return [];
  }

  private evalLeaf(node: Node, path: Set<Node>): StaticValue[] {
    if (Node.isSpreadElement(node) || Node.isSpreadAssignment(node)) {
      return this.evalClass(node.getExpression(), path);
    }
    if (Node.isIdentifier(node)) {
      return this.evalIdentifier(node, path);
    }
    if (Node.isPropertyAccessExpression(node)) {
      return evalObjectMember(this, node.getExpression(), [node.getName()], path);
    }
    if (Node.isElementAccessExpression(node)) {
      const argument = node.getArgumentExpression();
      const names = argument === undefined ? [] : staticScalars(this, argument, new Set());
      return evalObjectMember(this, node.getExpression(), names.length > 0 ? names : undefined, path);
    }
    if (Node.isCallExpression(node)) {
      return this.evalCall(node, path);
    }
    if (Node.isObjectLiteralExpression(node)) {
      this.diagnose("opaque", node, "object value outside a join composer or static member access");
      return [];
    }
    if (Node.isNullLiteral(node) || Node.isNumericLiteral(node) || node.getKindName() === "TrueKeyword" || node.getKindName() === "FalseKeyword") {
      return [];
    }
    this.diagnose("opaque", node, `runtime ${node.getKindName()} class value`);
    return [];
  }

  private evalCall(node: import("ts-morph").CallExpression, path: Set<Node>): StaticValue[] {
    const composer = this.composers.composerOf(node.getExpression());
    if (composer !== undefined && composer !== "tv-factory" && composer !== "join-factory") {
      return evalComposerCall(this, node, composer, path);
    }
    const variant = this.evalVariantResult(node, path);
    if (variant !== undefined) {
      return variant;
    }
    const trimmed = this.evalStringTrim(node, path);
    if (trimmed !== undefined) {
      return trimmed;
    }
    this.diagnose("opaque", node, "runtime call result");
    return [];
  }

  evalVariantResult(node: import("ts-morph").CallExpression, path: Set<Node>): StaticValue[] | undefined {
    const definitions = this.variants.definitionsOf(node.getExpression());
    return definitions.length === 0 ? undefined : dedupeValues(definitions.flatMap((definition) => evalComposerCall(this, definition, "tv", path)));
  }

  /** String trimming is value-preserving for class provenance. On a mixed runtime template only the
   * leading edge is knowable; trailing whitespace may become an internal separator once the tail lands. */
  private evalStringTrim(node: import("ts-morph").CallExpression, path: Set<Node>): StaticValue[] | undefined {
    const expression = node.getExpression();
    if (!Node.isPropertyAccessExpression(expression) || node.getArguments().length > 0) {
      return;
    }
    const operation = expression.getName();
    if (operation !== "trim" && operation !== "trimStart" && operation !== "trimEnd") {
      return;
    }
    const receiver = expression.getExpression();
    const type = receiver.getType();
    const stringReceiver =
      type.isString() || type.isStringLiteral() || (type.isUnion() && type.getUnionTypes().every((member) => member.isString() || member.isStringLiteral()));
    if (!stringReceiver) {
      return;
    }
    const prefixStart = this.runtimePrefixes.length;
    const values = this.evalClass(receiver, path);
    for (let index = prefixStart; index < this.runtimePrefixes.length; index += 1) {
      const prefix = this.runtimePrefixes[index];
      if (prefix === undefined || operation === "trimEnd") {
        continue;
      }
      const trimmedStart = prefix.prefix.trimStart();
      const start = prefix.prefix.length - trimmedStart.length;
      const sliced = sliceStaticValue({ value: prefix.prefix, segments: prefix.segments }, start, prefix.prefix.length);
      this.runtimePrefixes[index] = { prefix: sliced.value, segments: sliced.segments };
    }
    return values.map((value) => {
      const start = operation === "trimEnd" ? 0 : value.value.length - value.value.trimStart().length;
      const end = operation === "trimStart" ? value.value.length : value.value.trimEnd().length;
      return sliceStaticValue(value, start, end);
    });
  }

  private evalTemplate(node: import("ts-morph").TemplateExpression, path: Set<Node>): StaticValue[] {
    const headText = node.getHead().getLiteralText();
    let values: StaticValue[] = [this.templatePart(node.getHead(), headText)];
    for (const span of node.getTemplateSpans()) {
      const substitutions = this.templateSubstitutions(span.getExpression(), path, values);
      if (substitutions.length === 0) {
        return [];
      }
      values = this.product(values, substitutions);
      values = values.map((value) => combine(value, this.templatePart(span.getLiteral(), span.getLiteral().getLiteralText())));
    }
    return values;
  }

  private templateSubstitutions(expression: Node, path: Set<Node>, prefixes: readonly StaticValue[]): StaticValue[] {
    const beforeOpaque = this.opaqueEvents;
    const beforeUnresolved = this.unresolvedEvents;
    const substitutions = this.evalClass(expression, path);
    if (substitutions.length > 0) {
      if (this.opaqueEvents > beforeOpaque) {
        for (const prefix of prefixes) {
          this.addRuntimePrefix(prefix);
        }
      }
      return substitutions;
    }
    if (this.opaqueEvents > beforeOpaque) {
      for (const prefix of prefixes) {
        this.addRuntimePrefix(prefix);
      }
    } else if (this.unresolvedEvents === beforeUnresolved) {
      this.diagnose("opaque", expression, "runtime template substitution");
      for (const prefix of prefixes) {
        this.addRuntimePrefix(prefix);
      }
    }
    return [];
  }

  private templatePart(node: Node, value: string): StaticValue {
    return {
      value,
      segments: value.length === 0 ? [] : [{ node, valueStart: 0, valueEnd: value.length, sourceStart: node.getStart() + 1 }],
    };
  }

  private addRuntimePrefix(prefix: StaticValue): void {
    if (prefix.value.length === 0) {
      return;
    }
    this.runtimePrefixes.push({ prefix: prefix.value, segments: prefix.segments });
  }

  private product(left: readonly StaticValue[], right: readonly StaticValue[]): StaticValue[] {
    return dedupeValues(left.flatMap((a) => right.map((b) => combine(a, b))));
  }

  evalIdentifier = (node: import("ts-morph").Identifier, path: Set<Node>): StaticValue[] => {
    const declarations = this.identifierDeclarations(node);
    if (declarations.length === 0) {
      const stable = resolveStableExpression(node);
      if (stable.kind === "resolved" && stable.value.compilerNode !== node.compilerNode) {
        return this.evalClass(stable.value, path);
      }
      this.diagnose("opaque", node, "runtime identifier");
      return [];
    }
    return dedupeValues(declarations.flatMap((declaration) => this.evalDeclaration(declaration, path)));
  };

  private evalDeclaration(declaration: Node, path: Set<Node>): StaticValue[] {
    if (Node.isVariableDeclaration(declaration)) {
      return this.evalVariable(declaration, path);
    }
    if (Node.isBindingElement(declaration)) {
      return this.evalBinding(declaration, path);
    }
    if (Node.isPropertyAssignment(declaration)) {
      const initializer = declaration.getInitializer();
      return initializer === undefined ? [] : this.evalClass(initializer, path);
    }
    if (Node.isShorthandPropertyAssignment(declaration)) {
      return this.evalIdentifier(declaration.getNameNode(), path);
    }
    return this.evalModuleDeclaration(declaration, path);
  }

  private evalVariable(declaration: import("ts-morph").VariableDeclaration, path: Set<Node>): StaticValue[] {
    const statement = declaration.getVariableStatement();
    if (statement !== undefined && statement.getDeclarationKind() !== VariableDeclarationKind.Const) {
      this.diagnose("unresolved", declaration, "mutable class binding");
      return [];
    }
    const initializer = declaration.getInitializer();
    if (initializer === undefined) {
      this.diagnose("opaque", declaration, "declared runtime class binding");
      return [];
    }
    return this.evalClass(initializer, path);
  }

  private evalBinding(binding: import("ts-morph").BindingElement, path: Set<Node>): StaticValue[] {
    const variable = binding.getFirstAncestor(Node.isVariableDeclaration);
    if (variable !== undefined) {
      const initializer = variable.getInitializer();
      if (initializer === undefined) {
        this.diagnose("opaque", binding, "runtime destructured class binding");
        return [];
      }
      const name = binding.getPropertyNameNode()?.getText() ?? binding.getNameNode().getText();
      return evalObjectMember(this, initializer, [name], path);
    }
    const jsxValues = this.jsxBindings.values(this, binding, path);
    if (jsxValues !== undefined) {
      return dedupeValues(jsxValues);
    }
    this.diagnose("opaque", binding, "runtime parameter or destructured class binding");
    return [];
  }

  private evalModuleDeclaration(declaration: Node, path: Set<Node>): StaticValue[] {
    if (Node.isImportSpecifier(declaration)) {
      return this.evalImport(
        {
          from: declaration.getSourceFile(),
          moduleName: declaration.getImportDeclaration().getModuleSpecifierValue(),
          imported: declaration.getNameNode().getText(),
          anchor: declaration,
        },
        path,
      );
    }
    if (Node.isExportSpecifier(declaration)) {
      return this.evalExportSpecifier(declaration, path);
    }
    if (Node.isExportAssignment(declaration)) {
      return this.evalClass(declaration.getExpression(), path);
    }
    if (declaration.getKindName() === "ImportClause") {
      const importDeclaration = declaration.getFirstAncestor(Node.isImportDeclaration) as ImportDeclaration | undefined;
      return importDeclaration === undefined
        ? []
        : this.evalImport(
            { from: declaration.getSourceFile(), moduleName: importDeclaration.getModuleSpecifierValue(), imported: "default", anchor: declaration },
            path,
          );
    }
    if (Node.isParameterDeclaration(declaration)) {
      this.diagnose("opaque", declaration, "runtime parameter class value");
      return [];
    }
    this.diagnose("opaque", declaration, `runtime ${declaration.getKindName()} declaration`);
    return [];
  }

  private evalImport(target: ImportTarget, path: Set<Node>): StaticValue[] {
    const source = importedSource(this.sourceIndex, target.from, target.moduleName);
    const declarations =
      source === undefined ? this.workspaceImportDeclarations(target.anchor) : exportedDeclarations(this.sourceIndex, source, target.imported);
    if (source === undefined && declarations.length === 0) {
      this.diagnose("opaque", target.anchor, `external class value import from ${target.moduleName}`);
      return [];
    }
    if (declarations.length === 0) {
      this.diagnose("unresolved", target.anchor, `imported class value ${target.imported} has no resolved export`);
      return [];
    }
    return dedupeValues(declarations.flatMap((declaration) => this.evalDeclaration(declaration, path)));
  }

  /** Resolve package-export and package-import aliases only when TypeScript lands on a source file in this
   * collector's admitted workspace set. Third-party declarations remain opaque. */
  private workspaceImportDeclarations(anchor: Node): readonly Node[] {
    const key = `${anchor.getSourceFile().getFilePath()}:${anchor.getStart()}`;
    const cached = this.importDefinitionCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    let identifier: import("ts-morph").Identifier | undefined;
    if (Node.isImportSpecifier(anchor)) {
      const name = anchor.getNameNode();
      identifier = Node.isIdentifier(name) ? name : undefined;
    } else if (anchor.getKindName() === "ImportClause") {
      identifier = (anchor as ImportClause).getDefaultImport();
    }
    const declarations = uniqueNodes(
      (identifier?.getDefinitions() ?? []).flatMap((definition) => {
        const declaration = definition.getDeclarationNode();
        return declaration !== undefined && this.sourceSet.has(declaration.getSourceFile()) ? [declaration] : [];
      }),
    );
    this.importDefinitionCache.set(key, declarations);
    return declarations;
  }

  private evalExportSpecifier(specifier: import("ts-morph").ExportSpecifier, path: Set<Node>): StaticValue[] {
    const moduleName = specifier.getExportDeclaration().getModuleSpecifierValue();
    const imported = specifier.getNameNode().getText();
    if (moduleName !== undefined) {
      return this.evalImport({ from: specifier.getSourceFile(), moduleName, imported, anchor: specifier }, path);
    }
    const targets = localDeclarations(specifier.getSourceFile(), imported).filter((target) => target !== specifier);
    return dedupeValues(targets.flatMap((target) => this.evalDeclaration(target, path)));
  }

  identifierDeclarations = (node: import("ts-morph").Identifier): Node[] => {
    const direct = node.getSymbol()?.getDeclarations() ?? [];
    return uniqueNodes(direct).filter(
      (declaration) => declaration !== node && !(Node.isShorthandPropertyAssignment(declaration) && declaration.getNameNode().getStart() === node.getStart()),
    );
  };

  propertyName(node: Node, path: Set<Node>): string | undefined {
    return propertyName(this, node, path);
  }

  resolveObjects(node: Node, path: Set<Node>): import("ts-morph").ObjectLiteralExpression[] {
    return resolveObjects(this, node, path);
  }
}
