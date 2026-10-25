// A feature's `className` on a primitive is layout only, and a class string is never built (css-system plan, item
// 1316). Layout is decided by the CSS a token compiles to, never by a list of class names.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

/** How a class token paints: `layout` emits only layout properties, `paint` emits anything else, `unknown` does not compile. */
const CLASS_KINDS = ["layout", "paint", "unknown"] as const;
type ClassKind = (typeof CLASS_KINDS)[number];
export type ClassClassifier = (token: string) => ClassKind;
/** Tailwind's `DesignSystem.candidatesToCss`: one CSS string per candidate, `null` when it does not compile. */
export type CandidatesToCss = (classes: string[]) => (string | null)[];

// Properties that place and size boxes: display, positioned layout, box model, sizing, flexbox, grid, box alignment,
// overflow and line wrapping, multi-column, fragmentation, containment, pointer events and transforms.
const LAYOUT_PROPERTIES = new Set([
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "float",
  "clear",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "inline-size",
  "block-size",
  "min-inline-size",
  "min-block-size",
  "max-inline-size",
  "max-block-size",
  "aspect-ratio",
  "object-fit",
  "object-position",
  "visibility",
  "isolation",
  "order",
  "gap",
  "row-gap",
  "column-gap",
  "vertical-align",
  "text-align",
  "text-align-last",
  "columns",
  "text-overflow",
  "white-space",
  "white-space-collapse",
  "text-wrap",
  "text-wrap-mode",
  "text-wrap-style",
  "overflow-wrap",
  "word-break",
  "hyphens",
  "line-clamp",
  "-webkit-line-clamp",
  "-webkit-box-orient",
  "pointer-events",
  "touch-action",
  "resize",
  "content-visibility",
  "container",
  "container-type",
  "container-name",
  "table-layout",
  "caption-side",
  "border-collapse",
  "border-spacing",
  "transform",
  "transform-origin",
  "transform-box",
  "transform-style",
  "translate",
  "rotate",
  "scale",
  "will-change",
  "field-sizing",
]);
const LAYOUT_PREFIXES = [
  "margin",
  "padding",
  "inset",
  "scroll-",
  "overscroll-",
  "grid",
  "flex",
  "place-",
  "justify-",
  "align-",
  "column-",
  "overflow",
  "contain",
  "break-",
];

// The screen-reader utilities reset `border-width`, a paint property, to hide an element visually.
const ACCESSIBILITY_UTILITIES = new Set(["sr-only", "not-sr-only"]);

// Under any variant too: a skip link is `sr-only` until it takes keyboard focus (`not-focus-visible:sr-only`).
function isAccessibilityUtility(token: string): boolean {
  return ACCESSIBILITY_UTILITIES.has(token.slice(token.lastIndexOf(":") + 1));
}

