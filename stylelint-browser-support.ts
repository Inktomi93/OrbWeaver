// orb/browser-support-css: a property, value keyword or at-rule that some browser in BROWSER_TARGETS lacks (web-features per-key support).
// A declaration passes inside an `@supports` whose condition names its property or a sibling longhand of its family (`animation-*`); an at-rule inside one that names `at-rule(@name)`.
// Syntax Lightning CSS lowers per BROWSER_TARGETS (nesting, colour functions, media ranges) is not a property, keyword or at-rule key, so it never reaches here.
import valueParser from "postcss-value-parser";
import type { Rule } from "stylelint";
import stylelint from "stylelint";

type Lacking = readonly string[];
type CssRoot = Parameters<ReturnType<Rule>>[0];
type Declaration = Parameters<Parameters<CssRoot["walkDecls"]>[0]>[0];
type CssNode = Declaration | Parameters<Parameters<CssRoot["walkAtRules"]>[0]>[0];
/** What the `@supports` walk reads off an ancestor; every postcss container fits. */
interface Ancestor {
  readonly type: string;
  readonly name?: string;
  readonly params?: string;
  readonly parent?: Ancestor | undefined;
}

const RULE = "orb/browser-support-css";
const PROPERTY = "css.properties.";
const AT_RULE = "css.at-rules.";
const KEYWORD = /^[a-z][a-z0-9-]*$/u;

interface CssSupportIndex {
  readonly properties: Map<string, Lacking>;
  /** property → value keyword → lacking browsers. */
  readonly values: Map<string, Map<string, Lacking>>;
  readonly atRules: Map<string, Lacking>;
}

/** `css.properties.x[.v]` / `css.at-rules.x` as [kind, name, value]; any other key shape (selectors, types, sub-features) is not a use here. */
function parseKey(key: string): ["at-rule" | "property", string, string | undefined] | null {
  const kind = key.startsWith(AT_RULE) ? "at-rule" : "property";
  const prefix = kind === "at-rule" ? AT_RULE : PROPERTY;
  const [name, value, ...rest] = key.slice(prefix.length).split(".");
  const spelled = key.startsWith(prefix) && rest.length === 0 && KEYWORD.test(name ?? "") && (value === undefined || KEYWORD.test(value));
  return spelled && name !== undefined ? [kind, name, value] : null;
}

function indexCss(unsupported: ReadonlyMap<string, Lacking>): CssSupportIndex {
  const index: CssSupportIndex = { properties: new Map(), values: new Map(), atRules: new Map() };
  for (const [key, lacking] of unsupported) {
    const [kind, name, value] = parseKey(key) ?? [];
    if (name === undefined) {
      continue;
    }
    if (kind === "at-rule") {
      // `css.at-rules.supports.selector` is a sub-feature of a supported at-rule, not the at-rule.
      if (value === undefined) {
        index.atRules.set(name, lacking);
      }
    } else if (value === undefined) {
      index.properties.set(name, lacking);
    } else {
      index.values.set(name, (index.values.get(name) ?? new Map()).set(value, lacking));
    }
  }
  return index;
}

/** True when an enclosing `@supports` condition matches `pattern`. */
function underSupports(node: CssNode, pattern: RegExp): boolean {
  for (let parent: Ancestor | undefined = node.parent; parent !== undefined; parent = parent.parent) {
    if (parent.type === "atrule" && parent.name?.toLowerCase() === "supports" && pattern.test(parent.params ?? "")) {
      return true;
    }
  }
  return false;
}

/** The css plugin over the compat keys the declared floor lacks (`unsupportedAtFloor`). */
export function browserSupportCssPlugin(unsupported: ReadonlyMap<string, Lacking>): ReturnType<typeof stylelint.createPlugin> {
  const index = indexCss(unsupported);
  const rule: Rule<true> = (primary) => (root, result) => {
    if (!stylelint.utils.validateOptions(result, RULE, { actual: primary, possible: [true] })) {
      return;
    }
    const refuse = (node: CssNode, what: string, lacking: Lacking): void => {
      stylelint.utils.report({
        result,
        ruleName: RULE,
        node,
        message: `${what} is missing in ${lacking.join(", ")}, which are in the declared browser floor (packages/client/browser-targets.ts); put it under an @supports that names it or drop it (${RULE})`,
      });
    };
    root.walkDecls((declaration) => {
      const property = declaration.prop.toLowerCase();
      // A longhand of the same family (`animation-range` under `@supports (animation-timeline: ...)`) rides its sibling's test.
      const family = property.split("-")[0];
      if (property.startsWith("-") || underSupports(declaration, new RegExp(String.raw`(?<![\w-])(?:${property}|${family}-[a-z-]+)\s*:`, "u"))) {
        return;
      }
      const lacking = index.properties.get(property);
      if (lacking !== undefined) {
        refuse(declaration, `\`${property}\``, lacking);
        return;
      }
      const keywords = index.values.get(property);
      valueParser(keywords === undefined ? "" : declaration.value).walk((token) => {
        const missing = token.type === "word" ? keywords?.get(token.value.toLowerCase()) : undefined;
        if (missing !== undefined) {
          refuse(declaration, `\`${property}: ${token.value}\``, missing);
        }
      });
    });
    root.walkAtRules((atRule) => {
      const name = atRule.name.toLowerCase();
      const lacking = index.atRules.get(name);
      if (lacking !== undefined && !underSupports(atRule, new RegExp(String.raw`at-rule\(\s*@${name}\s*\)`, "u"))) {
        refuse(atRule, `\`@${name}\``, lacking);
      }
    });
  };
  rule.ruleName = RULE;
  rule.messages = {};
  return stylelint.createPlugin(RULE, rule);
}
