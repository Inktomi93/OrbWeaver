// A custom property a string reads (`var(--x, 1)`, Tailwind's `w-(--x)`), a CSS text string writes (`{ --x: 1 }`), or a style
// call names (`setProperty("--x")`) must be one the sheets, a runtime writer or a vendor declares; else the read is always
// its fallback and the write sets nothing. A class string's own `[--x:v]` write declares the name, and is dead when nothing reads it.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { CustomPropertyUses } from "../css-names/index.ts";
import { PROPERTY_READ } from "../css-names/index.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// A declaration inside CSS text (`{ --x:` or `; --x:`) and a class string's `[--x:v]` arbitrary property.
const CSS_TEXT_WRITE = /[{;]\s*(--[\w-]+)\s*:/gu;
const CLASS_WRITE = /\[(--[\w-]+):/gu;
const STYLE_CALLS = new Set(["setProperty", "getPropertyValue", "removeProperty"]);

const undeclared = (name: string): string =>
  `"${name}" is not declared by any sheet, runtime writer or vendor, so a read is always its fallback; declare it, list its writer in RUNTIME_CUSTOM_PROPERTIES, or fix the name.`;
const deadWrite = (name: string): string => `"${name}" is written by a class string but no sheet or source reads it; the write is dead.`;

/** The messages for one string: undeclared reads and CSS-text writes, and class-string writes nothing reads. */
function textFindings(text: string, { declared, read, readPrefixes }: CustomPropertyUses): readonly string[] {
  const names = [...text.matchAll(PROPERTY_READ), ...text.matchAll(CSS_TEXT_WRITE)].map((match) => match[1] ?? match[2] ?? "");
  const dead = [...text.matchAll(CLASS_WRITE)]
    .map((match) => match[1] ?? "")
    .filter((name) => !(read.has(name) || readPrefixes.some((prefix) => name.startsWith(prefix))));
  return [...names.filter((name) => !declared.has(name)).map(undeclared), ...dead.map(deadWrite)];
}

/** The property a `setProperty`-family call names in its first argument, when that is a plain string. */
function styleCallProperty(node: TSESTree.CallExpression): string | undefined {
  const callee = node.callee as TSESTree.MemberExpression;
  const [first] = node.arguments;
  if (callee.property.type !== "Identifier" || !STYLE_CALLS.has(callee.property.name)) {
    return undefined;
  }
  if (first?.type === "Literal" && typeof first.value === "string") {
    return first.value;
  }
  // A template literal with no interpolation is a plain string.
  return first?.type === "TemplateLiteral" && first.expressions.length === 0 ? (first.quasis[0]?.value.cooked ?? undefined) : undefined;
}

/** Build the rule over the sheets' and sources' uses (`customPropertyUses`), the one home Stylelint reads too. */
export function customPropertyDeclaredRule(uses: CustomPropertyUses): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const scan = (node: TSESTree.Node, text: string): void => {
        for (const message of textFindings(text, uses)) {
          context.report({ node, message });
        }
      };
      return {
        "Literal[value=/--/]": (node: TSESTree.Literal): void => {
          if (typeof node.value === "string") {
            scan(node, node.value);
          }
        },
        "TemplateElement[value.raw=/--/]": (node: TSESTree.TemplateElement): void => {
          scan(node, node.value.cooked ?? node.value.raw);
        },
        "CallExpression[callee.type='MemberExpression'][callee.computed=false]": (node: TSESTree.CallExpression): void => {
          const name = styleCallProperty(node);
          if (name?.startsWith("--") === true && !uses.declared.has(name)) {
            context.report({ node: node.arguments[0] ?? node, message: undeclared(name) });
          }
        },
      };
    },
  };
}
