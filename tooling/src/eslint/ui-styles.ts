import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { lexicalVariable } from "./general.ts";
import {
  accessedName,
  constantInitializer,
  isStyleMember,
  isValueWrapper,
  STATIC_CONST_DEPTH,
  staticKeyName,
  staticMemberName,
  staticTextValue,
  unwrapTsValue,
} from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const TOKEN_BACKED_STYLE_PROPS = new Set(
  [
    "borderRadius",
    "boxShadow",
    "color",
    "background",
    "backgroundColor",
    "transition",
    "transitionDuration",
    "transitionTimingFunction",
    "animation",
    "gap",
    "rowGap",
    "columnGap",
    "padding",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "marginInlineStart",
    "marginInlineEnd",
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "inlineSize",
    "blockSize",
    "minInlineSize",
    "minBlockSize",
    "maxInlineSize",
    "maxBlockSize",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "fontSize",
    "lineHeight",
    "letterSpacing",
    "zIndex",
  ].flatMap((name) => [name, name.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)]),
);

const RAW_STYLE_UNIT = /\d(?:\.\d+)?\s*(?:px|rem|em|%|ms|s|vh|vw|vmin|vmax|ch|cqh|cqw|fr|deg)\b/u;

const RAW_STYLE_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\s*\(/u;

const RAW_STYLE_EASING = /\b(?:ease-in-out|ease-in|ease-out|ease|linear|cubic-bezier)\b/u;

const BARE_STYLE_NUMBER = /^-?\d+(?:\.\d+)?$/u;

function isRawStyleValue(value: string | number | undefined): boolean {
  const text = value === undefined ? "" : String(value).trim();
  if (text.includes("var(--")) {
    return false;
  }
  if (BARE_STYLE_NUMBER.test(text)) {
    return Number(text) !== 0;
  }
  return RAW_STYLE_UNIT.test(text) || RAW_STYLE_COLOR.test(text) || RAW_STYLE_EASING.test(text);
}

const OFF_TOKEN_STYLE_MESSAGE =
  "A token-backed CSS property (radius, shadow, colour, motion, spacing) is written as a raw literal inline; use a Tailwind token utility or reference a var(--…) token from tokens.json.";

const styleObjectOf = (container: TSESTree.JSXExpressionContainer): TSESTree.ObjectExpression | undefined => {
  const expression = container.expression.type === "JSXEmptyExpression" ? undefined : unwrapTsValue(container.expression);
  return expression?.type === "ObjectExpression" ? expression : undefined;
};

export const offTokenInlineStyleRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const flagWhenRaw = (node: TSESTree.Node, value: TSESTree.Node): void => {
      if (isRawStyleValue(staticTextValue(context, value))) {
        context.report({ node, message: OFF_TOKEN_STYLE_MESSAGE });
      }
    };
    const tokenBacked = (name: string | number | undefined): boolean => name !== undefined && TOKEN_BACKED_STYLE_PROPS.has(name as string);
    return {
      "JSXAttribute[name.name='style'] > JSXExpressionContainer": (container: TSESTree.JSXExpressionContainer): void => {
        for (const property of styleObjectOf(container)?.properties ?? []) {
          const plain = property.type === "Property" && property.kind === "init" && !property.method;
          if (plain && tokenBacked(staticKeyName(context, property))) {
            flagWhenRaw(property, property.value);
          }
        }
      },
      "AssignmentExpression[operator='='][left.type='MemberExpression']": (
        assignment: TSESTree.AssignmentExpression & { left: TSESTree.MemberExpression },
      ): void => {
        if (tokenBacked(accessedName(context, assignment.left)) && isStyleMember(context, assignment.left.object)) {
          flagWhenRaw(assignment, assignment.right);
        }
      },
      "CallExpression[callee.type='MemberExpression']": (call: TSESTree.CallExpression & { callee: TSESTree.MemberExpression }): void => {
        const [property, value] = call.arguments;
        const setsStyle = accessedName(context, call.callee) === "setProperty" && isStyleMember(context, call.callee.object);
        if (setsStyle && value !== undefined && tokenBacked(staticTextValue(context, property as TSESTree.Node))) {
          flagWhenRaw(call, value);
        }
      },
    };
  },
};

const STATIC_STYLE_MESSAGE =
  "A static value (a literal, a constant, a token-only calc()) rides a style prop; make it an @orb/ui primitive prop or variant, or a token utility class. A style prop carries only what is computed at runtime from measurement or data.";

/** A binding that cannot hold render data: an import, or a name declared at module scope. */
function moduleLevelBinding(context: OrbRuleContext, identifier: TSESTree.Identifier): boolean {
  const variable = lexicalVariable(context, identifier);
  if (variable === undefined) {
    return true;
  }
  return variable.defs[0]?.type === "ImportBinding" || variable.scope.type === "module" || variable.scope.type === "global";
}

