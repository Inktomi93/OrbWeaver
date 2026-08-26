// E7 stays review-tier: this census proves only the narrow, enumerable Button/Switch shape. It records exact
// controls and mechanically classifies direct/derived pending guards; it does not accuse every unresolved
// expression of being unsafe or mint markers that would launder the migration.
import type {
  ArrowFunction,
  Expression,
  FunctionDeclaration,
  FunctionExpression,
  JsxOpeningLikeElement,
  MethodDeclaration,
  Node as MorphNode,
  Project,
  SourceFile,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { PendingGuardCensus, PendingGuardClassification, PendingGuardReceipt } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm review:mirror");

const CONTROLS = new Set(["Button", "Switch"]);
const MUTATIONS = new Set(["mutate", "mutateAsync"]);
const HANDLER_PROPS = new Map([
  ["Button", "onClick"],
  ["Switch", "onCheckedChange"],
]);
const MAX_RESOLUTION_DEPTH = 8;
const GENERATION_COMPARISON_TOKENS = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.LessThanToken,
  SyntaxKind.LessThanEqualsToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.GreaterThanEqualsToken,
]);
type FunctionNode = ArrowFunction | FunctionDeclaration | FunctionExpression | MethodDeclaration;

function jsxElements(source: SourceFile): readonly JsxOpeningLikeElement[] {
  return [...source.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...source.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
}

function attributeExpression(element: JsxOpeningLikeElement, name: string): Expression | undefined {
  const attribute = element.getAttributes().find((candidate) => Node.isJsxAttribute(candidate) && candidate.getNameNode().getText() === name);
  if (!Node.isJsxAttribute(attribute)) {
    return;
  }
  const initializer = attribute.getInitializer();
  if (!Node.isJsxExpression(initializer)) {
    return;
  }
  return initializer.getExpression();
}

function localHandler(expression: Expression, source: SourceFile): FunctionNode | undefined {
  if (Node.isArrowFunction(expression) || Node.isFunctionExpression(expression)) {
    return expression;
  }
  if (!Node.isIdentifier(expression)) {
    return;
  }
  for (const definition of expression.getDefinitions()) {
    const declaration = definition.getDeclarationNode();
    if (declaration?.getSourceFile() !== source) {
      continue;
    }
    if (Node.isFunctionDeclaration(declaration)) {
      return declaration;
    }
    if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer();
      if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) {
        return initializer;
      }
    }
  }
  // biome-ignore lint/complexity/noUselessUndefined: tooling/tsconfig enables noImplicitReturns.
  return undefined;
}

function isFunctionNode(node: MorphNode | undefined): node is FunctionNode {
  return Node.isArrowFunction(node) || Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node);
}

function ownerFunction(node: MorphNode): FunctionNode | undefined {
  return node.getFirstAncestor(isFunctionNode);
}

function mutationNames(handler: FunctionNode): readonly string[] {
  const found = new Set<string>();
  for (const call of handler.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (ownerFunction(call) !== handler) {
      continue;
    }
    const callee = call.getExpression();
    if (Node.isPropertyAccessExpression(callee) && MUTATIONS.has(callee.getName())) {
      found.add(callee.getName());
    }
  }
  return [...found].sort();
}

function functionName(node: FunctionNode | undefined): string | undefined {
  if (node === undefined) {
    return;
  }
  if (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node)) {
    const name = node.getName();
    if (name !== undefined) {
      return name;
    }
  }
  const variable = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return variable?.getName();
}

function handlerName(handler: FunctionNode): string {
  return functionName(handler) ?? `<inline:${handler.getStartLineNumber().toString()}>`;
}

function hasPendingIdentity(expression: Expression): boolean {
  if (Node.isIdentifier(expression) && expression.getText() === "isPending") {
    return true;
  }
  if (Node.isPropertyAccessExpression(expression) && expression.getName() === "isPending") {
    return true;
  }
  return expression
    .getDescendants()
    .some((node) => (Node.isIdentifier(node) && node.getText() === "isPending") || (Node.isPropertyAccessExpression(node) && node.getName() === "isPending"));
}

