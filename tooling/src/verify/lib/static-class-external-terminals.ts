// Exact external class writers that do not expose a JSX className root. Each terminal proves the
// package import and the package-specific argument path before asking the shared evaluator for values.
import type { CallExpression, Identifier, Node as MorphNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { StaticValue } from "./static-class-expression-model.ts";
import { unwrap } from "./static-class-expression-model.ts";
import { findObjectProperties } from "./static-class-object.ts";
import type { StaticClassEvaluator } from "./static-class-value.ts";

const LUCIDE_MODULE = "lucide-react";
const LUCIDE_FACTORY = "createLucideIcon";

function isLucideFactory(call: CallExpression): boolean {
  const callee = unwrap(call.getExpression());
  const source = call.getSourceFile();
  if (Node.isIdentifier(callee)) {
    return source
      .getImportDeclarations()
      .some(
        (declaration) =>
          declaration.getModuleSpecifierValue() === LUCIDE_MODULE &&
          declaration
            .getNamedImports()
            .some(
              (specifier) =>
                specifier.getNameNode().getText() === LUCIDE_FACTORY && (specifier.getAliasNode()?.getText() ?? LUCIDE_FACTORY) === callee.getText(),
            ),
      );
  }
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return false;
  }
  const receiver = unwrap(callee.getExpression());
  if (!Node.isIdentifier(receiver)) {
    return false;
  }
  const member = Node.isPropertyAccessExpression(callee)
    ? callee.getName()
    : callee
        .getArgumentExpression()
        ?.getText()
        .replace(/^['"]|['"]$/gu, "");
  return (
    member === LUCIDE_FACTORY &&
    source
      .getImportDeclarations()
      .some((declaration) => declaration.getModuleSpecifierValue() === LUCIDE_MODULE && declaration.getNamespaceImport()?.getText() === receiver.getText())
  );
}

function constDeclaration(identifier: Identifier): VariableDeclaration | undefined {
  const declarations = identifier
    .getDefinitionNodes()
    .filter(
      (node): node is VariableDeclaration =>
        Node.isVariableDeclaration(node) &&
        node.getSourceFile() === identifier.getSourceFile() &&
        node.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const,
    );
  return declarations.length === 1 ? declarations[0] : undefined;
}

function contains(root: MorphNode, child: MorphNode): boolean {
  let current: MorphNode | undefined = child;
  while (current !== undefined) {
    if (current === root) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

interface ArrayResolution {
  readonly elements: MorphNode[];
  readonly declarations: Set<VariableDeclaration>;
}

function resolveArrayLiteral(
  evaluator: StaticClassEvaluator,
  node: import("ts-morph").ArrayLiteralExpression,
  path: Set<MorphNode>,
): ArrayResolution | undefined {
  const elements: MorphNode[] = [];
  const declarations = new Set<VariableDeclaration>();
  for (const element of node.getElements()) {
    if (!Node.isSpreadElement(element)) {
      elements.push(element);
      continue;
    }
    const spread = resolveArray(evaluator, element.getExpression(), path);
    if (spread === undefined) {
      evaluator.diagnose("opaque", element, "unknown spread in lucide IconNode array");
      return;
    }
    elements.push(...spread.elements);
    for (const declaration of spread.declarations) {
      declarations.add(declaration);
    }
  }
  return { elements, declarations };
}

function resolveArray(evaluator: StaticClassEvaluator, raw: MorphNode, path: Set<MorphNode>): ArrayResolution | undefined {
  const node = unwrap(raw);
  if (path.has(node)) {
    evaluator.diagnose("unresolved", node, "lucide IconNode array cycle");
    return;
  }
  path.add(node);
  try {
    if (Node.isArrayLiteralExpression(node)) {
      return resolveArrayLiteral(evaluator, node, path);
    }
    if (!Node.isIdentifier(node)) {
      evaluator.diagnose("opaque", node, "runtime lucide IconNode array");
      return;
    }
    const declaration = constDeclaration(node);
    const initializer = declaration?.getInitializer();
    if (declaration === undefined || initializer === undefined) {
      evaluator.diagnose("opaque", node, "lucide IconNode array is not a local const");
      return;
    }
    const resolved = resolveArray(evaluator, initializer, path);
    if (resolved === undefined) {
      return;
    }
    resolved.declarations.add(declaration);
    return resolved;
  } finally {
    path.delete(node);
  }
}

function referenceUse(reference: MorphNode): "alias" | "push" | "read" | "unknown" {
  let node: MorphNode = reference;
  let parent = node.getParent();
  while (parent !== undefined && unwrap(parent) === node) {
    node = parent;
    parent = node.getParent();
  }
  if (
    parent !== undefined &&
    Node.isVariableDeclaration(parent) &&
    parent.getInitializer() !== undefined &&
    contains(parent.getInitializerOrThrow(), reference)
  ) {
    return parent.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const ? "alias" : "unknown";
  }
  if (parent !== undefined && Node.isPropertyAccessExpression(parent) && parent.getExpression() === node && parent.getName() === "push") {
    return "push";
  }
  const call = reference.getFirstAncestorByKind(SyntaxKind.CallExpression);
  if (call !== undefined && isLucideFactory(call) && call.getArguments()[1] !== undefined && contains(call.getArguments()[1] as MorphNode, reference)) {
    return "read";
  }
  return "unknown";
}

interface ReferenceResult {
  readonly alias?: VariableDeclaration;
  readonly pushed: MorphNode[];
  readonly valid: boolean;
}

function inspectReference(evaluator: StaticClassEvaluator, reference: MorphNode): ReferenceResult {
  const use = referenceUse(reference);
  if (use === "read") {
    return { pushed: [], valid: true };
  }
  if (use === "alias") {
    const alias = reference.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    return alias === undefined ? { pushed: [], valid: false } : { alias, pushed: [], valid: true };
  }
  if (use === "push") {
    const access = reference.getParentIfKind(SyntaxKind.PropertyAccessExpression);
    const call = access?.getParentIfKind(SyntaxKind.CallExpression);
    if (call === undefined || call.getArguments().some(Node.isSpreadElement)) {
      evaluator.diagnose("opaque", reference, "unknown spread or call shape in lucide IconNode push");
      return { pushed: [], valid: false };
    }
    return { pushed: [...call.getArguments()], valid: true };
  }
  evaluator.diagnose("opaque", reference, "unknown lucide IconNode array use or mutation");
  return { pushed: [], valid: false };
}

function pushedElements(evaluator: StaticClassEvaluator, declarations: ReadonlySet<VariableDeclaration>): MorphNode[] | undefined {
  const elements: MorphNode[] = [];
  const pending = [...declarations];
  const seen = new Set<VariableDeclaration>();
  while (pending.length > 0) {
    const declaration = pending.pop();
    if (declaration === undefined || seen.has(declaration)) {
      continue;
    }
    seen.add(declaration);
    const name = declaration.getNameNode();
    if (!Node.isIdentifier(name)) {
      evaluator.diagnose("opaque", declaration, "destructured lucide IconNode array alias");
      return;
    }
    for (const reference of name.findReferencesAsNodes()) {
      const result = inspectReference(evaluator, reference);
      if (!result.valid) {
        return;
      }
      elements.push(...result.pushed);
      if (result.alias !== undefined) {
        pending.push(result.alias);
      }
    }
  }
  return elements;
}

function tupleClassValues(evaluator: StaticClassEvaluator, raw: MorphNode): StaticValue[] | undefined {
  const tuple = unwrap(raw);
  if (!Node.isArrayLiteralExpression(tuple)) {
    evaluator.diagnose("opaque", tuple, "lucide IconNode entry is not a static tuple");
    return;
  }
  const attributes = tuple.getElements()[1];
  if (attributes === undefined || Node.isSpreadElement(attributes)) {
    evaluator.diagnose("opaque", tuple, "lucide IconNode tuple has no static attributes at index 1");
    return;
  }
  const opaqueStart = evaluator.opaque.length;
  const unresolvedStart = evaluator.unresolved.length;
  const properties = findObjectProperties(evaluator, attributes, new Set(["className"]), new Set());
  if (evaluator.opaque.length > opaqueStart || evaluator.unresolved.length > unresolvedStart) {
    return;
  }
  return properties.flatMap((property) => evaluator.evalClass(property.value, new Set()));
}

/** Resolve className only at lucide-react's createLucideIcon(name, IconNode[]) terminal. */
export function evalLucideIconTerminal(evaluator: StaticClassEvaluator, call: CallExpression): StaticValue[] | undefined {
  if (!isLucideFactory(call)) {
    return;
  }
  const iconNodes = call.getArguments()[1];
  if (iconNodes === undefined) {
    evaluator.diagnose("unresolved", call, "createLucideIcon has no IconNode argument at index 1");
    return [];
  }
  const resolved = resolveArray(evaluator, iconNodes, new Set());
  if (resolved === undefined) {
    return [];
  }
  const pushed = pushedElements(evaluator, resolved.declarations);
  if (pushed === undefined) {
    return [];
  }
  const values: StaticValue[] = [];
  for (const entry of [...resolved.elements, ...pushed]) {
    const tupleValues = tupleClassValues(evaluator, entry);
    if (tupleValues === undefined) {
      return [];
    }
    values.push(...tupleValues);
  }
  return values;
}
