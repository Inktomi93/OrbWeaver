import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import type { OrbRuleContext, Source } from "./syntax.ts";

export function isValueWrapper(
  node: TSESTree.Node | undefined,
): node is TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression | TSESTree.TSNonNullExpression | TSESTree.TSTypeAssertion {
  return node?.type === "TSAsExpression" || node?.type === "TSSatisfiesExpression" || node?.type === "TSNonNullExpression" || node?.type === "TSTypeAssertion";
}

export const unwrapTsValue = (node: TSESTree.Node): TSESTree.Node => {
  let current = node;
  while (isValueWrapper(current)) {
    current = current.expression;
  }
  return current;
};

export const STATIC_CONST_DEPTH = 8;

const variableNamed = (scope: TSESLint.Scope.Scope | null, name: string): TSESLint.Scope.Variable | undefined =>
  scope === null ? undefined : (scope.set.get(name) ?? variableNamed(scope.upper, name));

const STABLE_DECLARATION_KINDS = new Set(["const", "let"]);

export function constantInitializer(context: OrbRuleContext, identifier: TSESTree.Identifier): TSESTree.Expression | undefined {
  const variable = variableNamed(context.sourceCode.getScope(identifier), identifier.name);
  const definition = variable?.defs.at(0);
  const declared =
    variable?.defs.length === 1 &&
    definition?.type === "Variable" &&
    STABLE_DECLARATION_KINDS.has(definition.parent.kind) &&
    definition.node.id.type === "Identifier";
  const unwritten = declared && variable.references.every((reference) => !reference.isWrite() || reference.init === true);
  return unwritten && definition.node.init ? definition.node.init : undefined;
}

const SIGNED = new Map([
  ["-", (value: number): number => -value],
  ["+", (value: number): number => value],
]);

const joinStatic = (left: string | number | undefined, right: string | number): string | number =>
  typeof left === "number" && typeof right === "number" ? left + right : `${left}${right}`;

export function staticTextValue(context: OrbRuleContext, node: TSESTree.Node, depth = 0): string | number | undefined {
  const expression = unwrapTsValue(node);
  const next = (child: TSESTree.Node): string | number | undefined => staticTextValue(context, child, depth + 1);
  switch (expression.type) {
    case "Literal":
      return typeof expression.value === "string" || typeof expression.value === "number" ? expression.value : undefined;
    case "TemplateLiteral":
      return staticTemplateValue(expression, next);
    case "UnaryExpression": {
      const operand = next(expression.argument);
      const sign = SIGNED.get(expression.operator);
      return typeof operand === "number" && sign !== undefined ? sign(operand) : undefined;
    }
    case "BinaryExpression":
      return staticBinaryValue(expression, next);
    case "Identifier": {
      const initializer = depth >= STATIC_CONST_DEPTH ? undefined : constantInitializer(context, expression);
      return initializer === undefined ? undefined : next(initializer);
    }
    default:
      return undefined;
  }
}

const spelledName = (value: TSESTree.Literal["value"] | undefined): string | undefined => (value === undefined ? undefined : String(value));

export function accessedName(context: OrbRuleContext, member: TSESTree.MemberExpression): string | undefined {
  const { property } = member;
  if (!member.computed) {
    return property.type === "Identifier" ? property.name : undefined;
  }
  return spelledName(staticTextValue(context, property));
}

export function isStyleMember(context: OrbRuleContext, node: TSESTree.Node): boolean {
  const member = unwrapTsValue(node);
  return member.type === "MemberExpression" && accessedName(context, member) === "style";
}

export function staticKeyName(context: OrbRuleContext, property: TSESTree.Property): string | undefined {
  const { key } = property;
  if (property.computed) {
    return spelledName(staticTextValue(context, key));
  }
  return key.type === "Identifier" ? key.name : spelledName((key as TSESTree.Literal).value);
}

export function contextLiteral(node: TSESTree.Node | null | undefined): string | null | undefined {
  let value = node;
  while (value?.type === "TSAsExpression" || value?.type === "TSSatisfiesExpression" || value?.type === "TSNonNullExpression") {
    value = value.expression;
  }
  if (value?.type === "Literal" && typeof value.value === "string") {
    return value.value;
  }
  return value?.type === "TemplateLiteral" && value.expressions.length === 0 ? (value.quasis[0] as TSESTree.TemplateElement).value.cooked : undefined;
}

export function contextDirectArgument(call: TSESTree.CallExpression, argument: TSESTree.CallExpressionArgument, sourceCode: Source): boolean {
  const index = call.arguments.indexOf(argument);
  const before = sourceCode.getTokenBefore(argument);
  return index === 0
    ? before === sourceCode.getTokenAfter(call.typeArguments ?? call.callee, { filter: (token) => token.value !== "?." })
    : index > 0 && (before as TSESTree.Token).value === ",";
}

export function staticMemberName(member: TSESTree.Node): string | null | undefined {
  if (member.type !== "MemberExpression") {
    return;
  }
  if (!member.computed) {
    return member.property.type === "Identifier" ? member.property.name : undefined;
  }
  if (member.property.type === "Literal" && typeof member.property.value === "string") {
    return member.property.value;
  }
  return member.property.type === "TemplateLiteral" && member.property.expressions.length === 0
    ? (member.property.quasis[0] as TSESTree.TemplateElement).value.cooked
    : undefined;
}

function staticTemplateValue(expression: TSESTree.TemplateLiteral, next: (node: TSESTree.Node) => string | number | undefined): string | undefined {
  const parts = expression.expressions.map(next);
  return parts.includes(undefined) ? undefined : expression.quasis.map((quasi, index) => quasi.value.cooked + String(parts[index] ?? "")).join("");
}
function staticBinaryValue(expression: TSESTree.BinaryExpression, next: (node: TSESTree.Node) => string | number | undefined): string | number | undefined {
  const left = expression.operator === "+" ? next(expression.left) : undefined;
  const right = left === undefined ? undefined : next(expression.right);
  return right === undefined ? undefined : joinStatic(left, right);
}
