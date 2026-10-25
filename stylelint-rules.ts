// Stylesheet-only token checks run directly on Stylelint's PostCSS nodes, plus the value allow-lists the config composes.
import { isPlainObject } from "@orb/kit/guards";
import { blankText } from "@orb/kit/strings";
import valueParser from "postcss-value-parser";
import type { PostcssResult, Rule } from "stylelint";
import stylelint from "stylelint";

type CssRoot = Parameters<ReturnType<Rule>>[0];
type Declaration = Parameters<Parameters<CssRoot["walkDecls"]>[0]>[0];
type AtRule = Parameters<Parameters<CssRoot["walkAtRules"]>[0]>[0];
type StyleRule = Parameters<Parameters<CssRoot["walkRules"]>[0]>[0];

const MOTION = "orb/motion-token-purity";
const COLOR = "orb/no-raw-color-in-css";
const REST = "orb/rest-transform-grid";
const CONDITION = "orb/no-raw-media-condition";
const PRIMITIVE_VAR = "var(--primitive-";
const MOTION_PROPERTIES = new Set(["transition", "animation", "transition-duration", "animation-duration", "transition-timing-function"]);
const DURATION_PROPERTIES = new Set(["transition-duration", "animation-duration"]);
const REDUCED_MOTION = /prefers-reduced-motion|motion-reduce|appearance-reduced-motion/u;
const RAW_TIME = /(?<![\w.-])(?<num>\d+(?:\.\d+)?|\.\d+)(?:ms|s)\b/gu;
// A bare easing keyword or bezier; `--ease-*` token names are excluded by the lookbehind.
const RAW_EASE = /(?<!-)\b(?:ease-in-out|ease-in|ease-out|ease)\b(?!-)|cubic-bezier\s*\(/gu;
// A continuous decorative loop has no partner to drift from, so its easing is its own; its duration still rides a token.
const DECORATIVE_LOOP = /\binfinite\b/u;
const HEX = /#[0-9a-fA-F]{3,8}\b/u;
const COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch)\s*\(|(?<![\w-])color\s*\(/u;
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
  container: "A container condition's length is a rem value of the container.cq-* ladder; a container query cannot read a variable, so lint binds it",
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
/** A registered appearance number read in its unit; the `1<unit>` is a conversion, not a design length. */
export const APPEARANCE_UNIT_CONVERSION = /^calc\(var\(--appearance-[a-z0-9-]+\) \* 1(?:px|em|rem)\)$/u;
/** Tracking is a `--tracking-*` token; the reading surface's user knob is a declared exception (integer-line-boxes.md §2). */
export const LETTER_SPACING_VALUES = [/^var\(--tracking-[a-z-]+\)$/u, APPEARANCE_UNIT_CONVERSION, "normal", "inherit"] as const;

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

function motionHits(scanned: string, easing: boolean): RegExpExecArray[] {
  const times = [...scanned.matchAll(RAW_TIME)].filter((match) => Number(match.groups?.["num"]) !== 0);
  return [...times, ...(easing ? scanned.matchAll(RAW_EASE) : [])].toSorted((left, right) => left.index - right.index);
}

function reportMotionDeclaration(declaration: Declaration, result: PostcssResult): void {
  if (!MOTION_PROPERTIES.has(declaration.prop) || isReducedDuration(declaration)) {
    return;
  }
  const value = authoredValue(declaration);
  // Single-pass blanking is deliberate: nested calc containing a raw time remains reportable.
  const scanned = withoutValueComments(value).replace(/\b(?:var|calc)\s*\([^()]*\)/gu, blankText);
  const valueIndex = valueIndexOf(declaration, value);
  const easing = !(declaration.prop === "animation" && DECORATIVE_LOOP.test(scanned));
  for (const hit of motionHits(scanned, easing)) {
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
const CONTAINER_LENGTH = /(\d+(?:\.\d+)?)(px|rem|em)\b/gu;

/** A container condition cannot read a variable, so its lengths are bound to the container steps by lint instead. */
function containerLengthsOffLadder(params: string, steps: ReadonlySet<number>): boolean {
  return [...params.matchAll(CONTAINER_LENGTH)].some((match) => match[2] !== "rem" || !steps.has(Number(match[1])));
}

const conditionRule: Rule<true, { readonly containerSteps?: readonly number[] } | undefined> = (primary, secondary) => (root, result) => {
  const options = { actual: secondary, possible: { containerSteps: [(value: unknown): boolean => typeof value === "number"] }, optional: true };
  if (!stylelint.utils.validateOptions(result, CONDITION, { actual: primary, possible: [true] }, options)) {
    return;
  }
  const steps = new Set(secondary?.containerSteps ?? []);
  root.walkAtRules("media", (atRule) => {
    stylelint.utils.report({ result, ruleName: CONDITION, node: atRule, message: CONDITION_MESSAGES.media });
  });
  root.walkAtRules("container", (atRule) => {
    if (containerLengthsOffLadder(atRule.params, steps)) {
      stylelint.utils.report({ result, ruleName: CONDITION, node: atRule, message: CONDITION_MESSAGES.container });
    }
  });
  root.walkDecls((declaration) => {
    if (withoutValueComments(authoredValue(declaration)).includes(PRIMITIVE_VAR)) {
      stylelint.utils.report({ result, ruleName: CONDITION, node: declaration, message: CONDITION_MESSAGES.primitive });
    }
  });
};
conditionRule.ruleName = CONDITION;
conditionRule.messages = CONDITION_MESSAGES;

// ADR 0200: a shadow's colours resolve through served variables (an ingredient, a relative colour from one, or a
// mix over one) so a theme override reaches them; a frozen literal stays one colour under every palette.
const SHADOW = "orb/shadow-from-ingredients";
// A `--color-shadow-*` ingredient DEFINITION is a colour, not a shadow; it lives in the generated theme.
const SHADOW_PROPERTY = /^(?:box-shadow|text-shadow|filter|--(?!color-)[a-z0-9-]*(?:shadow|band)[a-z0-9-]*)$/u;
const SERVED_COLOR_FORMS =
  /\b(?:oklch|oklab|rgb|hsl|lab|lch|color-mix)\((?:[^()]|\([^()]*\))*var\(--color-[a-z0-9-]+\)(?:[^()]|\([^()]*\))*\)|var\(--[a-z0-9-]+(?:,[^)]*)?\)/gu;
const FROZEN_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(/iu;
const SHADOW_MESSAGES = messagesOf(SHADOW, {
  rejected: "A shadow colour is a served --color-* variable, a relative colour from one, or a mix over one, never a literal",
});

const shadowRule: Rule<true> = (primary) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, SHADOW, { actual: primary, possible: [true] })) {
    return;
  }
  root.walkDecls((declaration) => {
    if (!SHADOW_PROPERTY.test(declaration.prop)) {
      return;
    }
    const value = authoredValue(declaration);
    const scanned = withoutValueComments(value).replace(SERVED_COLOR_FORMS, blankText);
    if (!FROZEN_COLOR.test(scanned)) {
      return;
    }
    const valueIndex = valueIndexOf(declaration, value);
    stylelint.utils.report({
      result,
      ruleName: SHADOW,
      node: declaration,
      message: SHADOW_MESSAGES.rejected,
      index: valueIndex,
      endIndex: valueIndex + value.length,
    });
  });
};
shadowRule.ruleName = SHADOW;
shadowRule.messages = SHADOW_MESSAGES;

const LAYER = "orb/rule-in-layer";
const LAYER_MESSAGES = messagesOf(LAYER, { rejected: "Every style rule sits inside a declared @layer block; Tailwind's own at-rules place themselves" });
// The at-rules Tailwind or the browser places for us; a rule inside one needs no layer of its own.
const SELF_PLACING_AT_RULE = /^(?:utility|theme|custom-variant|keyframes|property|font-face)\b/u;

function insideLayer(rule: StyleRule): boolean {
  for (let parent: unknown = rule.parent; typeof parent === "object" && parent !== null; parent = (parent as { parent?: unknown }).parent) {
    if (isAtRule(parent) && (parent.name === "layer" || SELF_PLACING_AT_RULE.test(parent.name))) {
      return true;
    }
  }
  return false;
}

const layerRule: Rule<true> = (primary) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, LAYER, { actual: primary, possible: [true] })) {
    return;
  }
  root.walkRules((rule) => {
    if (!insideLayer(rule)) {
      stylelint.utils.report({ result, ruleName: LAYER, node: rule, message: LAYER_MESSAGES.rejected });
    }
  });
};
layerRule.ruleName = LAYER;
layerRule.messages = LAYER_MESSAGES;

