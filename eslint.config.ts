import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { staticImportGraph, unsupportedAtFloor, withoutPolyfilled } from "@orb/tooling/browser-support";
import { authorClassIgnores, baseUiDoors, classClassifier, createOrbPlugin } from "@orb/tooling/eslint";
import { BUTTON_SIZE_OVERFLOW } from "@orb/ui/button/size-hit-area";
import { TOKENS } from "@orb/ui/tokens";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import vitest from "@vitest/eslint-plugin";
import type { Linter } from "eslint";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import { getDefaultSelectors } from "eslint-plugin-better-tailwindcss/api/defaults";
import type { Selector, SelectorObjectValueMatcher, SelectorStringMatcher } from "eslint-plugin-better-tailwindcss/api/types";
import { MatcherType, SelectorKind } from "eslint-plugin-better-tailwindcss/api/types";
import drizzle from "eslint-plugin-drizzle";
import jsxA11y from "eslint-plugin-jsx-a11y";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import reactWebApi from "eslint-plugin-react-web-api";
import reactX from "eslint-plugin-react-x";
import reactNoEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import regexp from "eslint-plugin-regexp";
import tsdoc from "eslint-plugin-tsdoc";
import { __unstable__loadDesignSystem } from "tailwindcss";
import type { FlatConfig } from "typescript-eslint";
import tseslint from "typescript-eslint";
import biomeConfig from "./biome.json" with { type: "json" };
import { appearanceChannelVocabulary } from "./packages/client/appearance-channel.build.ts";
import { BROWSER_TARGETS, HARMLESS_WHEN_UNSUPPORTED, POLYFILLED_BUILTINS } from "./packages/client/browser-targets.ts";
import { OWNER_CSS_SHELL_CLASSES } from "./packages/client/owner-css-surface.ts";
import { customPropertyUses } from "./tooling/src/css-names/index.ts";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const UI_STYLESHEET = fileURLToPath(new URL("./packages/ui/src/styles/globals.css", import.meta.url));
const CLIENT_STYLESHEET = fileURLToPath(new URL("./packages/client/src/styles/globals.css", import.meta.url));
const SHELL_STYLESHEET = fileURLToPath(new URL("./packages/client/src/features/app-shell/surfaces/shell.css", import.meta.url));
const THEME_STYLESHEET = fileURLToPath(new URL("./packages/ui/src/styles/theme.css", import.meta.url));
// The design system `feature-classname-layout-only` compiles tokens through: the stock theme plus the generated theme.
const designSystem = await __unstable__loadDesignSystem(
  `${readFileSync(createRequire(import.meta.url).resolve("tailwindcss/theme.css"), "utf8")}\n${readFileSync(THEME_STYLESHEET, "utf8")}`,
);

const SOURCE = ["packages/*/src/**/*.{ts,tsx}", "tooling/src/**/*.{ts,tsx}"];

// Tailwind utilities the namespace resets cannot remove (the compiler still accepts them), refused here instead.
// `size`, `height` and `width` tokens compile as bare `size-<name>`/`h-<name>`/`w-<name>` on some axes only, so the
// `(--namespace-name)` form is the one spelling for every axis and the bare forms are refused.
const BARE_NAMESPACE_UTILITIES = Object.keys(TOKENS).flatMap((path) => {
  const [group, name] = [path.slice(0, path.indexOf(".")), path.slice(path.indexOf(".") + 1)];
  const roots =
    {
      size: ["size"],
      height: ["h", "min-h", "max-h", "block", "min-block", "max-block"],
      width: ["w", "min-w", "max-w", "inline", "min-inline", "max-inline"],
    }[group] ?? [];
  return roots.map((root) => `${root}-${name}`);
});
// Class strings live in every kind of binding (`SELECTION_RAIL`, a local `weldRounding`, a `toneClasses` map) and in
// function returns (`cellWidthClass`), where the plugin's default selectors, which read only `className`-named
// variables, do not look. These selectors read every binding, every function's returns (the patched plugin applies a
// variable selector to a function declaration by name) and every string in a `tv()` recipe. Only the pattern and the
// logical-properties rules take them: the order and unknown-class rules would read a prose string's words as classes.
const CLASS_STRING_MATCHERS: (SelectorStringMatcher | SelectorObjectValueMatcher)[] = [{ type: MatcherType.String }, { type: MatcherType.ObjectValue }];
const CLASS_SELECTORS: Selector[] = [
  ...getDefaultSelectors().filter(({ kind }) => kind !== SelectorKind.Variable),
  {
    kind: SelectorKind.Variable,
    name: "^.*$",
    match: [...CLASS_STRING_MATCHERS, { type: MatcherType.AnonymousFunctionReturn, match: CLASS_STRING_MATCHERS }],
  },
  { kind: SelectorKind.Callee, name: "^tv$", match: CLASS_STRING_MATCHERS },
];
const RESTRICTED_CLASSES = [
  {
    // An arbitrary class value that carries a design number: a length, a decimal, or a track share other than 1fr.
    // A keyword, `0`, `1fr`, `100%` or a `var(--token)` inside the brackets is structure and stays legal.
    pattern: String.raw`^(?:[^\s\[]*:)?[a-z-]+-\[[^\]]*(?:\d+(?:\.\d+)?(?:px|rem|em|ch|cq[whib]|v[wh]|dvh|svh|lvh|ms|s|deg)|\d\.\d+|(?:[2-9]|\d{2,})fr)[^\]]*\]`,
    message: "An arbitrary value with a design number bypasses the token scale; use a token utility or add one in tokens.json.",
  },
  {
    pattern: String.raw`^(?:[^\s]*:)?!?leading-(?:tight|snug|normal|relaxed|loose|\d+)!?$`,
    message: "A stock line-height; every line box is a leading token (docs/law/integer-line-boxes.md).",
  },
  {
    pattern: `^(?:[^\\s]*:)?!?-?(?:${BARE_NAMESPACE_UTILITIES.join("|")})!?$`,
    message: "Spell a size, height or width token as <utility>-(--<namespace>-<name>), the one form that works on every axis.",
  },
  {
    // The important modifier escapes the cascade a variant should own; a site that must beat an inline style names its reason.
    pattern: String.raw`^(?:[^\s]*:)?!.|.!$`,
    message: "The `!` modifier escapes the cascade; add a variant in @orb/ui, or name the inline style it beats beside a disable.",
  },
  {
    // An arbitrary layout, size or type value; a custom property, a formula and `inherit` are structure and stay legal.
    pattern: String.raw`^(?:[^\s]*:)?-?(?:[whz]|min-w|min-h|max-w|max-h|inline|block|min-inline|min-block|max-inline|max-block|size|p[xytrbles]?|m[xytrbles]?|gap(?:-x|-y)?|space-[xy]|inset(?:-x|-y|-s|-e)?|top|left|right|bottom|start|end|translate(?:-x|-y|-z)?|text|leading|tracking|rounded)-\[(?!(?:--|var\(|calc\(|inherit\]))[^\s:]+\]$`,
    message: "Arbitrary Tailwind layout/size/type value bypasses the token scale; use a token utility or extend tokens.json.",
  },
  {
    // A permanent layer promotion: the browser promotes what it animates, and a standing hint costs memory on small devices.
    pattern: String.raw`^(?:[^\s]*:)?(?:will-change-[a-z-]+|transform-gpu|backface-(?:hidden|visible)|translate-z-[^\s]+)$`,
    message:
      "A forced compositor layer (will-change, transform-gpu, backface, translate-z); animate transform, translate, scale, rotate, opacity or filter and let the browser promote.",
  },
  {
    pattern: String.raw`^(?:[^\s]*:)?@?(?:min|max)-\[[^\s\]]+\]:`,
    message: "An arbitrary breakpoint variant bypasses the named conditions; use a breakpoint or container token (tokens.json) or add one.",
  },
  {
    pattern: String.raw`\(--primitive-[a-z0-9-]+\)`,
    message: "A primitive ramp step is referenced directly; use the semantic token that aliases it, or add one in tokens.json.",
  },
  {
    pattern: String.raw`^(?:[^\s]*:)?(?:bg|text|border|ring|fill|stroke)-(?:black|white)(?:\/\d+)?$`,
    message: "A named non-token color bypasses the theme; use a semantic token, or bg-backdrop for a scrim.",
  },
  {
    pattern: String.raw`^(?:[^\s]*:)?(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|divide|placeholder|shadow|ring-offset)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?$`,
    message: "A palette-scale color bypasses the theme; use a semantic token such as text-destructive or bg-primary.",
  },
  {
    pattern: String.raw`-\[#[0-9a-fA-F]{3,8}\]`,
    message: "An arbitrary hex color bypasses the theme; use a semantic color token from theme.css.",
  },
  {
    // `all` fades a focus ring, animates the layout vars Base UI recomputes live and inherits properties the part never
    // opted into; every transition names its properties (motion-and-animation-guide.md §1.2).
    pattern: String.raw`^(?:[^\s]*:)?!?transition-(?:all|\[(?:[^\]]*,)?all(?:,[^\]]*)?\])!?$`,
    message: "`transition-all` animates every property; name them, for example transition-[opacity,scale] (motion-and-animation-guide.md §1.2).",
  },
  {
    // Lifecycle motion is a transition keyed off data-starting-style / data-ending-style, which a mid-flight close can
    // retarget; a keyframe animation cannot. The stock infinite loops and the word-reveal fade are not lifecycle motion.
    pattern: String.raw`^(?:[^\s]*:)?(?:(?:group|peer|has|in)-)*data-(?:open|closed|starting-style|ending-style|\[(?:open|closed|starting-style|ending-style)\])(?:\/[a-z0-9-]+)?:(?:[^\s:]+:)*!?animate-(?!(?:none|spin|ping|pulse|bounce)!?$|\[orb-word-reveal[_\]])`,
    message:
      "A keyframe animation keyed on a Base UI lifecycle attribute; use a transition off data-starting-style / data-ending-style (motion-and-animation-guide.md §5.1).",
  },
  {
    pattern: String.raw`^(?:[^\s]*:)?max-(?:w|inline)-prose$`,
    message:
      "Tailwind's max-w-prose matches no house reading measure. Body/teaching prose takes max-w-(--reading-measure-prose) on the paragraph; editor content takes max-w-(--width-content-col).",
  },
];

