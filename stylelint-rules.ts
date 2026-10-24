// Stylesheet-only token checks run directly on Stylelint's PostCSS nodes, plus the value allow-lists the config composes.
import { blankText } from "@orb/kit/strings";
import valueParser from "postcss-value-parser";
import type { PostcssResult, Rule } from "stylelint";
import stylelint from "stylelint";

type CssRoot = Parameters<ReturnType<Rule>>[0];
type Declaration = Parameters<Parameters<CssRoot["walkDecls"]>[0]>[0];
type AtRule = Parameters<Parameters<CssRoot["walkAtRules"]>[0]>[0];

const MOTION = "orb/motion-token-purity";
const COLOR = "orb/no-raw-color-in-css";
const REST = "orb/rest-transform-grid";
const CONDITION = "orb/no-raw-media-condition";
const PRIMITIVE_VAR = "var(--primitive-";
const MOTION_PROPERTIES = new Set(["transition", "animation", "transition-duration", "animation-duration", "transition-timing-function"]);
const DURATION_PROPERTIES = new Set(["transition-duration", "animation-duration"]);
const REDUCED_MOTION = /prefers-reduced-motion|motion-reduce|\[data-reduced-motion/u;
const RAW_TIME = /(?<![\w.-])(?<num>\d+(?:\.\d+)?|\.\d+)(?:ms|s)\b/gu;
const RAW_EASE = /\b(?:ease-in-out|ease-in|ease-out|ease)\b(?!-(?:expo|out-expo))|cubic-bezier\s*\(/gu;
const HEX = /#[0-9a-fA-F]{3,8}\b/u;
const COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\s*\(/u;
const TRANSFORM_PROPERTIES = new Set(["transform", "translate", "scale"]);
const ANIMATING_AT_RULE = /^(?:keyframes|starting-style)\b/u;
const STATE_SELECTOR = /\[[^=\]]*=[^\]]*\]|:hover|:focus|:active|:checked|:disabled|:target|:open|:popover-open/u;
const FRACTIONAL_PX = /-?\d*\.\d+px/u;
const PERCENTAGE = /-?(?:\d+(?:\.\d+)?|\.\d+)%/u;

/** `stylelint.utils.ruleMessages` keyed by message name; stylelint's own return type is an index signature. */
function messagesOf<const T extends Record<string, string>>(ruleName: string, messages: T): { readonly [K in keyof T]: string } {
  return Object.fromEntries(Object.entries(messages).map(([key, text]) => [key, `${text} (${ruleName})`])) as { readonly [K in keyof T]: string };
}
const MOTION_MESSAGES = messagesOf(MOTION, { rejected: "Use motion/easing tokens for coordinated CSS motion" });
const COLOR_MESSAGES = messagesOf(COLOR, { rejected: "Use a color token or token-derived relative color outside generated theme.css" });
const REST_MESSAGES = messagesOf(REST, { rejected: "A fractional-pixel or percentage transform must belong to motion, not rest" });
const CONDITION_MESSAGES = messagesOf(CONDITION, {
  media: "Spell a media condition as a generated @variant (pointer-coarse, motion-reduce, shell-mobile, …), never a raw @media",
  primitive: "A primitive ramp step is referenced directly; use the semantic token that aliases it",
});

// ── The value allow-lists (client-architecture-lockdown.md §4.4) ───────────────────────────────────────────
// A governed length property takes tokens, formulas over tokens, viewport and line units, percentages and
// keywords. A raw absolute length is refused, with two structural exceptions: a zero sentinel (`0px`) and the
// `1px` rounding interval of `round()`, which follows a comma.
const RAW_ABSOLUTE_LENGTH = String.raw`(?<!, )\b(?!0(?:px|rem|em|ch|ex|pt|pc|cm|mm|in|q)\b)(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch|ex|pt|pc|cm|mm|in|q)\b`;
/** Matches a value that spells no raw absolute length. */
export const LENGTH_FROM_TOKENS = new RegExp(String.raw`^(?![\s\S]*${RAW_ABSOLUTE_LENGTH})[\s\S]*$`, "iu");
/** The properties `LENGTH_FROM_TOKENS` governs, as the allow-list's property pattern. */
export const LENGTH_PROPERTIES =
  "/^(?:border-radius|gap|row-gap|column-gap|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?|font-size|inset(?:-[a-z-]+)?|top|right|bottom|left|width|height|min-width|min-height|max-width|max-height|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size|box-shadow|outline(?:-width|-offset)?|border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?(?:-width)?|scroll-padding(?:-[a-z-]+)?|scroll-margin(?:-[a-z-]+)?|text-indent|--[a-z][a-z0-9-]*)$/";
/** A stacking order is a `--z-*` token, a one-step offset from one, or one of the structural layers -1, 0 and 1. */
export const Z_INDEX_VALUES = [/^var\(--z-[a-z-]+\)$/u, /^calc\(var\(--z-[a-z-]+\) [-+] 1\)$/u, "-1", "0", "1", "auto"] as const;
/** A weight is a `--font-weight-*` token; a tier slot indirection resolves to one; the `100 900` range is the variable-font `@font-face` descriptor. */
export const FONT_WEIGHT_TOKEN = /^var\(--font-weight-[a-z]+\)$/u;
export const FONT_WEIGHT_VALUES = [FONT_WEIGHT_TOKEN, /^var\(--orb-tier-[a-z-]+-weight\)$/u, "100 900", "inherit"] as const;
/** Tracking is a `--tracking-*` token; the reading surface's user knob is a declared exception (integer-line-boxes.md §2). */
export const LETTER_SPACING_VALUES = [/^var\(--tracking-[a-z-]+\)$/u, "var(--reading-letter-spacing)", "normal", "inherit"] as const;

function withoutValueComments(value: string): string {
  const spans: { start: number; end: number }[] = [];
  valueParser(value).walk((node) => {
    if (node.type === "comment") {
      spans.push({ start: node.sourceIndex, end: node.sourceEndIndex });
    }
  });
  let scanned = value;
  for (const { start, end } of spans.toReversed()) {
    scanned = scanned.slice(0, start) + blankText(scanned.slice(start, end)) + scanned.slice(end);
  }
  return scanned;
}

function withoutColorStrings(value: string): string {
  const spans: { start: number; end: number }[] = [];
  valueParser(value).walk((node) => {
    if (node.type === "string") {
      spans.push({ start: node.sourceIndex, end: node.sourceEndIndex });
    }
  });
  let scanned = value;
  for (const { start, end } of spans.toReversed()) {
    scanned = scanned.slice(0, start) + blankText(scanned.slice(start, end)) + scanned.slice(end);
  }
  return scanned;
}

function isAtRule(node: unknown): node is AtRule {
  return typeof node === "object" && node !== null && (node as { type?: unknown }).type === "atrule";
}

function ancestorAtRuleMatches(declaration: Declaration, pattern: RegExp): boolean {
  for (let parent: unknown = declaration.parent; typeof parent === "object" && parent !== null; parent = (parent as { parent?: unknown }).parent) {
    if (isAtRule(parent) && pattern.test(`${parent.name} ${parent.params}`)) {
      return true;
    }
  }
  return false;
}

function isReducedDuration(declaration: Declaration): boolean {
  if (!DURATION_PROPERTIES.has(declaration.prop)) {
    return false;
  }
  const owner = declaration.parent;
  if (owner?.type === "rule" && REDUCED_MOTION.test((owner as { selector: string }).selector)) {
    return true;
  }
  return ancestorAtRuleMatches(declaration, REDUCED_MOTION);
}

function belongsToMotion(declaration: Declaration): boolean {
  const owner = declaration.parent;
  if (owner?.type === "rule" && STATE_SELECTOR.test((owner as { selector: string }).selector)) {
    return true;
  }
  return ancestorAtRuleMatches(declaration, ANIMATING_AT_RULE);
}

function authoredValue(declaration: Declaration): string {
  return declaration.raws.value?.raw ?? declaration.value;
}

function valueIndexOf(declaration: Declaration, value: string): number {
  const valueIndex = declaration.toString().indexOf(value, declaration.prop.length);
  if (valueIndex === -1) {
    throw new Error(`Native ${declaration.prop} declaration has no authored value range`);
  }
  return valueIndex;
}

function motionHits(scanned: string): RegExpExecArray[] {
  return [...[...scanned.matchAll(RAW_TIME)].filter((match) => Number(match.groups?.["num"]) !== 0), ...scanned.matchAll(RAW_EASE)].toSorted(
    (left, right) => left.index - right.index,
  );
}

function reportMotionDeclaration(declaration: Declaration, result: PostcssResult): void {
  if (!MOTION_PROPERTIES.has(declaration.prop) || isReducedDuration(declaration)) {
    return;
  }
  const value = authoredValue(declaration);
  // Single-pass blanking is deliberate: nested calc containing a raw time remains reportable.
  const scanned = withoutValueComments(value).replace(/\b(?:var|calc)\s*\([^()]*\)/gu, blankText);
  const valueIndex = valueIndexOf(declaration, value);
  for (const hit of motionHits(scanned)) {
    const token = hit[0].startsWith("cubic-bezier") ? "cubic-bezier" : hit[0];
    stylelint.utils.report({
      result,
      ruleName: MOTION,
      node: declaration,
      message: MOTION_MESSAGES.rejected,
      index: valueIndex + hit.index,
      endIndex: valueIndex + hit.index + token.length,
    });
  }
}

const motionRule: Rule<true> = (primary) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, MOTION, { actual: primary, possible: [true] })) {
    return;
  }
  root.walkDecls((declaration) => reportMotionDeclaration(declaration, result));
};
motionRule.ruleName = MOTION;
motionRule.messages = MOTION_MESSAGES;

