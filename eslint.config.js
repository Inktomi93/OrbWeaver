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
//   7. eslint-plugin-react-web-api — eslint-react's LEAK family: a Web-API subscription created in a
//      component that outlives it (listener/interval/timeout/fetch/IntersectionObserver/ResizeObserver
//      with no cleanup). Nothing else in the stack can see this: Biome is syntactic, react-hooks checks
//      deps not disposal, tsc has no notion of a lifetime. All six rules ON (shipped source only).
//
//   8. eslint-plugin-react-you-might-not-need-an-effect — SEMANTIC unnecessary-effect analysis (state
//      derived in an effect, effect chains, prop-change state adjustment, …). 6 of its 9 rules ON; the
//      other 3 are deliberately OFF with a measured receipt — see the block for the triage.
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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NODE_TOOL_SURFACE_GLOBS } from "@orb/tooling/_shared/project-worlds";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactWebApi from "eslint-plugin-react-web-api";
import reactNoEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import tsdoc from "eslint-plugin-tsdoc";
import tseslint from "typescript-eslint";

// This config lives at the repo root; projectService/tsconfig discovery is rooted here.
const ROOT = fileURLToPath(new URL(".", import.meta.url));

// The linted TS surface. @orb/ui is gated NOW (its components must be React-Compiler-clean, D54);
// @orb/client is skeletal but wired so the gate is live the moment code lands.
const UI_SRC = "packages/ui/src/**/*.{ts,tsx}";
const CLIENT_SRC = "packages/client/src/**/*.{ts,tsx}";

// ── Author classes: the DERIVED half of `no-unknown-classes` (#249) ─────────────────────────────
// A hand-written CSS class (`orb-skeleton-shimmer`, `shell-rail`) is real paint but not a Tailwind
// utility, so the unknown-class check would red it. It is fed the class names BY NAME, parsed out of
// the sanctioned stylesheets themselves — NEVER a `^shell-`/`^orb-` prefix wildcard. A wildcard is a
// rubber stamp that silently passes `shell-raill`, which is EXACTLY the compiles-to-nothing defect the
// rule exists to catch (`inset-block-0` shipped a band 490px short; `z-base` reached the train gate).
// Two-sided by construction: a sheet that moves makes this file throw at lint startup rather than
// silently widening the ignore set, and a deleted class stops being ignored the run after it dies.
const UI_STYLESHEET = "packages/ui/src/styles/globals.css";
// The client's entry `@import`s @orb/ui's, so its authored surface is the union of all three sheets;
// `shell.css` is the ONE sanctioned feature-tier stylesheet (client-architecture-lockdown §4, gated by
// `feature-css-files`).
const CLIENT_STYLESHEETS = [UI_STYLESHEET, "packages/client/src/styles/globals.css", "packages/client/src/features/app-shell/surfaces/shell.css"];

/** Class names authored as CSS SELECTORS in `sheets`, as anchored `ignore` regex strings. Comments are
 *  blanked and only the selector half of each rule is read — a `.foo` named in prose or inside a
 *  declaration value must not widen the ignore set (the permissive direction is the dangerous one). */