/** Viewport breakpoints are the shell's; a feature adapts to its pane with a container query. */
const VIEWPORT_CLASSES = {
  pattern: String.raw`^(?:[^\s]*:)?(?:(?:max-|min-)?(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\s\]]+\]):`,
  message: "Viewport breakpoints belong to app-shell; adapt to the pane with a container query or Container size.",
};
/** Pointer and hover capability variants are the tokens' or the shell's, never a feature's. */
const POINTER_CLASSES = {
  pattern: String.raw`^(?:[^\s]*:)?(?:(?:any-)?pointer-(?:coarse|fine)|hover-capable|\[@media\([^\s)]*(?:any-pointer|pointer|hover):[^\s)]*\)\]):`,
  message: "Device capability adaptation belongs to shared tokens or app-shell, not feature-local pointer/hover capability variants.",
};
/** A raw content width; the container scale and the Container primitive own widths. */
const WIDTH_CLASSES = {
  pattern: String.raw`^(?:[^\s]*:)?(?:(?:max-|min-)?(?:w|inline)-\[[^\s\]]+\]|(?:max-)?(?:w|inline)-(?:[1-9]\d*|\d+\.\d+))$`,
  message: "Raw content widths bypass the container scale; use Container size or a max-w-cq-* token utility.",
};

const REACT_SOURCE = ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"];

const BROWSER_MOUNT_SOURCE = ["tests/**/*.tsx", "scripts/**/*.tsx", "playwright/**/*.{ts,tsx}"];

const REACT_TEST_SOURCE = [
  "tests/**/*.ct.tsx",
  "tests/{ui,client,showcase-plugins}/**/_*.tsx",
  "tests/ui/**/*.fixtures.tsx",
  "tests/ui/**/*.stories.tsx",
  "tests/client/**/*.fixtures.tsx",
  "tests/client/**/*-fixtures.tsx",
  "tests/tooling/**/_ct-stories.tsx",
  "tests/support/browser/**/*.tsx",
];

const REACT_HOOK_RULES: Linter.RulesRecord = {
  ...reactHooks.configs["recommended-latest"].rules,
  "react-hooks/exhaustive-deps": "error",
  "react-hooks/unsupported-syntax": "error",
  "react-hooks/incompatible-library": "warn",
};

// The only tests/support files that may read rows directly; each line says why its read cannot go through a verb.
const ROW_READ_HOMES = [
  // The rows door: persistence-tier suites assert stored facts no read verb shows, and dependency-cruiser fences its importers.
  "tests/support/node/factories/rows.ts",
  // The rows tier behind that door: each `<seed>Rows` twin and capture reads what its verb-only seed left.
  "tests/support/node/factories/rows/*.ts",
  // Testkit self-tests prove a seed or capture stored what it claims; they are the testkit's own persistence tier.
  "tests/support/**/*.test.ts",
  // A child process with no server: its one query takes the WAL lock a layout migration must refuse to move under.
  "tests/support/node/db-holder.ts",
  // Corpus publication producers: the fixture CT and snap consumers replay is a snapshot of the rows each producer's
  // production pass left, and that snapshot is the product, so no read verb can stand in for it.
  // corpus.ts also refuses a copied private db holding unfinished work before the server that would resume it boots.
  "tests/support/node/corpus.ts",
  "tests/support/node/corpus-chat-lifecycle.ts",
  "tests/support/node/corpus-connection.ts",
  "tests/support/node/corpus-image-variants.ts",
  "tests/support/node/corpus-imagery.ts",
  "tests/support/node/corpus-knowledge-images.ts",
  "tests/support/node/corpus-knowledge-variants.ts",
  "tests/support/node/corpus-library-views.ts",
  "tests/support/node/corpus-notifications.ts",
  "tests/support/node/corpus-oidc.ts",
  "tests/support/node/corpus-plugin.ts",
  "tests/support/node/corpus-rpg.ts",
  "tests/support/node/corpus-search.ts",
  "tests/support/node/corpus-stats-settings.ts",
];
const PLAYWRIGHT_TESTS = ["tests/**/*.ct.tsx", "tests/**/*.spec.ts", "tests/e2e/**/!(*.test).{ts,tsx}"];

const MOCK_CALL =
  "CallExpression:matches([callee.name=/^(mock|doMock)$/], [callee.property.name=/^(mock|doMock)$/], [callee.property.value=/^(mock|doMock)$/])";
const INTERNAL_MODULE_SPECIFIER = String.raw`:matches([arguments.0.type='Literal'][arguments.0.value=/^(@orb\/|#|\.\.?\/)/], [arguments.0.type='ImportExpression'][arguments.0.source.value=/^(@orb\/|#|\.\.?\/)/])`;

const INTERNAL_MODULE_MOCK_RESTRICTION = {
  selector: `${MOCK_CALL}${INTERNAL_MODULE_SPECIFIER}`,
  message: "Do not replace internal modules in product tests. Script external execution through the production test root.",
};

// A module mock binds by resolved module id and only for modules loaded after it, so under a shared registry
// (`--no-isolate`, the integration project) a file that already loaded the subject keeps the real module and the
// test dials the real thing. tests/tooling is outside this twice over: its isolated project mocks `node:fs` and
// `node:child_process` for CLI subjects that have no seam by design.
const EXTERNAL_MODULE_MOCK_RESTRICTION = {
  selector: `${MOCK_CALL}:not(${INTERNAL_MODULE_SPECIFIER})`,
  message:
    "Do not mock a module in tests. Pass the external edge through an injected seam on the production options (as buildConnector is on ScopedEgressOptions), or add one.",
};

// The integration project shares one module registry (`isolate: false`), so a stubbed or written process
// environment leaks across files and the first file's value wins. Tests pass the value through the harness seam
// (`createServerHarness` options) or the subject's own parameter instead.
const ENV_MESSAGE =
  "Do not stub or write the process environment in tests. Pass the value through a harness seam (tests/support/node/server.ts) or the module's own parameter.";
const PROCESS_ENV = "[object.name='process'][property.name='env']";
const TEST_ENVIRONMENT_RESTRICTIONS = [
  {
    selector: "CallExpression[callee.object.name='vi'][callee.property.name=/^(stubEnv|unstubAllEnvs)$/]",
    message: ENV_MESSAGE,
  },
  {
    selector: `AssignmentExpression:matches([left.object.object.name='process'][left.object.property.name='env'], [left.object.name='process'][left.property.name='env'])`,
    message: ENV_MESSAGE,
  },
  {
    selector: "UnaryExpression[operator='delete'][argument.object.object.name='process'][argument.object.property.name='env']",
    message: ENV_MESSAGE,
  },
  {
    selector: "CallExpression[callee.object.name='Object'][callee.property.name='assign'][arguments.0.object.name='process'][arguments.0.property.name='env']",
    message: ENV_MESSAGE,
  },
  {
    selector: `CallExpression[callee.object.name='vi'][callee.property.name='hoisted'] MemberExpression${PROCESS_ENV}`,
    message: ENV_MESSAGE,
  },
];

const TEST_PROJECTS = ["tsconfig.json", "tsconfig.tests-dom.json", "tsconfig.tests-iso.json"];

const NODE_TOOL_SOURCE = ["*.{ts,mts,cts}", "packages/*/*.{ts,mts,cts}", "scripts/**/*.{ts,mts,cts}"];

const ASYNC_SAFETY_RULES: Linter.RulesRecord = {
  "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "@typescript-eslint/require-array-sort-compare": ["error", { ignoreStringArrays: true }],
  "@typescript-eslint/prefer-includes": "error",
  "@typescript-eslint/no-base-to-string": "error",
  "@typescript-eslint/no-unnecessary-type-conversion": "error",
  "@typescript-eslint/prefer-regexp-exec": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "error",
  "@typescript-eslint/prefer-string-starts-ends-with": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "@typescript-eslint/restrict-template-expressions": "error",
  "@typescript-eslint/no-deprecated": "error",
};

const SETTINGS_TABLE_IMPORT = {
  regex: "^@orb/db(?:/(?:schema|index))?$",
  importNames: ["settings"],
  message: "The settings domain owns this table; inject its registered prefix-scoped KV port.",
};

const PNG_CHUNK_IMPORT = {
  regex: "^@orb/kit/png-card-chunk(?:/|$)",
  importNames: ["readCardChunk", "writeCardChunk", "isPng"],
  message: "Use the import or export domain for PNG card-chunk operations.",
};

// dependency-cruiser sees only literal import edges, so a computed specifier or a host loader reaches any db door
// unseen (D335). `node:module` itself is a dependency-cruiser rule; these are the loaders no import names.
const MODULE_LOADER_SYNTAX = [
  {
    selector: "ImportExpression:not([source.type='Literal'])",
    message: "Write a dynamic import with a string-literal specifier; the db admission rules see only literal specifiers (D335).",
  },
  {
    selector:
      ":matches(MemberExpression[property.name='getBuiltinModule'], MemberExpression[property.value='getBuiltinModule'], Property[key.name='getBuiltinModule'])",
    message: "Import the builtin by a literal specifier; process.getBuiltinModule hands back node:module past the db admission rules (D335).",
  },
  {
    selector: ":matches(Property[key.name='importModuleDynamically'], Property[key.value='importModuleDynamically'])",
    message: "A vm script gets no dynamic-import hook; it would load any module past the db admission rules (D335).",
  },
];

const SERVER_SYNTAX = [
  {
    selector: String.raw`:matches(Literal[value=type(string)][raw=/corsproxy\.io/], TemplateElement[value.raw=/corsproxy\.io/])`,
    message: "D61 B5a: the rejected third-party CORS proxy cannot be spelled in server or inference literals; use the guarded network owner directly.",
  },
  ...MODULE_LOADER_SYNTAX,
];

