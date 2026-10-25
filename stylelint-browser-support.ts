// orb/browser-support-css: a property, value keyword or at-rule that some browser in BROWSER_TARGETS lacks (MDN per-key support).
// A declaration passes inside an `@supports` whose condition names its property or a sibling longhand of its family (`animation-*`),
// and a property listed in the rule's `harmless` option passes bare. An at-rule passes inside `@supports at-rule(@name)`.
// Syntax Lightning CSS lowers per BROWSER_TARGETS (nesting, colour functions, media ranges) is not a property, keyword or at-rule key, so it never reaches here.
import { indexCss, refusedDeclaration } from "@orb/tooling/browser-support";
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

export interface BrowserSupportCssOptions {
  /** Property → why a browser ignoring it changes no layout or behavior. */
  readonly harmless: Readonly<Record<string, string>>;
}

const RULE = "orb/browser-support-css";

/** The conditions of the `@supports` rules enclosing a node. */
function supportsConditions(node: CssNode): string[] {
  const conditions: string[] = [];
  for (let parent: Ancestor | undefined = node.parent; parent !== undefined; parent = parent.parent) {
    if (parent.type === "atrule" && parent.name?.toLowerCase() === "supports") {
      conditions.push(parent.params ?? "");
    }
  }
  return conditions;
}

/** The properties a `@supports` condition tests (`(animation-timeline: scroll())` gives `animation-timeline`). */
const testedProperties = (condition: string): string[] => [...condition.matchAll(/\(\s*([a-z][a-z-]*)\s*:/gu)].map(([, name = ""]) => name);

/** The css plugin over the compat keys the declared floor lacks (`unsupportedAtFloor`). */
export function browserSupportCssPlugin(unsupported: ReadonlyMap<string, Lacking>): ReturnType<typeof stylelint.createPlugin> {
  const rule: Rule<true, BrowserSupportCssOptions> = (primary, secondary) => (root, result) => {
    const options = { actual: secondary, possible: { harmless: [(value: unknown): boolean => typeof value === "object" && value !== null] } };
    if (!stylelint.utils.validateOptions(result, RULE, { actual: primary, possible: [true] }, options)) {
      return;
    }
    const index = indexCss(unsupported, secondary.harmless);
    const refuse = (node: CssNode, what: string, lacking: Lacking): void => {
      stylelint.utils.report({
        result,
        ruleName: RULE,
        node,
        message: `${what} is missing in ${lacking.join(", ")}, which are in the declared browser floor (packages/client/browser-targets.ts); put it under an @supports that names it, list it as harmless there, or drop it (${RULE})`,
      });
    };
    root.walkDecls((declaration) => {
      const property = declaration.prop.toLowerCase();
      // A longhand rides a sibling's test only when that sibling is itself missing at the floor and shares its family
      // (`animation-range` under `@supports (animation-timeline: ...)`); `(text-wrap: pretty)` vouches for no other `text-*`.
      const family = property.split("-")[0];
      const guarded = supportsConditions(declaration)
        .flatMap(testedProperties)
        .some((tested) => tested === property || (index.properties.has(tested) && tested.split("-")[0] === family));
      if (property.startsWith("-") || guarded) {
        return;
      }
      const refused = refusedDeclaration(index, property, declaration.value);
      if (refused !== null) {
        refuse(declaration, refused.what, refused.lacking);
      }
    });
    root.walkAtRules((atRule) => {
      const name = atRule.name.toLowerCase();
      const lacking = index.atRules.get(name);
      const guard = new RegExp(String.raw`at-rule\(\s*@${name}\s*\)`, "u");
      if (lacking !== undefined && !supportsConditions(atRule).some((condition) => guard.test(condition))) {
        refuse(atRule, `\`@${name}\``, lacking);
      }
    });
  };
  rule.ruleName = RULE;
  rule.messages = {};
  return stylelint.createPlugin(RULE, rule);
}
