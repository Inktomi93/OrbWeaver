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
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// This config lives at the repo root; projectService/tsconfig discovery is rooted here.
const ROOT = fileURLToPath(new URL(".", import.meta.url));

// The linted TS surface. @orb/ui is gated NOW (its components must be React-Compiler-clean, D54);
// @orb/client is skeletal but wired so the gate is live the moment code lands.
const UI_SRC = "packages/ui/src/**/*.{ts,tsx}";
const CLIENT_SRC = "packages/client/src/**/*.{ts,tsx}";
// Browser component tests (the ones @orb/ui's tsconfig owns — real components + hooks). The node
// `tests/ui/**/*.test.ts` (tokens, etc.) are NOT matched here — they hold no hooks/components.
const UI_CT = "tests/ui/**/*.ct.tsx";
const UI_FIXTURES = "tests/ui/**/*.fixtures.tsx";

const REACT_SURFACE = [UI_SRC, CLIENT_SRC, UI_CT, UI_FIXTURES];
const SHIPPED_SRC = [UI_SRC, CLIENT_SRC];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "reports/**",
      "**/*.gen.ts",
      "**/routeTree.gen.ts",
      "packages/ui/src/tokens/index.ts",
      "packages/ui/src/styles/theme.css",
    ],
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
    // Syntactic parser for the browser component tests. These live under tests/ (owned by @orb/ui's
    // tsconfig via a reach-back include), so projectService's upward search lands on the root tsconfig
    // — which EXCLUDES them. react-hooks rules are syntactic (no type info needed), so parse without
    // projectService. (no-deprecated stays off here — it's shipped-source-only above.)
    files: [UI_CT, UI_FIXTURES],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
  },
  {
    // @deprecated enforcement (type-aware, shipped source only): any USE of a @deprecated symbol
    // (ours OR a third-party API) errors — the doctrine's tag becomes a gate, not an editor strikethrough.
    files: SHIPPED_SRC,
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: { "@typescript-eslint/no-deprecated": "error" },
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
      // non-memoizable functions by design). Un-sealing to satisfy it is impossible + wrong. Keep it at
      // the plugin's recommended "warn" (surfaced for review, non-blocking) — the seal is the intended
      // architecture. This is a reasoned deviation from a blunt `--max-warnings=0`: we hard-block real
      // bugs (everything else is "error") while letting expected seal-skip notices through. Flip to
      // "error" only if a gate on new incompatible libraries is wanted (then each seal needs an ack).
      "react-hooks/incompatible-library": "warn",
    },
  },
  {
    // @tanstack/query — queryKey + queryFn discipline. Dormant until tRPC/Query lands on the client;
    // no-ops on the empty client today. Property-order + rest-destructure rules dropped (see header).
    files: [CLIENT_SRC],
    plugins: { "@tanstack/query": pluginQuery },
    rules: {
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/no-void-query-fn": "error",
      "@tanstack/query/stable-query-client": "error",
      "@tanstack/query/prefer-query-options": "error",
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
      "better-tailwindcss/no-unknown-classes": "error",
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
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name=/^use.*Store$/][callee.property.name=/^(setState|getState)$/]",
          message:
            "Don't reach into a zustand store's static setState/getState from outside state/. Define an action in the store file and call that.",
        },
      ],
    },
  },
);
