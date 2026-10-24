import { fileURLToPath } from "node:url";
import { authorClassIgnores, createOrbPlugin } from "@orb/tooling/eslint";
import { BUTTON_SIZE_OVERFLOW } from "@orb/ui/button/size-hit-area";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import vitest from "@vitest/eslint-plugin";
import type { Linter } from "eslint";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import drizzle from "eslint-plugin-drizzle";
import jsxA11y from "eslint-plugin-jsx-a11y";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import reactWebApi from "eslint-plugin-react-web-api";
import reactX from "eslint-plugin-react-x";
import reactNoEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import regexp from "eslint-plugin-regexp";
import tsdoc from "eslint-plugin-tsdoc";
import type { FlatConfig } from "typescript-eslint";
import tseslint from "typescript-eslint";
import biomeConfig from "./biome.json" with { type: "json" };

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const UI_STYLESHEET = fileURLToPath(new URL("./packages/ui/src/styles/globals.css", import.meta.url));
const CLIENT_STYLESHEET = fileURLToPath(new URL("./packages/client/src/styles/globals.css", import.meta.url));
const SHELL_STYLESHEET = fileURLToPath(new URL("./packages/client/src/features/app-shell/surfaces/shell.css", import.meta.url));

const SOURCE = ["packages/*/src/**/*.{ts,tsx}", "tooling/src/**/*.{ts,tsx}"];

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

const PLAYWRIGHT_TESTS = ["tests/**/*.ct.tsx", "tests/**/*.spec.ts", "tests/e2e/**/!(*.test).{ts,tsx}"];

const MOCK_CALL = String.raw`CallExpression:matches([callee.name=/^(mock|doMock)$/], [callee.property.name=/^(mock|doMock)$/], [callee.property.value=/^(mock|doMock)$/])`;
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

const SERVER_SYNTAX = [
  {
    selector: String.raw`:matches(Literal[value=type(string)][raw=/corsproxy\.io/], TemplateElement[value.raw=/corsproxy\.io/])`,
    message: "D61 B5a: the rejected third-party CORS proxy cannot be spelled in server or inference literals; use the guarded network owner directly.",
  },
];

const CLIENT_SRC = "packages/client/src/**/*.{ts,tsx}";

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
  ...[
    { name: "ui", entryPoint: UI_STYLESHEET, stylesheets: [UI_STYLESHEET] },
    { name: "client", entryPoint: CLIENT_STYLESHEET, stylesheets: [UI_STYLESHEET, CLIENT_STYLESHEET, SHELL_STYLESHEET] },
  ].map(
    ({ name, entryPoint, stylesheets }): FlatConfig.Config => ({
      files: [`packages/${name}/src/**/*.{ts,tsx}`],
      plugins: { "better-tailwindcss": betterTailwindcss },
      settings: { "better-tailwindcss": { entryPoint } },
      rules: {
        "better-tailwindcss/enforce-consistent-variable-syntax": ["error", { syntax: "shorthand" }],
        "better-tailwindcss/no-deprecated-classes": "error",
        "better-tailwindcss/no-unknown-classes": ["error", { ignore: authorClassIgnores(stylesheets) }],
      },
    }),
  ),
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
const localPlugin = createOrbPlugin({
  browserNodeGlobals: new Set([...Object.keys(browserGlobalsOverride.linter.rules.style.noRestrictedGlobals.options.deniedGlobals), "process"]),
  floorlessButtonSizes: new Set(
    Object.entries(BUTTON_SIZE_OVERFLOW)
      .filter(([, overflows]) => overflows)
      .map(([size]) => size),
  ),
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
      rules: {
        "orb/class-token-splice": "error",
        "orb/no-arbitrary-tw-values": "error",
        "orb/no-color-literals": "error",
        "orb/no-off-token-inline-style": "error",
        "orb/theme-override-only-via-scope": "error",
        "orb/no-banned-tw-utility": "error",
      },
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
      ignores: [
        "packages/ui/src/lib/coarse-pointer-now.ts",
        "packages/ui/src/lib/reduced-motion-now.ts",
        "packages/client/src/features/app-shell/hooks/use-is-mobile-viewport.ts",
        "packages/ui/src/lib/use-prefers-light-color-scheme.ts",
        "packages/ui/src/lib/use-prefers-reduced-motion.ts",
      ],
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
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/features/app-shell/**"],
      rules: { "orb/no-media-queries-in-features": "error" },
    },
    {
      files: ["packages/client/src/features/**/*.{ts,tsx}"],
      ignores: ["packages/client/src/features/app-shell/**"],
      rules: { "orb/no-pointer-variants-in-features": "error", "orb/context-shell-chrome": "error" },
    },
    {
      files: ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
      ignores: ["packages/ui/src/layout/**", "packages/ui/src/markdown/**"],
      rules: { "orb/no-raw-container-widths": "error" },
    },
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
    { files: ["packages/ui/src/**/*.tsx"], ignores: ["packages/ui/src/**/charts/**"], rules: { "orb/ui-no-inline-svg": "error" } },
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
const PRINCIPAL_SCOPE = rootSources("@server", "@inference");

export default [
  ...NATIVE_CONFIG.map((block) =>
    block.files === undefined || block.rules === undefined ? block : { ...block, ignores: [...(block.ignores ?? []), "**/*.gen.{ts,tsx}"] },
  ),
  ...LOCAL_RULE_BLOCKS,
  {
    files: ["packages/server/src/**/*.{ts,tsx}"],
    ignores: ["packages/server/src/domain/import/**", "packages/server/src/domain/export/**", "packages/server/src/domain/settings/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [SETTINGS_TABLE_IMPORT, PNG_CHUNK_IMPORT] }] },
  },
  {
    files: ["packages/server/src/domain/import/**/*.{ts,tsx}", "packages/server/src/domain/export/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [SETTINGS_TABLE_IMPORT] }] },
  },
  { files: ["packages/server/src/domain/settings/**/*.{ts,tsx}"], rules: { "no-restricted-imports": ["error", { patterns: [PNG_CHUNK_IMPORT] }] } },
  { files: rootSources("@server", "@inference"), rules: { "no-restricted-syntax": ["error", ...SERVER_SYNTAX] } },
  {
    files: ["packages/server/src/domain/settings/seed-themes.ts", "packages/server/src/domain/preset/seed.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
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
    files: BROWSER_MOUNT_SOURCE,
    ignores: ["tests/**/*.ct.tsx", "{tests,scripts}/support/{iso,node}/**"],
    plugins: { orb: localPlugin },
    rules: { "orb/browser-no-node-globals": "error" },
  },
  { files: [CLIENT_SRC], plugins: { orb: localPlugin }, rules: { "orb/zustand-selector-derived": "error", "orb/testid-typed-only": "error" } },
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
    files: ["tests/**/*.{ts,tsx}", "scripts/**/*.{ts,tsx}", "playwright/**/*.{ts,tsx}"],
    ignores: ["tests/support/**", "tests/db/**", "**/persistence/**", "**/*.d.ts"],
    plugins: { orb: localPlugin },
    rules: { "orb/no-direct-row-writes": "error" },
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
      "no-restricted-syntax": ["error", INTERNAL_MODULE_MOCK_RESTRICTION, EXTERNAL_MODULE_MOCK_RESTRICTION, ...TEST_ENVIRONMENT_RESTRICTIONS],
    },
  },
  {
    files: ["tests/**/*.ct.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
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
