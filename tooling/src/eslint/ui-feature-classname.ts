// A feature's `className` on a primitive is layout only, and a class string is never built (item 1316). Layout is decided by the CSS a token compiles to, never by a list of class names.
// On an `@orb/ui` component a class the component's own `tv()` table writes through a prop is refused too: the owner comes from the table, so a new prop closes itself.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
import { jsxProperties, staticKeyName, staticObjectProperties, staticValueOptions } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { posixPath } from "./syntax.ts";

/** How a class token paints: `layout` emits only layout properties, `paint` emits anything else, `unknown` does not compile. */
const CLASS_KINDS = ["layout", "paint", "unknown"] as const;
type ClassKind = (typeof CLASS_KINDS)[number];
export type ClassClassifier = (token: string) => ClassKind;
/** The prop that writes a class, and the value that writes exactly it. */
interface AxisOwner {
  /** `component.prop` in kebab case: `row.justify`. */
  readonly axis: string;
  readonly prop: string;
  /** Null when the prop chooses in the class's family and has no step for this class: the step is added to the axis, never written by hand. */
  readonly arm: string | null;
}

/** The tables name where the class belongs and no prop takes it yet. */
interface AskedOwner {
  /** The census row that names the home: `part of: row.pinned.header`. */
  readonly axis: string;
  readonly prop: null;
  readonly arm: null;
  /** The census's reason, so both tools say one thing. */
  readonly reason: string;
}

export type PropOwner = AxisOwner | AskedOwner;

/**
 * The prop of `component` (exported by the `@orb/ui/<door>` door) that writes `token` onto the component's own element, or null.
 *
 * @remarks
 * `classOwners` in ui-facts reads the tables and answers with the census's own judgement. A prop owns every class it writes, wherever the element
 * sits in the axis order: a recipe that orders two props so a class would beat the prop is a recipe to reorder, never a class to keep.
 */
export type PropOwners = (door: string, component: string, token: string, siblings: readonly string[]) => PropOwner | null;

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
const DECLARATION = /^[ \t]*([a-zA-Z-][\w-]*)\s*:[^{\n]*;[ \t]*$/gmu;
// Tailwind registers the custom properties a utility composes through (`contain-inline-size` builds `contain` from
// four `--tw-contain-*` parts) as `@property` rules, whose `syntax`/`inherits` descriptors are not declarations.
const PROPERTY_REGISTRATION = /@property[^{]*\{[^}]*\}/gu;

// A utility that only sets a colour (`shadow-accent`, `ring-primary`, `from-primary`) emits nothing but a `--tw-*` custom
// property that a shadow, ring or gradient utility reads, so it is judged by the name: shadow, ring and gradient parts paint.
const PAINT_CUSTOM_PROPERTY = /^--tw-(?:(?:inset-|text-|drop-)?shadow|(?:inset-)?ring|gradient)/u;

function isLayoutProperty(property: string): boolean {
  if (property.startsWith("--")) {
    return !PAINT_CUSTOM_PROPERTY.test(property);
  }
  return LAYOUT_PROPERTIES.has(property) || LAYOUT_PREFIXES.some((prefix) => property.startsWith(prefix));
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
const CLIENT_DIRECTORY = "/packages/client/src/";

// A boolean or numeric arm is a JSX expression, a named arm a string.
const EXPRESSION_ARM = /^(?:true|false|\d+)$/u;

function ownerPhrase(token: string, owner: PropOwner): string {
  if (owner.prop === null) {
    return owner.reason;
  }
  const { prop, arm } = owner;
  if (arm === null) {
    return `\`${token}\` is a step \`${prop}\` chooses among and has no arm for`;
  }
  return `\`${token}\` is \`${prop}=${EXPRESSION_ARM.test(arm) ? `{${arm}}` : `"${arm}"`}\``;
}

const MESSAGES = {
  paint: (tokens: readonly string[]): string =>
    `A feature className paints (${tokens.map((token) => `\`${token}\``).join(", ")}); colour, type, border, radius and shadow come from a primitive prop or variant.`,
  owned: (component: string, owned: readonly (readonly [string, PropOwner])[]): string =>
    `A feature className writes what ${component}'s own prop owns (${owned.map(([token, owner]) => ownerPhrase(token, owner)).join(", ")}); pass the prop and drop the class, adding the arm the prop lacks.`,
  template: "A template className builds a class string; spell the static tokens and put the state in a primitive prop.",
  concatenation: "A concatenated className builds a class string; spell the static tokens and put the state in a primitive prop.",
  imported: "An imported class string hides its paint from the variant system; add the variant to the primitive and pass a prop.",
  member: "A className read off an object hides its tokens from lint; spell the tokens or pass a primitive prop.",
  call: "A className built by a function hides its tokens from lint; spell the tokens or pass a primitive prop.",
  helper: "A helper that returns className hides its tokens at every element that spreads it; return the props and spell the class on the element.",
} as const;