/** True when `node` can only evaluate to the same thing on every render: built from literals, module-level names,
 *  and calls of them over such values. A parameter, a hook result or a local derived from either is runtime. */
function isStaticValue(context: OrbRuleContext, node: TSESTree.Node, depth = 0): boolean {
  if (depth > STATIC_CONST_DEPTH) {
    return false;
  }
  const expression = unwrapTsValue(node);
  const next = (child: TSESTree.Node): boolean => isStaticValue(context, child, depth + 1);
  switch (expression.type) {
    case "Literal":
      return true;
    case "Identifier": {
      if (moduleLevelBinding(context, expression)) {
        return true;
      }
      const variable = lexicalVariable(context, expression);
      const binding = variable?.defs[0]?.name;
      if (binding?.parent.type === "AssignmentPattern" && binding.parent.left === binding) {
        return next(binding.parent.right);
      }
      const initializer = constantInitializer(context, expression);
      return initializer !== undefined && next(initializer);
    }
    case "TemplateLiteral":
      return expression.expressions.every(next);
    case "MemberExpression":
      return next(expression.object) && (!expression.computed || next(expression.property));
    case "CallExpression":
      return next(expression.callee) && expression.arguments.every((argument) => argument.type !== "SpreadElement" && next(argument));
    case "UnaryExpression":
      return next(expression.argument);
    case "BinaryExpression":
    case "LogicalExpression":
      return next(expression.left) && next(expression.right);
    case "ConditionalExpression":
      return next(expression.test) && next(expression.consequent) && next(expression.alternate);
    case "ObjectExpression":
      return expression.properties.every((property) =>
        property.type === "SpreadElement" ? next(property.argument) : (!property.computed || next(property.key)) && next(property.value),
      );
    case "ArrayExpression":
      return expression.elements.every((element) => element !== null && element.type !== "SpreadElement" && next(element));
    default:
      return false;
  }
}

/** A value that sets nothing: omitting a property is a runtime choice, not a static style. */
const isAbsentValue = (node: TSESTree.Node): boolean => {
  const value = unwrapTsValue(node);
  return (value.type === "Identifier" && value.name === "undefined") || (value.type === "Literal" && (value.value === null || value.value === false));
};

function staticObjectEntries(context: OrbRuleContext, object: TSESTree.ObjectExpression, depth: number): readonly TSESTree.Node[] {
  return object.properties.flatMap((property): readonly TSESTree.Node[] => {
    if (property.type === "SpreadElement") {
      return isStaticValue(context, property.argument) ? [property] : staticStyleEntries(context, property.argument, depth + 1);
    }
    const keyFixed = !property.computed || isStaticValue(context, property.key);
    return keyFixed && !isAbsentValue(property.value) && isStaticValue(context, property.value) ? [property] : [];
  });
}

/** The static parts of a style expression: each static property of an object written in place, named by a constant,
 *  spread, or chosen by a runtime condition. A constant's findings are reported at the use. */
function staticStyleEntries(context: OrbRuleContext, node: TSESTree.Node, depth: number): readonly TSESTree.Node[] {
  if (depth > STATIC_CONST_DEPTH) {
    return [];
  }
  const expression = unwrapTsValue(node);
  switch (expression.type) {
    case "ObjectExpression":
      return staticObjectEntries(context, expression, depth);
    case "ConditionalExpression":
      return [...staticStyleEntries(context, expression.consequent, depth + 1), ...staticStyleEntries(context, expression.alternate, depth + 1)];
    case "LogicalExpression":
      return staticStyleEntries(context, expression.right, depth + 1);
    case "Identifier": {
      const initializer = constantInitializer(context, expression);
      return initializer === undefined || staticStyleEntries(context, initializer, depth + 1).length === 0 ? [] : [expression];
    }
    case "MemberExpression":
      return isStaticValue(context, expression) ? [expression] : [];
    case "CallExpression":
      return memoStyleEntries(context, expression, depth);
    default:
      return [];
  }
}

