import tokens from "./packages/ui/src/tokens/tokens.json" with { type: "json" };
import { CSS_RULES } from "./stylelint-rules.js";

const leadings = Object.keys(tokens.leading)
  .filter((name) => !name.startsWith("$"))
  .map((name) => `var(--leading-${name})`);

export default {
  ignoreFiles: ["**/dist/**", "**/node_modules/**"],
  plugins: CSS_RULES,
  reportNeedlessDisables: true,
  reportDescriptionlessDisables: true,
  reportUnscopedDisables: true,
  reportInvalidScopeDisables: true,
  rules: {
    "orb/motion-token-purity": true,
    "orb/no-raw-color-in-css": true,
    "orb/rest-transform-grid": [true, { reportDisables: true }],
    "property-disallowed-list": ["/^--leading-[a-z-]+$/"],
    "declaration-property-value-allowed-list": {
      "line-height": [...leadings, "/^var\\(--orb-tier-[a-z-]+-leading\\)$/"],
      "/^--orb-tier-[a-z-]+-leading$/": leadings,
    },
  },
  overrides: [
    {
      files: ["packages/ui/src/styles/theme.css"],
      rules: { "orb/no-raw-color-in-css": null, "property-disallowed-list": null, "declaration-property-value-allowed-list": null },
    },
  ],
};