function authorClassIgnores(sheets) {
  const names = new Set();
  for (const rel of sheets) {
    const css = readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const chunk of css.split("{")) {
      const selector = chunk.slice(chunk.lastIndexOf("}") + 1);
      for (const m of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        names.add(m[1]);
      }
    }
  }
  return [...names].map((name) => `^${name}$`);
}
// Browser component tests (the ones @orb/ui's / @orb/client's tsconfigs own — real components +
// hooks). The node `tests/ui/**/*.test.ts` (tokens, etc.) are NOT matched here — no hooks/components.
const COMPONENT_TEST_SUFFIXES = TEST_KIND_DEFINITIONS.filter(
  ({ family, suffix }) =>
    family === "component" && !TEST_KIND_DEFINITIONS.some((other) => other.family === family && other.suffix !== suffix && suffix.endsWith(other.suffix)),
).map(({ suffix }) => suffix);
const componentTestGlobs = (root) => COMPONENT_TEST_SUFFIXES.map((suffix) => `${root}/**/*${suffix}`);
const UI_CT = componentTestGlobs("tests/ui");
const UI_FIXTURES = "tests/ui/**/*.fixtures.tsx";
// #1590: `tests/ui/**` grew underscore-prefixed story modules (the same "not a real test file" naming
// convention as `_ct-stories.tsx` elsewhere) and a `.stories.tsx` suffix of its own — neither had a home
// here, so `pnpm exec eslint <file>` answered "File ignored" for both (a real defect: the CT surface's
// react-hooks/Compiler/jsx-a11y rules never reached them). Both are directory globs, not a filename list,
// same doctrine as CLIENT_STORIES below.
const UI_STORIES = "tests/ui/**/_*.tsx";
const UI_STORIES_SUFFIX = "tests/ui/**/*.stories.tsx";
const CLIENT_CT = componentTestGlobs("tests/client");
// #1590: widened from the exact `_ct-stories.tsx` filename to every underscore-prefixed `.tsx` under
// `tests/client/**` — story/fixture modules share that naming convention regardless of their suffix
// (`_cascade-fixtures.tsx`, `_slash-command-stories.tsx`, …), and a per-filename list here would rot the
// same way the exact-name-only version already had (32 files, none of them named `_ct-stories.tsx`,
// were "File ignored" before this widened). Still matches the original `_ct-stories.tsx` files too.
const CLIENT_STORIES = "tests/client/**/_*.tsx";
// #1590: `*.fixtures.tsx` under `tests/client/**` had no home (only `tests/ui/**/*.fixtures.tsx` did) —
// 12 files (11 `components/*.fixtures.tsx` + `state/config-row-annotation.fixtures.tsx`) were uncovered.
const CLIENT_FIXTURES = "tests/client/**/*.fixtures.tsx";
// tests/tooling grew a browser tree of its own (the design-audit walker + snap's overflow op are
// in-page instruments, so their proofs MOUNT), and tests/support/browser carries the shared CT providers.
// Both are React under playwright-ct exactly like the ui/client trees — without these rows the
// react-hooks/Compiler rules stop at the tests/{ui,client} border while `.ct.tsx` files elsewhere
// render unchecked. Syntactic parse, same as the rest of CT_SURFACE (no program needed).
const TOOLING_CT = componentTestGlobs("tests/tooling");
const TOOLING_STORIES = "tests/tooling/**/_ct-stories.tsx";
const SUPPORT_CT = "tests/support/browser/**/*.tsx";
const CT_SURFACE = [
  ...UI_CT,
  UI_FIXTURES,
  UI_STORIES,
  UI_STORIES_SUFFIX,
  ...CLIENT_CT,
  CLIENT_STORIES,
  CLIENT_FIXTURES,
  ...TOOLING_CT,
  TOOLING_STORIES,
  SUPPORT_CT,
];

const REACT_SURFACE = [UI_SRC, CLIENT_SRC, ...CT_SURFACE];
const SHIPPED_SRC = [UI_SRC, CLIENT_SRC];