function memoStyleEntries(context: OrbRuleContext, call: TSESTree.CallExpression, depth: number): readonly TSESTree.Node[] {
  const callee = call.callee;
  const member = callee.type === "MemberExpression" ? accessedName(context, callee) : undefined;
  const hook = callee.type === "Identifier" ? callee.name : member;
  const callback = call.arguments[0];
  if (hook !== "useMemo" || (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression")) {
    return [];
  }
  const results =
    callback.body.type === "BlockStatement"
      ? callback.body.body.flatMap((statement) => (statement.type === "ReturnStatement" && statement.argument !== null ? [statement.argument] : []))
      : [callback.body];
  return results.flatMap((result) => staticStyleEntries(context, result, depth + 1));
}

function cssPropertiesObject(context: OrbRuleContext, node: TSESTree.ObjectExpression): boolean {
  const parent = node.parent;
  const wrapped = parent.type === "TSAsExpression" || parent.type === "TSSatisfiesExpression" ? parent.typeAnnotation : undefined;
  const annotation = parent.type === "VariableDeclarator" ? parent.id.typeAnnotation?.typeAnnotation : wrapped;
  if (annotation?.type === "TSTypeReference" && annotation.typeName.type === "Identifier") {
    const definition = lexicalVariable(context, annotation.typeName)?.defs[0];
    if (
      definition?.type === "ImportBinding" &&
      definition.node.type === "ImportSpecifier" &&
      definition.node.imported.type === "Identifier" &&
      definition.node.imported.name === "CSSProperties" &&
      definition.parent.type === "ImportDeclaration" &&
      definition.parent.source.value === "react"
    ) {
      return true;
    }
  }
  const services = context.sourceCode.parserServices;
  if (!services?.program || services.esTreeNodeToTSNodeMap === undefined) {
    return false;
  }
  const expression = services.esTreeNodeToTSNodeMap.get(node);
  if (!ts.isObjectLiteralExpression(expression)) {
    return false;
  }
  const type = services.program.getTypeChecker().getContextualType(expression);
  const symbol = type?.getSymbol();
  return symbol?.name === "CSSProperties" && (symbol.declarations ?? []).some((declaration) => declaration.getSourceFile().fileName.includes("/@types/react/"));
}

/** Static style properties belong to primitive variants; React CSSProperties objects are judged at their authored home. */
export const noStaticStylePropRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      ObjectExpression: (node: TSESTree.ObjectExpression): void => {
        if (cssPropertiesObject(context, node)) {
          for (const entry of staticObjectEntries(context, node, 0)) {
            context.report({ node: entry, message: STATIC_STYLE_MESSAGE });
          }
        }
      },
      "JSXAttribute[name.name='style'] > JSXExpressionContainer": (container: TSESTree.JSXExpressionContainer): void => {
        if (container.expression.type === "JSXEmptyExpression") {
          return;
        }
        for (const node of staticStyleEntries(context, container.expression, 0)) {
          context.report({ node, message: STATIC_STYLE_MESSAGE });
        }
      },
    };
  },
};

const COLOR_TOKEN_PREFIX = "--color-";

const keyHead = (context: OrbRuleContext, property: TSESTree.Property): string | null | undefined =>
  property.computed && property.key.type === "TemplateLiteral" ? property.key.quasis[0]?.value.cooked : staticKeyName(context, property);

function overridesColorToken(context: OrbRuleContext, node: TSESTree.Node, depth = 0): boolean {
  const expression = unwrapTsValue(node);
  const initializer = expression.type === "Identifier" && depth < STATIC_CONST_DEPTH ? constantInitializer(context, expression) : undefined;
  if (initializer !== undefined) {
    return overridesColorToken(context, initializer, depth + 1);
  }
  return (
    expression.type === "ObjectExpression" &&
    depth < STATIC_CONST_DEPTH &&
    expression.properties.some((property) => overridesColorKey(context, property, depth))
  );
}

function overridesColorKey(context: OrbRuleContext, property: TSESTree.Property | TSESTree.SpreadElement, depth: number): boolean {
  if (property.type === "SpreadElement") {
    return overridesColorToken(context, property.argument, depth + 1);
  }
  return (keyHead(context, property) ?? "").startsWith(COLOR_TOKEN_PREFIX);
}

export const themeOverrideRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "JSXAttribute[name.name='style']": (attribute: TSESTree.JSXAttribute): void => {
        const container = attribute.value;
        const read = container?.type === "JSXExpressionContainer" && container.expression.type !== "JSXEmptyExpression";
        if (read && overridesColorToken(context, container.expression)) {
          context.report({
            node: attribute,
            message:
              "An inline style prop overrides a --color-* design token; token overrides go through <ThemeScope>, where the value is clamped at the boundary.",
          });
        }
      },
    };
  },
};

const VARIANT_CLOSERS = new Map([
  ["]", "["],
  [")", "("],
  ["}", "{"],
]);

function consumesQuoteOrEscape(state: VariantState, char: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\") {
    state.escaped = true;
    return true;
  }
  if (state.quote !== "") {
    state.quote = char === state.quote ? "" : state.quote;
    return true;
  }
  if (char === '"' || char === "'") {
    state.quote = char;
    return true;
  }
  return false;
}

