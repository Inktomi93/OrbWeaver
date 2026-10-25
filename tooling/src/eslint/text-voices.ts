// Client text chooses a semantic voice; UI alone composes its size, weight and transform axes.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { lexicalVariable } from "./general.ts";
import { accessedName, constantInitializer, staticKeyName, unwrapTsValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const TEXT_DOOR = "@orb/ui/text";
const TEXT_PARTS = new Set(["Text", "Heading"]);
const INTERNAL_AXES = new Set(["size", "weight", "transform"]);
const MESSAGE = "Text and Heading take voice in client code; size, weight and transform are UI-internal axes. Semantic tone stays available.";

function destructuredTextExport(
  context: OrbRuleContext,
  declaration: TSESTree.VariableDeclarator,
  local: string,
  seen: Set<TSESTree.Node>,
): string | undefined {
  if (declaration.id.type !== "ObjectPattern" || declaration.init === null || textExport(context, declaration.init, seen) !== "*") {
    return;
  }
  const property = declaration.id.properties.find(
    (candidate) => candidate.type === "Property" && candidate.value.type === "Identifier" && candidate.value.name === local,
  );
  return property?.type === "Property" ? staticKeyName(context, property) : undefined;
}

function boundTextExport(context: OrbRuleContext, node: TSESTree.Identifier | TSESTree.JSXIdentifier, seen: Set<TSESTree.Node>): string | undefined {
  const definition = lexicalVariable(context, node)?.defs[0];
  if (definition?.type === "ImportBinding" && definition.parent.type === "ImportDeclaration" && definition.parent.source.value === TEXT_DOOR) {
    const specifier = definition.node;
    if (specifier.type === "ImportNamespaceSpecifier") {
      return "*";
    }
    if (specifier.type === "ImportSpecifier") {
      return specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
    }
    return undefined;
  }
  if (definition?.type === "Variable" && definition.node.id.type === "ObjectPattern") {
    return destructuredTextExport(context, definition.node, node.name, seen);
  }
  const id = definition?.type === "Variable" ? definition.node.id : undefined;
  const initializer = id?.type === "Identifier" ? constantInitializer(context, id) : undefined;
  return initializer === undefined ? undefined : textExport(context, initializer, seen);
}

function textExport(context: OrbRuleContext, node: TSESTree.Node, seen = new Set<TSESTree.Node>()): string | undefined {
  const value = unwrapTsValue(node);
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (value.type === "Identifier" || value.type === "JSXIdentifier") {
    return boundTextExport(context, value, seen);
  }
  if ((value.type === "MemberExpression" || value.type === "JSXMemberExpression") && textExport(context, value.object, seen) === "*") {
    return value.type === "JSXMemberExpression" ? value.property.name : accessedName(context, value);
  }
  return undefined;
}

function spreadAxes(context: OrbRuleContext, node: TSESTree.Node, seen = new Set<TSESTree.Node>()): void {
  const value = unwrapTsValue(node);
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  switch (value.type) {
    case "Identifier": {
      const initializer = constantInitializer(context, value);
      if (initializer !== undefined) {
        spreadAxes(context, initializer, seen);
      }
      break;
    }
    case "ObjectExpression":
      for (const property of value.properties) {
        if (property.type === "SpreadElement") {
          spreadAxes(context, property.argument, seen);
        } else if (INTERNAL_AXES.has(staticKeyName(context, property) ?? "")) {
          context.report({ node: property.key, message: MESSAGE });
        }
      }
      break;
    case "ConditionalExpression":
      spreadAxes(context, value.consequent, seen);
      spreadAxes(context, value.alternate, seen);
      break;
    case "LogicalExpression":
      spreadAxes(context, value.left, seen);
      spreadAxes(context, value.right, seen);
      break;
    default:
      break;
  }
}

export const textVoiceOnlyRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "JSXOpeningElement:exit"(node: TSESTree.JSXOpeningElement): void {
        if (!TEXT_PARTS.has(textExport(context, node.name) ?? "")) {
          return;
        }
        for (const attribute of node.attributes) {
          if (attribute.type === "JSXSpreadAttribute") {
            spreadAxes(context, attribute.argument);
          } else if (attribute.name.type === "JSXIdentifier" && INTERNAL_AXES.has(attribute.name.name)) {
            context.report({ node: attribute, message: MESSAGE });
          }
        }
      },
    };
  },
};