function isComponentElement(element: TSESTree.JSXOpeningElement): boolean {
  const name = element.name;
  return name.type === AST_NODE_TYPES.JSXMemberExpression || (name.type === AST_NODE_TYPES.JSXIdentifier && /^[A-Z]/u.test(name.name));
}

const isClassProperty = (name: string | undefined): boolean => name === "className" || name?.endsWith("ClassName") === true;

interface ClassCarrier {
  readonly name: string;
  readonly node: TSESTree.Node;
  readonly value: MaybeNode;
}

function classCarriers(context: OrbRuleContext, element: TSESTree.JSXOpeningElement): readonly ClassCarrier[] {
  return jsxProperties(context, element).filter((property) => isClassProperty(property.name));
}

function tokensOf(text: string): readonly string[] {
  return text.split(/\s+/u).filter((token) => token !== "");
}

type ScopeVariable = ReturnType<OrbRuleContext["sourceCode"]["getScope"]>["references"][number]["resolved"];

function resolvedVariable(context: OrbRuleContext, identifier: TSESTree.Identifier | TSESTree.JSXIdentifier): ScopeVariable | undefined {
  return context.sourceCode.getScope(identifier).references.find((reference) => reference.identifier === identifier)?.resolved;
}

function localInitializer(context: OrbRuleContext, identifier: TSESTree.Identifier): TSESTree.Expression | undefined {
  const definition = resolvedVariable(context, identifier)?.defs[0];
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) {
    return undefined;
  }
  return definition.node.init ?? undefined;
}

function isImported(context: OrbRuleContext, identifier: TSESTree.Identifier): boolean {
  return resolvedVariable(context, identifier)?.defs[0]?.type === TSESLint.Scope.DefinitionType.ImportBinding;
}

/** The static class tokens a node spells itself: a string, a template's quasis, or an object's keys. */
function ownTokens(node: TSESTree.Node): readonly string[] {
  if (node.type === AST_NODE_TYPES.Literal) {
    return typeof node.value === "string" ? tokensOf(node.value) : [];
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.quasis.flatMap((quasi) => tokensOf(quasi.value.cooked ?? quasi.value.raw));
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.flatMap((property) => {
      if (property.type !== AST_NODE_TYPES.Property || property.computed) {
        return [];
      }
      return tokensOf(property.key.type === AST_NODE_TYPES.Identifier ? property.key.name : String((property.key as TSESTree.Literal).value));
    });
  }
  return [];
}

type MaybeNode = TSESTree.Node | null | undefined;