// One declaration per line, so a match never runs on into the next declaration and hides its property.
const DECLARATION = /^\s*([a-zA-Z-][\w-]*)\s*:[^{\n]*;\s*$/gmu;
// Tailwind registers the custom properties a utility composes through (`contain-inline-size` builds `contain` from
// four `--tw-contain-*` parts) as `@property` rules, whose `syntax`/`inherits` descriptors are not declarations.
const PROPERTY_REGISTRATION = /@property[^{]*\{[^}]*\}/gu;

function isLayoutProperty(property: string): boolean {
  return property.startsWith("--") || LAYOUT_PROPERTIES.has(property) || LAYOUT_PREFIXES.some((prefix) => property.startsWith(prefix));
}

function kindOf(css: string | null | undefined): ClassKind {
  if (css === null || css === undefined) {
    return "unknown";
  }
  const properties = [...css.replace(PROPERTY_REGISTRATION, "").matchAll(DECLARATION)].map(([, property]) => property ?? "");
  return properties.every(isLayoutProperty) ? "layout" : "paint";
}

/** Build the classifier over a loaded design system; the caller loads the stock theme plus the generated theme once per lint. */
export function classClassifier(candidatesToCss: CandidatesToCss): ClassClassifier {
  const known = new Map<string, ClassKind>();
  return (token: string): ClassKind => {
    const cached = known.get(token);
    if (cached !== undefined) {
      return cached;
    }
    const kind = kindOf(candidatesToCss([token])[0]);
    known.set(token, kind);
    return kind;
  };
}

const CLASS_HELPERS = new Set(["cn", "clsx"]);
const FEATURE_DIRECTORY = "/packages/client/src/features/";

const MESSAGES = {
  paint: (tokens: readonly string[]): string =>
    `A feature className paints (${tokens.map((token) => `\`${token}\``).join(", ")}); colour, type, border, radius and shadow come from a primitive prop or variant.`,
  template: "A template className builds a class string; spell the static tokens and put the state in a primitive prop.",
  concatenation: "A concatenated className builds a class string; spell the static tokens and put the state in a primitive prop.",
  imported: "An imported class string hides its paint from the variant system; add the variant to the primitive and pass a prop.",
  member: "A className read off an object hides its tokens from lint; spell the tokens or pass a primitive prop.",
  call: "A className built by a function hides its tokens from lint; spell the tokens or pass a primitive prop.",
} as const;

type ClassNameAttribute = TSESTree.JSXAttribute & { readonly name: TSESTree.JSXIdentifier & { readonly name: "className" } };

const CLASSNAME_SELECTOR = "JSXAttribute[name.type='JSXIdentifier'][name.name='className']";

function isComponentElement(attribute: TSESTree.JSXAttribute): boolean {
  const name = attribute.parent.name;
  return name.type === "JSXMemberExpression" || (name.type === "JSXIdentifier" && /^[A-Z]/u.test(name.name));
}

function tokensOf(text: string): readonly string[] {
  return text.split(/\s+/u).filter((token) => token !== "");
}

type ScopeVariable = ReturnType<OrbRuleContext["sourceCode"]["getScope"]>["references"][number]["resolved"];

function resolvedVariable(context: OrbRuleContext, identifier: TSESTree.Identifier): ScopeVariable | undefined {
  return context.sourceCode.getScope(identifier).references.find((reference) => reference.identifier === identifier)?.resolved;
}

function localInitializer(context: OrbRuleContext, identifier: TSESTree.Identifier): TSESTree.Expression | undefined {
  const definition = resolvedVariable(context, identifier)?.defs[0];
  if (definition?.type !== "Variable") {
    return undefined;
  }
  return definition.node.init ?? undefined;
}

function isImported(context: OrbRuleContext, identifier: TSESTree.Identifier): boolean {
  return resolvedVariable(context, identifier)?.defs[0]?.type === "ImportBinding";
}

/** The static class tokens a node spells itself: a string, a template's quasis, or an object's keys. */
function ownTokens(node: TSESTree.Node): readonly string[] {
  if (node.type === "Literal") {
    return typeof node.value === "string" ? tokensOf(node.value) : [];
  }
  if (node.type === "TemplateLiteral") {
    return node.quasis.flatMap((quasi) => tokensOf(quasi.value.cooked ?? quasi.value.raw));
  }
  if (node.type === "ObjectExpression") {
    return node.properties.flatMap((property) => {
      if (property.type !== "Property" || property.computed) {
        return [];
      }
      return tokensOf(property.key.type === "Identifier" ? property.key.name : String((property.key as TSESTree.Literal).value));
    });
  }
  return [];
}

type MaybeNode = TSESTree.Node | null | undefined;

/** The nodes under a className value that can carry class tokens; identifiers are followed to a local initializer only. */
function childNodes(context: OrbRuleContext, node: TSESTree.Node): readonly MaybeNode[] {
  switch (node.type) {
    case "TemplateLiteral":
      return node.expressions;
    case "JSXExpressionContainer":
      return [node.expression];
    case "ConditionalExpression":
      return [node.consequent, node.alternate];
    case "LogicalExpression":
    case "BinaryExpression":
      return [node.left, node.right];
    case "CallExpression":
      return node.arguments;
    case "ArrayExpression":
      return node.elements;
    case "Identifier":
      return [localInitializer(context, node)];
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "ChainExpression":
      return [node.expression];
    default:
      return [];
  }
}

function collectTokens(context: OrbRuleContext, root: MaybeNode): readonly string[] {
  const tokens: string[] = [];
  const seen = new Set<TSESTree.Node>();
  const visit = (node: MaybeNode): void => {
    if (node === null || node === undefined || seen.has(node)) {
      return;
    }
    seen.add(node);
    tokens.push(...ownTokens(node));
    for (const child of childNodes(context, node)) {
      visit(child);
    }
  };
  visit(root);
  return tokens;
}

/** Build the layout-only rule over a classifier, so the lint carries one design system for the whole run. */
export function featureClassNameLayoutOnlyRule(classify: ClassClassifier): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      if (!context.filename.includes(FEATURE_DIRECTORY)) {
        return {};
      }
      return {
        [CLASSNAME_SELECTOR]: (attribute: ClassNameAttribute): void => {
          if (!isComponentElement(attribute)) {
            return;
          }
          const paint = [...new Set(collectTokens(context, attribute.value))].filter((token) => !isAccessibilityUtility(token) && classify(token) === "paint");
          if (paint.length > 0) {
            context.report({ node: attribute, message: MESSAGES.paint(paint) });
          }
        },
      };
    },
  };
}

function firstReason(context: OrbRuleContext, nodes: readonly MaybeNode[]): string | undefined {
  return nodes.map((node) => builtReason(context, node)).find((reason) => reason !== undefined);
}

function builtReason(context: OrbRuleContext, node: MaybeNode): string | undefined {
  if (node === null || node === undefined) {
    return undefined;
  }
  switch (node.type) {
    case "TemplateLiteral":
      return node.expressions.length > 0 ? MESSAGES.template : undefined;
    case "BinaryExpression":
      return MESSAGES.concatenation;
    case "CallExpression":
      if (node.callee.type !== "Identifier" || !CLASS_HELPERS.has(node.callee.name)) {
        return MESSAGES.call;
      }
      return firstReason(context, node.arguments);
    case "Identifier":
      if (node.name === "undefined") {
        return undefined;
      }
      return isImported(context, node) ? MESSAGES.imported : builtReason(context, localInitializer(context, node));
    case "MemberExpression":
      return MESSAGES.member;
    default:
      return firstReason(context, childNodes(context, node));
  }
}

export const noBuiltClassStringRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    if (!context.filename.includes(FEATURE_DIRECTORY)) {
      return {};
    }
    return {
      [CLASSNAME_SELECTOR]: (attribute: ClassNameAttribute): void => {
        const message = builtReason(context, attribute.value);
        if (message !== undefined) {
          context.report({ node: attribute, message });
        }
      },
    };
  },
};
