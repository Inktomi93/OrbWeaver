// Stylesheet-only token checks run directly on Stylelint's PostCSS nodes.
import { blankText } from "@orb/kit/strings";
import valueParser from "postcss-value-parser";

import stylelint from "stylelint";

const MOTION = "orb/motion-token-purity";
const COLOR = "orb/no-raw-color-in-css";
const REST = "orb/rest-transform-grid";
const CONDITION = "orb/no-raw-media-condition";
const PRIMITIVE_VAR = /var\(--primitive-/u;
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

function withoutValueComments(value) {
  const spans = [];
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

function withoutColorStrings(value) {
  const spans = [];
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

function isReducedDuration(declaration) {
  if (!DURATION_PROPERTIES.has(declaration.prop)) {
    return false;
  }
  const owner = declaration.parent;
  if (owner?.type === "rule" && REDUCED_MOTION.test(owner.selector)) {
    return true;
  }
  for (let parent = owner; parent !== undefined; parent = parent.parent) {
    if (parent.type === "atrule" && REDUCED_MOTION.test(`${parent.name} ${parent.params}`)) {
      return true;
    }
  }
  return false;
}

function belongsToMotion(declaration) {
  const owner = declaration.parent;
  if (owner?.type === "rule" && STATE_SELECTOR.test(owner.selector)) {
    return true;
  }
  for (let parent = owner; parent !== undefined; parent = parent.parent) {
    if (parent.type === "atrule" && ANIMATING_AT_RULE.test(`${parent.name} ${parent.params}`)) {
      return true;
    }
  }
  return false;
}

function motionHits(scanned) {
  return [...[...scanned.matchAll(RAW_TIME)].filter((match) => Number(match.groups?.["num"]) !== 0), ...scanned.matchAll(RAW_EASE)].toSorted(
    (left, right) => left.index - right.index,
  );
}

function reportMotionDeclaration(declaration, result) {
  if (!MOTION_PROPERTIES.has(declaration.prop)) {
    return;
  }
  if (isReducedDuration(declaration)) {
    return;
  }
  const value = declaration.raws.value?.raw ?? declaration.value;
  // Single-pass blanking is deliberate: nested calc containing a raw time remains reportable.
  const scanned = withoutValueComments(value).replace(/\b(?:var|calc)\s*\([^()]*\)/gu, blankText);
  const valueIndex = declaration.toString().indexOf(value, declaration.prop.length);
  if (valueIndex === -1) {
    throw new Error("Native motion declaration has no authored value range");
  }
  const hits = motionHits(scanned);
  for (const hit of hits) {
    const token = hit[0].startsWith("cubic-bezier") ? "cubic-bezier" : hit[0];
    stylelint.utils.report({
      result,
      ruleName: MOTION,
      node: declaration,
      message: motionRule.messages.rejected,
      index: valueIndex + hit.index,
      endIndex: valueIndex + hit.index + token.length,
    });
  }
}

function motionRule(primary) {
  return (root, result) => {
    if (!stylelint.utils.validateOptions(result, MOTION, { actual: primary, possible: [true] })) {
      return;
    }
    root.walkDecls((declaration) => reportMotionDeclaration(declaration, result));
  };
}
motionRule.ruleName = MOTION;
motionRule.messages = stylelint.utils.ruleMessages(MOTION, { rejected: "Use motion/easing tokens for coordinated CSS motion" });

function colorRule(primary) {
  return (root, result) => {
    if (!stylelint.utils.validateOptions(result, COLOR, { actual: primary, possible: [true] })) {
      return;
    }
    root.walkDecls((declaration) => {
      const value = declaration.raws.value?.raw ?? declaration.value;
      // Quoted tokens cannot join neighboring fragments into an unquoted color function or hex value.
      const authored = withoutColorStrings(withoutValueComments(value));
      const hit = HEX.exec(authored) ?? (authored.includes("var(--") ? null : COLOR_FUNCTION.exec(authored));
      if (hit === null) {
        return;
      }
      const valueIndex = declaration.toString().indexOf(value, declaration.prop.length);
      if (valueIndex === -1) {
        throw new Error("Native color declaration has no authored value range");
      }
      stylelint.utils.report({
        result,
        ruleName: COLOR,
        node: declaration,
        message: colorRule.messages.rejected,
        index: valueIndex,
        endIndex: valueIndex + value.length,
      });
    });
  };
}
colorRule.ruleName = COLOR;
colorRule.messages = stylelint.utils.ruleMessages(COLOR, { rejected: "Use a color token or token-derived relative color outside generated theme.css" });

function restRule(primary) {
  return (root, result) => {
    if (!stylelint.utils.validateOptions(result, REST, { actual: primary, possible: [true] })) {
      return;
    }
    root.walkDecls((declaration) => {
      if (!TRANSFORM_PROPERTIES.has(declaration.prop)) {
        return;
      }
      if (belongsToMotion(declaration)) {
        return;
      }
      const value = declaration.raws.value?.raw ?? declaration.value;
      const scanned = withoutValueComments(value);
      const hit = FRACTIONAL_PX.exec(scanned) ?? PERCENTAGE.exec(scanned);
      if (hit === null) {
        return;
      }
      const valueIndex = declaration.toString().indexOf(value, declaration.prop.length);
      if (valueIndex === -1) {
        throw new Error("Native transform declaration has no authored value range");
      }
      stylelint.utils.report({
        result,
        ruleName: REST,
        node: declaration,
        message: restRule.messages.rejected,
        index: valueIndex + hit.index,
        endIndex: valueIndex + hit.index + hit[0].length,
      });
    });
  };
}
restRule.ruleName = REST;
restRule.messages = stylelint.utils.ruleMessages(REST, { rejected: "A fractional-pixel or percentage transform must belong to motion, not rest" });

// Authored CSS names a condition through a generated `@variant` and a value through a semantic token: a raw
// `@media` re-spells a query the vault owns, and a `--primitive-*` reference skips the semantic tier.
function conditionRule(primary) {
  return (root, result) => {
    if (!stylelint.utils.validateOptions(result, CONDITION, { actual: primary, possible: [true] })) {
      return;
    }
    root.walkAtRules("media", (atRule) => {
      stylelint.utils.report({ result, ruleName: CONDITION, node: atRule, message: conditionRule.messages.media });
    });
    root.walkDecls((declaration) => {
      const value = declaration.raws.value?.raw ?? declaration.value;
      if (PRIMITIVE_VAR.test(withoutValueComments(value))) {
        stylelint.utils.report({ result, ruleName: CONDITION, node: declaration, message: conditionRule.messages.primitive });
      }
    });
  };
}
conditionRule.ruleName = CONDITION;
conditionRule.messages = stylelint.utils.ruleMessages(CONDITION, {
  media: "Spell a media condition as a generated @variant (pointer-coarse, motion-reduce, shell-mobile, …), never a raw @media",
  primitive: "A primitive ramp step is referenced directly; use the semantic token that aliases it",
});

/** Stylesheet-only rules consumed by the native Stylelint configuration. */
export const CSS_RULES = [
  stylelint.createPlugin(MOTION, motionRule),
  stylelint.createPlugin(COLOR, colorRule),
  stylelint.createPlugin(REST, restRule),
  stylelint.createPlugin(CONDITION, conditionRule),
];
