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
const EPOCH_RE = /(?:epoch|sequence|requestId|requestToken|generation)/iu;
const MAX_RESOLUTION_DEPTH = 8;
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

function pendingThroughLocals(expression: Expression, depth: number, seen: Set<string>): boolean {
  if (expression.getText().includes("isPending")) {
    return true;
  }
  if (depth >= MAX_RESOLUTION_DEPTH) {
    return false;
  }
  const identifiers = Node.isIdentifier(expression) ? [expression] : expression.getDescendantsOfKind(SyntaxKind.Identifier);
  for (const identifier of identifiers) {
    const key = `${identifier.getSourceFile().getFilePath()}:${identifier.getText()}:${identifier.getStart().toString()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    for (const definition of identifier.getDefinitions()) {
      const declaration = definition.getDeclarationNode();
      if (!Node.isVariableDeclaration(declaration)) {
        continue;
      }
      const initializer = declaration.getInitializer();
      if (initializer !== undefined && pendingThroughLocals(initializer, depth + 1, seen)) {
        return true;
      }
    }
  }
  return false;
}

function classification(disabled: Expression | undefined, handler: FunctionNode): PendingGuardClassification {
  if (disabled === undefined) {
    return EPOCH_RE.test(handler.getText()) ? "epoch" : "missing";
  }
  if (disabled.getText().includes("isPending")) {
    return "direct-pending";
  }
  if (pendingThroughLocals(disabled, 0, new Set())) {
    return "derived-pending";
  }
  return EPOCH_RE.test(`${disabled.getText()}\n${handler.getText()}`) ? "epoch" : "other-guard";
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
  return { scannedTsx: sources.length, directControls: rows.length, rows, totals };
}