// The shell region files paint the shell's own surfaces from tokens and never skin a component. `@scope` with a
// lower boundary is not the mechanism: it needs Firefox 146 and the declared floor is Firefox 138 (browser-targets.ts).
const SHELL = "orb/shell-paint-law";
const SHELL_MESSAGES = messagesOf(SHELL, {
  colour: "A shell region paints a colour only as a semantic token reference, or a relative colour or color-mix over one",
  slot: "A shell region selector names only a data-slot the shell owns or coordinates; a component's skin lives with the component",
  class: "A shell region selector names only .shell-* classes or a listed coordination class; an @orb/ui class belongs to its component",
});
const ATTRIBUTE_SELECTOR = /\[[^\]]*\]/gu;
const SLOT_SELECTOR = /\[data-slot\s*[~|^$*]?=\s*["']?(?<slot>[^"'\]\s]+)/gu;
const CLASS_SELECTOR = /\.(?<name>-?[_a-zA-Z][\w-]*)/gu;
// A relative colour whose origin is a served `--color-*` token, passed through unchanged: its three colour channels are
// that colour space's own keywords in order and only the alpha slot varies. Any `calc()`, literal, `none` or other
// keyword in a colour channel writes a new colour; a tint or shade is a token or a `color-mix` over tokens.
const COLOUR_SPACE_CHANNELS: Readonly<Record<string, string>> = {
  rgb: "r g b",
  rgba: "r g b",
  hsl: "h s l",
  hsla: "h s l",
  hwb: "h w b",
  lab: "l a b",
  oklab: "l a b",
  lch: "l c h",
  oklch: "l c h",
};
const RELATIVE_COLOR = new RegExp(
  String.raw`\b(?<space>${Object.keys(COLOUR_SPACE_CHANNELS).join("|")})\(\s*from\s+var\(--color-[a-z0-9-]+\)\s+(?<channels>[a-z]+\s+[a-z]+\s+[a-z]+)(?:\s*/(?:[^()]|\([^()]*\))*)?\)`,
  "giu",
);

/** Blank the relative colours that pass the origin token through; any other stays to be refused. */
function withoutServedRelativeColors(value: string): string {
  return value.replace(RELATIVE_COLOR, (match, ...rest) => {
    const groups = rest.at(-1) as Record<string, string>;
    const identity = COLOUR_SPACE_CHANNELS[(groups["space"] ?? "").toLowerCase()];
    return (groups["channels"] ?? "").toLowerCase().split(/\s+/u).join(" ") === identity ? blankText(match) : match;
  });
}
const SHELL_CLASS_PREFIX = "shell-";

type ShellOptions = { readonly slots?: readonly string[]; readonly classes?: readonly string[] } | undefined;

/** The component references in one selector the shell neither owns nor coordinates, as message keys. */
function foreignSelectorParts(selector: string, slots: ReadonlySet<string>, classes: ReadonlySet<string>): ("slot" | "class")[] {
  const foreignSlots = [...selector.matchAll(SLOT_SELECTOR)].filter((match) => !slots.has(match.groups?.["slot"] ?? ""));
  const foreignClasses = [...selector.replace(ATTRIBUTE_SELECTOR, blankText).matchAll(CLASS_SELECTOR)].filter((match) => {
    const name = match.groups?.["name"] ?? "";
    return !(name.startsWith(SHELL_CLASS_PREFIX) || classes.has(name));
  });
  return [...foreignSlots.map((): "slot" => "slot"), ...foreignClasses.map((): "class" => "class")];
}

function spellsLiteralColour(value: string): boolean {
  const scanned = withoutServedRelativeColors(withoutColorStrings(withoutValueComments(value)));
  return HEX.test(scanned) || COLOR_FUNCTION.test(scanned);
}

const shellRule: Rule<true, ShellOptions> = (primary, secondary) => (root, result) => {
  const list = [(value: unknown): boolean => typeof value === "string"];
  const options = { actual: secondary, possible: { slots: list, classes: list }, optional: true };
  if (!stylelint.utils.validateOptions(result, SHELL, { actual: primary, possible: [true] }, options)) {
    return;
  }
  const slots = new Set(secondary?.slots ?? []);
  const classes = new Set(secondary?.classes ?? []);
  root.walkRules((rule) => {
    for (const part of foreignSelectorParts(withoutValueComments(rule.selector), slots, classes)) {
      stylelint.utils.report({ result, ruleName: SHELL, node: rule, message: SHELL_MESSAGES[part] });
    }
  });
  root.walkDecls((declaration) => {
    const value = authoredValue(declaration);
    if (!spellsLiteralColour(value)) {
      return;
    }
    const valueIndex = valueIndexOf(declaration, value);
    stylelint.utils.report({
      result,
      ruleName: SHELL,
      node: declaration,
      message: SHELL_MESSAGES.colour,
      index: valueIndex,
      endIndex: valueIndex + value.length,
    });
  });
};
shellRule.ruleName = SHELL;
shellRule.messages = SHELL_MESSAGES;

// The appearance channel's names come from the client manifest (`appearance-channel.build.ts`); a sheet that spells
// one the channel does not write reads a value nothing ever sets.
const APPEARANCE = "orb/appearance-name-in-manifest";
const APPEARANCE_MESSAGES = messagesOf(APPEARANCE, {
  rejected: "is not an appearance channel name; the manifest (appearance-carrier-manifest.ts) declares every one",
  osOnly: "an OS-only variant ignores the app's on and off; use the resolved appearance variant",
  unguarded: "under an OS-only variant every selector starts with the root guard, so the app's off beats the OS",
});
const APPEARANCE_PROPERTY = /--appearance-[a-z0-9-]+/gu;
const APPEARANCE_ATTRIBUTE = /data-appearance-[a-z0-9-]+/gu;
const APPEARANCE_VARIANT = /(?<![\w-])appearance-[a-z0-9-]+/gu;

/** The names the generated channel declares: the registered properties, the root attributes and the variants. */
export interface AppearanceVocabulary {
  readonly properties: readonly string[];
  readonly attributes: readonly string[];
  readonly variants: readonly string[];
  /** An OS-only preference variant → the resolved variant that honours the app's `on` and `off` over it. */
  readonly osVariants?: Readonly<Record<string, string>>;
  /**
   * Admit an OS-only variant when every selector under it starts with the root guard
   * (`:root:not([data-appearance-<key>="off"])`). The ui sheets compile without the client's resolved variants, so
   * they spell the OS arm this way beside the `on` arm.
   */
  readonly osGuard?: boolean;
}

// `motion-safe` negates `motion-reduce`, which no resolved variant can express.
const MOTION_SAFE = "motion-safe";

function isStyleRule(node: unknown): node is StyleRule {
  return typeof node === "object" && node !== null && (node as { type?: unknown }).type === "rule";
}

/** The nearest style rule a node sits inside, through any at-rules, or undefined at the top of the sheet or a layer. */
function enclosingRule(node: { readonly parent?: unknown }): StyleRule | undefined {
  for (let parent: unknown = node.parent; typeof parent === "object" && parent !== null; parent = (parent as { parent?: unknown }).parent) {
    if (isStyleRule(parent)) {
      return parent;
    }
  }
  return undefined;
}

/**
 * The selectors a rule matches once nesting is resolved through every ancestor rule: `&` stands for the parent's
 * selector, and a selector without `&` is the parent's descendant.
 */
function effectiveSelectors(rule: StyleRule): readonly string[] {
  const parent = enclosingRule(rule);
  const own = rule.selectors.map((selector) => selector.trim());
  if (parent === undefined) {
    return own;
  }
  const outer = effectiveSelectors(parent);
  return own.flatMap((selector) => outer.map((base) => (selector.includes("&") ? selector.replaceAll("&", base) : `${base} ${selector}`)));
}

/** A declaration reachable from the at-rule without crossing a style rule: it styles the enclosing rule's selectors. */
function holdsDeclarations(atRule: AtRule): boolean {
  return (atRule.nodes ?? []).some((node) => node.type === "decl" || (isAtRule(node) && holdsDeclarations(node)));
}

/**
 * Whether everything a variant styles sits under the root guard: every style rule inside it, and, when declarations
 * sit in it directly or through nested at-rules, the rule that encloses it, each with nesting resolved.
 */
function guardedSelectors(atRule: AtRule, guard: string): boolean {
  const isGuarded = (rule: StyleRule | undefined): boolean => rule !== undefined && effectiveSelectors(rule).every((selector) => selector.startsWith(guard));
  let guarded = !holdsDeclarations(atRule) || isGuarded(enclosingRule(atRule));
  atRule.walk((node) => {
    if (isStyleRule(node) && !isGuarded(node)) {
      guarded = false;
    }
  });
  return guarded;
}

type ReportNode = Parameters<typeof stylelint.utils.report>[0]["node"];

/** The rule's reporters over one vocabulary and one result. */
interface AppearanceChecks {
  /** Report each match of `pattern` in `text` that the vocabulary does not declare. */
  readonly names: (node: ReportNode, text: string, pattern: RegExp) => void;
  /** Report an OS-only preference variant, naming its resolved replacement when one exists. */
  readonly osOnly: (node: AtRule, name: string) => void;
}

function appearanceChecks(vocabulary: AppearanceVocabulary, result: PostcssResult): AppearanceChecks {
  const known = new Set([...vocabulary.properties, ...vocabulary.attributes, ...vocabulary.variants]);
  return {
    names: (node, text, pattern): void => {
      for (const match of text.matchAll(pattern)) {
        if (!known.has(match[0])) {
          stylelint.utils.report({ result, ruleName: APPEARANCE, node, message: `"${match[0]}" ${APPEARANCE_MESSAGES.rejected}`, word: match[0] });
        }
      }
    },
    osOnly: (node, name): void => {
      const resolved = vocabulary.osVariants?.[name];
      const remedy = resolved === undefined ? "" : ` → "${resolved}"`;
      stylelint.utils.report({ result, ruleName: APPEARANCE, node, message: `"${name}"${remedy}: ${APPEARANCE_MESSAGES.osOnly}`, word: name });
    },
  };
}

// A utility's variant prefix is a variant too, and a sheet cannot guard it, so an OS-only one is refused here.
function checkApply(atRule: AtRule, vocabulary: AppearanceVocabulary, checks: AppearanceChecks): void {
  for (const segment of atRule.params.split(/\s+/u).flatMap((candidate) => candidate.split(":").slice(0, -1))) {
    const variant = segment.replace(/^not-/u, "");
    checks.names(atRule, variant, APPEARANCE_VARIANT);
    if (variant === MOTION_SAFE || vocabulary.osVariants?.[variant] !== undefined) {
      checks.osOnly(atRule, variant);
    }
  }
}

function checkVariant(atRule: AtRule, vocabulary: AppearanceVocabulary, checks: AppearanceChecks, result: PostcssResult): void {
  const name = atRule.params.split(/\s/u)[0] ?? "";
  checks.names(atRule, name, APPEARANCE_VARIANT);
  const resolved = atRule.name === "variant" ? vocabulary.osVariants?.[name] : undefined;
  if (resolved === undefined) {
    return;
  }
  const guard = `:root:not([data-${resolved}="off"])`;
  if (vocabulary.osGuard !== true) {
    checks.osOnly(atRule, name);
  } else if (!guardedSelectors(atRule, guard)) {
    stylelint.utils.report({ result, ruleName: APPEARANCE, node: atRule, message: `"${name}": ${APPEARANCE_MESSAGES.unguarded} (${guard})`, word: name });
  }
}

const appearanceRule: Rule<true, AppearanceVocabulary> = (primary, secondary) => (root, result) => {
  const strings = [(value: unknown): boolean => typeof value === "string"];
  const options = {
    actual: secondary,
    possible: {
      properties: strings,
      attributes: strings,
      variants: strings,
      osVariants: [isPlainObject],
      osGuard: [(value: unknown): boolean => typeof value === "boolean"],
    },
  };
  if (!stylelint.utils.validateOptions(result, APPEARANCE, { actual: primary, possible: [true] }, options)) {
    return;
  }
  const checks = appearanceChecks(secondary, result);
  root.walkDecls((declaration) => {
    checks.names(declaration, declaration.prop, APPEARANCE_PROPERTY);
    checks.names(declaration, withoutValueComments(authoredValue(declaration)), APPEARANCE_PROPERTY);
  });
  root.walkRules((rule) => {
    checks.names(rule, rule.selector, APPEARANCE_ATTRIBUTE);
  });
  root.walkAtRules((atRule) => {
    checks.names(atRule, atRule.params, APPEARANCE_ATTRIBUTE);
    if (atRule.name === "apply") {
      checkApply(atRule, secondary, checks);
    } else if (atRule.name === "variant" || atRule.name === "custom-variant") {
      checkVariant(atRule, secondary, checks, result);
    }
  });
};
appearanceRule.ruleName = APPEARANCE;
appearanceRule.messages = APPEARANCE_MESSAGES;

/** Stylesheet-only rules consumed by the native Stylelint configuration. */
export const CSS_RULES = [
  stylelint.createPlugin(SHELL, shellRule),
  stylelint.createPlugin(LAYER, layerRule),
  stylelint.createPlugin(MOTION, motionRule),
  stylelint.createPlugin(COLOR, colorRule),
  stylelint.createPlugin(REST, restRule),
  stylelint.createPlugin(CONDITION, conditionRule),
  stylelint.createPlugin(SHADOW, shadowRule),
  stylelint.createPlugin(APPEARANCE, appearanceRule),
];
