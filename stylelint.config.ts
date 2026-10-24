import type { Config } from "stylelint";
import tokens from "./packages/ui/src/tokens/tokens.json" with { type: "json" };
import {
  CSS_RULES,
  FONT_WEIGHT_TOKEN,
  FONT_WEIGHT_VALUES,
  LENGTH_FROM_TOKENS,
  LENGTH_PROPERTIES,
  LETTER_SPACING_VALUES,
  Z_INDEX_VALUES,
} from "./stylelint-rules.ts";

const leadings = Object.keys(tokens.leading)
  .filter((name) => !name.startsWith("$"))
  .map((name) => `var(--leading-${name})`);

const containerSteps = Object.entries(tokens.container)
  .filter(([name]) => !name.startsWith("$"))
  .flatMap(([, step]) => (typeof step === "object" && "$value" in step ? [step.$value.value] : []));

const config: Config = {
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
    "orb/no-raw-media-condition": [true, { containerSteps }],
    "orb/shadow-from-ingredients": true,
    "property-disallowed-list": ["/^--leading-[a-z-]+$/"],
    "declaration-property-value-allowed-list": {
      "line-height": [...leadings, "/^var\\(--orb-tier-[a-z-]+-leading\\)$/"],
      "/^--orb-tier-[a-z-]+-leading$/": leadings,
      [LENGTH_PROPERTIES]: [LENGTH_FROM_TOKENS],
      "z-index": [...Z_INDEX_VALUES],
      "font-weight": [...FONT_WEIGHT_VALUES],
      "/^--orb-tier-[a-z-]+-weight$/": [FONT_WEIGHT_TOKEN],
      "letter-spacing": [...LETTER_SPACING_VALUES],
    },
  },
  overrides: [
    {
      files: ["packages/ui/src/styles/theme.css"],
      rules: {
        "orb/no-raw-color-in-css": null,
        "orb/no-raw-media-condition": null,
        "orb/shadow-from-ingredients": null,
        "property-disallowed-list": null,
        "declaration-property-value-allowed-list": null,
      },
    },
  ],
};

export default config;