const colorRule: Rule<true> = (primary) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, COLOR, { actual: primary, possible: [true] })) {
    return;
  }
  root.walkDecls((declaration) => {
    const value = authoredValue(declaration);
    // Quoted tokens cannot join neighboring fragments into an unquoted color function or hex value.
    const authored = withoutColorStrings(withoutValueComments(value));
    const hit = HEX.exec(authored) ?? (authored.includes("var(--") ? null : COLOR_FUNCTION.exec(authored));
    if (hit === null) {
      return;
    }
    const valueIndex = valueIndexOf(declaration, value);
    stylelint.utils.report({
      result,
      ruleName: COLOR,
      node: declaration,
      message: COLOR_MESSAGES.rejected,
      index: valueIndex,
      endIndex: valueIndex + value.length,
    });
  });
};
colorRule.ruleName = COLOR;
colorRule.messages = COLOR_MESSAGES;

const restRule: Rule<true> = (primary) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, REST, { actual: primary, possible: [true] })) {
    return;
  }
  root.walkDecls((declaration) => {
    if (!TRANSFORM_PROPERTIES.has(declaration.prop) || belongsToMotion(declaration)) {
      return;
    }
    const value = authoredValue(declaration);
    const scanned = withoutValueComments(value);
    const hit = FRACTIONAL_PX.exec(scanned) ?? PERCENTAGE.exec(scanned);
    if (hit === null) {
      return;
    }
    const valueIndex = valueIndexOf(declaration, value);
    stylelint.utils.report({
      result,
      ruleName: REST,
      node: declaration,
      message: REST_MESSAGES.rejected,
      index: valueIndex + hit.index,
      endIndex: valueIndex + hit.index + hit[0].length,
    });
  });
};
restRule.ruleName = REST;
restRule.messages = REST_MESSAGES;

// Authored CSS names a condition through a generated `@variant` and a value through a semantic token: a raw
// `@media` re-spells a query the vault owns, and a `--primitive-*` reference skips the semantic tier.
const conditionRule: Rule<true> = (primary) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, CONDITION, { actual: primary, possible: [true] })) {
    return;
  }
  root.walkAtRules("media", (atRule) => {
    stylelint.utils.report({ result, ruleName: CONDITION, node: atRule, message: CONDITION_MESSAGES.media });
  });
  root.walkDecls((declaration) => {
    if (withoutValueComments(authoredValue(declaration)).includes(PRIMITIVE_VAR)) {
      stylelint.utils.report({ result, ruleName: CONDITION, node: declaration, message: CONDITION_MESSAGES.primitive });
    }
  });
};
conditionRule.ruleName = CONDITION;
conditionRule.messages = CONDITION_MESSAGES;

/** Stylesheet-only rules consumed by the native Stylelint configuration. */
export const CSS_RULES = [
  stylelint.createPlugin(MOTION, motionRule),
  stylelint.createPlugin(COLOR, colorRule),
  stylelint.createPlugin(REST, restRule),
  stylelint.createPlugin(CONDITION, conditionRule),
];
