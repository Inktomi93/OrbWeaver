// At a fallback expression, the receiver's own initializer can prove that its two optional fields are
// alternative representations. Inputs arriving from outside the reader remain the construction report's question.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";
import type { TypeServices } from "./checker.ts";
import { requireTypeServices } from "./checker.ts";
import { lexicalVariable } from "./general.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

/** The explicit fields of a construction. A spread or computed property leaves the writer unknown. */
export function literalKeys(node: ts.Expression): readonly string[] | null {
  if (!ts.isObjectLiteralExpression(node)) {
    return null;
  }
  const keys: string[] = [];
  for (const property of node.properties) {
    const name = ts.isSpreadAssignment(property) ? undefined : property.name;
    if (name === undefined || !(ts.isIdentifier(name) || ts.isStringLiteralLike(name))) {
      return null;
    }
    keys.push(name.text);
  }
  return keys;
}

interface Read {
  readonly receiver: ts.VariableDeclaration | ts.ParameterDeclaration;
  readonly key: string;
}

function stableLocal(checker: ts.TypeChecker, receiver: ts.Identifier): ts.VariableDeclaration | ts.ParameterDeclaration | undefined {
  const declaration = checker.getSymbolAtLocation(receiver)?.valueDeclaration;
  if (declaration !== undefined && ts.isParameter(declaration)) {
    return declaration;
  }
  if (declaration === undefined || !ts.isVariableDeclaration(declaration) || !ts.isVariableDeclarationList(declaration.parent)) {
    return;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript NodeFlags is a compiler-owned bitfield.
  return (declaration.parent.flags & ts.NodeFlags.Const) === 0 ? undefined : declaration;
}

function read(checker: ts.TypeChecker, node: ts.Expression): Read | undefined {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const receiver = stableLocal(checker, node.expression);
    return receiver === undefined ? undefined : { receiver, key: node.name.text };
  }
  if (!ts.isIdentifier(node)) {
    return;
  }
  const binding = checker.getSymbolAtLocation(node)?.valueDeclaration;
  if (binding === undefined || !ts.isBindingElement(binding) || !ts.isObjectBindingPattern(binding.parent)) {
    return;
  }
  const owner = binding.parent.parent;
  const key = binding.propertyName ?? binding.name;
  if (!ts.isIdentifier(key)) {
    return;
  }
  if (ts.isParameter(owner)) {
    return { receiver: owner, key: key.text };
  }
  const init = ts.isVariableDeclaration(owner) ? owner.initializer : undefined;
  const receiver = init !== undefined && ts.isIdentifier(init) ? stableLocal(checker, init) : undefined;
  return receiver === undefined ? undefined : { receiver, key: key.text };
}

function optionalProperty(checker: ts.TypeChecker, owner: ts.Type, key: string, at: ts.Node): boolean {
  const field = owner.getProperty(key);
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  if (field === undefined || (field.flags & ts.SymbolFlags.Optional) === 0) {
    return false;
  }
  const value = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(field, at));
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return (value.flags & ts.TypeFlags.Never) === 0;
}

type Supplied = readonly (readonly string[] | null)[];

function produced(checker: ts.TypeChecker, node: ts.Expression | undefined, seen: ReadonlySet<ts.Node> = new Set()): Supplied {
  if (node === undefined || seen.has(node)) {
    return [null];
  }
  if (ts.isIdentifier(node)) {
    const source = stableLocal(checker, node);
    return source !== undefined && ts.isVariableDeclaration(source) ? produced(checker, source.initializer, new Set([...seen, node])) : [null];
  }
  if (ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) {
    return produced(checker, node.expression, seen);
  }
  return ts.isConditionalExpression(node) ? [...produced(checker, node.whenTrue, seen), ...produced(checker, node.whenFalse, seen)] : [literalKeys(node)];
}

function privateFunctionName(fn: ts.SignatureDeclaration): ts.Identifier | undefined {
  if (ts.isFunctionDeclaration(fn)) {
    return ts.getModifiers(fn)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true ? undefined : fn.name;
  }
  if (!((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name))) {
    return;
  }
  const statement = fn.parent.parent.parent;
  return ts.isVariableStatement(statement) && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) !== true
    ? fn.parent.name
    : undefined;
}