function pendingThroughIdentifier(identifier: MorphNode, source: SourceFile, depth: number, seen: Set<string>): boolean {
  if (!Node.isIdentifier(identifier)) {
    return false;
  }
  const key = `${source.getFilePath()}:${identifier.getText()}:${identifier.getStart().toString()}`;
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  return identifier.getDefinitions().some((definition) => {
    const declaration = definition.getDeclarationNode();
    if (!Node.isVariableDeclaration(declaration) || declaration.getSourceFile() !== source) {
      return false;
    }
    const initializer = declaration.getInitializer();
    return initializer !== undefined && pendingThroughLocals(initializer, depth + 1, seen);
  });
}

function pendingThroughLocals(expression: Expression, depth: number, seen: Set<string>): boolean {
  if (hasPendingIdentity(expression)) {
    return true;
  }
  if (depth >= MAX_RESOLUTION_DEPTH) {
    return false;
  }
  const identifiers = Node.isIdentifier(expression) ? [expression] : expression.getDescendantsOfKind(SyntaxKind.Identifier);
  return identifiers.some((identifier) => pendingThroughIdentifier(identifier, expression.getSourceFile(), depth, seen));
}

function exits(node: MorphNode): boolean {
  if (Node.isReturnStatement(node) || Node.isThrowStatement(node)) {
    return true;
  }
  if (Node.isBlock(node)) {
    return node.getStatements().some(exits);
  }
  if (Node.isIfStatement(node)) {
    const alternate = node.getElseStatement();
    return alternate !== undefined && exits(node.getThenStatement()) && exits(alternate);
  }
  return false;
}

function generationAdmissionGuard(handler: FunctionNode): boolean {
  return handler.getDescendantsOfKind(SyntaxKind.IfStatement).some((statement) => {
    if (ownerFunction(statement) !== handler || !exits(statement.getThenStatement())) {
      return false;
    }
    const condition = statement.getExpression();
    if (!Node.isBinaryExpression(condition)) {
      return false;
    }
    if (!GENERATION_COMPARISON_TOKENS.has(condition.getOperatorToken().getKind())) {
      return false;
    }
    const left = condition.getLeft();
    const right = condition.getRight();
    const identity = (node: MorphNode): boolean => Node.isIdentifier(node) || Node.isPropertyAccessExpression(node);
    return identity(left) && identity(right) && left.getText() !== right.getText();
  });
}

function classification(disabled: Expression | undefined, handler: FunctionNode): PendingGuardClassification {
  if (disabled === undefined) {
    return generationAdmissionGuard(handler) ? "epoch" : "missing";
  }
  if (hasPendingIdentity(disabled)) {
    return "direct-pending";
  }
  if (pendingThroughLocals(disabled, 0, new Set())) {
    return "derived-pending";
  }
  return generationAdmissionGuard(handler) ? "epoch" : "other-guard";
}

function receipt(source: SourceFile, root: string, element: JsxOpeningLikeElement): PendingGuardReceipt | undefined {
  const control = element.getTagNameNode().getText();
  if (!CONTROLS.has(control)) {
    return;
  }
  const handlerExpression = attributeExpression(element, HANDLER_PROPS.get(control) ?? "");
  if (handlerExpression === undefined) {
    return;
  }
  const handler = localHandler(handlerExpression, source);
  if (handler === undefined) {
    return;
  }
  const mutations = mutationNames(handler);
  if (mutations.length === 0) {
    return;
  }
  const disabled = attributeExpression(element, "disabled");
  const component = functionName(ownerFunction(handler)) ?? functionName(handler) ?? "<module>";
  const path = source.getFilePath().replace(`${root}/`, "");
  return {
    path,
    line: element.getStartLineNumber(),
    component,
    control: control as "Button" | "Switch",
    handler: handlerName(handler),
    mutations,
    disabled: disabled?.getText() ?? null,
    classification: classification(disabled, handler),
  };
}

export function censusPendingGuards(project: Project, root: string): PendingGuardCensus {
  const sources = project
    .getSourceFiles()
    .filter((source) => source.getFilePath().startsWith(`${root}/packages/client/src/`) && source.getFilePath().endsWith(".tsx"));
  const rows = sources.flatMap((source) => jsxElements(source).flatMap((element) => receipt(source, root, element) ?? []));
  const totals: Record<PendingGuardClassification, number> = {
    "direct-pending": 0,
    "derived-pending": 0,
    epoch: 0,
    missing: 0,
    "other-guard": 0,
  };
  for (const row of rows) {
    totals[row.classification] += 1;
  }
  return {
    scannedTsx: sources.length,
    directControls: rows.length,
    reviewResiduals: totals.missing + totals["other-guard"] + totals.epoch,
    rows,
    totals,
  };
}