// ── The TOOLING surface (#459) ──────────────────────────────────────────────────────────────────────
// `@orb/tooling` + its test mirror were DOUBLY uncovered by eslint until 2026-08-22, and the two halves
// have to be fixed together or the surface stays dark: the `lint:eslint` SCRIPT argv named only
// `packages/{ui,client,server,kit,db,contracts}` + `tests/{ui,client}`, AND no config object's `files`
// pattern matched `tooling/**` — so even an explicit `eslint tooling/src/foo.ts` answered "File ignored
// because no matching configuration was supplied". Both are repaired: this block, and the script's argv.
// (The scoped verify lane passes `--no-warn-ignored`, so the ignore was silent there too.)
//
// THE MEASUREMENT that justifies the block, taken over 591 files before anything was enabled:
// no-floating-promises 36 · switch-exhaustiveness-check 7 · no-deprecated 1 · restrict-template-expressions 1
// · no-misused-promises / require-await / await-thenable 0. The 36 were ONE class and a LYING-TEST class:
// `expect(res).toExitWith(N)` with no `await` — `toExitWith` is an ASYNC matcher (tests/support/matchers.ts),
// so a wrong exit code surfaced as an unhandled rejection attributed to a DIFFERENT test while the real
// test reported PASS (planted-control receipt: 2 passed, 1 unhandled error, wrong test named). Biome is
// syntactic and structurally cannot see any of these. All live violations were fixed in the landing lane;
// nothing here is suppressed or allowlisted.
//
// THE THREE DEFERRED RULES ARE BEING LANDED BY THE #472 SWEEP, one family per commit. They were REAL
// findings, never false positives — the deferral was about the fix wave's shape (behaviour-touching
// nullable-conditional rewrites; 111 comment edits), not about whether the rules belong here.
//   tsdoc/syntax — LANDED. Re-measured 111 on the current tree (the survey said 110); all 111 fixed and
//     the rule is ON below for tooling/src + tests/tooling. Every finding was in tooling/src; tests/tooling
//     measured 0, and the rule is on there anyway so the zero cannot rot. Four classes, no suppressions:
//     a bare `@orb/…` package name in prose (→ a code span, the packages/**  house spelling), an unescaped
//     `<`/`>`/`{`/`}` that TSDoc reads as an HTML tag or an inline-tag opener (→ a code span, or `\>` where
//     the text is a genuine comparison), a code span WRAPPED across two comment lines (TSDoc code spans are
//     single-line — reflowed, never truncated), and a markdown ``…`` double-backtick span (TSDoc has no
//     such form and no in-span escape — rewritten as backslash-escaped prose).
//   no-unnecessary-condition — LANDED, all 41 fixed, ON below for tooling/src + tests/tooling. Two
//     classes, and telling them apart was the whole job. (a) A GENUINELY dead check: ts-morph's
//     `getParent()`/`getExpression()`/`getDeclarations()` are non-optional on the node types these
//     call sites hold, a `matchAll` match always carries `.index`, and `exec` returns `null` and never
//     `undefined` — those guards are deleted. (b) A check the rule called dead because THE TYPE LIED,
//     which is a type-modelling defect and NOT a delete: node types `spawnSync`'s stdout/stderr as
//     `string` though a spawn that never starts returns null (the two int-test helpers now annotate
//     `SpawnSyncReturns<string | null>`), `process.stdout.columns` is typed non-optional but only
//     exists on a tty, and `MeterWindow.__perfMeter` was non-optional even though #409 exists BECAUSE
//     the in-page meter can be absent. Those seams were re-typed and every guard kept.
//   strict-boolean-expressions — LANDED. 61 at the survey, 59 after the no-unnecessary-condition pass
//     removed two of them; all 59 fixed, ON below for tooling/src + tests/tooling. This is the
//     behaviour-adjacent family, so every rewrite names the ARM the site wants: an optional `boolean`
//     flag wants "explicitly true" (`=== true`), a `x?.pred()` guard wants "present AND true"
//     (`x !== undefined && x.pred()` — spelled out so the ts-morph type predicate still narrows), and
//     an optional STRING used as a presence switch wants "present AND non-empty" (`""` stays falsey —
//     a mechanical `!== undefined` there would have been a defect: an empty `--mask ""` would start
//     pushing an empty selector, and a blank plan note would render an empty pair of parens). The 17
//     copies of that last shape in `codemod/lib` collapsed into one `noteSuffix()` in `lib/plans.ts`.
//   THE WAVE IS COMPLETE — all three rules are on and there is no deferred tooling population left.
//
// Scope note: the react/tailwind/query/router blocks above stay off tooling by construction (node-context
// tools render nothing). What tooling gets is the ASYNC-SAFETY + dispatch + deprecation set — exactly the
// eslint-only category, and the highest-value one for code that spawns processes and walks trees.
//
// ── WIDENED TO THE WHOLE TEST TREE (#473, 2026-08-22) ───────────────────────────────────────────────
// #459 fixed `tooling/**`; the same hole was still open over EVERY other node test dir. `tests/server`
// (1,025 files), `tests/kit`, `tests/db`, `tests/contracts`, `tests/support` and `tests/e2e` were all
// outside both halves of the surface, so the class #459 caught in tooling — an async assertion that
// could not fail its own test — had nowhere to be caught here either.
//
// SURVEY over the 1,276 newly-covered files, before anything was enabled:
//   require-await 182 (server 180 · contracts 2) · no-deprecated 11 (server 5 · contracts 4 · kit 2)
//   await-thenable 1 (server) · unused-eslint-disable 3 (server)
//   no-floating-promises / no-misused-promises / switch-exhaustiveness-check /
//   restrict-template-expressions: 0
// Everything except require-await was FIXED in the landing lane. no-floating-promises measuring 0 is
// the independent confirmation of #473's census: the 36 un-awaited matchers really were the whole
// population, and there is no second reservoir outside tooling.
//
// `require-await` IS DELIBERATELY OFF FOR `tests/**`, WITH A RECEIPT — it is a rule/surface mismatch,
// NOT a deferred sweep, so do not open a cleanup row for it. A 26-site spread sample of the 182 (every
// 7th site across 37 files) was 26/26 the SAME legitimate shape: an async TEST DOUBLE conforming to an
// interface whose method returns a Promise —
//   `vi.fn<ChatService["listChats"]>(async () => page)` · `generateSegments: async () => ({ written: 0 })`
//   · `async *exportAll(): AsyncIterable<PortableFile>`
// The `async` is REQUIRED by the contract being stubbed; there is nothing to await because a stub has no
// work. "Fixing" all 182 means `Promise.resolve(...)` boilerplate that is semantically identical and
// strictly less readable. The rule stays ON for `tooling/src/**` (real tool code, where an async
// function with no await IS a mis-signaled sync function — measured 0 there) and ON for `packages/**`
// via the async-safety block above. Same posture, same evidence standard, as the
// react-you-might-not-need-an-effect triage below.
//
// TWO PARSER PROGRAMS, because the test tree has two owners. Most of it resolves upward to the ROOT
// `tsconfig.json` (which `include`s `tests`), so `projectService` finds it. But `tests/e2e/**` is
// EXCLUDED from the root program and `tests/support/browser/**` is claimed only by
// `tsconfig.tests-dom.json` — under projectService those answer "was not found by
// the project service" (measured: 3 parse errors). The escapee block hands the parser BOTH configs as
// an array so each file is owned by whichever program includes it, WITHOUT duplicating tests-dom's
// filename list here (that list moves; a copy of it would rot silently).
const TOOLING_SRC = "tooling/src/**/*.ts";
const TOOLING_TESTS = "tests/tooling/**/*.ts";
const NODE_TOOL_SURFACE = [...NODE_TOOL_SURFACE_GLOBS];
// Node test dirs — root-owned since the type-worlds split (#1351: no per-file escapee lives in
// tsconfig.tests-dom.json any more). They keep riding the escapee parser below rather than
// projectService, because the parser is handed BOTH root programs and picks whichever owns a file.
const NODE_TEST_DIRS = ["tests/server/**/*.ts", "tests/kit/**/*.ts", "tests/db/**/*.ts", "tests/contracts/**/*.ts", "tests/showcase-plugins/**/*.ts"];
// The trees the root program does NOT own — see the parser note above; every one of them is rooted by
// `tsconfig.tests-dom.json`, which is why they share the escapee parser.
//
// #1574: `tests/client/**/*.ts` and `tests/ui/**/*.ts` were added 2026-09-04. They matched NO config
// object at all, so `pnpm exec eslint <one of them> --max-warnings 0` answered "File ignored because no
// matching configuration was supplied" — which the scoped verify lane passes `--no-warn-ignored` for, so
// the hole was silent there and RED elsewhere. Census at the time: 2642 tracked `tests/**` ts+tsx files,
// 274 uncovered — 202 `tests/client/**/*.ts`, 41 `tests/ui/**/*.ts` (both closed here), plus 32 `.tsx`
// story/fixture modules the CT surface's narrower globs missed — a REACT-surface question, deliberately
// left for its own row rather than folded in here. CLOSED by #1590: `UI_STORIES`/`UI_STORIES_SUFFIX`/
// `CLIENT_FIXTURES` above, and `CLIENT_STORIES` widened from the exact `_ct-stories.tsx` filename to
// every underscore-prefixed `.tsx` under `tests/client/**`.
// These two trees are exactly what tsconfig.tests-dom.json claims wholesale (#1243), so the escapee
// parser already has their program; no tsconfig moves with this.
const TESTS_DOM_OWNED = ["tests/support/**/*.ts", "tests/e2e/**/*.ts", "tests/client/**/*.ts", "tests/ui/**/*.ts"];
// Every TS program that ROOTS a file under tests/**: the node world and the browser-tests world (type-worlds
// program, #1351 — the package programs check nothing under tests/ any more). The escapee parser is handed
// both and uses whichever one owns the file, so no block here ever restates a tsconfig's include list.
const TEST_TREE_PROJECTS = ["tsconfig.json", "tsconfig.tests-dom.json"];
const PROJECT_SERVICE_SURFACE = [TOOLING_SRC, TOOLING_TESTS, ...NODE_TEST_DIRS];
// Every file the async-safety + dispatch + deprecation rules apply to.
const SAFETY_SURFACE = [...PROJECT_SERVICE_SURFACE, ...TESTS_DOM_OWNED];
const ASYNC_SAFETY_RULES = {
  // The headline rule here: 36 un-awaited async `toExitWith` matchers, all of them assertions that
  // could not fail their own test. Nothing else in the stack can see a dropped Promise.
  "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  "@typescript-eslint/await-thenable": "error",
  // The §5.5 string-union dispatch law: a default catch-all lets a new member inherit an arm silently.
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  // Caught a real object interpolation that would have rendered `[object Object]` in gate output.
  "@typescript-eslint/restrict-template-expressions": "error",
  "@typescript-eslint/no-deprecated": "error",
};

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
    // package name wants `{@link}`. See docs/architecture/core/Documentation-Law.md §Enforcement.
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
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
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
    // Type-aware parser for the root-program-owned half of the tooling + test surface (#459/#473).
    // `tooling/src` resolves upward to `tooling/tsconfig.json` (which `include`s `src`); the node test
    // dirs resolve to the ROOT `tsconfig.json` (which `include`s `tests`). All real programs, so
    // `projectService` finds an owner for every file here.
    files: PROJECT_SERVICE_SURFACE,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: ROOT, sourceType: "module" },
    },
  },
  {
    // THE ESCAPEE PARSER (#473, widened #1231). `projectService` cannot serve the test tree at all: it
    // searches UPWARD from a file, lands on the root tsconfig, and a file in that config's `exclude` then
    // answers "was not found by the project service" — silently, as a PARSE error, so the file is linted by
    // NOTHING. The root excludes 22 files under tests/** plus three whole trees, spread across
    // tests/support, tests/tooling AND tests/server, so EVERY test tree carrying an escapee is parsed here
    // instead, with all three owning programs handed over at once (TEST_TREE_PROJECTS). Measured on the
    // full 22-file escapee census: 9 parse errors before this block covered them, 0 after.
    // Note the whole DIRECTORY rides the array, never a filename list: tests-dom's include set moves, and a
    // copy of it here would rot silently into exactly the unlinted-file gap this block exists to close.
    files: [...TESTS_DOM_OWNED, TOOLING_TESTS, ...NODE_TEST_DIRS],
    languageOptions: {
      parser: tseslint.parser,
      // `projectService: false` is LOAD-BEARING, not tidiness: flat-config `languageOptions` MERGE, so the
      // earlier PROJECT_SERVICE_SURFACE block's `projectService: true` survives into this one for any file
      // both match (every `tests/tooling/**/*.ts`), and typescript-eslint then refuses the pair outright
      // ("Enabling \"project\" does nothing when \"projectService\" is enabled") — a PARSE error, so the
      // whole file goes unlinted exactly like the gap this block closes.
      parserOptions: { project: TEST_TREE_PROJECTS, projectService: false, tsconfigRootDir: ROOT, sourceType: "module" },
    },
  },
  {
    // Root and package-root TypeScript files are Node-executed build/config tools. Their structural
    // population comes from the same world classifier used by compiler routing; declarations are ambient
    // contracts, so this block excludes them rather than treating them as executable tools.
    files: NODE_TOOL_SURFACE,
    ignores: ["**/*.d.{ts,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: ["tsconfig.json"], projectService: false, tsconfigRootDir: ROOT, sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: ASYNC_SAFETY_RULES,
  },
  {
    // ASYNC-SAFETY + dispatch + deprecation over the tooling + test surface — see the SAFETY_SURFACE
    // header for the mechanism of the old gap, both measurements (591 files at #459, 1,276 more at
    // #473), the three rules tracked at #472, and why require-await is off for `tests/**`.
    files: SAFETY_SURFACE,
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: ASYNC_SAFETY_RULES,
  },
  {
    // #472 family 2, TOOLING ONLY — not the whole SAFETY_SURFACE. A condition the type system says can
    // never flip is either a dead guard or a LIE in the type, and on a tool tree that walks ASTs and
    // spawns processes it is regularly the second (the SAFETY_SURFACE header names the three seams it
    // caught that way). Measured 41 here, all fixed, none suppressed. The #473 dirs (tests/server &
    // co, 1,276 files) were NEVER surveyed for this rule, so they stay outside until someone measures
    // them — turning it on there sight-unseen is how a rule lands with a suppression wave attached.
    files: [TOOLING_SRC, TOOLING_TESTS],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "error",
      // #472 family 3. JS truthiness collapses "absent" and "empty"/"zero" into one arm, which on this
      // tree is regularly NOT what the site means — the rewrites had to state the arm each time (see
      // the SAFETY_SURFACE header). Measured 59 at the landing, all fixed, none suppressed. Same
      // tooling-only scope and the same reason: the #473 dirs were never surveyed for it.
      "@typescript-eslint/strict-boolean-expressions": "error",
    },
  },
  {
    // require-await is TOOL-SOURCE ONLY, never `tests/**` — the 26/26 test-double triage in the
    // SAFETY_SURFACE header. Here it keeps its real meaning: a tool function declared `async` with
    // nothing to await is a mis-signaled sync function, and a caller may skip awaiting it.
    files: [TOOLING_SRC],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: { "@typescript-eslint/require-await": "error" },
  },
  {
    // The Documentation-Law doc-comment gate over the tooling surface (#472, the first family of the
    // deferred wave — see the SAFETY_SURFACE header for the four fix classes). Same rule the typed-API
    // packages carry above: tooling's file headers ARE its per-domain law (the per-domain prose was
    // gutted), so a malformed doc comment there is exactly as load-bearing as one in `packages/server`.
    // Purely syntactic (the TSDoc parser), so it needs no program — but these files have one anyway.
    files: [TOOLING_SRC, TOOLING_TESTS],
    plugins: { tsdoc },
    rules: { "tsdoc/syntax": "error" },
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
    // react-web-api — the LEAK family. A Web-API subscription created inside a component that is never
    // torn down (no removeEventListener / clearInterval / clearTimeout / observer.disconnect / fetch
    // abort) outlives its component: a stale handler firing against an unmounted tree, or N listeners
    // after N remounts. This is the genuine eslint-only category alongside async-safety — Biome is
    // syntactic, react-hooks checks DEPS not DISPOSAL, and tsc has no notion of a lifetime. All six ON.
    // Measured 2026-08-03 on the live tree: ZERO hits across ui + client — these are pure guard-rails
    // (forward protection against a future component that subscribes and forgets), not a cleanup wave.
    // SHIPPED_SRC only, deliberately NOT the CT surface: harness glue legitimately opens listeners it
    // never removes (the page tears down instead), which would be false-positive noise.
    files: SHIPPED_SRC,
    plugins: { "react-web-api": reactWebApi },
    rules: {
      "react-web-api/no-leaked-event-listener": "error",
      "react-web-api/no-leaked-fetch": "error",
      "react-web-api/no-leaked-intersection-observer": "error",
      "react-web-api/no-leaked-interval": "error",
      "react-web-api/no-leaked-resize-observer": "error",
      "react-web-api/no-leaked-timeout": "error",
    },
  },
  {
    // react-you-might-not-need-an-effect — SEMANTIC unnecessary-effect analysis. An effect that only
    // computes state from props/state is a render-phase expression wearing an effect costume: it costs
    // an extra commit, can tear (one render shows the stale value), and hides the real data flow. Six
    // rules ON — each flags a shape with a mechanical render-phase rewrite (derive in render / lift the
    // computation / useSyncExternalStore).
    //
    // THREE ARE DELIBERATELY OFF, with a receipt. A full 25-site triage of this tree (2026-08-03) over
    // `no-event-handler`, `no-pass-live-state-to-parent` and `no-pass-data-to-parent` found 25/25 sites
    // LEGITIMATE and 0 real antipatterns: imperative DOM work (focus/scroll/measure) that cannot happen
    // in render, registration-with-host mount effects, TanStack Form's reset-after-submit constraint
    // (the reset must follow the submit commit), and external-system sync. These three rules cannot
    // distinguish "notify the parent as a side effect of state" from "run the imperative sink React has
    // no render-phase seam for", so enabling them buys nothing but suppression rot: ~25 permanent
    // `eslint-disable` comments smeared across documented load-bearing patterns, each of which then rots
    // silently. Re-triage before turning any of them on; a receipt, not a preference.
    //
    // SHIPPED_SRC only — same reason as the leak block: CT harness glue lands state in effects by design.
    files: SHIPPED_SRC,
    plugins: { "react-you-might-not-need-an-effect": reactNoEffect },
    rules: {
      "react-you-might-not-need-an-effect/no-derived-state": "error",
      "react-you-might-not-need-an-effect/no-chain-state-updates": "error",
      "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change": "error",
      "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change": "error",
      "react-you-might-not-need-an-effect/no-initialize-state": "error",
      "react-you-might-not-need-an-effect/no-external-store-subscription": "error",
    },
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
      // #579: `labelAttributes` teaches the rule the house `label` prop (`@orb/ui/select`'s own `label`,
      // e.g. `<Select label="…">`) — a literal JSX attribute the rule can check directly, so a Select that
      // names itself no longer needs a suppression. This does NOT reach every house association: `SelectField`
      // / `SwitchField` (`packages/client/src/forms/editor/bound-fields/`) associate through Base UI's
      // `FieldRootContext` — `<Select>`/`<Switch>` consume `BaseField.Control`, which injects
      // `aria-labelledby` at RENDER time from React context, never as a literal prop in this file's JSX
      // (source-verified: `packages/ui/src/primitives/select/select.tsx` — the trigger's `aria-labelledby`
      // comes from Field.Control's context merge, not a prop passed here). No `labelAttributes`/
      // `controlComponents`/`depth` combination sees a context injection — AST inspection only ever sees
      // this file's own JSX. Their suppressions stay (see each site's comment).
      "jsx-a11y/control-has-associated-label": [
        "error",
        {
          labelAttributes: ["label"],
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
      // Absolute — `entryPoint` is resolved against ESLint's `ctx.cwd`, which is repo root for
      // `pnpm check`/bare `eslint` but the VITE ROOT (`packages/client`) when vite-plugin-checker
      // spawns eslint out-of-process for the dev overlay (main.js `configureServer({ root })` →
      // `cwd: root`). A repo-root-relative string only resolves under the first cwd — under the
      // second it silently mis-resolves and the plugin reports "No tailwind css entry point found"
      // on every lint (#275). Absolute is cwd-invariant.
      "better-tailwindcss": { entryPoint: join(ROOT, UI_STYLESHEET) },
    },
    rules: {
      // `orb-*` are the kit's own bespoke component classes (keyframe animations Tailwind utilities
      // can't express — e.g. `orb-skeleton-shimmer`, D62 UIP-309), defined in globals.css and composed
      // by name; they are legitimately not Tailwind utilities, so the unknown-class check ignores them —
      // BY NAME, derived from that same stylesheet (see `authorClassIgnores`).
      "better-tailwindcss/no-unknown-classes": ["error", { ignore: authorClassIgnores([UI_STYLESHEET]) }],
      "better-tailwindcss/enforce-consistent-variable-syntax": ["error", { syntax: "shorthand" }],
      "better-tailwindcss/no-deprecated-classes": "error",
    },
  },
  {
    // The SAME correctness gate over @orb/client (#249). It was ui-only until 2026-08-19, which is the
    // whole reason `inset-block-0` had to be caught by rendered geometry and `z-base` by the train gate:
    // client code carries class strings too (it composes @orb/ui primitives by passing `className`), and
    // nothing was checking them against the engine's actual utility set. Its entry point is the CLIENT
    // stylesheet — the one that `@import`s @orb/ui's — so the known set is exactly what the client bundle
    // registers. Measured at landing: 37 findings, all of them authored `shell-*`/`ctx-tab-*` classes,
    // zero real dead utilities; the derived ignore set absorbs the 37 by name and nothing else.
    files: [CLIENT_SRC],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: {
      // Absolute — see the UI_SRC block's comment above (#275): `ctx.cwd` is repo root for
      // `pnpm check` but `packages/client` when vite-plugin-checker spawns eslint for the dev
      // overlay, so a repo-root-relative string mis-resolves under the checker specifically.
      "better-tailwindcss": { entryPoint: join(ROOT, "packages/client/src/styles/globals.css") },
    },
    rules: {
      "better-tailwindcss/no-unknown-classes": ["error", { ignore: authorClassIgnores(CLIENT_STYLESHEETS) }],
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
    ignores: ["packages/client/src/state/**"],
    rules: {
      "no-restricted-syntax": ["error", NO_STORE_STATICS],
    },
  },
  {
    // COMPOSE-ONLY KEYSTONE — the "client code can't invent UI" gate, CLIENT_SRC-wide (routes/data/
    // forms/state/lib/features — UI-Arch §2.1). Client code ASSEMBLES @orb/ui primitives + the layout
    // kit; it never PAINTS: no className/style on a raw intrinsic element. Re-lists NO_STORE_STATICS
    // because flat-config REPLACES no-restricted-syntax per file (no merge) and this block wins over
    // the CLIENT_SRC zustand block above for every file it matches. The app-shell ignore (SHELL-tier
    // layout owner + the one legal @media site, §4.1) paints the frame and keeps only the zustand guard
    // via the CLIENT_SRC block above; state/** is exempt from THIS block's NO_STORE_STATICS re-list for
    // the same reason the zustand block above exempts it — a store's own file legitimately calls its
    // internal setState/getState, and without this ignore the keystone's re-listed NO_STORE_STATICS
    // would false-fire on that legitimate internal use (W1-0a, measured 3 FPs without the ignore).
    files: [CLIENT_SRC],
    ignores: [
      "packages/client/src/features/app-shell/**",
      "packages/client/src/state/**",
      // D62's shared app brand paints hand-authored SVG geometry. Keep the grant on this exact component.
      "packages/client/src/components/weave-glyph.tsx",
    ],
    rules: {
      "no-restricted-syntax": ["error", NO_STORE_STATICS, NO_CLASSNAME_ON_INTRINSIC, NO_STYLE_ON_INTRINSIC],
    },
  },
);
