// `orb/no-undeclared-var-fallback`: a `var(--x, fallback)` of a property nothing declares is always its fallback, and the
// csstools unknown-property rule forgives it. Bare reads stay that rule's.
import valueParser from "postcss-value-parser";
import type { Rule } from "stylelint";
import stylelint from "stylelint";
import { declaredCustomProperties, declaredInCss } from "./tooling/src/css-names/index.ts";

const NAME = "orb/no-undeclared-var-fallback";
const MESSAGE = "reads a custom property no sheet, generated file, runtime writer or vendor declares, so it is always its fallback";

let declared: ReadonlySet<string> | undefined;
function declaredNames(): ReadonlySet<string> {
  declared ??= declaredCustomProperties(import.meta.dirname);
  return declared;
}

const undeclaredFallbackRule: Rule = (primary) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, NAME, { actual: primary, possible: [true] })) {
    return;
  }
  const known = declaredNames();
  const local = new Set(declaredInCss(root.toString()));
  root.walkDecls((declaration) => {
    valueParser(declaration.value).walk((node) => {
      if (node.type !== "function" || node.value !== "var") {
        return;
      }
      const [name, divider] = node.nodes;
      if (name === undefined || divider === undefined || !name.value.startsWith("--")) {
        return;
      }
      if (![known, local].some((names) => names.has(name.value))) {
        stylelint.utils.report({ result, ruleName: NAME, node: declaration, message: `"${name.value}" ${MESSAGE} (${NAME})`, word: name.value });
      }
    });
  });
};
undeclaredFallbackRule.ruleName = NAME;
undeclaredFallbackRule.messages = {};

/** The plugin entry the native Stylelint configuration loads. */
export const CUSTOM_PROPERTY_RULES = [stylelint.createPlugin(NAME, undeclaredFallbackRule)];
