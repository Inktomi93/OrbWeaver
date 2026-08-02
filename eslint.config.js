// Orbweaver's ESLint gate — the NARROW supplement to Biome.
//
// Biome owns formatting + 400+ correctness rules (biome.json, ~20 grit plugins). ESLint exists ONLY
// for the rules Biome can't do yet, and is intentionally explicit-rules-only: every rule is listed by
// name (never `...recommended` bundles) so a plugin upgrade can't silently add a new gate to
// `pnpm check`. What each plugin gives us:
//
//   1. eslint-plugin-react-hooks (v7 — ships the React Compiler diagnostics)
//      • rules-of-hooks + exhaustive-deps + the full Rules-of-React correctness set (purity,
//        immutability, refs, set-state-in-{effect,render}, static-components, use-memo, …).
//      • This IS the recommended set — every rule is rules-of-hooks-adjacent or a Compiler diagnostic
//        (a CORRECTNESS bundle, not a style bundle) — so we spread it, and `--max-warnings=0` (see the
//        `lint:eslint` script) turns its warn-level rules (exhaustive-deps, …) into hard gates.
//
//   2. @tanstack/eslint-plugin-query — queryKey/queryFn discipline (client only; dormant until tRPC lands)
//      • exhaustive-deps · no-unstable-deps · no-void-query-fn · stable-query-client · prefer-query-options
//
//   3. @tanstack/eslint-plugin-router — code-based route discipline (client only; dormant until routes land)
//      • create-route-property-order ONLY. Its meta: "define route options in a specific order to ensure
//        the type inference works correctly" — a TYPE-INFERENCE correctness rule (not ergonomic; Biome
//        can't do it) that applies to the hand-written createRoute/createRootRoute tree we DO use.
//
//   4. eslint-plugin-better-tailwindcss — validates class strings against the classes the v4 engine
//      ACTUALLY registers for our @theme (entryPoint: @orb/ui globals.css). ui NOW.
//      • no-unknown-classes · enforce-consistent-variable-syntax(shorthand) · no-deprecated-classes
//
//   5. @typescript-eslint/no-deprecated (type-aware) — makes the doctrine's `@deprecated` tag a gate.
//
//   6. Custom no-restricted-syntax — zustand escape-hatch guard (client only; dormant until state/ lands).
//
// What we INTENTIONALLY DROP (Biome owns them, or ergonomic-only):
//   • query/{infinite-query-property-order, mutation-property-order} — property ordering → Biome.
//   • query/no-rest-destructuring — destructure style → ergonomic.
//   • router/route-param-names — file-based `$param`↔useParams naming; we hand-write a code-based tree
//     (UI-Arch §6.1) so there are no `$param` route files for it to match → pure no-op.
//   • better-tailwindcss stylistic rules (enforce-consistent-class-order/-line-wrapping/-variant-order,
//     enforce-canonical/shorthand/logical, no-duplicate/-unnecessary-whitespace) — Biome owns class
//     style/format/order. (no-conflicting-classes / no-duplicate-classes are correctness-adjacent and
//     available; deferred until @orb/ui's class surface stabilizes — revisit then.)
//   • typescript-eslint's recommended RULE set — tsc + Biome own type/style; we take the PARSER only.
import { fileURLToPath } from "node:url";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tsdoc from "eslint-plugin-tsdoc";
import tseslint from "typescript-eslint";

// This config lives at the repo root; projectService/tsconfig discovery is rooted here.
const ROOT = fileURLToPath(new URL(".", import.meta.url));

// The linted TS surface. @orb/ui is gated NOW (its components must be React-Compiler-clean, D54);
// @orb/client is skeletal but wired so the gate is live the moment code lands.
const UI_SRC = "packages/ui/src/**/*.{ts,tsx}";
const CLIENT_SRC = "packages/client/src/**/*.{ts,tsx}";
// Browser component tests (the ones @orb/ui's / @orb/client's tsconfigs own — real components +
// hooks). The node `tests/ui/**/*.test.ts` (tokens, etc.) are NOT matched here — no hooks/components.
const UI_CT = "tests/ui/**/*.ct.tsx";
const UI_FIXTURES = "tests/ui/**/*.fixtures.tsx";
const CLIENT_CT = "tests/client/**/*.ct.tsx";
const CLIENT_STORIES = "tests/client/**/_ct-stories.tsx";
const CT_SURFACE = [UI_CT, UI_FIXTURES, CLIENT_CT, CLIENT_STORIES];

