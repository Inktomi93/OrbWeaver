// Paint on a raw HTML element in the client: `className`, `style` and spread attributes on a lowercase JSX element
// (client-architecture-lockdown.md §1.2). The one exception is the app shell's own frame, whose static class strings
// name shell.css classes.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const SHELL_DIRECTORY = "/features/app-shell/";
const PAINT_ATTRIBUTES = new Set(["className", "style"]);

const MESSAGES = {
  class: "A raw HTML element in a feature carries no className; compose an @orb/ui primitive, or add one.",
  shellClass: "Inside the app shell a raw element's className is a static string of shell.css classes only; anything else is a primitive's job.",
  style: "A raw HTML element never carries an inline style; a primitive owns the style a runtime value needs.",
  spread: "A spread on a raw HTML element can carry className or style; spell the attributes, or compose a primitive.",
} as const;

function staticClassList(attribute: TSESTree.JSXAttribute): readonly string[] | undefined {
  const value = attribute.value;
  if (value?.type === "Literal" && typeof value.value === "string") {
    return value.value.split(/\s+/u).filter((token) => token !== "");
  }
  return undefined;
}

/** Object literals a spread may carry; a conditional of literals counts as its arms. */
function spreadObjects(expression: TSESTree.Expression): readonly TSESTree.ObjectExpression[] | undefined {
  if (expression.type === "ObjectExpression") {
    return [expression];
  }
  if (expression.type === "ConditionalExpression") {
    const consequent = spreadObjects(expression.consequent);
    const alternate = spreadObjects(expression.alternate);
    return consequent === undefined || alternate === undefined ? undefined : [...consequent, ...alternate];
  }
  return undefined;
}

function staticKey(property: TSESTree.Property): string | undefined {
  if (property.key.type === "Identifier") {
    return property.key.name;
  }
  return property.key.type === "Literal" ? String(property.key.value) : undefined;
}

/** A property carries paint unless its key is known and is not one; a computed key is known only inside the shell. */
function propertyCarriesPaint(property: TSESTree.ObjectLiteralElement, inShell: boolean): boolean {
  if (property.type !== "Property") {
    return true;
  }
  if (property.computed) {
    return !inShell;
  }
  const key = staticKey(property);
  return key === undefined || PAINT_ATTRIBUTES.has(key);
}

function spreadCarriesPaint(spread: TSESTree.JSXSpreadAttribute, inShell: boolean): boolean {
  const objects = spreadObjects(spread.argument);
  return objects === undefined || objects.some((object) => object.properties.some((property) => propertyCarriesPaint(property, inShell)));
}

function attributeMessage(
  attribute: TSESTree.JSXAttribute | TSESTree.JSXSpreadAttribute,
  inShell: boolean,
  shellClasses: ReadonlySet<string>,
): string | undefined {
  if (attribute.type === "JSXSpreadAttribute") {
    return spreadCarriesPaint(attribute, inShell) ? MESSAGES.spread : undefined;
  }
  const name = attribute.name.type === "JSXIdentifier" ? attribute.name.name : undefined;
  if (name === "style") {
    return MESSAGES.style;
  }
  if (name !== "className") {
    return undefined;
  }
  const tokens = staticClassList(attribute);
  if (inShell && tokens?.every((token) => shellClasses.has(token)) === true) {
    return undefined;
  }
  return inShell ? MESSAGES.shellClass : MESSAGES.class;
}

/** Build the rule over the shell's class set, read from the owner-CSS manifest, never a hand list. */
export function rawIntrinsicPaintRule(shellClasses: ReadonlySet<string>): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const inShell = context.filename.includes(SHELL_DIRECTORY);
      return {
        "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^[a-z]/]": (element: TSESTree.JSXOpeningElement): void => {
          for (const attribute of element.attributes) {
            const message = attributeMessage(attribute, inShell, shellClasses);
            if (message !== undefined) {
              context.report({ node: attribute, message });
            }
          }
        },
      };
    },
  };
}
