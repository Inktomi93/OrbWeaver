// The native Stylelint configuration: stylelint-config-standard over the hand-written sheets, with Tailwind's
// directives declared, the house value allow-lists, and the orb/ rules (client-architecture-lockdown.md §4.4).
// Biome formats CSS and lints nothing in it, so every CSS check has one owner here.
import { join } from "node:path";
import { unsupportedAtFloor } from "@orb/tooling/browser-support";
import type { Config } from "stylelint";
import { appearanceChannelVocabulary } from "./packages/client/appearance-channel.build.ts";
import { BROWSER_TARGETS } from "./packages/client/browser-targets.ts";
import tokens from "./packages/ui/src/tokens/tokens.json" with { type: "json" };
import { browserSupportCssPlugin } from "./stylelint-browser-support.ts";
import {
  APPEARANCE_UNIT_CONVERSION,
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

/** Tailwind's own at-rules and functions (tailwindcss.com/docs/functions-and-directives). */
const TAILWIND_AT_RULES = ["theme", "utility", "variant", "custom-variant", "source", "reference", "apply", "config", "plugin"];
const TAILWIND_FUNCTIONS = ["--theme", "--spacing", "--alpha"];

const SHEETS = [
  "packages/ui/src/styles/theme.css",
  "packages/ui/src/styles/tiers.css",
  "packages/ui/src/styles/primitives.css",
  "packages/ui/src/styles/waystone.css",
  "packages/ui/src/styles/weave.css",
  "packages/client/src/styles/globals.css",
  "packages/client/src/styles/platform.css",
  "packages/client/src/features/app-shell/surfaces/shell/grid.css",
  "packages/client/src/features/app-shell/surfaces/shell/motion.css",
  "packages/client/src/features/app-shell/surfaces/shell/panels.css",
  "packages/client/src/features/app-shell/surfaces/shell/chrome.css",
].map((relative) => join(import.meta.dirname, relative));

/** Custom properties a component writes at runtime and the sheets read without a fallback; each names its writer. */
const RUNTIME_CUSTOM_PROPERTIES = {
  "--orb-web-spiral-length": "primitives/spinner/spinner.tsx (the spiral's arc length)",
  "--orb-ws-pitch": "charts/meter/waystone.tsx (the lattice step)",
};

const appearance = appearanceChannelVocabulary();
// The registered appearance properties are declared by `@property` in the generated channel and written on the root.
const APPEARANCE_PROPERTIES = Object.fromEntries(appearance.properties.map((name) => [name, "initial"]));

const config: Config = {
  extends: ["stylelint-config-standard"],
  // Codemod fixtures are data: an input spells the old form on purpose.
  ignoreFiles: ["**/dist/**", "**/node_modules/**", "**/codemods/*/tests*/**"],
  plugins: [
    ...CSS_RULES,
    browserSupportCssPlugin(unsupportedAtFloor(BROWSER_TARGETS)),
    "stylelint-value-no-unknown-custom-properties",
    "stylelint-plugin-logical-css",
  ],
  reportNeedlessDisables: true,
  reportDescriptionlessDisables: true,
  reportUnscopedDisables: true,
  reportInvalidScopeDisables: true,
  rules: {
    "orb/rule-in-layer": true,
    "orb/motion-token-purity": true,
    "orb/no-raw-color-in-css": true,
    "orb/rest-transform-grid": [true, { reportDisables: true }],
    "orb/no-raw-media-condition": [true, { containerSteps }],
    "orb/shadow-from-ingredients": true,
    "orb/appearance-name-in-manifest": [true, appearance],
    "orb/browser-support-css": true,
    // Compositor hacks: a permanent layer hint or a backface flip promotes a layer the browser would not, and costs memory on
    // the small devices this app runs on. Animate transform, translate, scale, rotate, opacity and filter.
    "property-disallowed-list": ["/^--leading-[a-z-]+$/", "will-change", "backface-visibility", "-webkit-overflow-scrolling"],
    "declaration-property-value-disallowed-list": { "/^(?:-webkit-)?transform$/": ["/translate(?:3d|Z)\\(/i"] },
    "declaration-property-value-allowed-list": {
      "line-height": [...leadings, "/^var\\(--orb-tier-[a-z-]+-leading\\)$/"],
      "/^--orb-tier-[a-z-]+-leading$/": leadings,
      [LENGTH_PROPERTIES]: [LENGTH_FROM_TOKENS, APPEARANCE_UNIT_CONVERSION],
      "z-index": [...Z_INDEX_VALUES],
      "font-weight": [...FONT_WEIGHT_VALUES],
      "/^--orb-tier-[a-z-]+-weight$/": [FONT_WEIGHT_TOKEN],
      "letter-spacing": [...LETTER_SPACING_VALUES],
    },
    "at-rule-no-unknown": [true, { ignoreAtRules: TAILWIND_AT_RULES }],
    // `@apply` takes a utility name, which the prelude grammar does not know.
    "at-rule-prelude-no-invalid": [true, { ignoreAtRules: ["apply"] }],
    "function-no-unknown": [true, { ignoreFunctions: TAILWIND_FUNCTIONS }],
    // Tailwind processes the string form of `@import`.
    "import-notation": "string",
    // The vault's DTCG colour components are numbers and the generator emits them unchanged, so the served value reads against its source.
    "alpha-value-notation": "number",
    "lightness-notation": "number",
    "hue-degree-notation": "number",
    // Tailwind's namespace resets (`--spacing-*: initial`) end in the wildcard.
    "custom-property-pattern": [
      "^([a-z][a-z0-9]*)(-[a-z0-9]+)*(-\\*)?$",
      { message: (name: string) => `Expected custom property name "${name}" to be kebab-case` },
    ],
    // A rem spelled from a half pixel needs five decimals (10.5px is 0.65625rem).
    "number-max-precision": 5,
    // Font family names are not keywords.
    "value-keyword-case": ["lower", { ignoreProperties: ["/^--font-/"] }],
    // Biome formats the sheets; stylelint does not judge blank lines.
    "at-rule-empty-line-before": null,
    "comment-empty-line-before": null,
    "custom-property-empty-line-before": null,
    "declaration-empty-line-before": null,
    "rule-empty-line-before": null,
    // The sheets' structural maxima, measured; a selector past them is a new specificity trick.
    "selector-max-specificity": "0,9,0",
    "selector-max-compound-selectors": 5,
    "max-nesting-depth": [1, { ignoreAtRules: ["variant"] }],
    "selector-max-id": 0,
    "selector-no-qualifying-type": true,
    "declaration-no-important": true,
    "property-no-vendor-prefix": true,
    "value-no-vendor-prefix": true,
    "declaration-property-value-no-unknown": true,
    "comment-word-disallowed-list": [["/#\\d+/", "/\\b[A-Z]+-\\d+\\b/", "former", "previously", "load-bearing", "used to", "measured"]],
    "csstools/value-no-unknown-custom-properties": [
      true,
      {
        importFrom: [
          ...SHEETS,
          { customProperties: { ...APPEARANCE_PROPERTIES, ...Object.fromEntries(Object.keys(RUNTIME_CUSTOM_PROPERTIES).map((name) => [name, "initial"])) } },
        ],
      },
    ],
    // `overflow-block` and `overflow-inline` are Safari 26, and the floor is Safari 18, so the two axes stay spelled `overflow-y` and `overflow-x`.
    "logical-css/require-logical-properties": [true, { ignore: ["overflow-x", "overflow-y"] }],
    "logical-css/require-logical-keywords": true,
    // The viewport units stay physical: `dvh` and `dvw` are the iPhone platform rules the owner keeps.
    "logical-css/require-logical-units": null,
  },
  overrides: [
    {
      // Generated from the vault: its values are the token sources, so the allow-lists and the orb/ value rules do not apply.
      files: ["packages/ui/src/styles/theme.css"],
      rules: {
        "orb/no-raw-color-in-css": null,
        "orb/no-raw-media-condition": null,
        "orb/shadow-from-ingredients": null,
        "property-disallowed-list": null,
        "declaration-property-value-allowed-list": null,
      },
    },
    {
      // The ui entry compiles without the client's generated variants, so its sheets spell a preference's OS arm with
      // the OS variant beside the root attribute (motion-floor.css).
      files: ["packages/ui/src/styles/**/*.css"],
      rules: { "orb/appearance-name-in-manifest": [true, { ...appearance, osVariants: {} }] },
    },
    {
      // Generated from the appearance manifest: a preference variant's body is Tailwind's `&` + `@slot` form, and its
      // query is read from `MEDIA_QUERIES`, the conditions' one home.
      files: ["packages/client/src/styles/appearance-channel.gen.css"],
      rules: { "nesting-selector-no-missing-scoping-root": null, "orb/no-raw-media-condition": null },
    },
    {
      // The reduced-motion floor exists to beat inline styles; every declaration in it is `!important` by design.
      files: ["packages/ui/src/styles/motion-floor.css"],
      rules: { "declaration-no-important": null },
    },
  ],
};

export default config;