const REACT_SURFACE = [UI_SRC, CLIENT_SRC, ...CT_SURFACE];
const SHIPPED_SRC = [UI_SRC, CLIENT_SRC];

// The typed exported-API packages governed by the Documentation-Law doc-comment gates
// (tsdoc/syntax + no-deprecated). server/kit/db/contracts — where the contract surface + its TSDoc
// live; ui/client run their own react-surface gates above. `.ts` only (no `.tsx` in these packages).
const TSDOC_SURFACE = ["packages/server/src/**/*.ts", "packages/kit/src/**/*.ts", "packages/db/src/**/*.ts", "packages/contracts/src/**/*.ts"];

// Reused restricted-syntax selectors. ESLint flat-config REPLACES `no-restricted-syntax` per matching
// file (it does NOT merge across config objects), so any block that wins for a file must re-list every
// selector that should apply there — hence these are shared consts, not inline.
const NO_STORE_STATICS = {
  selector: "CallExpression[callee.object.name=/^use.*Store$/][callee.property.name=/^(setState|getState)$/]",
  message: "Don't reach into a zustand store's static setState/getState from outside state/. Define an action in the store file and call that.",
};
// COMPOSE-ONLY KEYSTONE — a feature ASSEMBLES @orb/ui primitives + the layout kit; it never PAINTS.
// No className/style on a raw intrinsic (lowercase-tag) element. The kit is the only painter (§1.1/§4).
const INTRINSIC_EL = "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^[a-z]/]";
const NO_CLASSNAME_ON_INTRINSIC = {
  selector: `${INTRINSIC_EL} > JSXAttribute[name.name='className']`,
  message:
    "No className on a raw HTML element in a feature — compose @orb/ui primitives + <Stack>/<Row>/<Section>/<Container>. A styled element belongs in @orb/ui (the kit is the only painter — UI-Arch §1.1/§4).",
};
const NO_STYLE_ON_INTRINSIC = {
  selector: `${INTRINSIC_EL} > JSXAttribute[name.name='style']`,
  message: "No inline style on a raw HTML element in a feature — styling lives in @orb/ui, tokens only (UI-Arch §1.1).",
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "reports/**",
      // `__g_*` — the check-gates self-test's reserved throwaway-fixture sentinel (tsconfig.base.json's
      // exclude note). Ignoring it keeps a concurrent `pnpm lint:eslint` from catching a fixture (many land
      // under packages/*/src) mid-lifecycle → a phantom lint error that vanishes on re-run.
      "**/__g_*",
      "**/*.gen.ts",
      "**/routeTree.gen.ts",
      "packages/ui/src/tokens/index.ts",
      "packages/ui/src/styles/theme.css",
    ],
  },
  {
    // A stale `eslint-disable` can never rot silently: a directive that suppresses nothing is itself an
    // ERROR. No `files` key ⇒ this applies to every linted file. ESLint's own default here is "warn", which
    // only bites where `--max-warnings 0` is passed (the lint:eslint script and the verify registry's scoped
    // argv do; an ad-hoc `npx eslint <file>` does not) — "error" makes the verdict the same everywhere. A
    // suppression that stops matching a real diagnostic is exactly the comment the doctrine wants deleted,
    // and this is what turns "should be deleted" into "must be deleted".
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    // Type-aware parser for shipped source. `projectService` builds one TS program per package so
    // `no-deprecated` can see types; each file resolves upward to its own package tsconfig (ui/client).
    files: SHIPPED_SRC,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: ROOT,
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
  },
  {
    // Syntactic parser for the browser component tests. These live under tests/ (owned by the ui /
    // client package tsconfigs via reach-back includes), so projectService's upward search lands on
    // the root tsconfig — which EXCLUDES them. react-hooks rules are syntactic (no type info needed),
    // so parse without projectService. (no-deprecated stays off here — shipped-source-only above.)
    files: CT_SURFACE,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
  },
  {
    // @deprecated enforcement (type-aware, shipped source only): any USE of a @deprecated symbol
    // (ours OR a third-party API) errors — the doctrine's tag becomes a gate, not an editor strikethrough.
    // tsdoc/syntax joined at the client-foundation wave (2026-07-03): ui/client now carry a real
    // exported-API surface (the factories/seals), so their doc comments get the same Documentation-Law
    // gate as server/kit/db/contracts.
    files: SHIPPED_SRC,
    plugins: { "@typescript-eslint": tseslint.plugin, tsdoc },
    rules: { "@typescript-eslint/no-deprecated": "error", "tsdoc/syntax": "error" },
  },
  {
    // Type-aware parser for the exported-API packages (server/kit/db/contracts) — projectService builds
    // one TS program per package so no-deprecated can see types; each file resolves to its own tsconfig.
    files: TSDOC_SURFACE,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: ROOT, sourceType: "module" },
    },
  },
  {
    // The Documentation-Law doc-comment gates on the typed API surface — both hard gates. `no-deprecated`
    // (type-aware, rides the parser block above) rejects any USE of a `@deprecated` symbol. `tsdoc/syntax`
    // (eslint-plugin-tsdoc — the official parser) rejects malformed doc comments + non-standard tags: a
    // `{...}` prose token wants backticks (TSDoc reads `{` as an inline-tag opener), a bare `@orb/...`
    // package name wants `{@link}`. See docs/Documentation-Law.md §Enforcement.
    files: TSDOC_SURFACE,
    plugins: { "@typescript-eslint": tseslint.plugin, tsdoc },
    rules: {
      "@typescript-eslint/no-deprecated": "error",
      "tsdoc/syntax": "error",
    },
  },
  {
    // ASYNC-SAFETY (type-aware — rides the projectService programs the two parser blocks above build for
    // SHIPPED_SRC + TSDOC_SURFACE). These are the genuine eslint-only category: Biome is syntactic and
    // structurally cannot see a dropped/misused Promise. Uniform across the WHOLE type-aware surface
    // (server/kit/db/contracts AND ui/client) — an unawaited server db-write/bus-emit is the highest-value
    // catch, not just a frontend concern. Measured 2026-07-04 on the current tree: no-floating-promises 0,
    // no-misused-promises 0, require-await 0, await-thenable 0 (zero false-positive cost). NOT reached by
    // the CT_SURFACE blocks (syntactic parser, no program) — .ct.tsx/_ct-stories parse without type info,
    // so these skip test files, which is correct. (`await-thenable` was adopted once the db-layer seam was
    // fixed: the 3 standalone-run sites returning `BatchStmt` — which erases the drizzle builder's
    // thenability — now return `AwaitableBatchStmt<T>` (`@orb/db/kit`: `BatchStmt & PromiseLike<T>`), so the
    // bare `await` is type-honest; `BatchStmt` stays the erased multi-table batch-INPUT type.)
    files: [...SHIPPED_SRC, ...TSDOC_SURFACE],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      // A dropped Promise silently swallows the error/race — the standout catch Biome can't structurally see.
      "@typescript-eslint/no-floating-promises": "error",
      // A Promise where a void/boolean is expected. `checksVoidReturn.attributes: false` is load-bearing:
      // without it this nags idiomatic `onClick={async …}` (TanStack `mutateAsync`) JSX handlers — forward-
      // necessary once chat wires those, kept even though the current tree has zero such sites.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // An `async` fn with no `await` is a mis-signaled sync fn (a caller may skip awaiting it). 0 FP today.
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
    },
  },
  {
    // react-hooks: rules-of-hooks + React Compiler diagnostics. The full recommended set IS what we
    // want — every rule is a correctness check, not a style pick. `recommended-latest` is v7's
    // flat-config bundle. Gated on @orb/ui NOW: a rules-of-hooks/Compiler flag here is a real fix.
    // TRIPWIRE — why we SPREAD here despite our "list every rule by name" doctrine: `recommended-latest`
    // includes `void-use-memo` (a RecommendedLatest-ONLY rule) that the plugin's OWN README manual-config
    // example omits (that example is the plain `recommended` set). Hand-listing to satisfy the doctrine
    // would silently drop it — if you ever de-bundle this, enumerate from the SHIPPED SOURCE, not the
    // README. (Each rule also accepts the babel compiler options as `options[0]`; we pass none — the
    // build compiler runs all-defaults too, so mirror them here ONLY if the babel preset ever gets a
    // non-default option, else lint drifts from the build.)
    files: REACT_SURFACE,
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      // The recommended set ships three rules at "warn". Two are real defects → hard-gate them:
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/unsupported-syntax": "error",
      // …the third, `incompatible-library`, is INFORMATIONAL, not a defect: it fires when the Compiler
      // CORRECTLY skips compiling a component that wraps a third-party API it can't memoize — i.e. our
      // sealed satellites (virtual-list wraps TanStack Virtual's `useVirtualizer`, which returns
      // non-memoizable functions by design). Un-sealing to satisfy it is impossible + wrong. Stays at
      // "warn" HERE so a NEW seal still surfaces — and with `--max-warnings=0` (the lint:eslint script) a
      // new one is a HARD gate that must be explicitly acked (off-by-path) in the block below, exactly like
      // the three known seals. This keeps the tree warning-free while forcing every seal to be a conscious
      // architectural ack rather than silent noise.
      "react-hooks/incompatible-library": "warn",
    },
  },
  {
    // The KNOWN Compiler-incompatible seals — acked OFF by exact path (see the reasoning above). Each is a
    // sealed satellite that wraps a third-party hook the Compiler can't memoize; the skip is the intended
    // architecture, so the notice is pure noise here. A NEW incompatible-library seal is deliberately NOT
    // covered by this list — it stays "warn" → hard-fails under `--max-warnings=0` until added here with intent.
    files: [
      "packages/ui/src/primitives/virtual-list/virtual-list.tsx",
      "packages/ui/src/primitives/message-list/message-list.tsx",
      "packages/ui/src/primitives/media-grid/media-grid.tsx",
    ],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/incompatible-library": "off" },
  },
  {
    // jsx-a11y: enforcing accessibility constraints that Biome does not natively cover yet
    // (most notably `control-has-associated-label`). We use the strict config as a baseline.
    // The AGENT-NAVIGABILITY.md document specifically calls this out as a hard gate for UI.
    // Scoped to SHIPPED_SRC so we don't force boilerplate aria-labels into isolated component tests.
    files: SHIPPED_SRC,
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      "jsx-a11y": {
        components: {
          Button: "button",
          IconButton: "button",
          Toggle: "button",
          Switch: "button",
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
      ...jsxA11y.flatConfigs.strict.rules,
      // control-has-associated-label is actually turned off in strict by default due to noise,
      // but it is the primary rule we need for agent-navigability (accessible names on all interactive elements).
      "jsx-a11y/control-has-associated-label": [
        "error",
        {
          ignoreElements: [
            "audio",
            "canvas",
            "embed",
            "input",
            "textarea",
            "tr",
            "video",
            // Custom form controls that are handled by label-has-associated-control instead
            "Checkbox",
            "Switch",
            "Input",
            "Textarea",
            "Select",
            "CommandInput",
            "Slider",
          ],
        },
      ],
      // Tell jsx-a11y that nesting our custom Checkbox inside a label is sufficient (just like native inputs).
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: ["Checkbox", "Switch", "Toggle", "Input"],
          assert: "either",
        },
      ],
    },
  },
  {
    // @tanstack/query — queryKey + queryFn discipline (LIVE since the client-foundation wave landed
    // Query code). no-rest-destructuring stays dropped (ergonomic). The two property-order rules were
    // originally dropped as "ordering → Biome", but Biome has NO TanStack-aware ordering rule and both
    // are TYPE-INFERENCE correctness per their own meta (a mis-ordered onMutate loses the context
    // type — UI-Lib-TanStack-Query.md §E-3) — turned ON at the wave (2026-07-03).
    files: [CLIENT_SRC],
    plugins: { "@tanstack/query": pluginQuery },
    rules: {
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/no-void-query-fn": "error",
      "@tanstack/query/stable-query-client": "error",
      "@tanstack/query/prefer-query-options": "error",
      "@tanstack/query/mutation-property-order": "error",
      "@tanstack/query/infinite-query-property-order": "error",
    },
  },
  {
    // @tanstack/router — code-based route discipline (see header for why this one rule, not the other).
    files: [CLIENT_SRC],
    plugins: { "@tanstack/router": pluginRouter },
    rules: { "@tanstack/router/create-route-property-order": "error" },
  },
  {
    // Tailwind correctness gate — validates class strings against the classes the v4 engine ACTUALLY
    // registers for our @theme (entryPoint). Catches unknown utilities (wrong token namespace), v3 var
    // syntax the browser silently drops (`w-[--v]` → must be `w-(--v)`), and dropped v3 utilities.
    // Stylistic rules from this plugin are deliberately OFF (Biome owns class style/order).
    files: [UI_SRC],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: {
      "better-tailwindcss": { entryPoint: "packages/ui/src/styles/globals.css" },
    },
    rules: {
      // `orb-*` are the kit's own bespoke component classes (keyframe animations Tailwind utilities
      // can't express — e.g. `orb-skeleton-shimmer`, D62 UIP-309), defined in globals.css and composed
      // by name; they are legitimately not Tailwind utilities, so the unknown-class check ignores them.
      "better-tailwindcss/no-unknown-classes": ["error", { ignore: ["^orb-"] }],
      "better-tailwindcss/enforce-consistent-variable-syntax": ["error", { syntax: "shorthand" }],
      "better-tailwindcss/no-deprecated-classes": "error",
    },
  },
  {
    // Zustand escape-hatch guard. Outside client state/, components/routes may not call
    // `useFooStore.setState(...)`/`.getState()` on the store's static API — those bypass the action
    // seam. The canonical `useFooStore((s) => s.foo)` selector usage is unaffected. Dormant until
    // `packages/client/src/state/` exists.
    files: [CLIENT_SRC],
    ignores: ["packages/client/src/state/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", NO_STORE_STATICS],
    },
  },
  {
    // COMPOSE-ONLY KEYSTONE — the "client code can't invent UI" gate, CLIENT_SRC-wide (routes/data/
    // forms/state/lib/features — UI-Arch §2.1). Client code ASSEMBLES @orb/ui primitives + the layout
    // kit; it never PAINTS: no className/style on a raw intrinsic element. Re-lists NO_STORE_STATICS
    // because flat-config REPLACES no-restricted-syntax per file (no merge) and this block wins over
    // the CLIENT_SRC zustand block above for every file it matches. Two ignores: app-shell (SHELL-tier
    // layout owner + the one legal @media site, §4.1) paints the frame and keeps only the zustand guard
    // via the CLIENT_SRC block above; state/** is exempt from THIS block's NO_STORE_STATICS re-list for
    // the same reason the zustand block above exempts it — a store's own file legitimately calls its
    // internal setState/getState, and without this ignore the keystone's re-listed NO_STORE_STATICS
    // would false-fire on that legitimate internal use (W1-0a, measured 3 FPs without the ignore).
    files: [CLIENT_SRC],
    ignores: [
      "packages/client/src/features/app-shell/**",
      "packages/client/src/state/**",
      // The brand mark — a hand-authored inline-SVG geometry painter (the sanctioned no-inline-svg
      // exception), RE-HOMED here from app-shell chrome by D62/§13.9 as the cross-cutting display
      // seam. Like app-shell it legitimately paints (className on the raw <svg>); it is the ONE lib/
      // painter, exempted by exact path — never a lib/** wildcard.
      "packages/client/src/lib/weave-glyph.tsx",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": ["error", NO_STORE_STATICS, NO_CLASSNAME_ON_INTRINSIC, NO_STYLE_ON_INTRINSIC],
    },
  },
);