// Literal bidi controls and C0/C1 controls make the reviewed text differ from what runs (trojan source).
// Biome keeps escapes as written; this rejects the literal code points so source spells them as escapes.
// Ranges are hex text so this file never carries the characters it bans. Tab, LF and CR stay allowed.
const INVISIBLE_CONTROL_RANGES = [
  ["0000", "0008"],
  ["000b", "000c"],
  ["000e", "001f"],
  ["007f", "009f"],
  ["061c", "061c"],
  ["200e", "200f"],
  ["202a", "202e"],
  ["2066", "2069"],
] as const;
const HEX = 16;
const INVISIBLE_CONTROL_CLASS = `[${INVISIBLE_CONTROL_RANGES.map(([first, last]) => `\\u${first}-\\u${last}`).join("")}]`;
const INVISIBLE_CONTROL_MESSAGE = "Write bidi and C0/C1 control characters as escapes (\\uXXXX); a literal one hides what the code does from review.";
// Flat config replaces a rule's options per block, so every no-restricted-syntax block must spread this entry.
const INVISIBLE_CONTROL_SYNTAX = {
  selector: `:matches(Literal[raw=/${INVISIBLE_CONTROL_CLASS}/], TemplateElement[value.raw=/${INVISIBLE_CONTROL_CLASS}/], JSXText[raw=/${INVISIBLE_CONTROL_CLASS}/])`,
  message: INVISIBLE_CONTROL_MESSAGE,
};
// An empty or whitespace-only name, or `undefined`, names nothing. Client and @orb/ui blocks spread this entry.
const EMPTY_ARIA_NAME_SYNTAX = {
  selector:
    "JSXAttribute[name.name=/^aria-label(?:ledby)?$/]:matches([value.type='Literal'][value.value=/^\\s*$/], [value.expression.type='Identifier'][value.expression.name='undefined'], [value.expression.type='Literal'][value.expression.value=/^\\s*$/], [value.expression.type='UnaryExpression'][value.expression.operator='void'], [value.expression.type='TemplateLiteral'][value.expression.expressions.length=0][value.expression.quasis.0.value.cooked=/^\\s*$/])",
  message: "An empty aria-label or aria-labelledby names nothing: give it text, or omit the attribute.",
};
// no-warning-comments matches each term as a plain substring when it holds no word character.
const INVISIBLE_CONTROL_TERMS = INVISIBLE_CONTROL_RANGES.flatMap(([firstHex, lastHex]) => {
  const first = Number.parseInt(firstHex, HEX);
  return Array.from({ length: Number.parseInt(lastHex, HEX) - first + 1 }, (_, offset) => String.fromCodePoint(first + offset));
});

const CLIENT_SRC = "packages/client/src/**/*.{ts,tsx}";

const CLIENT_QUERY_KEY_SYNTAX = {
  selector: "Property[computed=false][key.name='queryKey'][value.type='ArrayExpression']",
  message:
    "A hand-built queryKey array: tRPC reads take their key from the proxy (`trpc.<path>.queryKey(input)`), so the reader and every invalidation share one key (client-architecture-state-and-gates.md §10).",
};
const CLIENT_FORM_NAME_SYNTAX = {
  // The accessibility registries mount only registered surfaces, so auth and dialog forms rely on this guard.
  selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='form']:not(:has(> JSXAttribute[name.name=/^aria-label(?:ledby)?$/]))",
  message: "A <form> needs an accessible name: add aria-label, or aria-labelledby pointing at its visible heading.",
};
// The `orb-*-track` utilities are client-globals classes. They are spelled in the one file below that owns them, and every
// carrier renders through the chat feature's `Track` component, so a copy cannot drift from the CSS that names it.
const ORB_TRACK_CLASS_HOMES = ["packages/client/src/features/chat/lib/chat-track.tsx"];
const ORB_TRACK_CLASS_PATTERN = String.raw`/\borb-[a-z]+-track\b/`;
const ORB_TRACK_CLASS_SYNTAX = {
  selector: `:matches(Literal[value=${ORB_TRACK_CLASS_PATTERN}], TemplateElement[value.raw=${ORB_TRACK_CLASS_PATTERN}])`,
  message: "An orb-*-track class string belongs to its home file; render the carrier through the chat feature's `Track` component.",
};
const CLIENT_SYNTAX = [INVISIBLE_CONTROL_SYNTAX, CLIENT_QUERY_KEY_SYNTAX, CLIENT_FORM_NAME_SYNTAX, EMPTY_ARIA_NAME_SYNTAX];

function rootSources(...refs: string[]): string[] {
  return refs.map((ref) => {
    const root =
      new Map([
        ["@tooling", "tooling/src"],
        ["@tests", "tests"],
        ["@scripts", "scripts"],
        ["@ui-authoring", "packages/ui"],
        ["@showcase", "packages/showcase-plugins/src"],
      ]).get(ref) ?? `packages/${ref.slice(1)}/src`;
    return `${root}/**/*.{ts,tsx}`;
  });
}

const AUTHORED_SRC = rootSources(
  "@client",
  "@ui",
  "@ui-authoring",
  "@server",
  "@db",
  "@contracts",
  "@kit",
  "@showcase",
  "@plugin-toolchain",
  "@default-content",
  "@inference",
  "@tooling",
  "@tests",
  "@scripts",
);

const PLUGIN_MEMBRANE = "packages/server/src/infra/plugin-host/membrane.ts";

