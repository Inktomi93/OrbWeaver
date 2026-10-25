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

function destructuredValues(context: OrbRuleContext, node: TSESTree.Identifier, seen: Set<TSESTree.Node>): readonly TSESTree.Node[] {
  const variable = variableNamed(context.sourceCode.getScope(node), node.name);
  const definition = variable?.defs[0];
  if (
    definition?.type !== "Variable" ||
    definition.node.id.type !== "ObjectPattern" ||
    definition.node.init === null ||
    !STABLE_DECLARATION_KINDS.has(definition.parent.kind) ||
    variable?.references.some((reference) => reference.isWrite() && reference.init !== true) === true
  ) {
    return [];
  }
  const binding = definition.node.id.properties.find((property) => {
    if (property.type !== "Property") {
      return false;
    }
    const target = property.value.type === "AssignmentPattern" ? property.value.left : property.value;
    return target.type === "Identifier" && target.name === node.name;
  });
  const key = binding?.type === "Property" ? staticKeyName(context, binding) : undefined;
  if (key === undefined || binding?.type !== "Property") {
    return [];
  }
  const selected = objectProperties(context, definition.node.init, seen)
    .filter((property) => staticKeyName(context, property) === key)
    .flatMap((property) => valueBranches(context, property.value, seen));
  if (binding.value.type !== "AssignmentPattern") {
    return selected;
  }
  const fallback = binding.value.right;
  if (selected.length === 0) {
    return valueBranches(context, fallback, seen);
  }
  return selected.flatMap((value) => {
    const absent = (value.type === "Identifier" && value.name === "undefined") || (value.type === "UnaryExpression" && value.operator === "void");
    return absent ? valueBranches(context, fallback, new Set(seen)) : [value];
  });
}

function valueBranches(context: OrbRuleContext, node: TSESTree.Node, seen: Set<TSESTree.Node>): readonly TSESTree.Node[] {
  const value = unwrapTsValue(node);
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);
  const next = (child: TSESTree.Node): readonly TSESTree.Node[] => valueBranches(context, child, seen);
  switch (value.type) {
    case "Identifier": {
      const initializer = constantInitializer(context, value);
      if (initializer !== undefined) {
        return next(initializer);
      }
      const values = destructuredValues(context, value, seen);
      return values.length === 0 ? [value] : values;
    }
    case "ChainExpression":
      return next(value.expression);
    case "ConditionalExpression":
      return [...next(value.consequent), ...next(value.alternate)];
    case "LogicalExpression":
      return [...next(value.left), ...next(value.right)];
    case "MemberExpression": {
      const key = accessedName(context, value);
      return objectProperties(context, value.object, seen)
        .filter((property) => key === undefined || staticKeyName(context, property) === key)
        .flatMap((property) => next(property.value));
    }
    default:
      return [value];
  }
}

function objectProperties(context: OrbRuleContext, node: TSESTree.Node, seen: Set<TSESTree.Node>): readonly TSESTree.Property[] {
  return valueBranches(context, node, seen).flatMap((value) =>
    value.type === "ObjectExpression"
      ? value.properties.flatMap((property) => {
          if (property.type === "SpreadElement") {
            return objectProperties(context, property.argument, seen);
          }
          return property.kind === "init" && !property.method ? [property] : [];
        })
      : [],
  );
}

/** Local static objects and selected table members only; unresolved imports/calls are not invented values. */
export function staticObjectProperties(context: OrbRuleContext, node: TSESTree.Node): readonly TSESTree.Property[] {
  return objectProperties(context, node, new Set());
}

/** Possible values of a local static table selection, without following imports or executing calls. */
export function staticValueOptions(context: OrbRuleContext, node: TSESTree.Node): readonly TSESTree.Node[] {
  return valueBranches(context, node, new Set());
}

interface JsxProperty {
  readonly name: string;
  readonly node: TSESTree.Node;
  readonly value: TSESTree.Node | null;
}