const MAX_JSX_ARMS = 16;

function suppliedAt(services: TypeServices, node: ts.Node, index: number): Supplied {
  const parent = node.parent;
  if (ts.isCallExpression(parent) && parent.expression === node && !parent.arguments.some(ts.isSpreadElement)) {
    return produced(services.checker, parent.arguments[index]);
  }
  if (ts.isJsxClosingElement(parent)) {
    return [];
  }
  if (index !== 0 || !(ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) || parent.tagName !== node) {
    return [null];
  }
  let arms: Supplied = [[]];
  for (const prop of parent.attributes.properties) {
    const keys = ts.isJsxSpreadAttribute(prop) ? produced(services.checker, prop.expression) : [[prop.name.getText()]];
    arms = arms.flatMap((arm) => keys.map((part) => (arm === null || part === null ? null : [...arm, ...part])));
    if (arms.length > MAX_JSX_ARMS) {
      return [null];
    }
  }
  return arms;
}

function incoming(context: OrbRuleContext, services: TypeServices, parameter: ts.ParameterDeclaration): Supplied {
  const fn = parameter.parent;
  const name = privateFunctionName(fn);
  if (name === undefined) {
    return [null];
  }
  const esName = services.tsNodeToESTreeNodeMap.get(name);
  if (esName.type !== AST_NODE_TYPES.Identifier) {
    return [null];
  }
  const variable = lexicalVariable(context, esName);
  const index = fn.parameters.indexOf(parameter);
  return (variable?.references ?? [])
    .filter((ref) => ref.isRead())
    .flatMap((ref) => suppliedAt(services, services.esTreeNodeToTSNodeMap.get(ref.identifier), index));
}

function alternatives(context: OrbRuleContext, services: TypeServices, first: ts.Expression, second: ts.Expression): boolean {
  const { checker } = services;
  const a = read(checker, first);
  const b = read(checker, second);
  if (a === undefined || b === undefined || a.key === b.key || a.receiver !== b.receiver) {
    return false;
  }
  const arms = ts.isParameter(a.receiver) ? incoming(context, services, a.receiver) : produced(checker, a.receiver.initializer);
  if (
    arms.some((keys) => keys === null || (keys.includes(a.key) && keys.includes(b.key))) ||
    !arms.some((keys) => keys?.includes(a.key) === true) ||
    !arms.some((keys) => keys?.includes(b.key) === true)
  ) {
    return false;
  }
  const owner = checker.getNonNullableType(checker.getTypeAtLocation(a.receiver.name));
  return (owner.isUnion() ? owner.types : [owner]).some(
    (arm) => optionalProperty(checker, arm, a.key, a.receiver) && optionalProperty(checker, arm, b.key, a.receiver),
  );
}

const MESSAGE =
  "This receiver is constructed in opposite arms and its reader selects one field. Use a discriminated union or forbid the other field in each arm.";

function presence(node: ts.Expression): ts.Expression {
  return ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    (node.right.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(node.right) && node.right.text === "undefined"))
    ? node.left
    : node;
}

export const optionalAlternativesRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const services = requireTypeServices(context);
    const toTs = services.esTreeNodeToTSNodeMap;
    return {
      "LogicalExpression[operator]"(node: TSESTree.LogicalExpression): void {
        const expression = toTs.get(node);
        if ((node.operator === "??" || node.operator === "||") && alternatives(context, services, expression.left, expression.right)) {
          context.report({ node, message: MESSAGE });
        }
      },
      "IfStatement[alternate.type='IfStatement']"(node: TSESTree.IfStatement): void {
        const branch = toTs.get(node);
        if (
          branch.elseStatement !== undefined &&
          ts.isIfStatement(branch.elseStatement) &&
          alternatives(context, services, presence(branch.expression), presence(branch.elseStatement.expression))
        ) {
          context.report({ node: node.test, message: MESSAGE });
        }
      },
    };
  },
};