const NATIVE_CONFIG: FlatConfig.Config[] = [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.cache/**",
      "**/.claude/worktrees/**",
      "reports/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",

      "packages/ui/src/tokens/index.ts",
      "tooling/src/snap/lib/devtools-frontend/**",
      "tooling/src/codemods/*/tests*/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "no-extend-native": "error",
      "no-proto": "error",
      "no-restricted-properties": [
        "error",
        { object: "Object", property: "setPrototypeOf", message: "Create the intended object without replacing its prototype." },
        { object: "Reflect", property: "setPrototypeOf", message: "Create the intended object without replacing its prototype." },
      ],
      "no-restricted-syntax": ["error", INVISIBLE_CONTROL_SYNTAX],
      "no-warning-comments": ["error", { terms: INVISIBLE_CONTROL_TERMS, location: "anywhere" }],
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tseslint.plugin, tsdoc },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false }],
      "tsdoc/syntax": "error",
    },
  },
  {
    files: ["tests/**/*.test-d.ts"],
    rules: {
      // Negative type assertions must fail compilation when the expected error disappears.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true, "ts-nocheck": true, "ts-check": false, minimumDescriptionLength: 10 },
      ],
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}", ...AUTHORED_SRC, ...NODE_TOOL_SOURCE, "packages/showcase-plugins/bundles/**/*.ts"],
    plugins: { regexp },
    rules: {
      ...Object.fromEntries(
        Object.entries(regexp.configs["flat/recommended"].rules)
          .filter(([id]) => id.startsWith("regexp/"))
          .map(([id, setting]) => [id, Array.isArray(setting) ? ["error", ...setting.slice(1)] : "error"]),
      ),
      // Spelling and unused-capture suggestions are not semantic correctness policies.
      "regexp/prefer-w": "off",
      "regexp/use-ignore-case": "off",
      "regexp/no-unused-capturing-group": "off",
    },
  },
  {
    files: [".claude/**", "tooling/**", "tests/**", "scripts/**"],
    rules: { "regexp/no-super-linear-backtracking": "off" },
  },
  { files: SOURCE, languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: ROOT } } },
  {
    files: SOURCE,
    ignores: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
      // JSX event handlers may return a Promise; non-JSX void callbacks still require correct handling.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/require-array-sort-compare": ["error", { ignoreStringArrays: true }],
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-unnecessary-type-conversion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-deprecated": "error",
    },
  },
  {
    files: ["tooling/src/eslint/**/*.{ts,tsx}"],
    rules: {
      // AST readers deliberately ignore unrelated node kinds in their explicit default branches.
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
    },
  },
  ...["main", "ui", "frame"].map(
    (runtime): FlatConfig.Config => ({
      files: [`packages/showcase-plugins/bundles/*/${runtime}.ts`],
      languageOptions: {
        parserOptions: { project: [`packages/showcase-plugins/tsconfig.author-${runtime}.json`], projectService: false, tsconfigRootDir: ROOT },
      },
      rules: {
        ...ASYNC_SAFETY_RULES,
        "@typescript-eslint/require-await": "error",
        "@typescript-eslint/strict-boolean-expressions": "error",
        "@typescript-eslint/triple-slash-reference": ["error", { lib: "never", types: "never", path: "never" }],
      },
    }),
  ),
  {
    files: ["tests/**/*.{ts,tsx,mts,cts}", "scripts/**/*.tsx", "playwright/**/*.{ts,tsx}"],
    ignores: ["**/*.d.{ts,mts,cts}"],
    languageOptions: { parserOptions: { project: TEST_PROJECTS, projectService: false, tsconfigRootDir: ROOT } },
    // Async test doubles implement Promise contracts without asynchronous work.
    rules: ASYNC_SAFETY_RULES,
  },
  {
    files: NODE_TOOL_SOURCE,
    ignores: ["**/*.d.{ts,mts,cts}"],
    languageOptions: { parserOptions: { project: ["tsconfig.json"], projectService: false, tsconfigRootDir: ROOT } },
    rules: ASYNC_SAFETY_RULES,
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx,mts,cts}", "tooling/src/**/*.{ts,tsx,mts,cts}", "tests/**/*.{ts,mts,cts}", ...NODE_TOOL_SOURCE],
    ignores: [...REACT_SOURCE, ...PLAYWRIGHT_TESTS, "tests/**/*.dom.test.ts", "tests/**/*.dom.test-d.ts", "tests/support/browser/**"],
    rules: { "@typescript-eslint/triple-slash-reference": ["error", { lib: "never", types: "never", path: "never" }] },
  },
  {
    files: ["packages/plugin-sdk/main.d.ts", "packages/plugin-sdk/ui.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": ["error", { lib: "never", types: "never", path: "always" }] },
  },
  {
    files: REACT_SOURCE,
    plugins: {
      "react-hooks": reactHooks,
      "react-web-api": reactWebApi,
      "react-x": reactX,
      "react-you-might-not-need-an-effect": reactNoEffect,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      "jsx-a11y": {
        components: {
          Button: "button",
          IconButton: "button",
          Toggle: "button",
          // Field context supplies the accessible name of these composite input controls at runtime.
          Switch: "input",
          Checkbox: "input",
          Input: "input",
          CommandInput: "input",
          Textarea: "textarea",
          Slider: "input",
          Select: "select",
        },
      },
    },
    rules: {
      ...REACT_HOOK_RULES,
      "react-web-api/no-leaked-event-listener": "error",
      "react-web-api/no-leaked-fetch": "error",
      "react-web-api/no-leaked-intersection-observer": "error",
      "react-web-api/no-leaked-interval": "error",
      "react-web-api/no-leaked-resize-observer": "error",
      "react-web-api/no-leaked-timeout": "error",
      "react-x/no-forward-ref": "error",
      "react-x/no-use-context": "error",
      "react-x/no-context-provider": "error",
      "react-x/no-clone-element": "error",
      "react-x/no-create-ref": "error",
      "react-x/no-children-count": "error",
      "react-x/no-children-for-each": "error",
      "react-x/no-children-map": "error",
      "react-x/no-children-only": "error",
      "react-x/no-class-component": "error",
      "react-you-might-not-need-an-effect/no-derived-state": "error",
      "react-you-might-not-need-an-effect/no-chain-state-updates": "error",
      "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change": "error",
      "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change": "error",
      "react-you-might-not-need-an-effect/no-initialize-state": "error",
      "react-you-might-not-need-an-effect/no-external-store-subscription": "error",
      ...jsxA11y.flatConfigs.strict.rules,
      "jsx-a11y/control-has-associated-label": [
        "error",
        { labelAttributes: ["label"], ignoreElements: ["audio", "canvas", "embed", "input", "textarea", "tr", "video"] },
      ],
      "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["Checkbox", "Switch", "Toggle", "Input"], assert: "either" }],
    },
  },
  {
    files: REACT_TEST_SOURCE,
    plugins: { "react-hooks": reactHooks },
    rules: REACT_HOOK_RULES,
  },
  {
    // The React compiler deliberately skips these third-party virtualizer wrappers.
    files: [
      "packages/ui/src/primitives/virtual-list/virtual-list.tsx",
      "packages/ui/src/primitives/message-list/message-list.tsx",
      "packages/ui/src/primitives/media-grid/media-grid.tsx",
    ],
    rules: { "react-hooks/incompatible-library": "off" },
  },
  {
    files: ["packages/client/src/**/*.{ts,tsx}"],
    plugins: { "@tanstack/query": pluginQuery, "@tanstack/router": pluginRouter },
    rules: {
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/no-void-query-fn": "error",
      "@tanstack/query/stable-query-client": "error",
      "@tanstack/query/prefer-query-options": "error",
      "@tanstack/query/mutation-property-order": "error",
      "@tanstack/query/infinite-query-property-order": "error",
      "@tanstack/router/create-route-property-order": "error",
    },
  },
  ...(
    [
      // The ui package: viewport variants and raw widths are refused; the layout and markdown primitives own widths.
      {
        name: "ui",
        files: ["packages/ui/src/**/*.{ts,tsx}"],
        ignores: ["packages/ui/src/layout/**", "packages/ui/src/markdown/**"],
        restrict: [VIEWPORT_CLASSES, WIDTH_CLASSES],
      },
      { name: "ui", files: ["packages/ui/src/layout/**/*.{ts,tsx}", "packages/ui/src/markdown/**/*.{ts,tsx}"], ignores: [], restrict: [VIEWPORT_CLASSES] },
      // The app shell is the one home of viewport and pointer variants.
      { name: "client", files: ["packages/client/src/features/app-shell/**/*.{ts,tsx}"], ignores: [], restrict: [WIDTH_CLASSES] },
      {
        name: "client",
        files: ["packages/client/src/features/**/*.{ts,tsx}"],
        ignores: ["packages/client/src/features/app-shell/**"],
        restrict: [VIEWPORT_CLASSES, POINTER_CLASSES, WIDTH_CLASSES],
      },
      {
        name: "client",
        files: ["packages/client/src/**/*.{ts,tsx}"],
        ignores: ["packages/client/src/features/**"],
        restrict: [VIEWPORT_CLASSES, WIDTH_CLASSES],
      },
    ] as const
  ).map(({ name, files, ignores, restrict }): FlatConfig.Config => {
    const entryPoint = name === "ui" ? UI_STYLESHEET : CLIENT_STYLESHEET;
    const stylesheets = name === "ui" ? [UI_STYLESHEET] : [UI_STYLESHEET, CLIENT_STYLESHEET, SHELL_STYLESHEET];
    return {
      files: [...files],
      ignores: [...ignores],
      plugins: { "better-tailwindcss": betterTailwindcss },
      settings: { "better-tailwindcss": { entryPoint } },
      rules: {
        "better-tailwindcss/enforce-consistent-variable-syntax": ["error", { syntax: "shorthand" }],
        "better-tailwindcss/no-deprecated-classes": "error",
        "better-tailwindcss/no-unknown-classes": ["error", { ignore: authorClassIgnores(stylesheets) }],
        "better-tailwindcss/no-conflicting-classes": "error",
        "better-tailwindcss/no-duplicate-classes": "error",
        "better-tailwindcss/no-concatenated-classes": "error",
        // The namespace resets remove the stock scales; the patterns close the spellings a reset cannot see, per scope.
        "better-tailwindcss/no-restricted-classes": ["error", { restrict: [...RESTRICTED_CLASSES, ...restrict], selectors: CLASS_SELECTORS }],
        // Tailwind's own order, so a class list reads the same everywhere; component and unknown classes keep their place.
        "better-tailwindcss/enforce-consistent-class-order": ["error", { order: "official" }],
        "better-tailwindcss/enforce-consistent-variant-order": "error",
        // Canonical spellings only: `collapse` is off because it folds two house tokens with one value into the wrong name
        // (`text-label leading-label` into `text-code/label`), and the `(--token)` forms are ignored because the bare forms
        // it would prefer are the ones `no-restricted-classes` refuses; `logical` is enforce-logical-properties' axis.
        "better-tailwindcss/enforce-canonical-classes": ["error", { collapse: false, logical: false, ignore: [String.raw`\(--`] }],
        "better-tailwindcss/enforce-shorthand-classes": "error",
        "better-tailwindcss/enforce-logical-properties": ["error", { selectors: CLASS_SELECTORS }],
        // The trailing form is Tailwind v4's; the modifier itself is refused above, so this governs only a named exception.
        "better-tailwindcss/enforce-consistent-important-position": ["error", { position: "recommended" }],
        // Biome's lineWidth is 160; the same width here means the two never fight over a class string.
        "better-tailwindcss/enforce-consistent-line-wrapping": ["error", { printWidth: 160, group: "newLine", preferSingleLine: true, indent: 2 }],
        "better-tailwindcss/no-unnecessary-whitespace": ["error", { allowMultiline: true }],
      },
    };
  }),
  {
    files: ["packages/server/src/**/*.ts", "packages/db/src/**/*.ts"],
    plugins: { drizzle },
    rules: {
      "drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: ["db"] }],
      "drizzle/enforce-update-with-where": ["error", { drizzleObjectName: ["db"] }],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    ignores: PLAYWRIGHT_TESTS,
    plugins: { vitest },
    settings: {
      vitest: {
        vitestImports: [
          "@orb/testkit/node/fixtures.ts",
          "@orb/testkit/node/tool-fixtures.ts",
          /(?:^|\/)(?:_fixtures|_support|fixtures|tool-fixtures|[\w-]+\.fixtures)\.ts$/u,
        ],
      },
    },
    rules: {
      "vitest/expect-expect": [
        "error",
        { assertFunctionNames: ["expect", "expectTypeOf"], additionalTestBlockFunctions: ["auditRuleTest", "cellTest", "forEachAuthMode"] },
      ],
      "vitest/valid-expect": ["error", { maxArgs: 2 }],
      "vitest/no-standalone-expect": ["error", { additionalTestBlockFunctions: ["auditRuleTest", "cellTest", "forEachAuthMode"] }],
      "vitest/valid-title": ["error", { allowArguments: true }],
      "vitest/valid-describe-callback": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/warn-todo": "error",
      "vitest/no-interpolation-in-snapshots": "error",
      "vitest/require-local-test-context-for-concurrent-snapshots": "error",
    },
  },
  {
    files: ["tests/**/*.test.ts"],
    ignores: PLAYWRIGHT_TESTS,
    rules: { "vitest/no-import-node-test": "error" },
  },
  {
    files: PLAYWRIGHT_TESTS,
    plugins: { playwright },
    rules: {
      "playwright/expect-expect": ["error", { assertFunctionNames: ["expect", "expectTypeOf"] }],
      "playwright/no-skipped-test": ["error", { allowConditional: true }],
      "playwright/prefer-to-have-count": "error",
      "playwright/prefer-web-first-assertions": "error",
      "playwright/no-unnecessary-assertions": "error",
      "playwright/no-unused-locators": "error",
      "playwright/no-unsafe-references": "error",
      "playwright/valid-expect": "error",
    },
  },
];
const browserGlobalsOverride = biomeConfig.overrides.find(
  ({ includes, linter }) => includes.includes("packages/client/**") && linter?.rules.style?.noRestrictedGlobals !== undefined,
);
if (browserGlobalsOverride?.linter?.rules.style?.noRestrictedGlobals === undefined) {
  throw new Error("The browser Node-global policy must be configured in Biome");
}
const UNSUPPORTED_AT_FLOOR = unsupportedAtFloor(BROWSER_TARGETS);
// The page script and what it imports statically run before the polyfills are installed (packages/client/src/entry.ts), so nothing there is trusted.
const PRE_POLYFILL_SOURCE = staticImportGraph(fileURLToPath(new URL("./packages/client/src/entry.ts", import.meta.url))).map((file) => relative(ROOT, file));
const localPlugin = createOrbPlugin({
  baseUiDoors: baseUiDoors(fileURLToPath(new URL("./packages/ui", import.meta.url))),
  browserNodeGlobals: new Set([...Object.keys(browserGlobalsOverride.linter.rules.style.noRestrictedGlobals.options.deniedGlobals), "process"]),
  floorlessButtonSizes: new Set(
    Object.entries(BUTTON_SIZE_OVERFLOW)
      .filter(([, overflows]) => overflows)
      .map(([size]) => size),
  ),
  shellClasses: new Set(OWNER_CSS_SHELL_CLASSES),
  appearanceVocabulary: appearanceChannelVocabulary(),
  browserUnsupported: withoutPolyfilled(UNSUPPORTED_AT_FLOOR, POLYFILLED_BUILTINS),
  browserUnsupportedBeforePolyfills: UNSUPPORTED_AT_FLOOR,
  browserHarmless: HARMLESS_WHEN_UNSUPPORTED,
  candidatesToCss: (classes) => designSystem.candidatesToCss(classes),
  customProperties: customPropertyUses(ROOT),
  classifyClass: classClassifier((classes) => designSystem.candidatesToCss(classes)),
});
// The only files that may spell a portal-float z token: each is a surface that portals to
// [data-slot="portal-root"] or mounts at the document root. A new consumer is a finding, not an entry here.
const PORTAL_FLOAT_HOMES = {
  "packages/ui/src/lib/popup-surface.ts": "the shared popup surface every portaled popup composes",
  "packages/ui/src/primitives/combobox/variants.ts": "its positioner portals to the portal root",
  "packages/ui/src/primitives/popover/variants.ts": "its positioner portals to the portal root",
  "packages/ui/src/primitives/menu/variants.ts": "its positioner portals to the portal root",
  "packages/ui/src/primitives/select/variants.ts": "its positioner portals to the portal root",
  "packages/ui/src/primitives/autocomplete/variants.ts": "its positioner portals to the portal root",
  "packages/ui/src/primitives/tooltip/variants.ts": "its positioner portals to the portal root",
  "packages/ui/src/primitives/toast/variants.ts": "its viewport portals to the portal root",
  "packages/ui/src/primitives/alert-dialog/variants.ts": "its viewport portals to the portal root",
  "packages/ui/src/primitives/dialog/variants.ts": "its viewport portals to the portal root",
  "packages/ui/src/primitives/drawer/variants.ts": "its backdrop and viewport portal to the portal root",
  "packages/ui/src/art/web-weave/variants.ts": "the boot veil mounts at the document root, above the whole shell",
} as const;
// The only files that make motion in JS (motion-and-animation-guide.md §1.5). Each carries a shape the rule matches and says
// why CSS cannot express it; tests/tooling/eslint-motion-gates.test.ts fails a home the rule no longer matches.
const FLIP_INVERSION_HOMES = {
  "packages/ui/src/primitives/tabs/tabs.tsx":
    "the tabs indicator glide: the delta between two runtime boxes, inverted inline and flushed so the slot's transition runs it home",
  "packages/ui/src/art/web-weave/web-weave.tsx":
    "the brand web's canvas frame loop paints pixels, not style; the canvas has no CSS property to key a transition off",
  "packages/ui/src/stream/use-smooth-text.ts": "the streamed-text pacer reveals a string prefix on frames; text content has no style property to transition",
  "packages/client/src/features/refinery/hooks/use-count-up.ts":
    "the hero gauge counts a printed figure that must equal the Meter's value; the figure is text content, not a style",
} as const;
// The only client files that touch browser storage directly. client-architecture-state-and-gates.md §10a sanctions each one and states why.
const RAW_STORAGE_HOMES = [
  "packages/client/src/state/durable-local.ts",
  "packages/client/src/data/session-resume.ts",
  "packages/client/src/lib/probe-mode.ts",
  "packages/client/src/main.tsx",
];
const LOCAL_RULE_BLOCKS: FlatConfig.Config[] = (
  [
    { files: ["tests/**/*.{ts,tsx}"], rules: { "orb/no-test-fabrication": "error" } },
    {
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
      ignores: Object.keys(PORTAL_FLOAT_HOMES),
      rules: { "orb/no-portal-float-token": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
      ignores: Object.keys(FLIP_INVERSION_HOMES),
      rules: { "orb/no-unruled-flip-inversion": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
      rules: {
        "orb/baseui-state-data-attributes": "error",
        "orb/no-off-token-inline-style": "error",
        "orb/theme-override-only-via-scope": "error",
      },
    },
    { files: ["packages/client/src/**/*.tsx"], rules: { "orb/no-raw-intrinsic-paint": "error" } },
    // Tooling is outside: its CLI flags share the `--appearance-` prefix (`--appearance-preset`).
    {
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}", "tests/client/**/*.{ts,tsx}", "tests/ui/**/*.{ts,tsx}"],
      rules: { "orb/appearance-name-in-manifest": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}", "tests/support/**/*.{ts,tsx}", "tests/**/*.ct.tsx"],
      rules: { "orb/custom-property-declared": "error" },
    },
    // On by owner ruling before the tree is at zero: the sites drain through items 1334 to 1336 and 1338
    // (docs/plans/css-system/feature-classname-sites.md), and the pre-push lint stays red until the last one goes.
    {
      files: ["packages/client/src/features/**/*.tsx"],
      rules: { "orb/feature-classname-layout-only": "error", "orb/no-built-class-string": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/state/entity-draft-store-implementation.ts", "packages/client/src/state/persisted-store-implementation.ts"],
      rules: { "orb/no-raw-zustand-persist": "error" },
    },
    { files: ["packages/client/src/state/durable-local.ts"], rules: { "orb/no-raw-zustand-persist-registry": "error" } },
    {
      files: [
        "packages/client/src/**/*.{ts,tsx}",
        "packages/ui/src/**/*.{ts,tsx}",
        "packages/ui/**/*.{ts,tsx}",
        "packages/server/src/**/*.{ts,tsx}",
        "packages/db/src/**/*.{ts,tsx}",
        "packages/contracts/src/**/*.{ts,tsx}",
        "packages/kit/src/**/*.{ts,tsx}",
        "packages/showcase-plugins/src/**/*.{ts,tsx}",
        "packages/plugin-toolchain/src/**/*.{ts,tsx}",
        "packages/default-content/src/**/*.{ts,tsx}",
        "packages/inference/src/**/*.{ts,tsx}",
        "tooling/src/**/*.{ts,tsx}",
        "tests/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
      ],
      ignores: ["packages/client/src/forms/editor/contexts.ts", "packages/client/src/forms/editor/use-app-form.ts"],
      rules: { "orb/no-direct-useform": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/entry/compose/automation-watcher.ts", "packages/server/src/transport/trpc/index.ts"],
      rules: { "orb/firehose-import-allowlist": "error" },
    },
    {
      files: ["packages/server/src/transport/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/transport/trpc/bus-channel.ts"],
      rules: { "orb/bus-channel-primitive": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
      // Polarity is light-dark()'s job, not a named condition (client-architecture-lockdown.md §4.6), so the
      // colour-scheme read keeps its own query.
      ignores: ["packages/ui/src/lib/use-prefers-light-color-scheme.ts"],
      rules: { "orb/no-raw-matchmedia": "error" },
    },
    { files: ["packages/client/src/features/**/*.{ts,tsx}"], rules: { "orb/fetch-fn-in-features": "error" } },
    {
      files: ["packages/client/src/**/*.{ts,tsx}"],
      rules: {
        "orb/windowed-infinite-query": "error",
        "orb/no-mutating-register-api": "error",
        "orb/registry-context-via-mint": "error",
        "orb/no-fake-disabled-id": "error",
      },
    },
    { files: ["packages/client/src/**/*.{ts,tsx}"], ignores: RAW_STORAGE_HOMES, rules: { "orb/persistence-boundary": "error" } },
    {
      files: ["packages/client/src/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/data/**"],
      rules: { "orb/client-cache-surgery-only-in-data": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/data/invalidation.ts"],
      rules: { "orb/no-inline-invalidate-outside-seam": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/data/create-entity-mutation.ts"],
      rules: { "orb/mutation-only-in-factory": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/features/*/lib/**"],
      rules: { "orb/modal-definition-home": "error", "orb/config-group-definition-home": "error" },
    },
    { files: ["packages/client/src/**/*.{ts,tsx}"], rules: { "orb/modal-definition-literal": "error" } },
    {
      files: ["packages/client/src/features/**/*.{ts,tsx}"],
      // The shell tier owns the layout and appearance root effects (ui-architecture-state-and-stack.md §5.1).
      ignores: ["packages/client/src/features/app-shell/**"],
      rules: { "orb/no-effect-on-shared-selection": "error" },
    },
    { files: ["packages/client/src/features/**/*.tsx"], rules: { "orb/dialog-via-composite": "error" } },
    {
      files: ["packages/client/src/features/**/*.tsx"],
      ignores: ["packages/client/src/features/app-shell/surfaces/app-shell.tsx"],
      rules: { "orb/no-raw-interactive-intrinsics": "error" },
    },
    {
      files: [
        "packages/client/src/**/*.{ts,tsx}",
        "packages/ui/src/**/*.{ts,tsx}",
        "packages/ui/**/*.{ts,tsx}",
        "packages/server/src/**/*.{ts,tsx}",
        "packages/db/src/**/*.{ts,tsx}",
        "packages/contracts/src/**/*.{ts,tsx}",
        "packages/kit/src/**/*.{ts,tsx}",
        "packages/showcase-plugins/src/**/*.{ts,tsx}",
        "packages/plugin-toolchain/src/**/*.{ts,tsx}",
        "packages/default-content/src/**/*.{ts,tsx}",
        "packages/inference/src/**/*.{ts,tsx}",
        "tooling/src/**/*.{ts,tsx}",
        "tests/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
      ],
      ignores: ["**/*.test.{ts,tsx}"],
      rules: { "orb/no-static-staletime": "error" },
    },
    {
      files: [
        "packages/client/src/**/*.{ts,tsx}",
        "packages/ui/src/**/*.{ts,tsx}",
        "packages/ui/**/*.{ts,tsx}",
        "packages/server/src/**/*.{ts,tsx}",
        "packages/db/src/**/*.{ts,tsx}",
        "packages/contracts/src/**/*.{ts,tsx}",
        "packages/kit/src/**/*.{ts,tsx}",
        "packages/showcase-plugins/src/**/*.{ts,tsx}",
        "packages/plugin-toolchain/src/**/*.{ts,tsx}",
        "packages/default-content/src/**/*.{ts,tsx}",
        "packages/inference/src/**/*.{ts,tsx}",
        "tooling/src/**/*.{ts,tsx}",
        "tests/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
      ],
      ignores: ["packages/ui/src/markdown/dialogue-paragraph.tsx"],
      rules: { "orb/no-legacy-react-api": "error" },
    },
    { files: ["packages/server/src/infra/auth/**/*.{ts,tsx}"], rules: { "orb/infra-auth-no-userid": "error", "orb/infra-auth-pre-row-imports": "error" } },
    { files: ["packages/server/src/domain/discovery/**/*.{ts,tsx}"], rules: { "orb/discovery-no-stats-rollups": "error" } },
    {
      files: ["packages/server/src/domain/**/*.{ts,tsx}", "packages/server/src/entry/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/domain/sessions/**", "packages/server/src/domain/admin/**"],
      rules: { "orb/no-direct-users-read": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      rules: {
        "orb/no-direct-users-read-reexport": "error",
        "orb/vector-scope-derived-reexport": "error",
        "orb/users-write-plain-spelling": "error",
        "orb/handle-key-writer": "error",
        "orb/member-card-clamped-verb": "error",
      },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: [
        "packages/server/src/domain/embeddings/**",
        "packages/server/src/domain/search/persistence/**",
        "packages/server/src/domain/chat/memory/persistence/**",
        "packages/server/src/domain/discovery/persistence/**",
        "packages/server/src/foundation/observability/debug/**",
      ],
      rules: { "orb/vector-scope-derived": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/domain/embeddings/persistence/**"],
      rules: { "orb/vector-scope-derived-write": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/domain/search/persistence/**"],
      rules: { "orb/vector-scope-derived-cosine": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: [
        "packages/server/src/domain/sessions/persistence/users.ts",
        "packages/server/src/domain/sessions/verbs/link-external-id.ts",
        "packages/server/src/domain/sessions/verbs/provision-identity.ts",
      ],
      rules: { "orb/external-id-claim-writer-callers": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/domain/sessions/persistence/users.ts", "packages/server/src/domain/sessions/verbs/pending-signup.ts"],
      rules: { "orb/external-id-pending-join-writer-callers": "error" },
    },
    { files: ["packages/server/src/domain/sessions/persistence/users.ts"], rules: { "orb/external-id-writer-home": "error" } },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/domain/sessions/persistence/users.ts", "packages/server/src/domain/sessions/verbs/provision-identity.ts"],
      rules: { "orb/external-id-subject-binds": "error", "orb/external-id-opaque-users-writes": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/domain/sessions/persistence/users.ts"],
      rules: { "orb/external-id-raw-users-writes": "error" },
    },
    { files: ["packages/ui/src/**/*.{ts,tsx}"], ignores: ["packages/ui/src/lib/**"], rules: { "orb/ui-skin-fragment-purity": "error" } },
    {
      files: ["packages/client/src/features/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/features/app-shell/**"],
      rules: { "orb/context-shell-chrome": "error" },
    },
    {
      files: ["packages/client/src/**/*.tsx", "packages/ui/src/**/*.tsx"],
      rules: { "orb/no-layout-context-props": "error" },
    },
    { files: ["packages/client/src/features/**/*.{ts,tsx}"], rules: { "orb/no-raw-container-in-features": "error" } },
    { files: ["packages/client/src/features/*/surfaces/**/*.tsx"], rules: { "orb/surface-consumes-container": "error" } },
    { files: ["packages/client/src/features/*/anchors/**/*.tsx"], rules: { "orb/anchor-provides-container": "error" } },
    { files: ["packages/server/src/primitives/role-data/index.ts"], rules: { "orb/role-data-export-surface-0": "error" } },
    { files: ["packages/server/src/primitives/role-data/registry.ts"], rules: { "orb/role-data-export-surface-1": "error" } },
    { files: ["packages/server/src/primitives/role-data/decode/index.ts"], rules: { "orb/role-data-export-surface-2": "error" } },
    { files: ["packages/server/src/domain/admin/guard.ts"], rules: { "orb/role-data-export-surface-3": "error" } },
    { files: ["packages/server/src/domain/chat/substrate/participants-host.ts"], rules: { "orb/role-data-export-surface-4": "error" } },
    { files: ["packages/server/src/domain/chat/substrate/member-visibility.ts"], rules: { "orb/role-data-export-surface-5": "error" } },
    { files: ["packages/server/src/domain/chat/persistence/role-encoding.ts"], rules: { "orb/role-data-export-surface-6": "error" } },
    { files: ["packages/server/src/entry/http/auth-meta.ts"], rules: { "orb/role-data-export-surface-7": "error" } },
    { files: ["packages/server/src/transport/trpc/role-output.ts"], rules: { "orb/role-data-export-surface-8": "error" } },
    { files: ["packages/server/src/domain/databank/persistence/scope.ts"], rules: { "orb/role-data-export-surface-9": "error" } },
    { files: ["packages/server/src/domain/admin/persistence/queries.ts"], rules: { "orb/role-data-export-surface-10": "error" } },
    { files: ["packages/server/src/entry/compose/chat.ts"], rules: { "orb/role-data-export-surface-11": "error" } },
    { files: ["packages/server/src/domain/sessions/verbs/validate.ts"], rules: { "orb/role-data-export-surface-12": "error" } },
    { files: ["packages/server/src/domain/sessions/verbs/load-user-by-id.ts"], rules: { "orb/role-data-export-surface-13": "error" } },
    { files: ["packages/server/src/domain/sessions/verbs/provision-identity.ts"], rules: { "orb/role-data-export-surface-14": "error" } },
    { files: ["packages/server/src/entry/auth/seam.ts"], rules: { "orb/role-data-export-surface-15": "error" } },
    { files: ["packages/server/src/domain/automation/persistence/canon-reads.ts"], rules: { "orb/role-data-export-surface-16": "error" } },
    { files: ["packages/server/src/domain/chat/persistence/queries.ts"], rules: { "orb/role-data-export-surface-17": "error" } },
    { files: ["packages/server/src/domain/chat/persistence/participants-read.ts"], rules: { "orb/role-data-export-surface-18": "error" } },
    { files: ["packages/server/src/domain/chat/verbs/edit.ts"], rules: { "orb/role-data-export-surface-19": "error" } },
    { files: ["packages/server/src/domain/chat/verbs/read.ts"], rules: { "orb/role-data-export-surface-20": "error" } },
    { files: ["packages/server/src/domain/chat/verbs/participants.ts"], rules: { "orb/role-data-export-surface-21": "error" } },
    { files: ["packages/server/src/domain/chat/engine/**/*.{ts,tsx}"], rules: { "orb/turn-identity-name": "error", "orb/turn-identity-principal": "error" } },
    {
      files: [
        "packages/client/src/**/*.{ts,tsx}",
        "packages/ui/src/**/*.{ts,tsx}",
        "packages/ui/**/*.{ts,tsx}",
        "packages/server/src/**/*.{ts,tsx}",
        "packages/db/src/**/*.{ts,tsx}",
        "packages/contracts/src/**/*.{ts,tsx}",
        "packages/kit/src/**/*.{ts,tsx}",
        "packages/showcase-plugins/src/**/*.{ts,tsx}",
        "packages/plugin-toolchain/src/**/*.{ts,tsx}",
        "packages/default-content/src/**/*.{ts,tsx}",
        "packages/inference/src/**/*.{ts,tsx}",
        "tooling/src/**/*.{ts,tsx}",
        "tests/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
      ],
      ignores: ["packages/contracts/**"],
      rules: { "orb/member-card-clamped": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/domain/chat/substrate/auth/**"],
      rules: { "orb/member-card-clamped-clamp": "error" },
    },
    { files: ["packages/server/src/domain/chat/**/*.{ts,tsx}"], rules: { "orb/membership-fan-guard": "error" } },
    {
      files: ["packages/server/src/**/*.{ts,tsx}", "packages/inference/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/infra/network/egress.ts"],
      rules: { "orb/no-raw-egress": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}", "packages/inference/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/infra/network/tls-terminator.ts"],
      rules: { "orb/no-raw-http-client": "error" },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}", "packages/inference/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/foundation/env/index.ts"],
      rules: { "orb/sole-env-reader": "error" },
    },
    {
      files: [
        "packages/client/src/**/*.{ts,tsx}",
        "packages/ui/src/**/*.{ts,tsx}",
        "packages/server/src/**/*.{ts,tsx}",
        "packages/db/src/**/*.{ts,tsx}",
        "packages/contracts/src/**/*.{ts,tsx}",
        "packages/kit/src/**/*.{ts,tsx}",
        "packages/showcase-plugins/src/**/*.{ts,tsx}",
        "packages/default-content/src/**/*.{ts,tsx}",
        "packages/inference/src/**/*.{ts,tsx}",
      ],
      ignores: ["packages/server/src/domain/chat/substrate/member-visibility.ts"],
      rules: { "orb/scrubber-home": "error" },
    },
    { files: ["packages/client/src/features/config/surfaces/config-content-surface.tsx"], rules: { "orb/config-host-no-feature-import": "error" } },
    {
      files: ["packages/client/src/forms/editor/bound-fields/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/forms/editor/bound-fields/use-bound-field.ts"],
      rules: { "orb/bound-field-via-hook": "error" },
    },
    {
      files: [
        "packages/client/src/**/*.{ts,tsx}",
        "packages/ui/src/**/*.{ts,tsx}",
        "packages/ui/**/*.{ts,tsx}",
        "packages/server/src/**/*.{ts,tsx}",
        "packages/db/src/**/*.{ts,tsx}",
        "packages/contracts/src/**/*.{ts,tsx}",
        "packages/kit/src/**/*.{ts,tsx}",
        "packages/showcase-plugins/src/**/*.{ts,tsx}",
        "packages/plugin-toolchain/src/**/*.{ts,tsx}",
        "packages/default-content/src/**/*.{ts,tsx}",
        "packages/inference/src/**/*.{ts,tsx}",
        "tooling/src/**/*.{ts,tsx}",
        "tests/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
      ],
      ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "packages/client/src/data/bus/chat-bus-writes.ts"],
      rules: { "orb/chat-stream-writes-in-bus-only": "error" },
    },
    { files: ["packages/client/src/data/bus/**/*.{ts,tsx}"], rules: { "orb/bus-on-data-no-store-write": "error" } },
    {
      files: ["packages/client/src/state/*-selection-store.ts"],
      ignores: [
        "packages/client/src/state/create-drill-selection-store.ts",
        "packages/client/src/state/create-kinded-selection-store.ts",
        "packages/client/src/state/message-selection-store.ts",
      ],
      rules: { "orb/selection-store-via-factory": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/main.tsx", "packages/client/src/**/compose/**"],
      rules: { "orb/registry-assembly-at-door-only": "error" },
    },
    { files: ["packages/client/src/state/*.{ts,tsx}"], ignores: ["packages/client/src/state/index.ts"], rules: { "orb/state-files": "error" } },
    { files: ["tests/**/_*stories.tsx", "tests/**/*.stories.tsx"], rules: { "orb/testid-typed-only-stories": "error" } },
    { files: ["tests/**/*.ct.tsx"], rules: { "orb/route-trpc-lifo-order": "error" } },
    { files: ["packages/server/src/domain/*/contract/service.ts"], rules: { "orb/types-in-contract": "error" } },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: ["packages/server/src/primitives/serde/card/index.ts"],
      rules: { "orb/serde-core-definition-uniqueness": "error" },
    },
    { files: ["packages/db/src/schema/**/*.ts"], rules: { "orb/db-enum-from-tuple": "error" } },
    { files: ["packages/ui/src/**/index.ts"], rules: { "orb/ui-variants-barrel-private": "error" } },
    { files: ["packages/ui/src/**/*.tsx"], ignores: ["packages/ui/src/**/charts/**", "packages/ui/src/art/**"], rules: { "orb/ui-no-inline-svg": "error" } },
    { files: ["tests/ui/**/*.ct.tsx", "tests/ui/**/*.fixtures.tsx"], rules: { "orb/ui-ct-no-inline-provider": "error" } },
    {
      files: [
        "packages/ui/src/primitives/popover/popover.tsx",
        "packages/ui/src/primitives/menu/menu.tsx",
        "packages/ui/src/primitives/select/select.tsx",
        "packages/ui/src/primitives/autocomplete/autocomplete.tsx",
        "packages/ui/src/primitives/tooltip/tooltip.tsx",
      ],
      rules: { "orb/ui-overlay-anchored-anatomy": "error" },
    },
    {
      files: [
        "packages/ui/src/primitives/dialog/dialog.tsx",
        "packages/ui/src/primitives/alert-dialog/alert-dialog.tsx",
        "packages/ui/src/primitives/drawer/drawer.tsx",
      ],
      rules: { "orb/ui-overlay-modal-anatomy": "error" },
    },
    {
      files: [
        "packages/client/src/**/*.{ts,tsx}",
        "packages/ui/src/**/*.{ts,tsx}",
        "packages/ui/**/*.{ts,tsx}",
        "packages/server/src/**/*.{ts,tsx}",
        "packages/db/src/**/*.{ts,tsx}",
        "packages/contracts/src/**/*.{ts,tsx}",
        "packages/kit/src/**/*.{ts,tsx}",
        "packages/showcase-plugins/src/**/*.{ts,tsx}",
        "packages/plugin-toolchain/src/**/*.{ts,tsx}",
        "packages/default-content/src/**/*.{ts,tsx}",
        "packages/inference/src/**/*.{ts,tsx}",
        "tooling/src/**/*.{ts,tsx}",
        "tests/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
      ],
      rules: { "orb/no-raw-id": "error", "orb/no-inline-union-alias": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/server/src/**/*.{ts,tsx}", "packages/inference/src/**/*.{ts,tsx}"],
      rules: { "orb/wire-json-parsed-at-consumer": "error" },
    },
  ] satisfies FlatConfig.Config[]
).map((block): FlatConfig.Config => ({ ...block, plugins: { orb: localPlugin } }));

// Client and @orb/ui law that was review-only: manual memo, `use()` on a promise, and `useInfiniteQuery` outside its factory.
const INFINITE_QUERY_HOME = "packages/client/src/data/create-collection-surface.ts";
const SUSPENSE_READS_HOME = "packages/client/src/data/suspense-reads.ts";
const INFINITE_QUERY_IMPORT = {
  name: "@tanstack/react-query",
  importNames: ["useInfiniteQuery"],
  message: "Paginated browse is createCollectionSurface; useInfiniteQuery appears only inside that factory (client-architecture-state-and-gates.md §14).",
};
const SUSPENSE_READ_IMPORT = {
  name: "@tanstack/react-query",
  importNames: ["useSuspenseQuery", "useSuspenseQueries", "useSuspenseInfiniteQuery"],
  message: "Import the suspending reads from #data: they check that a QueryBoundary sits above the read (client-architecture-state-and-gates.md §11).",
};
// The only client files that page a suspending read; each says why the collection factory cannot carry it.
const SUSPENSE_INFINITE_HOMES = {
  "packages/client/src/components/character-picker.tsx":
    "a cmdk Command body whose search suspends behind a deferred value and whose tail-fetch error shows beside the retained rows; the factory is a virtual-list machine that neither suspends nor exposes the tail error",
  "packages/client/src/features/chat/components/transcript-window.tsx":
    "a bidirectional message window with before and after cursors; the factory pages one direction",
} as const;
const SUSPENSE_INFINITE_IMPORT = {
  name: "#data",
  importNames: ["useSuspenseInfiniteQuery"],
  message: "A paged suspending read belongs to createCollectionSurface; the files in SUSPENSE_INFINITE_HOMES (eslint.config.ts) name why they cannot use it.",
};
const refuseImports = (...paths: readonly object[]): Linter.RulesRecord => ({ "no-restricted-imports": ["error", { paths }] });
const UI_LAW_BLOCKS: FlatConfig.Config[] = [
  { files: REACT_SOURCE, plugins: { orb: localPlugin }, rules: { "orb/no-manual-memo": "error", "orb/no-use-promise": "error" } },
  // Flat config replaces a rule's options per block, so each file gets the one block naming every path it must refuse.
  {
    files: [CLIENT_SRC],
    ignores: [INFINITE_QUERY_HOME, SUSPENSE_READS_HOME, ...Object.keys(SUSPENSE_INFINITE_HOMES)],
    rules: refuseImports(INFINITE_QUERY_IMPORT, SUSPENSE_READ_IMPORT, SUSPENSE_INFINITE_IMPORT),
  },
  { files: Object.keys(SUSPENSE_INFINITE_HOMES), rules: refuseImports(INFINITE_QUERY_IMPORT, SUSPENSE_READ_IMPORT) },
  { files: [INFINITE_QUERY_HOME], rules: refuseImports(SUSPENSE_READ_IMPORT, SUSPENSE_INFINITE_IMPORT) },
  { files: [SUSPENSE_READS_HOME], rules: refuseImports(INFINITE_QUERY_IMPORT) },
];

const PRINCIPAL_RULES: { id: string; notUnder?: string[] }[] = [
  {
    id: "principal-alias",
  },
  {
    id: "principal-assertion",
  },
  {
    id: "principal-return-site",
  },
  {
    id: "principal-mint-site",
  },
  {
    id: "principal-literal",
  },
  {
    id: "principal-brand-launder",
  },
  {
    id: "principal-synthetic-role",
    notUnder: ["packages/server/src/entry/**"],
  },
];
// Files whose module state is one process's by construction: each is its own process root or a documented
// per-process latch, so `orb/no-module-state` does not apply. Each entry names its reason.
const MODULE_STATE_OWN_PROCESS = [
  // The one process.env reader: the .env file's provenance is written once, at load, from this process's file.
  "packages/server/src/foundation/env/index.ts",
  // The process's build identity, read once and frozen so every surface reports the same string.
  "packages/server/src/foundation/version/index.ts",
  // The OTel provider and context manager are process-global by design; the boot latch guards their one install.
  "packages/server/src/foundation/observability/tracing.ts",
  // The plugin broker, its watchdog and its guest Worker are each their own process root.
  "packages/server/src/infra/plugin-host/broker-entry.ts",
  "packages/server/src/infra/plugin-host/broker-watchdog.ts",
  "packages/server/src/infra/plugin-host/worker-runtime.ts",
  // The compiled QuickJS WASM module the guest runtime shares, compiled once per process.
  "packages/server/src/infra/plugin-host/module.ts",
];
const PRINCIPAL_SCOPE = rootSources("@server", "@inference");

// The only client features files that look DOM up by id or selector. Each is a surface whose job is DOM addressing;
// tests/tooling/eslint-client-dom-locks.test.ts fails a home the rule no longer matches. A new site is a finding.
const DOM_LOOKUP_HOMES = {
  "packages/client/src/features/app-shell/components/context-bracket.tsx":
    "the shell's tab rail scrolls its own active cell into view; the Tabs part publishes no active-cell handle",
  "packages/client/src/features/app-shell/components/modal-host.tsx":
    "the focus return finds the rendered rail or topbar trigger that opened the modal, which the shell chrome draws",
  "packages/client/src/features/app-shell/lib/bug-report-capture.ts": "dev bug-report capture reads the live page the reporter was looking at",
  "packages/client/src/features/app-shell/surfaces/app-shell.tsx": "a closed panel hands focus to its toggle, which the shell frame stamps with a marker",
  "packages/client/src/features/character/hooks/use-roving-chip-focus.ts": "a roving group discovers its items under its own container",
  "packages/client/src/features/chat/components/members-panel.tsx": "a roving row discovers its own controls, which depend on the row kind and the pointer",
  "packages/client/src/features/config/hooks/use-config-scroll-spy.ts":
    "the settings host addresses contribution anchors by the registry-minted id prefix (client-architecture-lockdown.md §8)",
  "packages/client/src/features/config/lib/config-jump.ts":
    "the settings host addresses contribution anchors by the registry-minted id prefix (client-architecture-lockdown.md §8)",
  "packages/client/src/features/config/lib/config-scroll-spy.ts":
    "the settings host addresses contribution anchors by the registry-minted id prefix (client-architecture-lockdown.md §8)",
  "packages/client/src/features/config/surfaces/config-content-surface.tsx":
    "the settings host addresses a setting control by the registry-minted control id (client-architecture-lockdown.md §8)",
  "packages/client/src/features/home/lib/use-balanced-foot.ts":
    "the balancer measures the two columns it does not render and asks whether a placeholder is left in them",
  "packages/client/src/features/persona/components/persona-switch-list.tsx": "a roving group discovers its items under its own container",
  "packages/client/src/features/stats/lib/leaderboard-row-focus.ts":
    "Back returns focus to a virtualized finder row in a sibling pane, addressed by the character attribute the row publishes",
  "packages/client/src/features/stats/lib/use-leaderboard-roving.ts": "a roving group discovers its items under its own container",
  "packages/client/src/features/tag/lib/labels-focus-targets.ts":
    "the finder and the library are sibling panes with no shared ancestor; each is addressed by its stamped data-slot",
} as const;

// Hand-rolled DOM and style work in the client (docs/law/client-architecture-lockdown.md §0 and §4, motion-and-animation-guide.md §5.3).
const CLIENT_DOM_LOCK_BLOCKS: FlatConfig.Config[] = [
  { files: ["packages/client/src/**/*.tsx"], rules: { "orb/no-static-style-prop": "error" } },
  {
    files: ["packages/client/src/features/**/*.{ts,tsx}"],
    ignores: Object.keys(DOM_LOOKUP_HOMES),
    rules: { "orb/no-dom-lookup-in-features": "error" },
  },
  { files: ["packages/client/src/**/*.{ts,tsx}"], rules: { "orb/no-class-list-write": "error", "orb/no-sealed-library-internals": "error" } },
  { files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"], rules: { "orb/no-render-layout-read": "error" } },
];

export default [
  ...NATIVE_CONFIG.map((block) =>
    block.files === undefined || block.rules === undefined ? block : { ...block, ignores: [...(block.ignores ?? []), "**/*.gen.{ts,tsx}"] },
  ),
  ...LOCAL_RULE_BLOCKS,
  ...CLIENT_DOM_LOCK_BLOCKS,
  ...UI_LAW_BLOCKS,
  {
    files: ["packages/server/src/**/*.{ts,tsx}"],
    ignores: ["packages/server/src/domain/import/**", "packages/server/src/domain/export/**", "packages/server/src/domain/settings/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [SETTINGS_TABLE_IMPORT, PNG_CHUNK_IMPORT] }] },
  },
  {
    files: ["packages/server/src/domain/import/**/*.{ts,tsx}", "packages/server/src/domain/export/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [SETTINGS_TABLE_IMPORT] }] },
  },
  {
    files: ["packages/server/src/domain/settings/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [PNG_CHUNK_IMPORT] }] },
  },
  { files: rootSources("@server", "@inference"), rules: { "no-restricted-syntax": ["error", INVISIBLE_CONTROL_SYNTAX, ...SERVER_SYNTAX] } },
  { files: rootSources("@db"), rules: { "no-restricted-syntax": ["error", INVISIBLE_CONTROL_SYNTAX, ...MODULE_LOADER_SYNTAX] } },
  {
    files: [CLIENT_SRC],
    ignores: ORB_TRACK_CLASS_HOMES,
    rules: { "no-restricted-syntax": ["error", ...CLIENT_SYNTAX, ORB_TRACK_CLASS_SYNTAX] },
  },
  {
    files: ORB_TRACK_CLASS_HOMES,
    rules: { "no-restricted-syntax": ["error", ...CLIENT_SYNTAX] },
  },
  { files: ["packages/ui/src/**/*.{ts,tsx}"], rules: { "no-restricted-syntax": ["error", INVISIBLE_CONTROL_SYNTAX, EMPTY_ARIA_NAME_SYNTAX] } },
  {
    files: ["packages/server/src/domain/settings/seed-themes.ts", "packages/server/src/domain/preset/seed.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        INVISIBLE_CONTROL_SYNTAX,
        ...SERVER_SYNTAX,
        {
          selector:
            "Program > :matches(ExportAllDeclaration, ExportDefaultDeclaration, ExportNamedDeclaration[exportKind!='type'][declaration.type!='FunctionDeclaration'])",
          message:
            "System seed roots cannot forward exports through specifiers, defaults, stars or non-function value declarations; keep the declared seed functions. Function-return escape is outside this syntax claim (D328).",
        },
      ],
    },
  },
  ...PRINCIPAL_RULES.map(
    ({ id, notUnder }): FlatConfig.Config => ({
      files: PRINCIPAL_SCOPE,
      ...(notUnder === undefined ? {} : { ignores: notUnder }),
      plugins: { orb: localPlugin },
      rules: { [`orb/${id}`]: "error" },
    }),
  ),
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { orb: localPlugin },
    rules: { "orb/commented-code": "error" },
  },
  {
    files: rootSources("@server", "@inference"),
    ignores: ["packages/server/src/**/persistence/**"],
    plugins: { orb: localPlugin },
    rules: { "orb/assumes-single-replica": "error" },
  },
  {
    files: rootSources("@server"),
    ignores: MODULE_STATE_OWN_PROCESS,
    plugins: { orb: localPlugin },
    rules: { "orb/no-module-state": "error" },
  },
  { files: rootSources("@server", "@inference"), plugins: { orb: localPlugin }, rules: { "orb/detached-work-traced": "error" } },
  { files: [...rootSources("@tooling"), ...PLAYWRIGHT_TESTS], plugins: { orb: localPlugin }, rules: { "orb/evaluate-no-scope-capture": "error" } },
  {
    files: ["packages/server/src/domain/**/*.{ts,tsx}", "packages/server/src/entry/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { orb: localPlugin },
    rules: { "orb/no-hardcoded-side-gen-sampling": "error" },
  },
  {
    files: rootSources("@client", "@ui"),
    plugins: { orb: localPlugin },
    rules: {
      "orb/receded-ink-integrity": "error",
      "orb/no-tailwind-dark-variant": "error",
      "orb/no-floorless-control-in-wrap": "error",
      "orb/browser-no-node-globals": "error",
    },
  },
  {
    // The packages the client bundle ships; plugin bundles run in the WASM sandbox, not the browser's main realm.
    files: rootSources("@client", "@ui", "@kit", "@contracts"),
    plugins: { orb: localPlugin },
    rules: { "orb/browser-support": "error" },
  },
  {
    files: PRE_POLYFILL_SOURCE,
    plugins: { orb: localPlugin },
    rules: { "orb/browser-support": "off", "orb/browser-support-entry": "error" },
  },
  {
    files: BROWSER_MOUNT_SOURCE,
    ignores: ["tests/**/*.ct.tsx", "{tests,scripts}/support/{iso,node}/**"],
    plugins: { orb: localPlugin },
    rules: { "orb/browser-no-node-globals": "error" },
  },
  {
    files: [CLIENT_SRC],
    plugins: { orb: localPlugin },
    rules: { "orb/zustand-selector-derived": "error", "orb/testid-typed-only": "error" },
  },
  {
    files: [CLIENT_SRC, "packages/ui/src/**/*.{ts,tsx}"],
    plugins: { orb: localPlugin },
    rules: { "orb/no-native-title": "error" },
  },
  {
    files: [CLIENT_SRC],
    ignores: ["packages/client/src/lib/session-channel.ts"],
    plugins: { orb: localPlugin },
    rules: { "orb/session-channel-boundary": "error" },
  },
  { files: ["tests/**/*.{ts,tsx}"], plugins: { orb: localPlugin }, rules: { "orb/ct-poll-intervals-shared": "error" } },
  { files: ["tests/ui/**/*.ct.tsx"], plugins: { orb: localPlugin }, rules: { "orb/ui-ct-no-color-literal": "error" } },
  { files: [PLUGIN_MEMBRANE], plugins: { orb: localPlugin }, rules: { "orb/plugin-dump-guard": "error" } },
  { files: ["packages/contracts/src/plugin/**/*.ts"], plugins: { orb: localPlugin }, rules: { "orb/sandbox-wire-id": "error" } },
  { files: ["packages/ui/src/**/*.{ts,tsx}"], plugins: { orb: localPlugin }, rules: { "orb/baseui-portal-container-seam": "error" } },
  {
    files: ["tests/support/node/factories/**/*.{ts,tsx}", "**/tests/support/node/factories/**/*.{ts,tsx}"],
    plugins: { orb: localPlugin },
    rules: { "orb/test-factory-contract": "error" },
  },
  {
    // The persistence tier matches the rows door's audience (testkit-rows-persistence-only); every other test seeds through verbs.
    // tests/tooling is outside: those tests exercise tooling that owns its row writes and reads (seeders, migrators, snap
    // stages), and Spine-Testing §9 governs product tests, as with the TEST_ENVIRONMENT_RESTRICTIONS tooling exemption.
    files: ["tests/**/*.{ts,tsx}", "scripts/**/*.{ts,tsx}", "playwright/**/*.{ts,tsx}"],
    ignores: ["tests/support/**", "tests/db/**", "tests/tooling/**", "**/persistence/**", "**/*.d.ts"],
    plugins: { orb: localPlugin },
    rules: { "orb/no-direct-row-writes": "error" },
  },
  {
    // Reads take a closed list inside tests/support, so a seed or door helper cannot read a row and hand it to a verb suite.
    files: ["tests/**/*.{ts,tsx}", "scripts/**/*.{ts,tsx}", "playwright/**/*.{ts,tsx}"],
    ignores: ["tests/db/**", "tests/tooling/**", "**/persistence/**", "**/*.d.ts", ...ROW_READ_HOMES],
    plugins: { orb: localPlugin },
    rules: { "orb/no-direct-row-reads": "error" },
  },
  {
    files: AUTHORED_SRC.map((glob) => [glob, "**/context.ts"]),
    plugins: { orb: localPlugin },
    rules: { "orb/no-context-returntype": "error" },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    ignores: ["tests/support/**", "tests/tooling/**", "**/*.test-d.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "vitest", importNames: ["test", "it"], message: "Use the shared @orb/testkit/node/fixtures.ts test entry." }],
          patterns: [
            {
              regex: "^(@orb/server(?:/|$)|#server/|.*packages/server/)",
              importNamePattern: "^create(?:Services|.*(?:Service|Context))$",
              allowTypeImports: true,
              message: "Use the production graph from testkit; application tests must not assemble replacement services or contexts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    // tests/tooling is outside this block twice over: it runs in the isolated `tooling` project, where a stubbed
    // environment cannot reach another file, and its subjects (CLIs, `readBoxLoad`, the `.env` loader) read the
    // process environment at call time by design with no parameter to pass the value through.
    ignores: ["tests/tooling/**", "**/*.test-d.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        INVISIBLE_CONTROL_SYNTAX,
        INTERNAL_MODULE_MOCK_RESTRICTION,
        EXTERNAL_MODULE_MOCK_RESTRICTION,
        ...TEST_ENVIRONMENT_RESTRICTIONS,
      ],
    },
  },
  {
    files: ["tests/**/*.ct.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        INVISIBLE_CONTROL_SYNTAX,
        INTERNAL_MODULE_MOCK_RESTRICTION,
        EXTERNAL_MODULE_MOCK_RESTRICTION,
        ...TEST_ENVIRONMENT_RESTRICTIONS,
        { selector: "JSXElement, JSXFragment", message: "Keep component composition in browser stories; CT specs call native mount with data props." },
        {
          selector: "CallExpression[callee.name='mount']:not([typeArguments])",
          message: "Use mount<typeof Story> so the compiler checks mount and update props.",
        },
        {
          selector:
            "CallExpression:matches([callee.name='mount'], [callee.property.name='update']) > ObjectExpression.arguments Property > :matches(ArrowFunctionExpression, FunctionExpression)",
          message: "Create callbacks inside the browser story; mount props carry data, not Node callbacks.",
        },
        {
          selector: String.raw`ImportDeclaration[importKind!='type'][source.value=/(?:-stories|-fixtures|\.stories|\.fixtures)(?:\.tsx)?$/] > :matches(ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier[importKind!='type'])`,
          message: "Import story types only in CT specs; the gallery loads the browser implementation.",
        },
      ],
    },
  },
] satisfies FlatConfig.Config[];