function consumesBracket(state: VariantState, char: string): boolean {
  if (char === "[" || char === "(" || char === "{") {
    state.open.push(char);
    return true;
  }
  const opener = VARIANT_CLOSERS.get(char);
  if (opener !== undefined && state.open.at(-1) === opener) {
    state.open.pop();
  }
  return opener !== undefined;
}

function topLevelVariantParts(candidate: string): string[] {
  const state: VariantState = { open: [], quote: "", escaped: false };
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate.charAt(index);
    if (consumesQuoteOrEscape(state, char) || consumesBracket(state, char)) {
      continue;
    }
    if (char === ":" && state.open.length === 0) {
      parts.push(candidate.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(candidate.slice(start));
  return parts;
}

const UNREAD_TEXT = "\u0000";

function spellsDarkVariant(text: string): boolean {
  return text
    .split(/\s+/u)
    .filter((candidate) => candidate !== "")
    .some((candidate) =>
      candidate.split(UNREAD_TEXT).some((piece, index, pieces) => {
        const parts = topLevelVariantParts(piece);
        return parts.slice(0, -1).includes("dark") && (parts.at(-1) !== "" || index < pieces.length - 1);
      }),
    );
}

function joinedText(context: OrbRuleContext, node: TSESTree.Node, depth = 0): string {
  const expression = unwrapTsValue(node);
  const next = (child: TSESTree.Node): string => joinedText(context, child, depth + 1);
  switch (expression.type) {
    case "Literal":
      return typeof expression.value === "string" || typeof expression.value === "number" ? String(expression.value) : UNREAD_TEXT;
    case "TemplateLiteral":
      return expression.quasis.map((quasi, index) => quasi.value.cooked + (expression.expressions[index] ? next(expression.expressions[index]) : "")).join("");
    case "BinaryExpression":
      return expression.operator === "+" ? next(expression.left) + next(expression.right) : UNREAD_TEXT;
    case "Identifier": {
      const initializer = depth >= STATIC_CONST_DEPTH ? undefined : constantInitializer(context, expression);
      const text = initializer === undefined ? UNREAD_TEXT : next(initializer);
      return spellsDarkVariant(text) ? UNREAD_TEXT : text;
    }
    default:
      return UNREAD_TEXT;
  }
}

function isOutermostText(node: TSESTree.Expression): boolean {
  let current = node;
  let parent = current.parent;
  while (isValueWrapper(parent) && parent.expression === current) {
    current = parent;
    parent = current.parent;
  }
  const joined = (parent.type === "BinaryExpression" && parent.operator === "+") || (parent.type === "TemplateLiteral" && parent.expressions.includes(current));
  return !joined;
}

export const darkVariantRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const judge = (node: TSESTree.Literal | TSESTree.TemplateLiteral | TSESTree.BinaryExpression): void => {
      if (isOutermostText(node) && spellsDarkVariant(joinedText(context, node))) {
        context.report({ node, message: "Use a polarity-aware light-dark() token; dark: cannot follow ThemeScope-derived custom-theme polarity." });
      }
    };
    return { "Literal[value=type(string)]": judge, ["TemplateLiteral"]: judge, "BinaryExpression[operator='+']": judge };
  },
};

const RECEDED_INK_NAME = "RECEDED_INK";

const VARIANT_PREFIX_END = /\S:$/u;

function importedRecededInk(context: OrbRuleContext, expression: TSESTree.Node): boolean {
  if (expression.type === "Identifier") {
    return expression.name === RECEDED_INK_NAME && lexicalVariable(context, expression)?.defs[0]?.node.type === "ImportSpecifier";
  }
  return (
    expression.type === "MemberExpression" &&
    staticMemberName(expression) === RECEDED_INK_NAME &&
    expression.object.type === "Identifier" &&
    lexicalVariable(context, expression.object)?.defs[0]?.node.type === "ImportNamespaceSpecifier"
  );
}

export const recededInkRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "TemplateLiteral[expressions.length>0]"(template: TSESTree.TemplateLiteral): void {
        template.expressions.forEach((expression, index) => {
          if (importedRecededInk(context, expression) && VARIANT_PREFIX_END.test((template.quasis[index] as TSESTree.TemplateElement).value.raw)) {
            context.report({
              node: expression,
              message:
                "RECEDED_INK behind a Tailwind variant states nothing about the control's rest state, the only state the recession ruling governs. Carry it unprefixed on the composite's own control, or author the colour directly when the control recedes only in a variant state (packages/ui/src/lib/receded-ink.ts).",
            });
          }
        });
      },
    };
  },
};

interface VariantState {
  open: string[];
  quote: string;
  escaped: boolean;
}