/** The nodes under a className value that can carry class tokens; identifiers are followed to a local initializer only. */
function childNodes(context: OrbRuleContext, node: TSESTree.Node): readonly MaybeNode[] {
  switch (node.type) {
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions;
    case AST_NODE_TYPES.JSXExpressionContainer:
      return [node.expression];
    case AST_NODE_TYPES.ConditionalExpression:
      return [node.consequent, node.alternate];
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.BinaryExpression:
      return [node.left, node.right];
    case AST_NODE_TYPES.CallExpression:
      return node.arguments;
    case AST_NODE_TYPES.ArrayExpression:
      return node.elements;
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.MemberExpression:
      return staticValueOptions(context, node);
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.ChainExpression:
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

const UI_DOOR = /^@orb\/ui\/([^/]+)/u;

interface Primitive {
  readonly door: string;
  readonly component: string;
}

/** The element a `<Track of={Stack}>` renders, which wears the attributes written on the carrier; otherwise the element's own name. */
function renderedName(element: TSESTree.JSXOpeningElement): TSESTree.Identifier | TSESTree.JSXIdentifier | null {
  const carried = element.attributes.find(
    (attribute) => attribute.type === AST_NODE_TYPES.JSXAttribute && attribute.name.type === AST_NODE_TYPES.JSXIdentifier && attribute.name.name === "of",
  );
  if (carried === undefined) {
    return element.name.type === AST_NODE_TYPES.JSXIdentifier ? element.name : null;
  }
  const value = carried.type === AST_NODE_TYPES.JSXAttribute ? carried.value : null;
  return value?.type === AST_NODE_TYPES.JSXExpressionContainer && value.expression.type === AST_NODE_TYPES.Identifier ? value.expression : null;
}

/** The `@orb/ui` component a name is, proven by its named import: a local that shadows the name resolves to another binding and is no primitive. */
function primitiveOf(context: OrbRuleContext, element: TSESTree.JSXOpeningElement): Primitive | null {
  const tag = renderedName(element);
  const definition = tag === null ? undefined : resolvedVariable(context, tag)?.defs[0];
  if (definition?.type !== TSESLint.Scope.DefinitionType.ImportBinding || definition.node.type !== AST_NODE_TYPES.ImportSpecifier) {
    return null;
  }
  const { parent } = definition;
  const door = parent.type === AST_NODE_TYPES.ImportDeclaration ? UI_DOOR.exec(parent.source.value)?.[1] : undefined;
  const { imported } = definition.node;
  if (door === undefined) {
    return null;
  }
  return { door, component: imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value };
}

type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | TSESTree.FunctionExpression;

const isFunction = (node: TSESTree.Node | null | undefined): node is FunctionNode =>
  node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
  node?.type === AST_NODE_TYPES.FunctionDeclaration ||
  node?.type === AST_NODE_TYPES.FunctionExpression;

/** The function a same-file component name is bound to. */
function localComponent(context: OrbRuleContext, element: TSESTree.JSXOpeningElement): FunctionNode | null {
  const definition = element.name.type === AST_NODE_TYPES.JSXIdentifier ? resolvedVariable(context, element.name)?.defs[0] : undefined;
  const node = definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.node.init : definition?.node;
  return isFunction(node) ? node : null;
}

/** The name a component holds the caller's class under: its whole props, a `className` binding, or the rest that carries it on. */
function classHolder(component: FunctionNode): string | null {
  const [parameter] = component.params;
  if (parameter?.type === AST_NODE_TYPES.Identifier) {
    return parameter.name;
  }
  if (parameter?.type !== AST_NODE_TYPES.ObjectPattern) {
    return null;
  }
  const bound = parameter.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property && property.key.type === AST_NODE_TYPES.Identifier && property.key.name === "className" ? [property.value] : [],
  );
  const rest = parameter.properties.find((property) => property.type === AST_NODE_TYPES.RestElement);
  const [holder] = [...bound, ...(rest === undefined ? [] : [rest.argument])];
  return holder?.type === AST_NODE_TYPES.Identifier ? holder.name : null;
}

const mentions = (context: OrbRuleContext, node: TSESTree.Node, name: string): boolean =>
  new RegExp(`\\b${name}\\b`, "u").test(context.sourceCode.getText(node));

/** The element takes the caller's class: a spread or a `className` value that reads what holds it. */
const wearsHolder = (context: OrbRuleContext, element: TSESTree.JSXOpeningElement, holder: string): boolean =>
  element.attributes.some((attribute) =>
    attribute.type === AST_NODE_TYPES.JSXSpreadAttribute
      ? mentions(context, attribute.argument, holder)
      : attribute.name.name === "className" && attribute.value !== null && mentions(context, attribute.value, holder),
  );

/** The primitive a same-file wrapper hands its `className` to; a wrapper from another file is the census's to follow, because a rule reads one file. */
function wrappedPrimitive(context: OrbRuleContext, element: TSESTree.JSXOpeningElement, file: readonly TSESTree.JSXOpeningElement[]): Primitive | null {
  const component = localComponent(context, element);
  const holder = component === null ? null : classHolder(component);
  if (component === null || holder === null) {
    return null;
  }
  const inside = file.filter(({ range }) => range[0] >= component.range[0] && range[1] <= component.range[1]);
  return inside.filter((inner) => wearsHolder(context, inner, holder)).flatMap((inner) => primitiveOf(context, inner) ?? [])[0] ?? null;
}

/** The classes of one `className` that a prop of the primitive writes, each with that prop. */
function ownedTokens(primitive: Primitive, tokens: readonly string[], ownerOf: PropOwners): readonly (readonly [string, PropOwner])[] {
  return tokens.flatMap((token) => {
    const owner = ownerOf(primitive.door, primitive.component, token, tokens);
    return owner === null ? [] : [[token, owner] as const];
  });
}

function reportOwned(context: OrbRuleContext, carrier: ClassCarrier, primitive: Primitive, owned: readonly (readonly [string, PropOwner])[]): void {
  if (owned.length > 0) {
    context.report({ node: carrier.node, message: MESSAGES.owned(primitive.component, owned) });
  }
}

function judgeElement(
  context: OrbRuleContext,
  element: TSESTree.JSXOpeningElement,
  file: readonly TSESTree.JSXOpeningElement[],
  { classify, ownerOf }: { readonly classify: ClassClassifier; readonly ownerOf: PropOwners },
): void {
  const primitive = primitiveOf(context, element) ?? wrappedPrimitive(context, element, file);
  for (const carrier of classCarriers(context, element)) {
    const tokens = [...new Set(collectTokens(context, carrier.value))];
    const paint = tokens.filter((token) => !isAccessibilityUtility(token) && classify(token) === "paint");
    if (paint.length > 0) {
      context.report({ node: carrier.node, message: MESSAGES.paint(paint) });
    }
    if (primitive !== null && carrier.name === "className") {
      reportOwned(context, carrier, primitive, ownedTokens(primitive, tokens, ownerOf));
    }
  }
}

/** Build the layout-only rule over a classifier and the prop owners, so the lint carries one design system and one set of tables for the whole run. */
export function featureClassNameLayoutOnlyRule(classify: ClassClassifier, ownerOf: PropOwners): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      if (!posixPath(context.filename).includes(CLIENT_DIRECTORY)) {
        return {};
      }
      const file: TSESTree.JSXOpeningElement[] = [];
      return {
        "JSXOpeningElement:exit": (element: TSESTree.JSXOpeningElement): void => {
          file.push(element);
        },
        // Judged once the file is read: a same-file wrapper can sit below the element that wears it.
        "Program:exit": (): void => {
          for (const element of file.filter(isComponentElement)) {
            judgeElement(context, element, file, { classify, ownerOf });
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
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions.length > 0 ? MESSAGES.template : undefined;
    case AST_NODE_TYPES.BinaryExpression:
      return MESSAGES.concatenation;
    case AST_NODE_TYPES.CallExpression:
      if (node.callee.type !== AST_NODE_TYPES.Identifier || !CLASS_HELPERS.has(node.callee.name)) {
        return MESSAGES.call;
      }
      return firstReason(context, node.arguments);
    case AST_NODE_TYPES.Identifier:
      if (node.name === "undefined") {
        return undefined;
      }
      return isImported(context, node) ? MESSAGES.imported : builtReason(context, localInitializer(context, node));
    case AST_NODE_TYPES.MemberExpression:
      return MESSAGES.member;
    default:
      return firstReason(context, childNodes(context, node));
  }
}

const carriesClass = (context: OrbRuleContext, node: TSESTree.Node): boolean =>
  staticObjectProperties(context, node).some((property) => isClassProperty(staticKeyName(context, property)));

export const noBuiltClassStringRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    if (!posixPath(context.filename).includes(CLIENT_DIRECTORY)) {
      return {};
    }
    const reportReturned = (node: MaybeNode): void => {
      if (node !== null && node !== undefined && carriesClass(context, node)) {
        context.report({ node, message: MESSAGES.helper });
      }
    };
    return {
      ReturnStatement: (node: TSESTree.ReturnStatement): void => reportReturned(node.argument),
      ArrowFunctionExpression: (node: TSESTree.ArrowFunctionExpression): void => reportReturned(node.expression ? node.body : null),
      "JSXOpeningElement:exit": (element: TSESTree.JSXOpeningElement): void => {
        for (const carrier of classCarriers(context, element)) {
          const message = builtReason(context, carrier.value);
          if (message !== undefined) {
            context.report({ node: carrier.node, message });
          }
        }
      },
    };
  },
};