/** Explicit JSX properties and the known properties of local static spreads share the same checks. */
export function jsxProperties(context: OrbRuleContext, element: TSESTree.JSXOpeningElement): readonly JsxProperty[] {
  return element.attributes.flatMap((attribute): JsxProperty[] => {
    if (attribute.type === "JSXSpreadAttribute") {
      return staticObjectProperties(context, attribute.argument).flatMap((property) => {
        const name = staticKeyName(context, property);
        return name === undefined ? [] : [{ name, node: property, value: property.value }];
      });
    }
    if (attribute.name.type !== "JSXIdentifier") {
      return [];
    }
    const expression = attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : attribute.value;
    return [{ name: attribute.name.name, node: attribute, value: expression?.type === "JSXEmptyExpression" ? null : expression }];
  });
}

interface ImportedSymbol {
  readonly source: string;
  readonly name: string;
}

function importedSpecifierName(specifier: TSESTree.Node): string | undefined {
  if (specifier.type === "ImportSpecifier") {
    return specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
  }
  if (specifier.type === "ImportNamespaceSpecifier") {
    return "*";
  }
  return specifier.type === "ImportDefaultSpecifier" ? "default" : undefined;
}

function destructuredImport(
  context: OrbRuleContext,
  declaration: TSESTree.VariableDeclarator,
  local: string,
  seen: Set<TSESTree.Node>,
): ImportedSymbol | undefined {
  if (declaration.id.type !== "ObjectPattern" || declaration.init === null) {
    return;
  }
  const namespace = importedSymbol(context, declaration.init, seen);
  const property = declaration.id.properties.find(
    (candidate) => candidate.type === "Property" && candidate.value.type === "Identifier" && candidate.value.name === local,
  );
  const name = property?.type === "Property" ? staticKeyName(context, property) : undefined;
  return namespace?.name === "*" && name !== undefined ? { source: namespace.source, name } : undefined;
}

function importedIdentifier(context: OrbRuleContext, node: TSESTree.Identifier | TSESTree.JSXIdentifier, seen: Set<TSESTree.Node>): ImportedSymbol | undefined {
  const definition = variableNamed(context.sourceCode.getScope(node), node.name)?.defs[0];
  if (definition?.type === "ImportBinding" && definition.parent.type === "ImportDeclaration") {
    const name = importedSpecifierName(definition.node);
    return name === undefined ? undefined : { source: definition.parent.source.value, name };
  }
  if (definition?.node.type === "TSTypeAliasDeclaration" && definition.node.typeAnnotation.type === "TSTypeReference") {
    return importedSymbol(context, definition.node.typeAnnotation.typeName, seen);
  }
  if (definition?.type !== "Variable") {
    return;
  }
  if (definition.node.id.type === "Identifier") {
    const initializer = constantInitializer(context, definition.node.id);
    return initializer === undefined ? undefined : importedSymbol(context, initializer, seen);
  }
  return destructuredImport(context, definition.node, node.name, seen);
}

/** Resolve a named import through local aliases and namespace selections, without loading another module. */
export function importedSymbol(context: OrbRuleContext, node: TSESTree.Node, seen = new Set<TSESTree.Node>()): ImportedSymbol | undefined {
  const value = unwrapTsValue(node);
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (value.type === "Identifier" || value.type === "JSXIdentifier") {
    return importedIdentifier(context, value, seen);
  }
  if (value.type === "MemberExpression" || value.type === "JSXMemberExpression") {
    const namespace = importedSymbol(context, value.object, seen);
    const name = value.type === "JSXMemberExpression" ? value.property.name : accessedName(context, value);
    return namespace?.name === "*" && name !== undefined ? { source: namespace.source, name } : undefined;
  }
  if (value.type === "TSQualifiedName") {
    const namespace = importedSymbol(context, value.left, seen);
    return namespace?.name === "*" ? { source: namespace.source, name: value.right.name } : undefined;
  }
  return undefined;
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
