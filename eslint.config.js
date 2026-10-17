// Orbweaver's ESLint gate — the NARROW supplement to Biome.
//
// WHY THIS FILE IS JAVASCRIPT (work item 0036 converted every other script to TypeScript): ESLint 10 loads an
// `eslint.config.ts` under Node only through the `jiti` package, which is not a dependency here, or behind its
// `unstable_native_nodejs_ts_config` flag, which every caller would have to pass: the CLI adapter, the
// programmatic `new ESLint()` readers in tooling, vite-plugin-checker and the editor integration
// (`node_modules/eslint/lib/config/config-loader.js#loadConfigFile`). Revisit when ESLint loads TypeScript
// configs natively without a flag.
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
//        (a CORRECTNESS bundle, not a style bundle) — so we spread it, and `--max-warnings 0` turns its
//        warn-level rules (exhaustive-deps, …) into hard gates. THE FLAG DOES NOT LIVE IN A SCRIPT: it is
//        `CHILD_FLAGS` in `tooling/src/verify/ops/eslint.ts` (what `pnpm lint:eslint` runs) and the scoped
//        argv in `tooling/src/verify/lib/registry-argv.ts`; `package.json`'s `lint:eslint` carries no flag.
//
//   2. @tanstack/eslint-plugin-query — queryKey/queryFn discipline (client only; LIVE since the
//      client-foundation wave landed Query code — NOT dormant).
//      • exhaustive-deps · no-unstable-deps · no-void-query-fn · stable-query-client · prefer-query-options
//      • mutation-property-order · infinite-query-property-order — once dropped here as "ordering →
//        Biome", turned ON at the wave (2026-07-03): Biome has no TanStack-aware ordering rule and both
//        are TYPE-INFERENCE correctness per their own meta. The block's own comment states it.
//
//   3. @tanstack/eslint-plugin-router — code-based route discipline (client only; LIVE — the hand-written
//      createRoute tree lives in `packages/client/src/routes/`)
//      • create-route-property-order ONLY. Its meta: "define route options in a specific order to ensure
//        the type inference works correctly" — a TYPE-INFERENCE correctness rule (not ergonomic; Biome
//        can't do it) that applies to the hand-written createRoute/createRootRoute tree we DO use.
//
//   4. eslint-plugin-better-tailwindcss — validates class strings against the classes the v4 engine
//      ACTUALLY registers for our @theme (entryPoint: the package's own globals.css). TWO blocks: @orb/ui,
//      and @orb/client since 2026-08-19 — not ui-only.
//      • no-unknown-classes · enforce-consistent-variable-syntax(shorthand) · no-deprecated-classes
//
//   5. @typescript-eslint/no-deprecated (type-aware) — makes the doctrine's `@deprecated` tag a gate.
//
//   6. Custom no-restricted-syntax — LIVE (`packages/client/src/state/` is populated). Selector sets: the
//      client-only zustand escape-hatch guard, the COMPOSE-ONLY KEYSTONE (no className/style on a raw
//      intrinsic element), and the syntax bans (decorators, `defaultProps`, inline `queryKey` arrays) over
//      the populations of the structural gates they replaced. Flat config REPLACES this rule per file, so
//      the later blocks re-list the layers beneath them.
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
//   9. eslint-plugin-jsx-a11y — the a11y constraints Biome does not natively cover (shipped source only).
//      • The SECOND sanctioned bundle spread, on react-hooks' terms and no looser: `flatConfigs.strict`
//        is an audited CORRECTNESS set from an EXACT-pinned catalog entry (`6.10.2`, not `^`), so the
//        "a plugin upgrade can't silently add a gate" property above is held by the PIN rather than by
//        enumeration. See the TRIPWIRE at the block itself for what the pin is load-bearing for.
//
//  10. eslint-plugin-tsdoc — `tsdoc/syntax`, the official TSDoc parser: malformed doc comments and
//      non-standard tags are a gate, which is how the TSDoc rules in .claude/rules/comments.md are enforced.
//      ON for shipped source (ui/client), the typed-API packages, and tooling/src + tests/tooling.
//
// What we INTENTIONALLY DROP (Biome owns them, or ergonomic-only):
//   • query/no-rest-destructuring — destructure style → ergonomic. (The two query property-order rules
//     were once dropped here; they are ON — see item 2. Do not re-drop them.)
//   • router/route-param-names — file-based `$param`↔useParams naming; we hand-write a code-based tree
//     (UI-Arch §6.1) so there are no `$param` route files for it to match → pure no-op.
//   • better-tailwindcss stylistic rules (enforce-consistent-class-order/-line-wrapping/-variant-order,
//     enforce-canonical/shorthand/logical, no-duplicate/-unnecessary-whitespace) — Biome owns class
//     style/format/order. (no-conflicting-classes / no-duplicate-classes are correctness-adjacent and
//     available; deferred until @orb/ui's class surface stabilizes — revisit then.)
//   • typescript-eslint's recommended RULE set — tsc + Biome own type/style; we take the PARSER only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import {
  TYPE_HOME_NATIVE_CONTRACT_GLOBS,
  TYPE_HOME_NATIVE_POLICY_ID,
  TYPE_HOME_NATIVE_SOURCE_GLOBS,
  TYPE_HOME_NATIVE_UNADMITTED_GLOBS,
} from "@orb/tooling/floor/code-facts/type-home";
import { readAuthoredRepositoryInventory } from "@orb/tooling/floor/compiler/authored-repository";
import { BROWSER_PACKAGES, HELPER_WORLD_DIRS, NODE_TOOL_SURFACE_GLOBS, PACKAGE_WORLDS, TEST_WORLD_PROGRAMS } from "@orb/tooling/floor/compiler/project-worlds";
import { AMBIENT_SOURCE_PATTERNS } from "@orb/tooling/floor/testing/ambient-source-patterns";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/floor/testing/test-kinds";
import { LEGACY_TEST_ROOT } from "@orb/tooling/floor/testing/test-population";
import { Z_TOKEN_SCOPES } from "@orb/ui/z-scope";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import vitest from "@vitest/eslint-plugin";
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
import zod from "eslint-plugin-zod";
import tseslint from "typescript-eslint";
import { CHROME_ZONES } from "./packages/client/src/state/chrome-registry.ts";
import { CONFIG_GROUP_IDS } from "./packages/client/src/state/config-group-ids.ts";
import { MODAL_SLOT_IDS } from "./packages/client/src/state/modal-slot-ids.ts";
import { SECTION_IDS } from "./packages/client/src/state/section-ids.ts";
import { BASE_UI_NATIVE_INPUT_PATHS } from "./tooling/src/verify/contract/baseui.ts";
import {
  ENTRY_DRIVER_GLOBS,
  ENTRY_PROCESS_PROPERTIES,
  ENTRY_WIRING_GLOBS,
  QUERY_FREE_BOOT_GLOBS,
} from "./tooling/src/verify/contract/compose-query-capability.ts";
import { MANUAL_MEMO_CUSTOM_HOMES, MANUAL_MEMO_EXPORTS } from "./tooling/src/verify/contract/manual-memo.ts";
import { POPULATION_ROOTS, POPULATION_SETS } from "./tooling/src/verify/contract/population.ts";
import { DEFINITION_SLOTS } from "./tooling/src/verify/contract/registry-definition-home.ts";
import { JSON_RESOURCE_PATHS } from "./tooling/src/verify/contract/resource-json.ts";
import { DOMAIN_ROOT, PNG_CHUNK_SPECIFIER_PATTERN, PNG_CHUNK_SYMBOL_NAMES, SANCTIONED_DOMAINS } from "./tooling/src/verify/contract/serde-core-seal.ts";
import { surfaceManifestFrom } from "./tooling/src/verify/lib/baseui-manifest.ts";
import { CLIENT_LEXICAL_NATIVE_INPUT_PATHS } from "./tooling/src/verify/lib/client-lexical-native.ts";
import { CLIENT_MAP_NATIVE_INPUT_PATHS, CLIENT_MAP_NATIVE_RULE } from "./tooling/src/verify/lib/client-map-native.ts";
import { DEFINE_CONTEXT_REGION, DEFINE_CONTEXT_TABS, REGISTRY_CONTRACTS_RE } from "./tooling/src/verify/lib/context-definition-shape.ts";
import { isDefinitionHome } from "./tooling/src/verify/lib/registry-definition-home.ts";
import {
  SOURCE_TYPE_SUPPRESSION_EXCLUSIONS,
  SOURCE_TYPE_SUPPRESSION_GLOBS,
  SOURCE_TYPE_SUPPRESSION_RULE,
} from "./tooling/src/verify/lib/source-type-suppression-native.ts";
import { readTailwindClassTokens } from "./tooling/src/verify/lib/tailwind-class-token.ts";
import { Z_INDEX_IMPLEMENTATION_HOMES } from "./tooling/src/verify/lib/z-index-homes.ts";

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
// Native compiler owners still choose the parser world; authored membership admits each populated mirror automatically.
const AUTHORED_TEST_PATHS = readAuthoredRepositoryInventory(ROOT).paths.filter(
  (path) => path.startsWith("tests/") && (path.endsWith(".ts") || path.endsWith(".tsx")),
);
const testHomes = (pkg) => [`${LEGACY_TEST_ROOT}/${pkg}`, `tests/${pkg}`].filter((home) => AUTHORED_TEST_PATHS.some((path) => path.startsWith(`${home}/`)));
const homeGlobs = (pkg, glob) => testHomes(pkg).map((home) => `${home}/${glob}`);
const UI_CT = testHomes("ui").flatMap((home) => componentTestGlobs(home));
const UI_FIXTURES = homeGlobs("ui", "**/*.fixtures.tsx");
// #1590: `tests/ui/**` grew underscore-prefixed story modules (the same "not a real test file" naming
// convention as `_ct-stories.tsx` elsewhere) and a `.stories.tsx` suffix of its own — neither had a home
// here, so `pnpm exec eslint <file>` answered "File ignored" for both (a real defect: the CT surface's
// react-hooks/Compiler/jsx-a11y rules never reached them). Both are directory globs, not a filename list,
// same doctrine as CLIENT_STORIES below.
const UI_STORIES = homeGlobs("ui", "**/_*.tsx");
const UI_STORIES_SUFFIX = homeGlobs("ui", "**/*.stories.tsx");
const CLIENT_CT = testHomes("client").flatMap((home) => componentTestGlobs(home));
// #1590: widened from the exact `_ct-stories.tsx` filename to every underscore-prefixed `.tsx` under
// `tests/client/**` — story/fixture modules share that naming convention regardless of their suffix
// (`_cascade-fixtures.tsx`, `_slash-command-stories.tsx`, …), and a per-filename list here would rot the
// same way the exact-name-only version already had (32 files, none of them named `_ct-stories.tsx`,
// were "File ignored" before this widened). Still matches the original `_ct-stories.tsx` files too.
const CLIENT_STORIES = homeGlobs("client", "**/_*.tsx");
// #1590: `*.fixtures.tsx` under `tests/client/**` had no home (only `tests/ui/**/*.fixtures.tsx` did) —
// 12 files (11 `components/*.fixtures.tsx` + `state/config-row-annotation.fixtures.tsx`) were uncovered.
const CLIENT_FIXTURES = [...homeGlobs("client", "**/*.fixtures.tsx"), ...homeGlobs("client", "**/*-fixtures.tsx")];
// tests/tooling grew a browser tree of its own (the design-audit walker + snap's overflow op are
// in-page instruments, so their proofs MOUNT), and tests/support/browser carries the shared CT providers.
// Both are React under playwright-ct exactly like the ui/client trees — without these rows the
// react-hooks/Compiler rules stop at the tests/{ui,client} border while `.ct.tsx` files elsewhere
// render unchecked. Syntactic parse, same as the rest of CT_SURFACE (no program needed).
const TOOLING_CT = componentTestGlobs("tests/tooling");
const TOOLING_STORIES = "tests/tooling/**/_ct-stories.tsx";
const SUPPORT_CT = "tests/support/browser/**/*.tsx";
// The showcase plugins mount their frame surfaces under playwright-ct like the ui and client trees.
const SHOWCASE_CT = testHomes("showcase-plugins").flatMap((home) => componentTestGlobs(home));
const SHOWCASE_STORIES = homeGlobs("showcase-plugins", "**/_*.tsx");
const CT_SURFACE = [
  ...UI_CT,
  ...UI_FIXTURES,
  ...UI_STORIES,
  ...UI_STORIES_SUFFIX,
  ...CLIENT_CT,
  ...CLIENT_STORIES,
  ...CLIENT_FIXTURES,
  ...TOOLING_CT,
  TOOLING_STORIES,
  SUPPORT_CT,
  ...SHOWCASE_CT,
  ...SHOWCASE_STORIES,
];

const REACT_SURFACE = [UI_SRC, CLIENT_SRC, ...CT_SURFACE];
const SHIPPED_SRC = [UI_SRC, CLIENT_SRC];

// ── The TOOLING surface (#459) ──────────────────────────────────────────────────────────────────────
// `@orb/tooling` + its test mirror were DOUBLY uncovered by eslint until 2026-08-22, and the two halves
// have to be fixed together or the surface stays dark: the `lint:eslint` SCRIPT argv named only
// `packages/{ui,client,server,kit,db,contracts}` + `tests/{ui,client}`, AND no config object's `files`
// pattern matched `tooling/**` — so even an explicit `eslint tooling/src/foo.ts` answered "File ignored
// because no matching configuration was supplied". Both are repaired: this block, and the script's argv.
// (The scoped verify lane drops an ignored explicit path at discovery, so the ignore was silent there too.)
//
// THE MEASUREMENT that justifies the block, taken over 591 files before anything was enabled:
// no-floating-promises 36 · switch-exhaustiveness-check 7 · no-deprecated 1 · restrict-template-expressions 1
// · no-misused-promises / require-await / await-thenable 0. The 36 were ONE class and a LYING-TEST class:
// `expect(res).toExitWith(N)` with no `await` — `toExitWith` is an ASYNC matcher (tests/support/node/matchers.ts),
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
/** The NESTED `scripts/` trees (#2290) — what `NODE_TOOL_SURFACE_GLOBS`'s `scripts/*` deliberately does not
 *  reach. Enumerated rather than `scripts/**` so a NEW top-level scripts directory is a decision someone
 *  makes, not a surface that silently absorbs it: the block's rule set is type-aware and its parser is the
 *  root program, and a tree outside that program (the st-goldens browser world) must not be swept in. */
const SCRIPTS_NESTED_SURFACE = [
  "scripts/ci/**/*.{ts,mts,cts}",
  "scripts/codemods/**/*.{ts,mts,cts}",
  "scripts/probes/**/*.{ts,mts,cts}",
  "scripts/research/**/*.{ts,mts,cts}",
];
const NON_BROWSER_PACKAGES = Object.keys(PACKAGE_WORLDS).filter((name) => !BROWSER_PACKAGES.has(name));
const NON_BROWSER_PACKAGE_SRC = NON_BROWSER_PACKAGES.map((name) => `packages/${name}/src/**/*.ts`);
// Node test dirs — root-owned since the type-worlds split (#1351: no per-file escapee lives in
// tsconfig.tests-dom.json any more). They keep riding the escapee parser below rather than
// projectService, because the parser is handed BOTH root programs and picks whichever owns a file.
const NODE_TEST_DIRS = NON_BROWSER_PACKAGES.flatMap((name) => homeGlobs(name, "**/*.ts"));
// The trees the root program does NOT own — see the parser note above; every one of them is rooted by
// `tsconfig.tests-dom.json`, which is why they share the escapee parser.
//
// #1574: `tests/client/**/*.ts` and `tests/ui/**/*.ts` were added 2026-09-04. They matched NO config
// object at all, so `pnpm exec eslint <one of them> --max-warnings 0` answered "File ignored because no
// matching configuration was supplied" — which the scoped verify lane drops silently at discovery, so
// the hole was silent there and RED elsewhere. Census at the time: 2642 tracked `tests/**` ts+tsx files,
// 274 uncovered — 202 `tests/client/**/*.ts`, 41 `tests/ui/**/*.ts` (both closed here), plus 32 `.tsx`
// story/fixture modules the CT surface's narrower globs missed — a REACT-surface question, deliberately
// left for its own row rather than folded in here. CLOSED by #1590: `UI_STORIES`/`UI_STORIES_SUFFIX`/
// `CLIENT_FIXTURES` above, and `CLIENT_STORIES` widened from the exact `_ct-stories.tsx` filename to
// every underscore-prefixed `.tsx` under `tests/client/**`.
// These two trees are exactly what tsconfig.tests-dom.json claims wholesale (#1243), so the escapee
// parser already has their program; no tsconfig moves with this.
const TESTS_DOM_OWNED = ["tests/support/**/*.ts", "tests/e2e/**/*.ts", ...homeGlobs("client", "**/*.ts"), ...homeGlobs("ui", "**/*.ts")];
// Every TS program that ROOTS a file under tests/**: the node world, the browser-tests world (type-worlds
// program, #1351 — the package programs check nothing under tests/ any more), and the ISOMORPHIC helper
// world. The escapee parser is handed all of them and uses whichever one owns the file, so no block here
// ever restates a tsconfig's include list.
//
// `tsconfig.tests-iso.json` joined the list on 2026-09-13 (#2300), and its absence was invisible until
// then for one reason: `tests/support/iso/` was a DECLARED world with no files in it (a tsconfig, a
// dep-cruiser direction rule, a helper-world root — and an empty directory). The first module landed
// there and its sibling test answered `Parsing error: … The file was not found in any of the provided
// project(s)`, because a helper module that something imports is pulled into the importer's program while
// a test that nothing imports is rooted only by its own world.
// Legacy worlds remain typecheck programs, not type-aware lint inputs (D320).
const TEST_TREE_PROJECTS = [TEST_WORLD_PROGRAMS.node, TEST_WORLD_PROGRAMS.browser, TEST_WORLD_PROGRAMS.iso];
const LEGACY_TEST_LINT_GLOB = `${LEGACY_TEST_ROOT}/**/*.{ts,tsx}`;
const PROJECT_SERVICE_SURFACE = [TOOLING_SRC, TOOLING_TESTS, ...NODE_TEST_DIRS];
// Every file the async-safety + dispatch + deprecation rules apply to.
const SAFETY_SURFACE = [...PROJECT_SERVICE_SURFACE, ...TESTS_DOM_OWNED];
// The real-type twins of Biome's type-inference rules. Biome's partial inference misread drizzle builders (thenable),
// `useRef().current` and TanStack status flags, so these run on the TypeScript checker's types instead.
const REAL_TYPE_RULES = {
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "@typescript-eslint/require-array-sort-compare": ["error", { ignoreStringArrays: true }],
  "@typescript-eslint/prefer-includes": "error",
  "@typescript-eslint/no-base-to-string": "error",
  "@typescript-eslint/no-unnecessary-type-conversion": "error",
  "@typescript-eslint/prefer-regexp-exec": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "error",
  "@typescript-eslint/prefer-string-starts-ends-with": "error",
};
const ASYNC_SAFETY_RULES = {
  // The headline rule here: 36 un-awaited async `toExitWith` matchers, all of them assertions that
  // could not fail their own test. Nothing else in the stack can see a dropped Promise.
  "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  ...REAL_TYPE_RULES,
  // The §5.5 string-union dispatch law: a default catch-all lets a new member inherit an arm silently.
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  // Caught a real object interpolation that would have rendered `[object Object]` in gate output.
  "@typescript-eslint/restrict-template-expressions": "error",
  "@typescript-eslint/no-deprecated": "error",
};

// Generic typed correctness + TSDoc checks cover every non-browser package source. This
// includes showcase-plugins' standalone guest packer, without placing its guest runtime content in an
// app-specific brand/domain group. ui/client retain their browser/React policy above.
const TSDOC_SURFACE = NON_BROWSER_PACKAGE_SRC;

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
// SYNTAX BANS, each over the population of the structural gate it replaced. The selector sets are layered
// (authored → shipped → client) because a later `no-restricted-syntax` block replaces an earlier one per file.
const NO_DECORATORS = {
  selector: "Decorator",
  message:
    "Decorators are not erasable syntax — tsx/node type-stripping has no decorator runtime (a runtime error) and the erasableSyntaxOnly flag does not catch them. Use function composition or a zod schema (Spine-TypeScript-and-Patterns.md §5).",
};
const NO_DEFAULT_PROPS = {
  selector: ":matches(MemberExpression[computed=false][property.type='Identifier'], JSXMemberExpression)[property.name='defaultProps']",
  message: "defaultProps is deprecated in modern React — use default parameters in the component signature instead.",
};
// An inline `queryKey: [...]` array diverges from the key the tRPC options proxy mints. esquery cannot recurse,
// so the `as`/`satisfies` wrapper chain around the array literal is unrolled to a fixed depth.
const QUERY_KEY_PROPERTY = "Property[computed=false][key.type='Identifier'][key.name='queryKey']";
const QUERY_KEY_WRAPPER = ":matches(TSAsExpression, TSSatisfiesExpression)";
const QUERY_KEY_WRAPPER_DEPTH = 8;
const NO_ARRAY_LITERAL_QUERYKEY = {
  selector: Array.from({ length: QUERY_KEY_WRAPPER_DEPTH + 1 }, (_, depth) =>
    [QUERY_KEY_PROPERTY, ...Array.from({ length: depth }, () => QUERY_KEY_WRAPPER), "ArrayExpression"].join(" > "),
  ).join(", "),
  message:
    "Inline array-literal queryKey — client query keys are 100% tRPC-proxy-derived (trpc.<router>.<proc>.queryKey()/.queryFilter()/.pathFilter()); a hand-written key array silently diverges from the reader/invalidator's key (UI-Gates-and-Lessons.md §11.1).",
};
const AUTHORED_SYNTAX = [NO_DECORATORS];
const SHIPPED_SYNTAX = [...AUTHORED_SYNTAX, NO_DEFAULT_PROPS];
const ENTRY_LOADER_SYNTAX = [
  {
    selector: "ImportExpression:not([source.type='Literal'][source.value=type(string)])",
    message: "Entry wiring uses resolved literal imports; dynamic host loading cannot bypass the native query frontier.",
  },
  {
    selector: "TSImportEqualsDeclaration",
    message: "Entry wiring uses ESM imports checked by the native query frontier, not CommonJS loader aliases.",
  },
  {
    selector:
      "ImportDeclaration[source.value=/^(node:)?process$/] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier[local.name!='process'], ImportSpecifier)",
    message: "Entry wiring keeps process as the checked direct binding, not a renamed, namespace or named host capability.",
  },
  {
    selector: `Identifier[name='process']:not(ImportDefaultSpecifier > Identifier.local):not(MemberExpression[computed=false][property.name=/^(${ENTRY_PROCESS_PROPERTIES.join("|")})$/] > Identifier.object)`,
    message: "Entry wiring may read its direct process status/stream fields, but cannot capture or compute a host process capability.",
  },
];
const CLIENT_SYNTAX = [...SHIPPED_SYNTAX, NO_ARRAY_LITERAL_QUERYKEY];
/** Source globs of a population root, derived from the gate runtime's own root table so the two cannot drift. */
const rootSources = (...refs) => refs.flatMap((ref) => POPULATION_ROOTS[ref].map((root) => `${root}**/*.{ts,tsx}`));
const AUTHORED_SRC = POPULATION_SETS["@authored"].flatMap((ref) => rootSources(ref));

// These are the native source groups configured before restriction-only inputs were admitted.
const MAINTAINED_GLOBAL_SURFACES = [
  { files: ["**/*.{js,cjs,mjs}", ...AUTHORED_SRC, ...TSDOC_SURFACE, "scripts/probes/st-goldens/**/*.ts"] },
  { files: NODE_TOOL_SURFACE, ignores: ["**/*.d.{ts,mts,cts}"] },
  { files: SCRIPTS_NESTED_SURFACE, ignores: ["scripts/probes/st-goldens/**"] },
];

const GENERATED_SOURCE = ["**/*.gen.ts", "packages/ui/src/tokens/index.ts"];
const STRICT_SYNTAX_IGNORES = [`${LEGACY_TEST_ROOT}/**`];
const CALLER_SRC = rootSources("@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference", "@tooling", "@tests", "@scripts");
const CALLER_IGNORES = [...STRICT_SYNTAX_IGNORES, "tooling/src/verify/gates/**"];
const GROUP_IGNORES = [...STRICT_SYNTAX_IGNORES, "**/tests/**", "**/tools/**", "**/scripts/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"];
const NO_CALLER_USER_ID = {
  selector: ":matches(Identifier, JSXIdentifier)[name='callerUserId']",
  message: "D19: use triggeredBy, funderUserId or runAsUserId for turn identity; the authenticated caller is Principal.userId.",
};
const GROUP_NAME = "/^(isGroup|isGroupChat|isGroupMode|is_group)$/";
const NO_GROUP_BRANCH = {
  selector: `:matches(VariableDeclarator > Identifier.id, IfStatement > Identifier.test, ConditionalExpression > Identifier.test)[name=${GROUP_NAME}]`,
  message: "D16: group chat is data, never a branch. Gate on the roster's character count and no-op at one.",
};
const NO_LAYOUT_CONTEXT_PROPS = {
  selector: "JSXAttribute[name.name=/^(compact|inDrawer|isSheet|density)$/]",
  message: "Query the container or use data-density instead of layout-context props (UI-Architecture-and-Layout §4).",
};
const NO_MAIN_DOM_HTML = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: "D294: render raw HTML through SandboxFrame, never inject it into the main document. New injection permissions require security review.",
};
// The all-tag selector keeps HTML policy independent of Biome's DOM tag recognition.
const NO_AS_CHILD_COMPOSITION = {
  selector:
    "JSXAttribute[name.type='JSXIdentifier'][name.name='asChild'], " +
    "TSPropertySignature[computed=false][key.type='Identifier'][key.name='asChild'], " +
    "TSPropertySignature[key.type='Literal'][key.value='asChild'], " +
    "TSPropertySignature[key.type='TemplateLiteral'][key.expressions.length=0][key.quasis.0.value.cooked='asChild']",
  message: "asChild is Radix's composition prop, not Base UI's. Use the render prop instead.",
};
const BROWSER_SYNTAX = [NO_LAYOUT_CONTEXT_PROPS, NO_MAIN_DOM_HTML, NO_AS_CHILD_COMPOSITION];
const memberNamed = (name, prefix = "") =>
  `:matches([${prefix}computed=false][${prefix}property.name='${name}'], [${prefix}computed=true][${prefix}property.type='Literal'][${prefix}property.value='${name}'], [${prefix}computed=true][${prefix}property.type='TemplateLiteral'][${prefix}property.expressions.length=0][${prefix}property.quasis.0.value.cooked='${name}'])`;
const EFFECT_CALL = `CallExpression[arguments.length=2]:matches([callee.type='Identifier'][callee.name='useEffect'], [callee.type='MemberExpression']${memberNamed("useEffect", "callee.")})`;
const FORM_READ = `:matches(MemberExpression${memberNamed("store")}, MemberExpression${memberNamed("values")}[object.type='MemberExpression']${memberNamed("state", "object.")})`;
const NO_FORM_DEPENDENCY = {
  selector: `${EFFECT_CALL} > ArrayExpression.arguments:nth-child(2) ${FORM_READ}`,
  message: "Use form listeners.onChange or form.Subscribe, not form.store/state.values in an effect dependency array.",
};
const FORM_SYNTAX_SRC = [
  "*.ts",
  "packages/*/*.ts",
  "packages/*/bundles/**/*.ts",
  "packages/*/src/**/*.{ts,tsx}",
  "playwright/**/*.{ts,tsx}",
  "tooling/src/**/*.{ts,tsx}",
  "tests/**/*.{ts,tsx}",
  "scripts/**/*.{ts,tsx}",
];
const MUTATION_HOME = "packages/client/src/data/create-entity-mutation.ts";
const COLLECTION_HOME = "packages/client/src/data/create-collection-surface.ts";
const QUERY_HOMES = [MUTATION_HOME, COLLECTION_HOME];
const queryImport = (names) => ({
  selector: `ImportDeclaration[source.value='@tanstack/react-query'] > ImportSpecifier[imported.name=/^(${names.join("|")})$/]`,
  message: "Use createEntityMutation or createCollectionSurface; only the owning factory imports its raw query hook.",
});
const NO_RAW_QUERY_HOOKS = queryImport(["useMutation", "useInfiniteQuery"]);
const ROUTES_SRC = "packages/client/src/routes/**/*.{ts,tsx}";
const APP_ROOT = "packages/client/src/routes/app-root.tsx";
const AUTH_ROUTES = ["packages/client/src/routes/login-page.tsx", "packages/client/src/routes/router.tsx"];
const routeImports = (doors = []) => ({
  selector: `ImportDeclaration[source.value=/^#features\\u002F/]${doors.map((door) => `:not([source.value='#features/${door}'])`).join("")}`,
  message: "A route mounts the registry-assembled shell, not a feature. Only exact composition and pre-authentication doors are permitted.",
});

const NO_MANUAL_MEMO_IMPORT = {
  selector: `ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name=/^(${MANUAL_MEMO_EXPORTS.join("|")})$/]`,
  message: "React Compiler owns memoization; remove the manual useMemo/useCallback/memo import.",
};
const NO_LITERAL_RESERVATION = {
  selector:
    "JSXOpeningElement[name.type='JSXIdentifier'][name.name='QueryBoundary'][selfClosing=false]:not(:has(> JSXAttribute[name.name='reserveKey'])) > " +
    "JSXAttribute[name.name='fallback'] > JSXExpressionContainer > JSXElement[openingElement.selfClosing=true][openingElement.name.type='JSXIdentifier'][openingElement.name.name='SkeletonRows'] > " +
    "JSXOpeningElement > JSXAttribute[name.name='count'] > JSXExpressionContainer > Literal[value=type(number)]",
  message: "A direct static SkeletonRows count guesses the settled box. Add reserveKey to QueryBoundary.",
};
const MEMO_NATIVE_SRC = rootSources("@client", "@ui", "@tests");

// Flat config replaces rule arrays. Repeat the applicable native layers in each existing override partition.
function syntaxBlocks(files, selectors, ignores = []) {
  const base = [...selectors, NO_FORM_DEPENDENCY];
  const blocks = [
    { files, ...(ignores.length === 0 ? {} : { ignores }), rules: { "no-restricted-syntax": ["error", ...selectors] } },
    { files, ignores: [...ignores, ...STRICT_SYNTAX_IGNORES], rules: { "no-restricted-syntax": ["error", ...base] } },
    {
      files: files.flatMap((file) => CALLER_SRC.map((caller) => [file, caller])),
      ignores: [...ignores, ...CALLER_IGNORES],
      rules: { "no-restricted-syntax": ["error", ...base, NO_CALLER_USER_ID] },
    },
    {
      files: files.flatMap((file) => AUTHORED_SRC.map((authored) => [file, authored])),
      ignores: [...ignores, ...GROUP_IGNORES],
      rules: { "no-restricted-syntax": ["error", ...base, NO_GROUP_BRANCH] },
    },
    {
      files: files.flatMap((file) => CALLER_SRC.map((caller) => [file, caller])),
      ignores: [...ignores, ...CALLER_IGNORES, ...GROUP_IGNORES],
      rules: { "no-restricted-syntax": ["error", ...base, NO_CALLER_USER_ID, NO_GROUP_BRANCH] },
    },
  ];
  const layered = blocks.flatMap((block) => [
    block,
    {
      files: block.files.flatMap((file) => AUTHORED_SRC.map((authored) => [...(Array.isArray(file) ? file : [file]), authored])),
      ignores: [...(block.ignores ?? []), ...STRICT_SYNTAX_IGNORES, "**/*.test.{ts,tsx}", ...QUERY_HOMES],
      rules: { "no-restricted-syntax": [...block.rules["no-restricted-syntax"], NO_RAW_QUERY_HOOKS] },
    },
  ]);
  return layered.flatMap((block) => [
    block,
    {
      ...block,
      files: block.files.flatMap((file) => MEMO_NATIVE_SRC.map((source) => [...(Array.isArray(file) ? file : [file]), source])),
      ignores: [...(block.ignores ?? []), ...STRICT_SYNTAX_IGNORES, ...Object.values(MANUAL_MEMO_CUSTOM_HOMES)],
      rules: { "no-restricted-syntax": [...block.rules["no-restricted-syntax"], NO_MANUAL_MEMO_IMPORT] },
    },
    {
      ...block,
      files: block.files.map((file) => [...(Array.isArray(file) ? file : [file]), CLIENT_SRC]),
      rules: { "no-restricted-syntax": [...block.rules["no-restricted-syntax"], NO_MANUAL_MEMO_IMPORT, NO_LITERAL_RESERVATION] },
    },
  ]);
}

// ── RESTRICTIONS: one core restriction rule per structural gate it replaced ─────────────────────────────
// Each entry publishes ESLint's own `no-restricted-syntax` / `no-restricted-globals` under the former gate's id
// (`orb/<id>`), so a ban carries its own scope and its own HOME list. Flat config replaces a rule's options
// per file, which would make two bans on one core rule fight; one rule name per ban makes that impossible.
//
// A `homes` entry is the one module that legitimately OWNS the capability the ban fences (the matchMedia
// reader, the persist factory); `why` says so. A `deferred` entry is a site that still breaks the ban and
// cannot be fixed locally; `item` is its proposed work item, so the list only shrinks. Neither is ever an
// inline `eslint-disable`. A path that stops existing reds `eslint-grant-liveness`.
const TEST_FILES = "**/*.test.{ts,tsx}";
const CLIENT_FEATURES = "packages/client/src/features/**/*.{ts,tsx}";
const CLIENT_FEATURES_TSX = "packages/client/src/features/**/*.tsx";
const SERVER_TRANSPORT = "packages/server/src/transport/**/*.{ts,tsx}";
const alternation = (names) => `/^(${names.join("|")})$/`;
const TANSTACK_FORM_MINTS = ["useForm", "createFormHook", "createFormHookContexts"];
const MATCH_MEDIA = "matchMedia";
const FIREHOSE_SYMBOL = "subscribeAllChatEvents";
const SETTINGS_TABLE_IMPORT = {
  regex: "^@orb/db(?:/(?:schema|index))?$",
  importNames: ["settings"],
  message: "The settings domain owns this table; inject its registered prefix-scoped KV port.",
};
const POST_ROW_IDENTITY_NAMES = alternation([
  "Principal",
  "Can",
  "UserRole",
  "USER_ROLES",
  "ParticipantRole",
  "PARTICIPANT_ROLES",
  "ChatMembership",
  "ChatResource",
  "GlobalResource",
  "ResourceRef",
]);

const DIRECT_CLASS_LITERAL_TEMPLATE =
  "JSXAttribute[name.name=/^class(Name)?$/] > JSXExpressionContainer > TemplateLiteral[expressions.length=1][expressions.0.type='Literal'][expressions.0.value=type(string)]";

const INFRA_AUTH_RESTRICTIONS = [
  {
    id: "infra-auth-no-userid",
    scope: ["packages/server/src/infra/auth/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='userId']",
        message: "D40: infra/auth verifies pre-row identity; resolve userId through sessions at entry/auth/seam.ts.",
      },
    ],
  },
  {
    id: "infra-auth-pre-row-imports",
    scope: ["packages/server/src/infra/auth/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector: `:matches(ImportDeclaration, ExportNamedDeclaration)[source.value='@orb/contracts/identity'] > :matches(ImportSpecifier[imported.name=${POST_ROW_IDENTITY_NAMES}], ImportSpecifier[imported.value=${POST_ROW_IDENTITY_NAMES}], ExportSpecifier[local.name=${POST_ROW_IDENTITY_NAMES}], ExportSpecifier[local.value=${POST_ROW_IDENTITY_NAMES}], ImportNamespaceSpecifier)`,
        message: "D1/D40: post-row identity and authorization belong above infra/auth; import only pre-row verification contracts here.",
      },
      {
        selector: "ExportAllDeclaration[source.value='@orb/contracts/identity']",
        message: "D1/D40: infra/auth cannot reexport post-row identity or authorization through a namespace or star door.",
      },
    ],
  },
];

const CLASS_LITERAL_START = String.raw`(?:^["']|\s)`;
const CLASS_LITERAL_END = String.raw`(?=\s|["']$)`;
const CLASS_SPAN_START = String.raw`(?:^|\s)`;
const CLASS_SPAN_END = String.raw`(?=\s|$)`;
const STATIC_CLASS_SPAN = "TemplateLiteral[expressions.length=0] > TemplateElement";
const ARBITRARY_CLASS = String.raw`(?:[^\s]*:)?(?:[whz]|min-w|min-h|max-w|max-h|size|p[xytrbles]?|m[xytrbles]?|gap(-x|-y)?|space-[xy]|inset(-x|-y)?|top|left|right|bottom|start|end|translate(-x|-y|-z)?|grid-(cols|rows)|text|leading|tracking|rounded)-\[(?!(?:--|var\(|calc\())[^\s:]+\]`;
const NAMED_COLOR = String.raw`\b(bg|text|border|ring|fill|stroke)-(black|white)(\/\d+)?\b`;
const PALETTE_COLOR = String.raw`\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|divide|placeholder|shadow|ring-offset)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?\b`;
const HEX_COLOR = String.raw`-\[#[0-9a-fA-F]{3,8}\]`;
const VIEWPORT_CLASS = String.raw`(?:(?:max-|min-)?(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\s\]]+\]):`;
const POINTER_CLASS = String.raw`(?:any-)?pointer-(?:coarse|fine):`;
const CAPABILITY_MEDIA_CLASS = String.raw`\[@media\([^\s)]*(?:any-pointer|pointer|hover):[^\s)]*\)\]:`;
const WIDTH_CLASS = String.raw`(?:(?:max-|min-)?w-\[[^\s\]]+\]|(?:max-)?w-(?:[1-9]\d*|\d+\.\d+))`;

// These unfenced lexical bans also judge generated declarations; carrier-aware Tailwind rules do not.
const CLASS_RESTRICTIONS = [
  {
    id: "ui-skin-fragment-purity",
    scope: rootSources("@ui"),
    homes: [{ path: "packages/ui/src/lib/**", why: "Canonical shared focus, scrim, arrow, touch-target and disabled recipe definitions live here." }],
    selectors: [
      "focus-visible:ring-",
      "before:size-touch-target",
      "rotate-45 border border-border bg-popover",
      "bg-backdrop",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "disabled:pointer-events-none disabled:opacity-50",
    ].map((signature) => ({
      selector: `:matches(Literal[value=type(string)][raw=/${signature}/], TemplateElement[value.raw=/${signature}/])`,
      message: "A string outside the canonical UI lib home hand-spells a skin fragment; compose the matching lib constant instead.",
    })),
  },
  {
    id: "no-arbitrary-tw-values",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${ARBITRARY_CLASS}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${ARBITRARY_CLASS}${CLASS_SPAN_END}/])`,
        message: "Arbitrary Tailwind layout/size/type value bypasses the token scale; use a token utility or extend tokens.json.",
      },
    ],
  },
  {
    id: "no-color-literals",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${NAMED_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${NAMED_COLOR}/])`,
        message: "A named non-token color bypasses the theme; use a semantic token, or bg-backdrop for a scrim.",
      },
      {
        selector: String.raw`:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}(?![^\s]*${NAMED_COLOR})[^\s]*${PALETTE_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}(?![^\s]*${NAMED_COLOR})[^\s]*${PALETTE_COLOR}/])`,
        message: "A palette-scale color bypasses the theme; use a semantic token such as text-destructive or bg-primary.",
      },
      {
        selector: String.raw`:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}(?![^\s]*${NAMED_COLOR})(?![^\s]*${PALETTE_COLOR})[^\s]*${HEX_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}(?![^\s]*${NAMED_COLOR})(?![^\s]*${PALETTE_COLOR})[^\s]*${HEX_COLOR}/])`,
        message: "An arbitrary hex color bypasses the theme; use a semantic color token from theme.css.",
      },
    ],
  },
  {
    id: "no-media-queries-in-features",
    scope: rootSources("@client", "@ui"),
    notUnder: ["packages/client/src/features/app-shell/**"],
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${VIEWPORT_CLASS}/], TemplateElement[value.raw=/${CLASS_SPAN_START}${VIEWPORT_CLASS}/])`,
        message: "Viewport breakpoints belong to app-shell; adapt to the pane with a container query or Container size.",
      },
    ],
  },
  {
    id: "no-pointer-variants-in-features",
    scope: [CLIENT_FEATURES],
    notUnder: ["packages/client/src/features/app-shell/**"],
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${POINTER_CLASS}|${CAPABILITY_MEDIA_CLASS}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${POINTER_CLASS}|${CAPABILITY_MEDIA_CLASS}/])`,
        message: "Device capability adaptation belongs to shared tokens or app-shell, not feature-local pointer/hover capability variants.",
      },
    ],
  },
  {
    id: "no-raw-container-widths",
    scope: rootSources("@client", "@ui"),
    notUnder: ["packages/ui/src/layout/**", "packages/ui/src/markdown/**"],
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${WIDTH_CLASS}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${WIDTH_CLASS}${CLASS_SPAN_END}/])`,
        message: "Raw content widths bypass the container scale; use Container size or a max-w-cq-* token utility.",
      },
    ],
  },
];

// These decoders have a closed value API. Their native incoming doors cannot be laundered through a new export.
const ROLE_DATA_EXPORTS = [
  { path: "primitives/role-data/index.ts", names: ["captureUserRole", "captureParticipantRole"] },
  { path: "primitives/role-data/registry.ts", names: ["userRoleCodes", "participantRoleCodes"] },
  { path: "primitives/role-data/decode/index.ts", names: ["isUserRoleState", "isParticipantRoleState", "userRoleValue", "participantRoleValue"] },
  { path: "domain/admin/guard.ts", names: ["isBootstrapOwnerRole", "isBootstrapOwnerRoleCode", "can", "requireAdmin", "requireOwner", "isAdmin", "isOwner"] },
  { path: "domain/chat/substrate/participants-host.ts", names: ["hostSeatOf", "hostUserIdOf"] },
  {
    path: "domain/chat/substrate/member-visibility.ts",
    names: [
      "viewerHoldsHost",
      "viewerReadsHidden",
      "stripMessagesForViewer",
      "stripMemberCardForViewer",
      "projectViewReturnForViewer",
      "stripChatEventForMember",
      "scrubDeltaEventForMember",
      "createMemberDeltaStamper",
      "scrubStreamReplayForMember",
      "scrubChatEventReplayForMember",
    ],
  },
  { path: "domain/chat/persistence/role-encoding.ts", names: ["prepareContinueRestoreForRoleData"] },
  { path: "entry/http/auth-meta.ts", names: ["registerAuthMeta"] },
  {
    path: "transport/trpc/role-output.ts",
    names: [
      "viewerViewSchema",
      "adminUserViewSchema",
      "participantViewSchema",
      "chatDetailSchema",
      "chatListPageSchema",
      "chatLineageViewSchema",
      "startChatResultSchema",
      "forkResultSchema",
      "redeemInviteResultSchema",
    ],
  },
  {
    path: "domain/databank/persistence/scope.ts",
    names: [
      "requireIngestDestination",
      "attachIngestDestination",
      "insertIngestDocument",
      "resolveChatHiddenDocumentIds",
      "resolveChatDocumentSources",
      "resolveActiveDocumentScope",
      "resolveActiveDocumentIds",
    ],
  },
  { path: "domain/admin/persistence/queries.ts", names: ["userCols", "loadUser", "listUsers", "toAdminUserData"] },
  {
    path: "entry/compose/chat.ts",
    names: [
      "createSignupMinterCheck",
      "activePersonaIdFor",
      "voicePersonaFor",
      "createTurnPersonaResolver",
      "buildChatToolOps",
      "createRunChatTurnBridge",
      "createTaskWindowReaders",
      "createGeneratePictureOp",
      "speakerArbiterFor",
      "buildChatService",
    ],
  },
  { path: "domain/sessions/verbs/validate.ts", names: ["createValidate"] },
  { path: "domain/sessions/verbs/load-user-by-id.ts", names: ["createLoadUserById"] },
  { path: "domain/sessions/verbs/provision-identity.ts", names: ["createProvisionIdentity"] },
  { path: "entry/auth/seam.ts", names: ["readSessionCookie", "createHostPrincipalResolver", "createAuthSeam"] },
  {
    path: "domain/automation/persistence/canon-reads.ts",
    names: [
      "loadCallerRole",
      "isBookAttachedToChat",
      "countChatMessages",
      "loadPresentHumanMemberIds",
      "isDomainRowOwnedBy",
      "isBookOwnedBy",
      "listRuleEntryTitles",
      "listAnalysisWindow",
      "maxVisibleSeq",
      "latestAuditableReply",
      "hasActiveGame",
    ],
  },
  {
    path: "domain/chat/persistence/queries.ts",
    names: [
      "normalizeToolOrdinals",
      "loadChatRow",
      "loadPendingHandoff",
      "selectStandingNominationChatIds",
      "loadMemberChat",
      "listMemberChats",
      "countMemberChats",
      "loadViewerLastTurnAt",
      "loadForkChildren",
      "loadChatMessageStats",
      "loadViewerLastTurns",
      "loadChatLastMessages",
      "loadAncestorChain",
      "loadMaxMessageSeq",
      "loadPendingUserText",
      "loadIsReplyToLatestUserMessage",
      "loadCanonHistory",
      "loadInlineReplyAssetIds",
      "loadRecordedSystemTokens",
      "loadCanonContentSignatures",
      "loadCanonReasoningParts",
      "loadCanonCues",
      "loadMessageView",
      "readRetainedCanonContributions",
      "loadCanonStatRows",
      "loadSwipeStatRows",
      "loadSlotTarget",
      "loadContinueSnapshot",
      "loadMessagesPage",
      "loadStreamReplay",
      "loadStreamBounds",
      "loadChatEventReplay",
      "loadChatEventById",
      "loadChatEventBounds",
      "loadMessageVariantSummaries",
      "loadVariantWire",
      "loadVariantMessageId",
      "loadMessageSeqs",
      "loadAuthoredUserMessageIds",
      "retainOpenGreetingWindow",
      "loadHasUserMessage",
      "loadHasSelectedCanonUserMessage",
      "loadCanonHistoryAfter",
      "loadStandaloneVariableDeltasWithRaw",
      "loadMessageVariableDeltas",
      "loadVariableDeltas",
      "toStandaloneFoldRow",
      "loadTurnOrigin",
      "loadVariantDelta",
      "loadStoredVariables",
      "loadRuntimeVariables",
      "loadStoredUserMacroValues",
      "loadChatInjections",
      "loadMessageSlots",
      "loadVariantsByMessageIds",
    ],
  },
  {
    path: "domain/chat/persistence/participants-read.ts",
    names: [
      "loadPresentRole",
      "loadPresentVisibilityRow",
      "loadPresentVisibilityRows",
      "loadPresentHumanUserIds",
      "loadPresentCharacterSeats",
      "isCharacterSeated",
      "isPresentParticipant",
      "loadParticipants",
      "characterSeatedInAnotherChat",
      "characterEverSeatedInChat",
      "buildInitialParticipantRows",
      "loadParticipantsBatch",
      "captureParticipantRow",
    ],
  },
  { path: "domain/chat/verbs/edit.ts", names: ["createEdit"] },
  { path: "domain/chat/verbs/read.ts", names: ["createRead"] },
  { path: "domain/chat/verbs/participants.ts", names: ["createParticipants", "setParticipantActivePersona"] },
];
const ROLE_DATA_RESTRICTIONS = ROLE_DATA_EXPORTS.map(({ path, names }, index) => ({
  id: `role-data-export-surface-${index}`,
  scope: [`packages/server/src/${path}`],
  homes: [],
  selectors: [
    {
      selector:
        ":matches(ExportAllDeclaration[exportKind!='type'], ExportDefaultDeclaration, TSExportAssignment), ExportNamedDeclaration[exportKind!='type'] > ExportSpecifier[exportKind!='type'], ExportNamedDeclaration > :matches(TSImportEqualsDeclaration, TSModuleDeclaration, TSDeclareFunction)",
      message: "Role codec owners expose only their canonical declared API, never an alias, namespace, default or reexport door.",
    },
    {
      selector: `ExportNamedDeclaration > :matches(FunctionDeclaration, ClassDeclaration, TSEnumDeclaration)[id.name!=${alternation(names)}], ExportNamedDeclaration > VariableDeclaration > VariableDeclarator:not([id.type='Identifier'][id.name=${alternation(names)}])`,
      message: "Role data owners cannot add exported codec access outside their canonical API.",
    },
  ],
}));
const TURN_IDENTITY_RESTRICTIONS = [
  {
    id: "turn-identity-name",
    scope: ["packages/server/src/domain/chat/engine/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector:
          ":matches(Identifier[name='principal']:not(Property[shorthand=true] > Identifier.key):not(ImportSpecifier[imported.name='principal'][local.name='principal'] > Identifier.imported):not(ExportSpecifier[local.name='principal'][exported.name='principal'] > Identifier.exported), JSXIdentifier[name='principal'])",
        message: "D19: the turn engine receives frozen runAsUserId/funderUserId/triggeredBy facts, never a request principal binding.",
      },
    ],
  },
];
const CONTEXT_NATIVE_SETTINGS = {
  "orb/context-vocabulary": {
    mintHome: { source: REGISTRY_CONTRACTS_RE.source, flags: REGISTRY_CONTRACTS_RE.flags },
    tabs: DEFINE_CONTEXT_TABS,
    region: DEFINE_CONTEXT_REGION,
  },
  "orb/context-implementation": createHash("sha256")
    .update(readFileSync(new URL(import.meta.url), "utf8"))
    .digest("hex"),
};
const CLIENT_CONTEXT_RESTRICTIONS = [
  { id: "context-definition-shape", scope: [CLIENT_SRC], homes: [] },
  {
    id: "context-shell-chrome",
    scope: [CLIENT_FEATURES],
    notUnder: ["packages/client/src/features/app-shell/**"],
    homes: [],
    selectors: [
      {
        selector: ":matches(Literal[value=type(string)][raw=/shell-panel-header/], TemplateElement[value.raw=/shell-panel-header/])",
        message: "A feature must compose its own band, not paint the shell-panel-header chrome.",
      },
    ],
  },
  {
    id: "no-mutating-register-api",
    scope: [CLIENT_SRC],
    homes: [],
    selectors: [
      {
        selector:
          "FunctionDeclaration[id.name='register'], :matches(MethodDefinition, TSAbstractMethodDefinition)[computed=false][kind='method'][key.type='Identifier'][key.name='register'], Property[computed=false][method=true][key.type='Identifier'][key.name='register'], TSDeclareFunction[id.name='register']",
        message: "Export definition values for door assembly, not a mutating register API.",
      },
    ],
  },
];

const PARALLEL_MAP_VOCABULARIES = [
  { name: "SectionId", ids: SECTION_IDS, slot: DEFINITION_SLOTS.section },
  { name: "ModalSlotId", ids: MODAL_SLOT_IDS, slot: DEFINITION_SLOTS.modal },
  { name: "ConfigGroupId", ids: CONFIG_GROUP_IDS, slot: DEFINITION_SLOTS.group },
];
for (const { name, ids } of [...PARALLEL_MAP_VOCABULARIES, { name: "CHROME_ZONES", ids: CHROME_ZONES }]) {
  if (!Array.isArray(ids) || ids.length === 0 || [...ids].some((id) => typeof id !== "string")) {
    throw new Error(`Native parallel-map vocabulary ${name} must be a nonempty string array`);
  }
}
const CLIENT_MAP_NATIVE_SETTINGS = {
  "orb/parallel-map-vocabulary": {
    ids: PARALLEL_MAP_VOCABULARIES,
    zones: CHROME_ZONES,
    chromeSlot: DEFINITION_SLOTS.chrome,
  },
  "orb/parallel-map-inputs": createHash("sha256")
    .update(JSON.stringify(CLIENT_MAP_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(new URL(path, import.meta.url), "utf8")])))
    .digest("hex"),
};
const CLIENT_MAP_RESTRICTIONS = [{ id: CLIENT_MAP_NATIVE_RULE.slice("orb/".length), scope: [CLIENT_SRC], homes: [] }];

const CLIENT_LEXICAL_RESTRICTIONS = [
  { id: "ui-size-via-variant", scope: rootSources("@client", "@ui"), homes: [] },
  { id: "testid-typed-only", scope: [CLIENT_SRC], homes: [] },
  { id: "scroll-container-positioned", scope: rootSources("@client", "@ui"), homes: [] },
];
const CLIENT_LEXICAL_NATIVE_SETTINGS = {
  "orb/client-lexical-inputs": createHash("sha256")
    .update(JSON.stringify(CLIENT_LEXICAL_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(new URL(path, import.meta.url), "utf8")])))
    .digest("hex"),
};

const CLIENT_REGISTRY_RESTRICTIONS = [
  ...["sections", "modals"].map((name) => ({
    id: name === "sections" ? "section-route-registry-map" : "modal-route-registry-map",
    scope: ["packages/client/src/routes/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector: `JSXAttribute[name.name='${name}'][value.type='JSXExpressionContainer'][value.expression.type='ObjectExpression']`,
        message: "Routes forward assembled registries; they do not reconstruct registry override maps.",
      },
    ],
  })),
];

const BANNED_UTILITY = String.raw`(?:[^\s]*:)?!?max-w-prose!?`;
const CLASS_TOKEN_RESTRICTIONS = [
  {
    id: "no-banned-tw-utility",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${BANNED_UTILITY}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${BANNED_UTILITY}${CLASS_SPAN_END}/])`,
        message:
          "Tailwind's max-w-prose matches no house reading measure. Body/teaching prose takes max-w-(--reading-measure-prose) on the paragraph; editor content takes max-w-(--width-content-col).",
      },
    ],
  },
];

const Z_INDEX_HOMES = Object.entries(Z_INDEX_IMPLEMENTATION_HOMES).map(([path, { why }]) => ({ path: `${path}**`, why }));
const GOVERNED_Z_NAMES = Object.keys(Z_TOKEN_SCOPES)
  .map((path) => RegExp.escape(path.slice("z.".length)))
  .join("|");
const UNKNOWN_SEMANTIC_Z = String.raw`\bz-\(--z-(?!(?:${GOVERNED_Z_NAMES})\))[a-z0-9-]+\)`;
const Z_INDEX_RESTRICTIONS = [
  { id: "no-raw-z-index", scope: rootSources("@client", "@ui"), homes: Z_INDEX_HOMES },
  {
    id: "no-unknown-z-index-token",
    scope: rootSources("@client", "@ui"),
    homes: Z_INDEX_HOMES,
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${UNKNOWN_SEMANTIC_Z}/], TemplateElement[value.raw=/${UNKNOWN_SEMANTIC_Z}/])`,
        message: "Unknown semantic z-index token; use the canonical vocabulary in packages/ui/src/tokens/z-scope.ts.",
      },
    ],
  },
];

const DETERMINISM_TEST_SOURCES = ["tests/**/*.{ts,tsx}", `${HELPER_WORLD_DIRS.node}/**/*.mjs`];
const ESCAPE_MINT_NAMES = "/^(escapeRegExp|escapeRegex)$/";
const DETERMINISM_RESTRICTIONS = [
  {
    id: "platform-escape-mint",
    scope: [...POPULATION_SETS["@product"].flatMap((ref) => rootSources(ref)), ...DETERMINISM_TEST_SOURCES],
    notUnder: [`${LEGACY_TEST_ROOT}/**`],
    homes: [],
    selectors: [
      `FunctionDeclaration[id.name=${ESCAPE_MINT_NAMES}]`,
      `TSDeclareFunction[id.name=${ESCAPE_MINT_NAMES}]`,
      `VariableDeclarator[id.type='Identifier'][id.name=${ESCAPE_MINT_NAMES}][init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]`,
      `Property[computed=false][kind='init'][key.type='Identifier'][key.name=${ESCAPE_MINT_NAMES}][value.type=/^(ArrowFunctionExpression|FunctionExpression)$/]`,
      `:matches(MethodDefinition, TSAbstractMethodDefinition)[computed=false][kind='method'][key.type='Identifier'][key.name=${ESCAPE_MINT_NAMES}]`,
    ].map((selector) => ({ selector, message: "Use the native RegExp.escape API instead of declaring an escapeRegExp/escapeRegex function." })),
  },
  {
    id: "test-ambient-source-string",
    scope: DETERMINISM_TEST_SOURCES,
    notUnder: [`${LEGACY_TEST_ROOT}/**`, "tests/e2e/**"],
    homes: [],
    selectors: AMBIENT_SOURCE_PATTERNS.map(({ re, what }) => ({
      selector: `:matches(Literal[value=type(string)][raw=/${re.source}/], TemplateElement[value.raw=/${re.source}/])`,
      message: `Ambient nondeterminism in source text: ${what}`,
    })),
  },
  {
    id: "test-wait-for-timeout",
    scope: DETERMINISM_TEST_SOURCES,
    notUnder: [`${LEGACY_TEST_ROOT}/**`, "tests/e2e/**"],
    homes: [],
    selectors: [
      {
        selector: "CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.property.name='waitForTimeout']",
        message: "Use a locator assertion or expect.poll instead of a fixed waitForTimeout delay.",
      },
    ],
  },
];

// These joins are file-local syntax over the adjudicated vendor surface, never semantic type queries.
const BASEUI_RESTRICTIONS = [
  { id: "baseui-derives-not-respells", scope: [UI_SRC], homes: [] },
  { id: "baseui-state-data-attributes", scope: [UI_SRC], homes: [] },
];
const baseUiManifestRead = surfaceManifestFrom(JSON.parse(readFileSync(new URL(JSON_RESOURCE_PATHS["baseui-manifest"], import.meta.url), "utf8")));
if (!baseUiManifestRead.ok) {
  throw new Error(`Native Base UI policies cannot read the surface manifest: ${baseUiManifestRead.reason}`);
}
const BASEUI_SURFACE = baseUiManifestRead.manifest;
const BASEUI_INPUT_REVISION = createHash("sha256")
  .update(JSON.stringify(BASE_UI_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(new URL(path, import.meta.url), "utf8")])))
  .digest("hex");

const RESTRICTIONS = [
  ...Z_INDEX_RESTRICTIONS,
  ...BASEUI_RESTRICTIONS,
  ...CLASS_TOKEN_RESTRICTIONS,
  ...DETERMINISM_RESTRICTIONS,
  ...INFRA_AUTH_RESTRICTIONS,
  ...CLASS_RESTRICTIONS,
  ...ROLE_DATA_RESTRICTIONS,
  ...TURN_IDENTITY_RESTRICTIONS,
  ...CLIENT_REGISTRY_RESTRICTIONS,
  ...CLIENT_CONTEXT_RESTRICTIONS,
  ...CLIENT_MAP_RESTRICTIONS,
  ...CLIENT_LEXICAL_RESTRICTIONS,
  {
    id: "class-token-splice",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: `${DIRECT_CLASS_LITERAL_TEMPLATE}:matches([quasis.0.value.cooked=/\\S$/][expressions.0.value=/^\\S/], [expressions.0.value=/\\S$/][quasis.1.value.cooked=/^\\S/])`,
        message: "A literal interpolation splits a class token; spell the complete class as one source literal.",
      },
    ],
  },
  {
    id: "no-tailwind-dark-variant",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: "JSXAttribute[name.name='className'] > Literal[value=/^dark:/]",
        message: "Use a polarity-aware light-dark() token; dark: cannot follow ThemeScope-derived custom-theme polarity.",
      },
    ],
  },
  {
    id: TYPE_HOME_NATIVE_POLICY_ID,
    scope: TYPE_HOME_NATIVE_SOURCE_GLOBS,
    notUnder: [...TYPE_HOME_NATIVE_CONTRACT_GLOBS, ...TYPE_HOME_NATIVE_UNADMITTED_GLOBS],
    homes: [],
    selectors: [
      {
        selector: ":matches(ExportNamedDeclaration, ExportDefaultDeclaration) > :matches(TSTypeAliasDeclaration, TSInterfaceDeclaration)",
        message:
          "An exported package-owned type belongs in its sanctioned src/contract home; import or reexport its canonical declaration (Spine-TypeScript §7.4).",
      },
    ],
  },
  {
    id: "no-raw-zustand-persist",
    scope: rootSources("@client"),
    homes: [
      {
        path: "packages/client/src/state/entity-draft-store-implementation.ts",
        why: "the draft-store factory bakes partialize / version+total-migrate / key uniqueness in; its `persist(` call and its registered `reset` closure ARE the seal every draft store mints through",
      },
      { path: "packages/client/src/state/persisted-store-implementation.ts", why: "the general persisted-store factory, the same seal one shape over" },
    ],
    selectors: [
      {
        selector: "ImportDeclaration[source.value='zustand/middleware'] > ImportSpecifier[imported.name='persist']",
        message:
          "Raw zustand `persist` outside its sealed homes — partialize / version+total-migrate / key uniqueness are baked into `createEntityDraftStore` / `createPersistedStore` (UI-Gates-and-Lessons.md §11.5).",
      },
      {
        selector: "ExportNamedDeclaration[source.value='zustand/middleware'] > ExportSpecifier[local.name='persist']",
        message: "Raw zustand `persist` re-exported outside its sealed homes (UI-Gates-and-Lessons.md §11.5).",
      },
      {
        selector:
          "CallExpression[callee.property.name='setState'][arguments.1.value=true]:has(> CallExpression.arguments[callee.property.name='getInitialState'])",
        message:
          "`setState(store.getInitialState(), true)` on a persist-minted store writes the emptied state THROUGH to durable storage (#879, from #837); it belongs to the two mint factories, whose `reset` closures the durable-local registry drives behind the storage blindfold.",
      },
    ],
  },
  {
    // The registry's own `reset()` may only run in the function that installs the storage blindfold.
    id: "no-raw-zustand-persist-registry",
    scope: ["packages/client/src/state/durable-local.ts"],
    homes: [],
    selectors: [
      {
        selector: "CallExpression[callee.property.name='reset']:not(FunctionDeclaration[id.name='resetWithoutPersisting'] CallExpression)",
        message:
          "A registered store's `reset()` inside the durable-local registry may only run from `resetWithoutPersisting`, which blindfolds the store's storage first — anywhere else drops a store WITHOUT the blindfold (#837 one layer up).",
      },
    ],
  },
  {
    id: "no-direct-useform",
    scope: AUTHORED_SRC,
    homes: [
      {
        path: "packages/client/src/forms/editor/contexts.ts",
        why: "the ONE `createFormHookContexts()` call the whole form toolkit is built on, split from use-app-form.ts only so bound components can import the contexts without a cycle",
      },
      {
        path: "packages/client/src/forms/editor/use-app-form.ts",
        why: "the single `createFormHook` instance every multi-field form builds from — `useAppForm` IS this call",
      },
    ],
    selectors: [
      {
        selector: `ImportDeclaration[source.value='@tanstack/react-form'] > ImportSpecifier[imported.name=${alternation(TANSTACK_FORM_MINTS)}]`,
        message:
          "TanStack Form's raw mint is used outside the shared form toolkit — use `useAppForm` (and `withForm` / `withFieldGroup`) from `#forms/editor`; the raw mints bypass the bound @orb/ui Field components.",
      },
      {
        selector: `CallExpression[callee.type='MemberExpression'][callee.property.name=${alternation(TANSTACK_FORM_MINTS)}]`,
        message: "TanStack Form's raw mint is called through a namespace outside the shared form toolkit — use `useAppForm` from `#forms/editor`.",
      },
    ],
  },
  {
    id: "firehose-import-allowlist",
    scope: rootSources("@server"),
    homes: [
      {
        path: "packages/server/src/entry/compose/automation-watcher.ts",
        why: "the server composition root is the sole HOST-authority consumer of the unclamped all-chat stream; it injects the bounded automation operation instead of exposing the stream to a user surface",
      },
      {
        path: "packages/server/src/transport/trpc/index.ts",
        why: "the transport barrel republishes the canonical firehose only so the composition root can wire the HOST-authority consumer",
      },
    ],
    selectors: [
      {
        selector: `:matches(ImportSpecifier[imported.name='${FIREHOSE_SYMBOL}'], ExportSpecifier[local.name='${FIREHOSE_SYMBOL}'])`,
        message: `The all-chats firehose \`${FIREHOSE_SYMBOL}\` is importable ONLY by the composition root (entry/compose). It is unclamped by type — no chatId, no caller, no per-member history-floor verdict — so any per-user surface fed from it ships a join-history leak (D162). Tail \`subscribeChatEvents\` behind the member-gated \`chatEventBounds\` probe instead.`,
      },
      {
        selector: `:matches(MemberExpression[computed=false][property.name='${FIREHOSE_SYMBOL}'], MemberExpression[computed=true][property.value='${FIREHOSE_SYMBOL}'])`,
        message: `The all-chats firehose \`${FIREHOSE_SYMBOL}\` is importable ONLY by the composition root (entry/compose) (D162).`,
      },
    ],
  },
  {
    id: "bus-channel-primitive",
    scope: [SERVER_TRANSPORT],
    homes: [
      {
        path: "packages/server/src/transport/trpc/bus-channel.ts",
        why: "`defineBusChannel`'s own module — the node EventEmitter it wraps is constructed HERE, which is the point of the mint (M9, client-architecture-state-and-gates.md §13/§16 G10)",
      },
    ],
    selectors: [
      {
        selector:
          ":matches(ImportDeclaration[source.value=/^(node:)?events$/] > ImportSpecifier[imported.name='EventEmitter'], ExportNamedDeclaration[source.value=/^(node:)?events$/] > ExportSpecifier[local.name='EventEmitter'])",
        message:
          "`EventEmitter` under packages/server/src/transport/ outside the mint — `defineBusChannel` (transport/trpc/bus-channel.ts) is the ONE transport EventEmitter home; a bespoke emitter re-introduces the machinery M9 unified.",
      },
      {
        selector: "NewExpression[callee.type='MemberExpression'][callee.property.name='EventEmitter']",
        message:
          "`new events.EventEmitter()` under packages/server/src/transport/ outside the mint — route the bus through `defineBusChannel` (transport/trpc/bus-channel.ts).",
      },
    ],
  },
  {
    id: "no-raw-matchmedia",
    scope: rootSources("@client", "@ui"),
    homes: [
      {
        path: "packages/ui/src/lib/coarse-pointer-now.ts",
        why: "the ONE `(pointer: coarse)` / `(pointer: fine)` home (`coarsePointerNow()`, `finePointerNow()`, `useCoarsePointer()`)",
      },
      { path: "packages/ui/src/lib/reduced-motion-now.ts", why: "the imperative reduced-motion one-home (`prefersReducedMotionNow()`)" },
      {
        path: "packages/client/src/features/app-shell/hooks/use-is-mobile-viewport.ts",
        why: "the shell's viewport one-home: the ONE place the mobile-viewport fact is read; the rest of the client reads it off `#state`",
      },
      { path: "packages/ui/src/lib/use-prefers-light-color-scheme.ts", why: "the canonical OS color-scheme query and subscription" },
      {
        path: "packages/ui/src/lib/use-prefers-reduced-motion.ts",
        why: "the render-time reduced-motion one-home: one `matchMedia` + `useSyncExternalStore` subscription for every non-CSS motion path",
      },
    ],
    globals: [{ name: MATCH_MEDIA, message: "A bare `matchMedia` read outside the named media-query one-homes (UI-Gates-and-Lessons.md §11)." }],
    selectors: [
      {
        // `typeof x.matchMedia` is a capability probe, not a read of the api, and every one-home does it first.
        selector: `MemberExpression[computed=false][property.name='${MATCH_MEDIA}']:not(UnaryExpression[operator='typeof'] > MemberExpression)`,
        message:
          "A raw `matchMedia` read outside the named media-query one-homes — use `usePrefersReducedMotion()` / `usePrefersLightColorScheme()` (render), `prefersReducedMotionNow()` / `coarsePointerNow()` / `finePointerNow()` (imperative) from `@orb/ui`'s `#lib`, or the shell's viewport hook (UI-Gates-and-Lessons.md §11).",
      },
      {
        selector: `MemberExpression[computed=true][property.value='${MATCH_MEDIA}']:not(UnaryExpression[operator='typeof'] > MemberExpression)`,
        message: "A raw `matchMedia` read outside the named media-query one-homes (UI-Gates-and-Lessons.md §11).",
      },
    ],
  },
  {
    id: "fetch-fn-in-features",
    scope: [CLIENT_FEATURES],
    homes: [],
    globals: [
      {
        name: "fetch",
        message:
          "A client feature never writes `fetch(` — HTTP-route egress gets ONE data/ fetch fn each (beside upload-asset.ts / auth-session.ts / post-bug-report.ts), imported via #data; everything else is tRPC (client-architecture-state-and-gates.md §10/§16 R5).",
      },
    ],
    selectors: [
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(globalThis|window|self)$/]:matches([callee.property.name='fetch'], [callee.property.value='fetch'])",
        message: "A client feature never writes `fetch(` — use the data/ fetch fn for the route, or tRPC (client-architecture-state-and-gates.md §10/§16 R5).",
      },
    ],
  },
  {
    id: "dialog-via-composite",
    scope: [CLIENT_FEATURES_TSX],
    homes: [],
    selectors: [
      {
        selector: "ImportDeclaration[source.value='@orb/ui/dialog'] > ImportSpecifier[imported.name='Dialog']",
        message: "A features/** file imports the raw `Dialog` root from @orb/ui/dialog — use FormDialog for a form/prompt or ConfirmDialog for an alert.",
      },
    ],
  },
  {
    id: "no-raw-interactive-intrinsics",
    scope: [CLIENT_FEATURES_TSX],
    homes: [
      {
        path: "packages/client/src/features/app-shell/surfaces/app-shell.tsx",
        why: "the shell scrim is part of the app frame an @orb/ui Button is rendered inside — a borderless pointer-only backdrop painted by shell.css, not a feature affordance",
      },
    ],
    selectors: [
      {
        selector: `JSXOpeningElement[name.type='JSXIdentifier'][name.name=${alternation(["button", "input", "select", "textarea"])}]`,
        message:
          "A raw interactive intrinsic in a feature (D62) — interactivity comes from an @orb/ui primitive (Button, TextField, Select, TextArea, Link), never a hand-rolled <button>/<input>/<select>/<textarea>.",
      },
      {
        // An `<a>` with no href is an anchor TARGET, not a control.
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='a']:has(> JSXAttribute[name.name='href'])",
        message: "A raw `<a href>` in a feature (D62) — use the @orb/ui Link primitive.",
      },
    ],
  },
  {
    id: "no-static-staletime",
    scope: AUTHORED_SRC,
    notNamed: [TEST_FILES],
    homes: [],
    selectors: [
      {
        selector: "Property[computed=false][key.name='staleTime'][value.value='static']",
        message:
          "`staleTime: 'static'` silently ignores invalidateQueries — it would disable the SSE bus→cache seam with a green check. Use Infinity (invalidation still overrides it).",
      },
      {
        selector: "Property[computed=false][key.name='staleTime'] > TemplateLiteral[expressions.length=0][quasis.0.value.cooked='static']",
        message: "`staleTime: 'static'` silently ignores invalidateQueries. Use Infinity.",
      },
    ],
  },
  {
    id: "no-legacy-react-api",
    scope: AUTHORED_SRC,
    homes: [
      {
        path: "packages/ui/src/markdown/dialogue-paragraph.tsx",
        why: "the markdown seal transforms ALREADY-RENDERED children in a `components.p` override running after sanitize, so `Children` is the library's own interface here; there is no data array to map instead",
      },
    ],
    selectors: [
      {
        selector: `ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name=${alternation(["cloneElement", "createRef", "Children", "PureComponent"])}]`,
        message: "A legacy React API (cloneElement, createRef, Children, PureComponent) — use the React 19 function-component equivalent.",
      },
      {
        selector: `ImportDeclaration[source.value='react-dom'] > ImportSpecifier[imported.name=${alternation(["useFormState", "flushSync"])}]`,
        message: "A retired react-dom API (useFormState, flushSync) — use `useActionState`, and let React schedule the flush.",
      },
    ],
  },
];

/** A rule that reports each esquery selector and each unresolved global of one RESTRICTIONS entry. It is the
 *  body of core `no-restricted-syntax` / `no-restricted-globals` with the options closed over, because ESLint
 *  keeps one options list per rule and file, and the core rules are reachable only through an API ESLint
 *  marks deprecated. */
function restrictionRule({ selectors = [], globals = [] }) {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const listeners = Object.fromEntries(selectors.map(({ selector, message }) => [selector, (node) => context.report({ node, message })]));
      if (globals.length > 0) {
        listeners["Program:exit"] = (program) => {
          for (const { identifier } of context.sourceCode.getScope(program).through) {
            const banned = globals.find(({ name }) => name === identifier.name);
            if (banned !== undefined) {
              context.report({ node: identifier, message: banned.message });
            }
          }
        };
      }
      return listeners;
    },
  };
}
const RAW_Z_INDEX_REGEX = /\bz-(?:\d+|\[\d+\])/u;
const Z_CLASS_COMPOSERS = new Set(["cn", "clsx", "cva", "tv"]);
// The nearest carrier is significant; a descendant selector would reclaim nested foreign calls or attributes.
const rawZIndexRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = (node) => {
      if (!RAW_Z_INDEX_REGEX.test(context.sourceCode.getText(node))) {
        return;
      }
      const ancestors = context.sourceCode.getAncestors(node);
      const attribute = ancestors.findLast((ancestor) => ancestor.type === "JSXAttribute");
      const call = ancestors.findLast((ancestor) => ancestor.type === "CallExpression");
      if (
        (attribute?.name.type === "JSXIdentifier" && attribute.name.name === "className") ||
        (call?.callee.type === "Identifier" && Z_CLASS_COMPOSERS.has(call.callee.name))
      ) {
        context.report({ node, message: "Raw z-index in a class carrier; use a governed semantic token from packages/ui/src/tokens/z-scope.ts." });
      }
    };
    return {
      "Literal[value=type(string)]"(node) {
        report(node);
      },
      "TemplateLiteral[expressions.length=0]"(node) {
        report(node);
      },
    };
  },
};
function baseUiIdentifiers(node, sourceCode) {
  const identifiers = new Map();
  const pending = [node];
  while (pending.length > 0) {
    const part = pending.pop();
    if (part === null || part === undefined) {
      continue;
    }
    if (part.type === "Identifier" || part.type === "JSXIdentifier") {
      identifiers.set(part.range.join(":"), part);
    }
    for (const key of sourceCode.visitorKeys[part.type] ?? []) {
      const children = part[key];
      pending.push(...(Array.isArray(children) ? children : [children]));
    }
  }
  return [...identifiers.values()].toSorted((left, right) => left.range[0] - right.range[0]);
}

function baseUiSignatureArity(node) {
  if (node?.type === "TSFunctionType") {
    return node.params.length;
  }
  if (node?.type === "TSUnionType") {
    return node.types.map(baseUiSignatureArity).find((arity) => arity !== undefined);
  }
}

function baseUiBindings(program) {
  return program.body.flatMap((node) =>
    node.type !== "ImportDeclaration" || !node.source.value.startsWith("@base-ui/react/")
      ? []
      : node.specifiers
          .filter((specifier) => specifier.type === "ImportSpecifier")
          .map((specifier) => ({
            local: specifier.local.name,
            exported: specifier.imported.name ?? specifier.imported.value,
            typeOnly: node.importKind === "type" || specifier.importKind === "type",
          })),
  );
}

function baseUiExported(iface, exports, sourceCode) {
  if (iface.parent.type === "ExportNamedDeclaration" || iface.parent.type === "ExportDefaultDeclaration") {
    return true;
  }
  const declared = sourceCode.getDeclaredVariables(iface);
  return exports.some((identifier) => {
    for (let scope = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
      const variable = scope.set.get(identifier.name);
      if (variable !== undefined) {
        return declared.includes(variable);
      }
    }
    return false;
  });
}

function baseUiFoldPart(surface, binding, part, { name, isRoot }) {
  for (const [prop, arity] of Object.entries(part.handlers)) {
    if (!surface.handlers.has(prop)) {
      surface.handlers.set(prop, { arity, owner: `${binding.exported}.${name}` });
    }
  }
  if (!isRoot) {
    return;
  }
  for (const prop of part.props) {
    if (!(prop in part.handlers || surface.rootProps.has(prop))) {
      surface.rootProps.set(prop, `${binding.exported}.${name}`);
    }
  }
}

function baseUiFoldBinding(surface, binding, tags) {
  const component = BASEUI_SURFACE.components[binding.exported];
  if (component === undefined) {
    return;
  }
  surface.sawValue = true;
  for (const [name, part] of Object.entries(component.parts)) {
    const tag = component.namespaced ? `${binding.local}.${name}` : binding.local;
    const isRoot = name === (component.namespaced ? "Root" : binding.exported);
    if (part.kind === "part" && part.state.length > 0) {
      surface.stateful.set(tag, part.state);
    }
    if (isRoot || tags.has(tag)) {
      surface.baseTags.add(tag);
      baseUiFoldPart(surface, binding, part, { name, isRoot });
    }
  }
}

function baseUiForwardedProps(elements, surface, sourceCode) {
  const forwarded = new Set();
  for (const element of elements) {
    if (!surface.baseTags.has(sourceCode.getText(element.name))) {
      continue;
    }
    for (const attribute of element.attributes) {
      if (attribute.type === "JSXAttribute") {
        forwarded.add(sourceCode.getText(attribute.name));
      } else {
        for (const prop of [...surface.handlers.keys(), ...surface.rootProps.keys()]) {
          forwarded.add(prop);
        }
      }
    }
  }
  return forwarded;
}

function baseUiFileSurface(program, elements, sourceCode) {
  const surface = { sawValue: false, handlers: new Map(), rootProps: new Map(), baseTags: new Set(), baseTypes: new Set(), stateful: new Map() };
  const tags = new Set(elements.map((element) => sourceCode.getText(element.name)));
  for (const binding of baseUiBindings(program)) {
    if (binding.typeOnly) {
      surface.baseTypes.add(binding.local);
    } else {
      baseUiFoldBinding(surface, binding, tags);
    }
  }
  return { ...surface, forwarded: baseUiForwardedProps(elements, surface, sourceCode) };
}

function baseUiRespelledMember(member, file, derived, sourceCode) {
  if (member.type !== "TSPropertySignature" || member.computed) {
    return;
  }
  const name = member.key.name ?? member.key.value;
  const type = member.typeAnnotation?.typeAnnotation;
  if (!file.forwarded.has(name) || baseUiIdentifiers(type, sourceCode).some((id) => file.baseTypes.has(id.name) || derived.has(id.name))) {
    return;
  }
  return { name, arity: baseUiSignatureArity(type), handler: file.handlers.get(name), rootOwner: file.rootProps.get(name) };
}

function baseUiJudgeInterface(context, iface, file, { derived, handlersOnly }) {
  for (const member of iface.body.body) {
    const hit = baseUiRespelledMember(member, file, derived, context.sourceCode);
    if (hit === undefined) {
      continue;
    }
    if (handlersOnly && hit.arity !== undefined && hit.handler !== undefined) {
      context.report({
        node: member.key,
        message: `Derive ${hit.name} from ${hit.handler.owner}'s props type; a hand-written handler loses native event details or future capability (${hit.arity}/${hit.handler.arity} arguments).`,
      });
    } else if (!handlersOnly && hit.arity === undefined && iface.id.name.endsWith("Props") && hit.rootOwner !== undefined) {
      context.report({
        node: member.key,
        message: `Derive ${hit.name} from ${hit.rootOwner}'s props type; a deliberate narrower item model requires a reasoned native permission.`,
      });
    }
  }
}

function baseUiDerivesRule(handlersOnly) {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const sourceCode = context.sourceCode;
      const elements = [];
      const interfaces = [];
      const aliases = [];
      const exports = [];
      return {
        "JSXOpeningElement:exit": (node) => elements.push(node),
        "TSInterfaceDeclaration:exit": (node) => interfaces.push(node),
        "TSTypeAliasDeclaration:exit"(node) {
          if (node.parent.type === "Program" || (node.parent.type === "ExportNamedDeclaration" && node.parent.parent.type === "Program")) {
            aliases.push(node);
          }
        },
        "ExportNamedDeclaration:exit"(node) {
          if (node.source === null) {
            exports.push(...node.specifiers.map((specifier) => specifier.local));
          }
        },
        "ExportDefaultDeclaration:exit"(node) {
          if (node.declaration.type === "Identifier") {
            exports.push(node.declaration);
          }
        },
        "Program:exit"(program) {
          const file = baseUiFileSurface(program, elements, sourceCode);
          if (!file.sawValue) {
            return;
          }
          const derived = new Set(
            aliases
              .filter((alias) => baseUiIdentifiers(alias.typeAnnotation, sourceCode).some(({ name }) => file.baseTypes.has(name)))
              .map((alias) => alias.id.name),
          );
          for (const iface of interfaces) {
            if (baseUiExported(iface, exports, sourceCode)) {
              baseUiJudgeInterface(context, iface, file, { derived, handlersOnly });
            }
          }
        },
      };
    },
  };
}

function baseUiStateRead(id) {
  const parent = id.parent;
  return !(
    (parent.type === "MemberExpression" && parent.property === id && !parent.computed) ||
    (parent.type === "Property" && parent.key === id && !parent.computed && !parent.shorthand)
  );
}

function baseUiJudgeState(context, element, keys, local) {
  const attribute = element.attributes.find((attr) => attr.type === "JSXAttribute" && attr.name.name === "className");
  if (keys === undefined || attribute?.value?.type !== "JSXExpressionContainer") {
    return;
  }
  for (const id of baseUiIdentifiers(attribute, context.sourceCode)) {
    if (local.has(id.name) && keys.includes(id.name) && baseUiStateRead(id)) {
      context.report({ node: id, message: `Use Base UI's data attribute for ${id.name}, not a parallel React state read in this part's className.` });
    }
  }
}

const baseUiStateRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const elements = [];
    const local = new Set();
    return {
      "JSXOpeningElement:exit": (node) => elements.push(node),
      "VariableDeclarator:exit"(node) {
        const init = node.init?.type === "ChainExpression" ? node.init.expression : node.init;
        if (init?.type === "CallExpression" && /^use[A-Z]/u.test(sourceCode.getText(init.callee))) {
          for (const { name } of baseUiIdentifiers(node.id, sourceCode)) {
            local.add(name);
          }
        }
      },
      "Program:exit"(program) {
        const file = baseUiFileSurface(program, elements, sourceCode);
        for (const element of elements) {
          baseUiJudgeState(context, element, file.stateful.get(sourceCode.getText(element.name)), local);
        }
      },
    };
  },
};

const CONTEXT_BODIES_RECORD = /^(?:readonly\s+)?(?:Partial<\s*)?Record<\s*string\s*,\s*ReactNode\s*>>?$/u;

function contextProperty(object, name) {
  return object.properties.find(
    (property) => property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === name,
  );
}

function contextLiteral(node) {
  let value = node;
  while (value?.type === "TSAsExpression" || value?.type === "TSSatisfiesExpression" || value?.type === "TSNonNullExpression") {
    value = value.expression;
  }
  if (value?.type === "Literal" && typeof value.value === "string") {
    return value.value;
  }
  if (value?.type === "TemplateLiteral" && value.expressions.length === 0) {
    return value.quasis[0].value.cooked;
  }
}

// Native ESTree erases parentheses; supplied tokens distinguish the call's own delimiter from a wrapper.
function contextDirectArgument(call, argument, sourceCode) {
  const index = call.arguments.indexOf(argument);
  const before = sourceCode.getTokenBefore(argument);
  return index === 0
    ? before === sourceCode.getTokenAfter(call.typeArguments ?? call.callee, { filter: (token) => token.value !== "?." })
    : index > 0 && before.value === ",";
}

function contextBareCall(call, name) {
  return call.callee.type === "Identifier" && call.callee.name === name && call.range[0] === call.callee.range[0];
}

function contextObject(context, object) {
  if (REGISTRY_CONTRACTS_RE.test(context.filename)) {
    return;
  }
  const sourceCode = context.sourceCode;
  const kind = contextProperty(object, "kind");
  const resolved = contextProperty(object, "useResolved");
  if (kind?.kind === "init" && !kind.method && contextLiteral(kind.value) === "tabs" && resolved?.kind === "init") {
    context.report({ node: resolved.key, message: "Mint tabs renderers through defineContextTabs, not a hand-rolled kind/useResolved object." });
  }
  const claims = contextProperty(object, "claims");
  const band = contextProperty(object, "band");
  const parent = object.parent;
  const minted = parent.type === "CallExpression" && contextBareCall(parent, DEFINE_CONTEXT_REGION) && contextDirectArgument(parent, object, sourceCode);
  if (claims?.kind === "init" && band !== undefined && !minted) {
    context.report({ node: claims.key, message: "Mint region claims through defineContextRegion, not a hand-rolled claims/band object." });
  }
}

const contextDefinitionRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      "ObjectExpression:exit": (node) => contextObject(context, node),
      "CallExpression:exit"(node) {
        const argument = node.arguments[0];
        if (!contextBareCall(node, DEFINE_CONTEXT_TABS) || argument?.type !== "ObjectExpression" || !contextDirectArgument(node, argument, sourceCode)) {
          return;
        }
        const tabs = contextProperty(argument, "tabs");
        if (
          tabs?.kind === "init" &&
          !tabs.method &&
          tabs.value.type === "ArrayExpression" &&
          tabs.value.elements.length === 0 &&
          sourceCode.getTokenBefore(tabs.value).value === ":" &&
          contextProperty(argument, "contributors") === undefined
        ) {
          context.report({ node: tabs.key, message: "A tabs:[] context mint needs a contributors registry so it has reachable content." });
        }
      },
      "JSXAttribute[name.name='bodies']:exit"(node) {
        context.report({ node: node.name, message: "Keep tab identity and body together, not a separate bodies map." });
      },
      "TSPropertySignature:exit"(node) {
        if (node.computed || node.key.type !== "Identifier" || node.key.name !== "bodies" || node.typeAnnotation === undefined) {
          return;
        }
        const colon = sourceCode.getFirstToken(node.typeAnnotation);
        if (sourceCode.getTokenAfter(colon).value === "(") {
          return;
        }
        const text = sourceCode.getText(node.typeAnnotation.typeAnnotation).replace(/\s+/gu, " ").trim();
        if (CONTEXT_BODIES_RECORD.test(text)) {
          context.report({ node: node.key, message: "Keep tab identity and body together, not a separate bodies Record." });
        }
      },
    };
  },
};
const registerApiRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const entry = CLIENT_CONTEXT_RESTRICTIONS.find(({ id }) => id === "no-mutating-register-api");
    return {
      ...restrictionRule(entry).create(context),
      "VariableDeclarator[id.type='Identifier'][id.name='register']:exit"(node) {
        if (
          (node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression") &&
          context.sourceCode.getTokenBefore(node.init).value === "="
        ) {
          context.report({ node: node.id, message: "Export definition values for door assembly, not a mutating register API." });
        }
      },
    };
  },
};

const PARALLEL_MAP_TUPLE_HOMES = ["/state/shell-store.ts", "/state/section-ids.ts", "/state/config-group-ids.ts", "/state/modal-slot-ids.ts"];

function parallelMapDoor(path) {
  return path.endsWith("/client/src/main.tsx") || path.includes("/client/src/compose/");
}

function parallelMapHome(path, slot) {
  return PARALLEL_MAP_TUPLE_HOMES.some((home) => path.endsWith(home)) || parallelMapDoor(path) || isDefinitionHome(path, slot);
}

function parallelMapField(object, name) {
  const property = contextProperty(object, name);
  const value = property?.kind === "init" && !property.method ? contextLiteral(property.value) : undefined;
  return value === undefined ? undefined : { value, node: property.value };
}

function parallelMapArrayAnchor(array, ids, sourceCode) {
  const objects =
    array.elements.length > 0 &&
    array.elements.every((element) => element?.type === "ObjectExpression" && ["[", ","].includes(sourceCode.getTokenBefore(element).value));
  const entries = array.elements.map((element) => (objects ? parallelMapField(element, "id") : { value: contextLiteral(element), node: element }));
  if (entries.some((entry) => entry === undefined || !ids.includes(entry.value))) {
    return;
  }
  return new Set(entries.map(({ value }) => value)).size >= 2 ? entries[0]?.node : undefined;
}

const parallelMapRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const path = relative(context.cwd, context.filename).replaceAll("\\", "/");
    const report = (node, shape) => context.report({ node, message: `${shape} is a parallel registry map; derive it from the registry instead.` });
    return {
      "ObjectExpression:exit"(node) {
        const properties = node.properties.filter((property) => property.type === "Property" && property.kind === "init" && !property.method);
        for (const { ids, slot, name } of PARALLEL_MAP_VOCABULARIES) {
          if (
            !parallelMapHome(path, slot) &&
            properties.length >= 2 &&
            properties.every((property) => !property.computed && property.key.type === "Identifier" && ids.includes(property.key.name))
          ) {
            report(properties[0].key, `A per-id ${name} object literal`);
          }
        }
      },
      "ArrayExpression:exit"(node) {
        for (const { ids, slot, name } of PARALLEL_MAP_VOCABULARIES) {
          if (!parallelMapHome(path, slot)) {
            const anchor = parallelMapArrayAnchor(node, ids, sourceCode);
            if (anchor !== undefined) {
              report(anchor, `An array covering multiple ${name}s`);
            }
          }
        }
        if (parallelMapDoor(path) || path.endsWith("/state/assemble-chrome.ts") || isDefinitionHome(path, DEFINITION_SLOTS.chrome)) {
          return;
        }
        const zones = node.elements.map((element) =>
          element?.type === "ObjectExpression" && ["[", ","].includes(sourceCode.getTokenBefore(element).value) ? parallelMapField(element, "zone") : undefined,
        );
        if (zones.length >= 2 && zones.every((zone) => zone !== undefined && CHROME_ZONES.includes(zone.value))) {
          report(zones[0].node, "A hand-maintained chrome list");
        }
      },
      "VariableDeclarator:exit"(node) {
        const statement = node.parent;
        const parent = statement.parent.type === "ExportNamedDeclaration" ? statement.parent.parent : statement.parent;
        const annotation = node.id.typeAnnotation;
        if (parent.type !== "Program" || annotation?.typeAnnotation.type !== "TSTypeReference") {
          return;
        }
        if (sourceCode.getTokenAfter(sourceCode.getFirstToken(annotation)).value === "(") {
          return;
        }
        const text = sourceCode.getText(annotation.typeAnnotation);
        for (const { slot, name } of PARALLEL_MAP_VOCABULARIES) {
          if (!parallelMapHome(path, slot) && new RegExp(`\\bRecord<\\s*${name}\\b`, "u").test(text)) {
            report(node.id, `A module-level Record<${name}, …> value`);
          }
        }
      },
    };
  },
};

const typedTestIdRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      "JSXAttribute[name.type='JSXIdentifier'][name.name='data-testid']"(node) {
        const value = node.value;
        const literal = value?.type === "Literal" && typeof value.value === "string";
        if (literal || (value?.type === "JSXExpressionContainer" && contextLiteral(value.expression) !== undefined)) {
          context.report({ node: node.name, message: 'Freeform data-testid string; use the typed registry via testId("key").' });
        }
      },
    };
  },
};

const VERTICAL_SCROLL_UTILITIES = new Set(["overflow-auto", "overflow-scroll", "overflow-y-auto", "overflow-y-scroll"]);
const POSITION_UTILITIES = new Set(["relative", "absolute", "fixed", "sticky"]);
const scrollContainerRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = (node) => {
      const parts = readTailwindClassTokens(context.sourceCode.getText(node));
      const scroll = parts.find(({ utility }) => VERTICAL_SCROLL_UTILITIES.has(utility));
      if (scroll !== undefined && !parts.some(({ utility }) => POSITION_UTILITIES.has(utility))) {
        context.report({
          loc: {
            start: context.sourceCode.getLocFromIndex(node.range[0] + scroll.offset),
            end: context.sourceCode.getLocFromIndex(node.range[0] + scroll.offset + scroll.token.length),
          },
          message: "A vertical scroll literal must supply relative, absolute, fixed or sticky in the SAME literal.",
        });
      }
    };
    return { "Literal[value=type(string)]": report, TemplateElement: report };
  },
};

// Unsized APIs explicitly give geometry to callers; VirtualList requires a bounded caller height.
const UNSIZED_UI_MODULES = new Set([
  "@orb/ui/layout",
  "@orb/ui/skeleton",
  "@orb/ui/theme-scope",
  "@orb/ui/crossfade-image",
  "@orb/ui/background-video",
  "@orb/ui/virtual-list",
]);
const SEALED_SIZE_UTILITY = /^(?<axis>h|min-h|size|w)-(?<value>[a-z0-9./-]+)$/u;
const LAYOUT_SIZE_VALUE = /^(?:full|fit|min|max|screen|[sld]v[hw]|\d+\/\d+)$/u;
const SEALED_SIZE_VALUE = /^(?:\d+(?:\.\d+)?|[a-z][a-z0-9-]*)$/u;
function isSealedSizeUtility(utility) {
  const match = SEALED_SIZE_UTILITY.exec(utility);
  return (
    match !== null &&
    !LAYOUT_SIZE_VALUE.test(match.groups.value) &&
    !(match.groups.axis === "min-h" && match.groups.value === "0") &&
    SEALED_SIZE_VALUE.test(match.groups.value)
  );
}
function uiSizeLiteral(attribute, sourceCode) {
  const literal = attribute?.value?.type === "JSXExpressionContainer" ? attribute.value.expression : attribute?.value;
  if (!((literal?.type === "Literal" && typeof literal.value === "string") || (literal?.type === "TemplateLiteral" && literal.expressions.length === 0))) {
    return;
  }
  // Native ESTree drops parentheses; the original carrier accepts only an unwrapped literal.
  if (attribute.value.type === "JSXExpressionContainer" && sourceCode.getTokenAfter(sourceCode.getFirstToken(attribute.value)).range[0] !== literal.range[0]) {
    return;
  }
  return literal;
}
const uiSizeRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const imports = new Set();
    return {
      Program: (program) => {
        for (const node of program.body) {
          if (node.type !== "ImportDeclaration" || !/^@orb\/ui(?:\/|$)/u.test(node.source.value) || UNSIZED_UI_MODULES.has(node.source.value)) {
            continue;
          }
          for (const specifier of node.specifiers) {
            if (specifier.type === "ImportSpecifier") {
              imports.add(specifier.local.name);
            }
          }
        }
      },
      "JSXOpeningElement:exit"(node) {
        if (node.name.type !== "JSXIdentifier" || !imports.has(node.name.name)) {
          return;
        }
        const attribute = node.attributes.find((part) => part.type === "JSXAttribute" && part.name.name === "className");
        const literal = uiSizeLiteral(attribute, context.sourceCode);
        if (literal === undefined) {
          return;
        }
        for (const part of readTailwindClassTokens(context.sourceCode.getText(literal))) {
          if (!isSealedSizeUtility(part.utility)) {
            continue;
          }
          context.report({
            loc: {
              start: context.sourceCode.getLocFromIndex(literal.range[0] + part.offset),
              end: context.sourceCode.getLocFromIndex(literal.range[0] + part.offset + part.token.length),
            },
            message: "Sizes come from primitive variants; a call-site sizing utility overrides the sealed box.",
          });
        }
      },
    };
  },
};

const restrictionPlugin = {
  rules: {
    ...Object.fromEntries(RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)])),
    "no-raw-z-index": rawZIndexRule,
    "baseui-derives-not-respells": baseUiDerivesRule(false),
    "baseui-derives-not-respells-health": baseUiDerivesRule(true),
    "baseui-state-data-attributes": baseUiStateRule,
    "context-definition-shape": contextDefinitionRule,
    "no-mutating-register-api": registerApiRule,
    [CLIENT_MAP_NATIVE_RULE.slice("orb/".length)]: parallelMapRule,
    "testid-typed-only": typedTestIdRule,
    "scroll-container-positioned": scrollContainerRule,
    "ui-size-via-variant": uiSizeRule,
  },
};
const RESTRICTION_BLOCKS = RESTRICTIONS.map(({ id, scope, notNamed = [], notUnder = [], homes, deferred = [] }) => {
  const ignores = [...notNamed, ...notUnder, ...homes.map(({ path }) => path), ...deferred.map(({ path }) => path)];
  return {
    files: scope,
    // A flat-config `ignores` array must not be empty.
    ...(ignores.length === 0 ? {} : { ignores }),
    plugins: { orb: restrictionPlugin },
    ...(BASEUI_RESTRICTIONS.some((entry) => entry.id === id)
      ? { settings: { "orb/baseui-surface": BASEUI_SURFACE, "orb/baseui-input-revision": BASEUI_INPUT_REVISION } }
      : {}),
    ...(CLIENT_CONTEXT_RESTRICTIONS.some((entry) => entry.id === id) ? { settings: CONTEXT_NATIVE_SETTINGS } : {}),
    ...(CLIENT_MAP_RESTRICTIONS.some((entry) => entry.id === id) ? { settings: CLIENT_MAP_NATIVE_SETTINGS } : {}),
    ...(CLIENT_LEXICAL_RESTRICTIONS.some((entry) => entry.id === id) ? { settings: CLIENT_LEXICAL_NATIVE_SETTINGS } : {}),
    rules: { [`orb/${id}`]: "error" },
  };
});

// react-x: React 19 retired these APIs. Its rules take no options. `no-class-component` already passes an error
// boundary (a class with `getDerivedStateFromError` / `componentDidCatch`), which has no function equivalent.
const REACT_X_BLOCKS = [
  {
    files: AUTHORED_SRC,
    plugins: { "react-x": reactX },
    rules: {
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
    },
  },
  {
    files: AUTHORED_SRC,
    ignores: ["packages/ui/src/markdown/dialogue-paragraph.tsx"],
    plugins: { "react-x": reactX },
    rules: { "react-x/no-children-to-array": "error" },
  },
];

const STANDARD_CONFIG = tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "reports/**",
      // Mutation sandboxes contain rewritten source and generated runner setup, never authored inputs.
      ".stryker-tmp/**",
      // Local tool caches are derived scratch artifacts, never authored inputs. THE `**/` PREFIX IS
      // LOAD-BEARING and was missing until #2213: a flat-config `ignores` glob is anchored at the CONFIG
      // DIRECTORY, so bare `.cache/**` covered the root cache and missed every NESTED one — while the
      // identical-looking `.gitignore` row (`.cache/`) matches at ANY depth, because gitignore patterns and
      // flat-config globs do not share anchoring rules. The two disagreed silently, and a pattern
      // transliterated from one into the other is the shape to distrust. `playwright/.cache` (the
      // Playwright CT build bundles) was therefore invisible to git and LINTED by eslint, supplying 106 of
      // the 117 errors in this stage's first whole-repo verdict after #2211 restored its discovery.
      // `.stryker-tmp/**` above carries the same missing prefix; it is root-only on today's tree, so it has
      // no nested instance to control in either direction and is deliberately left alone.
      "**/.cache/**",
      // Agent worktrees (#2281). `.gitignore` has carried `.claude/worktrees/` all along and it protects
      // NOTHING here — flat config reads no VCS ignore file at all, which is why biome (fenced twice over:
      // `vcs.useIgnoreFile: true` PLUS an explicit `"!.claude"`) never showed the symptom and this went
      // unnoticed in the sibling tool. Discovery is `eslint.lintFiles(["."])` (ops/eslint-discovery.ts:49),
      // ESLint's own walk of the repo root, so every live lane was WALKED: 42 worktrees carrying 316,809
      // `.ts`/`.tsx` on disk against 7,574 authored (2026-09-13). Almost none of that is lintable — a
      // flat-config `files:` glob is anchored at the config DIRECTORY, so
      // `.claude/worktrees/<id>/tooling/src/x.ts` matches no surface at all — but the default-linted
      // extensions still land: of the 15,994 files ESLint ADMITTED on main, **7,896 were other lanes'
      // worktrees**, about half the population, every one of them a file no rule could usefully judge.
      // THE REASON IS CORRECTNESS, NOT COST. Whole-run timings were load-confounded and did not reproduce;
      // discovery itself changes materially with the live worktree count. What the fence removes is the
      // stage's inability to return a VERDICT — a lane swept mid-run, which is routine, turns an enumerated path into ENOENT and
      // the stage exits 2, the tool-error class, never a verdict (reproduced live on
      // `agent-afe8e5ce74da79230`). That is exactly the concurrent-lifecycle phantom the retired `**/__g_*` entry was
      // reasoned through for, never carried across to the larger, more frequently mutated case.
      // `**/`-PREFIXED per the #2213 note above: a worktree CONTAINS a `.claude/` of its own, so unlike
      // `.stryker-tmp/**` a nested instance is structurally possible and root anchoring would miss it.
      "**/.claude/worktrees/**",
      // The SillyTavern parity rig's captured runtime (#2282) — vendored third-party source the repository
      // deliberately does not track (`.gitignore:121`) — and the THIRD instance of this class, after
      // `playwright/.cache` (#2213) and the worktrees above. Unlike those two, these files DO get rules,
      // because they sit under `scripts/`, a real lint surface. COUNT THE ADMITTED POPULATION, NOT THE DISK:
      // 17,053 `.js`/`.ts` live under it, but ~16.7k of those are the runtime's OWN `node_modules` and were
      // already fenced — ESLint admitted **353** of them (measured on main, 2026-09-13). Those 353 were the
      // entire content of this stage's exit 1: four `Unused eslint-disable directive` errors — SillyTavern's own
      // directives, written for SillyTavern's config, reported unused under ours. There is nothing to fix in
      // them; the defect is that we lint them at all.
      // ROOT-ANCHORED, NOT `**/`-prefixed, and the asymmetry with the row above is deliberate: this is one
      // repo-relative path with exactly one home, `.gitignore` anchors its own row the same way (leading
      // `/`), and the only structurally possible nesting is inside a worktree — which the row above already
      // covers. SCOPED TO `sillytavern-runtime/` ALONE, because the rig's own tracked files sit at the
      // directory's top level and are not ours to fence. They are all `.ts` since work item 0036 converted
      // `write-v2-png.cjs`, and the `.ts` ones match no `files:` surface (the nested-scripts block ignores the
      // browser-world rig), but a `.js`/`.cjs` script added there would be admitted, and the broader spelling
      // `scripts/probes/st-goldens/**` would swallow it. The three sibling generated dirs
      // (`fixtures/`, `output/`, `orbweaver-output/`) hold ZERO lintable files (measured 2026-09-13), so a
      // selector naming them would be precisely the dead grant `eslint-grant-liveness` exists to refuse.
      "scripts/probes/st-goldens/sillytavern-runtime/**",
      "packages/ui/src/styles/theme.css",
    ],
  },
  {
    // Restriction-only inputs must not acquire unrelated directive diagnostics.
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
  ...MAINTAINED_GLOBAL_SURFACES.map((surface) => ({ ...surface, linterOptions: { reportUnusedDisableDirectives: "error" } })),
  {
    files: FORM_SYNTAX_SRC,
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" } },
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
    // exported-API surface (the factories/seals), so their doc comments get the same TSDoc
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
    // The TSDoc doc-comment gates on the typed API surface — both hard gates. `no-deprecated`
    // (type-aware, rides the parser block above) rejects any USE of a `@deprecated` symbol. `tsdoc/syntax`
    // (eslint-plugin-tsdoc — the official parser) rejects malformed doc comments + non-standard tags: a
    // `{...}` prose token wants backticks (TSDoc reads `{` as an inline-tag opener), a bare `@orb/...`
    // package name wants `{@link}`. The tag rules: .claude/rules/comments.md §TSDoc.
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
    // thenability — now return `AwaitableBatchStmt<T>` (`@orb/db/query`: `BatchStmt & PromiseLike<T>`), so the
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
      ...REAL_TYPE_RULES,
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
    },
  },
  {
    files: [LEGACY_TEST_LINT_GLOB],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
  },
  {
    // Type-aware parser for the root-program-owned half of the tooling + test surface (#459/#473).
    // `tooling/src` resolves upward to `tooling/tsconfig.json` (which `include`s `src`); the node test
    // dirs resolve to the ROOT `tsconfig.json` (which `include`s `tests`). All real programs, so
    // `projectService` finds an owner for every file here.
    files: PROJECT_SERVICE_SURFACE,
    ignores: [LEGACY_TEST_LINT_GLOB],
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
    ignores: [LEGACY_TEST_LINT_GLOB],
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
    // Root, package-root, and direct scripts/ TypeScript files are Node-executed build/config tools.
    // Their structural population comes from the same world classifier used by compiler routing;
    // declarations are ambient contracts, so this block excludes them rather than treating them as tools.
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
    // THE NESTED `scripts/` TREES (#2290) — the COVERAGE half of the block above, landed 2026-09-13.
    //
    // `NODE_TOOL_SURFACE_GLOBS` is `scripts/*.{ts,mts,cts}`: DIRECT children only. So 42 of the 44 tracked
    // `.ts` files under `scripts/` — codemods 10, probes 30, research 2 — matched NO `files:` glob at all,
    // and only the no-`files` global block reached them: zero substantive rules. This is a COVERAGE hole
    // and NOT a fence question, which is the distinction the two are easiest to confuse: #2281/#2282 fence
    // directories OUT of discovery because they are untracked vendor or transient trees; these are
    // authored, tracked, first-party TypeScript that nobody linted. `scripts/` is treated as first-party
    // everywhere else — `scripts/depcruise.ts` hands `HELPER_WORLD_DIRS` to dependency-cruiser and
    // `@scripts` is a named population root in the gate runtime's own vocabulary.
    //
    // IT IS A SEPARATE BLOCK RATHER THAN A WIDER `NODE_TOOL_SURFACE_GLOBS`, deliberately: that constant is
    // the ESLint spelling of `isNodeToolSource`/`NODE_TOOL_RE` in `floor/compiler/project-worlds.ts`, which is a
    // statement about COMPILER routing ("root, package-root, and direct scripts/ tools"). Widening the
    // glob alone would silently desync the two halves of one identity; widening both would change compiler
    // routing to close a lint hole. The surface this block names is a lint surface and says so.
    //
    // MEASURED BEFORE LANDING, the way the async-safety family was (591 files at #459, 1,276 more at #473
    // — see the SAFETY_SURFACE header): the full `ASYNC_SAFETY_RULES` set over this population reported
    // **3 findings**, all `restrict-template-expressions` on an `unknown` interpolation, all FIXED in the
    // landing lane with none suppressed. A surface that arrives red is a surface someone disables, so the
    // count is stated rather than discovered. `require-await` was measured separately (1 more finding, an
    // async generator) and is NOT in this set — same rule/surface mismatch, and the same receipt, as
    // `tests/**` above.
    //
    // `scripts/probes/st-goldens/**` IS EXCLUDED, and not as a convenience: it is BROWSER world
    // (`BROWSER_SURFACE_DIRS`), the root `tsconfig.json` EXCLUDES it, and this block's parser is that
    // program — so a file from there would parse-error rather than lint. Its own surface is its own row.
    // NO `**/*.d.{ts,mts,cts}` ignore, unlike the block above — and that is a MEASUREMENT, not an
    // oversight. These trees carry ZERO declaration files (`git ls-files 'scripts/**/*.d.ts'` → 0), and
    // `eslint-grant-liveness` reds a selector with zero members in its native scope: copying the sibling's
    // ignore shipped a dead one and the gate caught it in this lane's own before/after drive. The
    // st-goldens ignore stays because it has 5 members.
    files: SCRIPTS_NESTED_SURFACE,
    ignores: ["scripts/probes/st-goldens/**"],
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
    ignores: [LEGACY_TEST_LINT_GLOB],
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
    // The TSDoc doc-comment gate over the tooling surface and every test tree (#472, the first family of the
    // deferred wave — see the SAFETY_SURFACE header for the four fix classes). Same rule the typed-API
    // packages carry above: tooling's file headers ARE its per-domain law (the per-domain prose was
    // gutted), so a malformed doc comment there is exactly as load-bearing as one in `packages/server`.
    // Purely syntactic (the TSDoc parser), so it needs no program — but these files have one anyway.
    files: [...SAFETY_SURFACE, ...CT_SURFACE],
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
      // "warn" HERE so a NEW seal still surfaces — and with `--max-warnings 0` (every lint run passes it —
      // the verify `eslint` op's CHILD_FLAGS) a
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
    //
    // NO DOC CARRIES THIS RULE, and the sentence that claimed one is gone (#1331). It cited a root-level
    // agent-navigability doc added by `f075271678` and deleted two days later by `31425ede14` (2026-07-09);
    // the pointer outlived it by two months and was the LAST reference to that filename in the repo,
    // which is why the row's done-check bans the spelling outright — naming it again, even to explain it,
    // re-creates the dangling reference. The provenance is the two SHAs. The live authority for "every
    // interactive element carries an accessible name" is THIS block plus the `surface-a11y-focus` gate.
    //
    // TRIPWIRE — why the `...strict` spread below is allowed when the file's own rule is "every rule
    // listed by name, never a `...recommended` bundle". Same terms react-hooks got, and no looser: this
    // is an audited CORRECTNESS bundle (33 rules at 6.10.2; `recommended` carries 34 and `strict` adds no
    // rule name it lacks — the two differ by severity and options), and the "a plugin upgrade can't
    // silently add a gate" property is held by an EXACT catalog pin (`eslint-plugin-jsx-a11y: 6.10.2` in
    // pnpm-workspace.yaml), not by enumeration. Every lint run passes `--max-warnings 0` (the verify
    // `eslint` op's CHILD_FLAGS, which `pnpm lint:eslint` runs), so a rule a 6.x
    // MINOR added to `strict` would land as a hard `pnpm check` gate with no config change and no review.
    // THE PIN IS WHAT MAKES THE ACK HONEST: loosen it back to `^6.10.2` and this spread becomes the
    // unguarded door again — enumerate the 33 rules by name instead if the pin ever has to float.
    //
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
          // #1633: `input`, not `button`, and the difference is load-bearing. Base UI's `Switch.Root`
          // renders a `<button role="switch">` plus a hidden checkbox input, so BOTH spellings are a
          // semantic proxy — the same proxy `Checkbox` has taken since #579 (Base UI's Checkbox is also a
          // button). `button` made `control-has-associated-label` RED at every `<Switch>` inside a
          // `<Field>`, because the rule resolves the tag through THIS map before testing `ignoreElements`
          // (source: eslint-plugin-jsx-a11y 6.10.2 `lib/rules/control-has-associated-label.js` —
          // `var tag = elementType(node.openingElement)` then `newIgnoreElements.has(tag)`), and the rule
          // is structurally blind to the render-time `FieldRootContext` `aria-labelledby` injection that
          // actually names the control. `input` is in that rule's ignore list, so the six call sites no
          // longer owe a dead `aria-label`. Measured alternatives, all rejected with planted controls:
          // DROPPING this entry also silences `role-supports-aria-props` and
          // `no-interactive-element-to-noninteractive-role` on `<Switch>`; adding `"button"` to
          // `ignoreElements` blinds the rule to an unlabelled `<Toggle>`, `<Button>`, `<IconButton>` and
          // native `<button>` — which is the coverage this rule is turned on for.
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
          ignoreElements: ["audio", "canvas", "embed", "input", "textarea", "tr", "video"],
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
    // type) — turned ON at the wave (2026-07-03).
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
    // The st-goldens rig's own tracked scripts are browser-world TypeScript the root program does not own, so they
    // match no parser block above. A syntactic parse is all the decorator ban below needs from them.
    files: ["scripts/probes/st-goldens/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: "module" },
    },
  },
  ...syntaxBlocks(FORM_SYNTAX_SRC, []),
  ...syntaxBlocks(AUTHORED_SRC, AUTHORED_SYNTAX),
  ...syntaxBlocks(rootSources("@server"), SHIPPED_SYNTAX),
  ...syntaxBlocks(ENTRY_WIRING_GLOBS, [...SHIPPED_SYNTAX, ...ENTRY_LOADER_SYNTAX], ENTRY_DRIVER_GLOBS),
  ...syntaxBlocks(QUERY_FREE_BOOT_GLOBS, [...SHIPPED_SYNTAX, ...ENTRY_LOADER_SYNTAX]),
  ...[{ files: ENTRY_WIRING_GLOBS, ignores: ENTRY_DRIVER_GLOBS }, { files: QUERY_FREE_BOOT_GLOBS }].map((scope) => ({
    ...scope,
    rules: {
      "no-restricted-globals": [
        "error",
        ...["require", "module", "global", "globalThis"].map((name) => ({
          name,
          message: "Entry wiring cannot capture an ambient host loader or global object.",
        })),
      ],
      "no-new-func": "error",
    },
  })),
  ...syntaxBlocks([UI_SRC], [...SHIPPED_SYNTAX, ...BROWSER_SYNTAX]),
  ...syntaxBlocks([CLIENT_SRC], [...CLIENT_SYNTAX, ...BROWSER_SYNTAX]),
  ...RESTRICTION_BLOCKS,
  ...REACT_X_BLOCKS,
  ...syntaxBlocks([CLIENT_SRC], [NO_STORE_STATICS, ...CLIENT_SYNTAX, ...BROWSER_SYNTAX], ["packages/client/src/state/**"]),
  ...syntaxBlocks(
    [CLIENT_SRC],
    [NO_STORE_STATICS, NO_CLASSNAME_ON_INTRINSIC, NO_STYLE_ON_INTRINSIC, ...CLIENT_SYNTAX, ...BROWSER_SYNTAX],
    ["packages/client/src/features/app-shell/**", "packages/client/src/state/**", "packages/client/src/components/weave-glyph.tsx"],
  ),
  ...syntaxBlocks(
    [MUTATION_HOME],
    [NO_STORE_STATICS, NO_CLASSNAME_ON_INTRINSIC, NO_STYLE_ON_INTRINSIC, ...CLIENT_SYNTAX, ...BROWSER_SYNTAX, queryImport(["useInfiniteQuery"])],
  ),
  ...syntaxBlocks(
    [COLLECTION_HOME],
    [NO_STORE_STATICS, NO_CLASSNAME_ON_INTRINSIC, NO_STYLE_ON_INTRINSIC, ...CLIENT_SYNTAX, ...BROWSER_SYNTAX, queryImport(["useMutation"])],
  ),
  ...syntaxBlocks(
    [ROUTES_SRC],
    [NO_STORE_STATICS, NO_CLASSNAME_ON_INTRINSIC, NO_STYLE_ON_INTRINSIC, ...CLIENT_SYNTAX, ...BROWSER_SYNTAX, routeImports()],
    [APP_ROOT, ...AUTH_ROUTES],
  ),
  // The app root assembles registries before the shell exists; auth runs before any authenticated registry.
  ...syntaxBlocks(
    [APP_ROOT],
    [NO_STORE_STATICS, NO_CLASSNAME_ON_INTRINSIC, NO_STYLE_ON_INTRINSIC, ...CLIENT_SYNTAX, ...BROWSER_SYNTAX, routeImports(["app-shell", "chat", "persona"])],
  ),
  ...syntaxBlocks(AUTH_ROUTES, [
    NO_STORE_STATICS,
    NO_CLASSNAME_ON_INTRINSIC,
    NO_STYLE_ON_INTRINSIC,
    ...CLIENT_SYNTAX,
    ...BROWSER_SYNTAX,
    routeImports(["auth"]),
  ]),
  ...maintainedRulePacks(),
);

// Size scopes stay outside generated-source exclusions: token output and tooling/test generators still have caps.
const SIZE_IGNORED_DIRS = ["**/node_modules/**", "**/dist/**", "**/__screenshots__/**"];
const CLIENT_SIZE_IGNORES = [...SIZE_IGNORED_DIRS, "**/*.{test,spec,gen}.{ts,tsx}", "**/*.d.ts"];
const UI_SIZE_IGNORES = [...CLIENT_SIZE_IGNORES, "**/*.{ct,fixtures}.{ts,tsx}"];
const FILE_SIZE_BLOCKS = [
  { files: [CLIENT_SRC], ignores: CLIENT_SIZE_IGNORES, rules: { "max-lines": ["error", { max: 450, skipBlankLines: false, skipComments: false }] } },
  {
    files: ["packages/client/src/routes/**/*.{ts,tsx}"],
    ignores: CLIENT_SIZE_IGNORES,
    rules: { "max-lines": ["error", { max: 500, skipBlankLines: false, skipComments: false }] },
  },
  { files: [UI_SRC], ignores: UI_SIZE_IGNORES, rules: { "max-lines": ["error", { max: 450, skipBlankLines: false, skipComments: false }] } },
  {
    files: ["tests/**/*.{ts,tsx}", "tests/support/node/**/*.mjs"],
    ignores: ["tests/legacy/**"],
    rules: { "max-lines": ["error", { max: 1000, skipBlankLines: false, skipComments: false }] },
  },
  {
    files: ["tooling/src/**/*.{ts,tsx}"],
    ignores: ["tooling/src/verify/gates/**"],
    rules: { "max-lines": ["error", { max: 450, skipBlankLines: false, skipComments: false }] },
  },
  {
    files: ["tooling/src/**/cli.ts"],
    ignores: ["tooling/src/verify/gates/**"],
    rules: { "max-lines": ["error", { max: 200, skipBlankLines: false, skipComments: false }] },
  },
];

// Read-only outputs retain their other-rule exclusion while the migrated restrictions still judge their source.
const ORDINARY_CONFIG = [
  {
    files: SOURCE_TYPE_SUPPRESSION_GLOBS,
    ignores: SOURCE_TYPE_SUPPRESSION_EXCLUSIONS,
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" } },
  },
  ...FILE_SIZE_BLOCKS,
  ...STANDARD_CONFIG.map((block) =>
    block.rules === undefined ||
    [
      ...INFRA_AUTH_RESTRICTIONS,
      ...CLASS_RESTRICTIONS,
      ...ROLE_DATA_RESTRICTIONS,
      ...TURN_IDENTITY_RESTRICTIONS,
      ...DETERMINISM_RESTRICTIONS,
      ...CLASS_TOKEN_RESTRICTIONS,
      ...Z_INDEX_RESTRICTIONS,
      ...BASEUI_RESTRICTIONS,
      ...CLIENT_CONTEXT_RESTRICTIONS,
      ...CLIENT_MAP_RESTRICTIONS,
      ...CLIENT_LEXICAL_RESTRICTIONS,
    ].some(({ id }) => Object.hasOwn(block.rules, `orb/${id}`))
      ? block
      : { ...block, ignores: [...(block.ignores ?? []), ...GENERATED_SOURCE] },
  ),
  ...[...syntaxBlocks(FORM_SYNTAX_SRC, []), ...syntaxBlocks([CLIENT_SRC, UI_SRC], BROWSER_SYNTAX)].map((block) => ({
    ...block,
    files: block.files.flatMap((file) => GENERATED_SOURCE.map((generated) => [...(Array.isArray(file) ? file : [file]), generated])),
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
  })),
];

export default ORDINARY_CONFIG;

// HARD syntax runs separately so its no-inline-config policy cannot invalidate ordinary native exceptions.
export const hardConfig = [
  ...ORDINARY_CONFIG.filter(
    (block) => block.rules === undefined || block.files === undefined || Object.keys(block).some((key) => !["files", "ignores", "name", "rules"].includes(key)),
  ).map((block) => ({
    ...block,
    ...(block.rules === undefined ? {} : { rules: {} }),
    ...(block.languageOptions === undefined
      ? {}
      : {
          languageOptions: {
            ...block.languageOptions,
            parserOptions: { ...block.languageOptions.parserOptions, project: false, projectService: false, programs: null },
          },
        }),
  })),
  {
    files: rootSources("@server", "@inference"),
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: String.raw`:matches(Literal[value=type(string)][raw=/corsproxy\.io/], TemplateElement[value.raw=/corsproxy\.io/])`,
          message: "D61 B5a: the rejected third-party CORS proxy cannot be spelled in server or inference literals; use the guarded network owner directly.",
        },
      ],
    },
  },
  { files: [UI_SRC], rules: { "orb/baseui-derives-not-respells-health": "error" } },
  {
    files: SOURCE_TYPE_SUPPRESSION_GLOBS,
    ignores: SOURCE_TYPE_SUPPRESSION_EXCLUSIONS,
    plugins: { "@typescript-eslint": tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    rules: {
      [SOURCE_TYPE_SUPPRESSION_RULE]: ["error", { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false }],
    },
  },
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off", reportUnusedInlineConfigs: "off" } },
];

// ── MAINTAINED RULE PACKS: the plugins that replace custom gates ───────────────────────────────────────
// Six plugins, each configured on the population it judges. They are SPREAD from the plugin's own
// recommended set, which the "list every rule by name" doctrine at the top of this file allows only on the
// react-hooks/jsx-a11y terms: the catalog entries are EXACT pins (pnpm-workspace.yaml), so an upgrade cannot
// add a gate unreviewed. A rule that is OFF below says why; a rule a plugin does not recommend is not on.
// The section is a hoisted function at the end of the file so the blocks above stay untouched.
function maintainedRulePacks() {
  /** A plugin config's rules whose id starts with `prefix`, all at `error` with their recommended options.
   *  The prefix drops the core ESLint rules some recommended sets also switch on. */
  const packRules = (config, prefix) =>
    Object.fromEntries(
      Object.entries(config.rules)
        .filter(([id]) => id.startsWith(prefix))
        .map(([id, setting]) => [id, Array.isArray(setting) ? ["error", ...setting.slice(1)] : "error"]),
    );
  // Playwright runs the component (`*.ct.tsx`) and e2e (`*.spec.ts`) suffixes; Vitest runs every other file
  // under tests/. Both lists derive from the test-kind registry, so a new suffix lands in one of them.
  const playwrightTests = TEST_KIND_DEFINITIONS.filter(({ family }) => family === "component" || family === "e2e").map(({ suffix }) => `tests/**/*${suffix}`);
  const vitestTests = ["tests/**/*.{ts,tsx}"];

  const globalRules = {
    ...packRules(eslintComments.configs.recommended, "@eslint-community/eslint-comments/"),
    "@eslint-community/eslint-comments/require-description": "error",
    ...packRules(regexp.configs["flat/recommended"], "regexp/"),
    // Spelling and unused-capture suggestions are not semantic correctness policies.
    "regexp/prefer-w": "off",
    "regexp/use-ignore-case": "off",
    "regexp/no-unused-capturing-group": "off",
  };

  return [
    {
      // Playwright. Rules Biome already enforces (biome.json: noPlaywright*, noConditionalExpect,
      // noFocusedTests, usePlaywrightValidDescribeCallback) stay off here: a second copy of an enabled
      // native rule is a duplicate report (GATE-AUTHORING §10).
      files: playwrightTests,
      plugins: { playwright },
      rules: {
        ...packRules(playwright.configs["flat/recommended"], "playwright/"),
        "playwright/no-element-handle": "off",
        "playwright/no-eval": "off",
        "playwright/no-force-option": "off",
        "playwright/missing-playwright-await": "off",
        "playwright/no-networkidle": "off",
        "playwright/no-page-pause": "off",
        "playwright/no-useless-await": "off",
        "playwright/no-wait-for-navigation": "off",
        "playwright/no-wait-for-selector": "off",
        "playwright/no-wait-for-timeout": "off",
        "playwright/valid-describe-callback": "off",
        "playwright/no-conditional-expect": "off",
        "playwright/no-focused-test": "off",
        // Noise for us: a component test narrows a nullable `boundingBox()` or locator with `if (box === null)
        // throw …` before it measures, and a ternary builds an expected value. Neither is a test that
        // branches on the product's state, which is what the rule polices.
        "playwright/no-conditional-in-test": "off",
        // Formatting: Biome owns blank lines.
        "playwright/consistent-spacing-between-blocks": "off",
        // Style only: `.length` on a plain array reads the same as `toHaveLength`, and the rule has no defect
        // class. (Its count twin, `prefer-to-have-count`, stays on: a one-shot locator count races the DOM.)
        "playwright/prefer-to-have-length": "off",
        // `test.skip(condition, reason)` is the runtime guard for a missing backend or a chat style a suite
        // does not cover; only an unconditional skip is a disabled test.
        "playwright/no-skipped-test": ["error", { allowConditional: true }],
        // Replaces the `test-no-stubs` gate, with the assertion roots the gate counted.
        "playwright/expect-expect": ["error", { assertFunctionNames: ["expect", "expectTypeOf"] }],
      },
    },
    {
      // Vitest, on every test file Playwright does not run. Replaces the `test-no-stubs` gate (expect-expect
      // with the gate's own assertion roots). Biome owns focused tests and conditional expects.
      // `valid-expect` takes Vitest's optional message argument (`expect(value, "why")`).
      files: vitestTests,
      ignores: playwrightTests,
      plugins: { vitest },
      settings: { vitest: { vitestImports: ["@orb/testkit/node/fixtures.ts", "@orb/testkit/node/tool-fixtures.ts"] } },
      rules: {
        ...packRules(vitest.configs.recommended, "vitest/"),
        "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "expectTypeOf"] }],
        "vitest/valid-expect": ["error", { maxArgs: 2 }],
        "vitest/no-conditional-expect": "off",
        "vitest/no-focused-tests": "off",
      },
    },
    {
      // Zod, on the two packages that author schemas. `prefer-enum-over-literal-union` is not in the
      // recommended set and stays off: the repository rules an all-literal union into the multi-value
      // `z.literal([…])` (zod-modern-spellings arm B), and that rule asks for `z.enum` instead.
      files: ["packages/contracts/src/**/*.ts", "packages/server/src/**/*.ts"],
      plugins: { zod },
      rules: {
        ...packRules(zod.configs.recommended, "zod/"),
        // Style: the repository imports `{ z }`, and import shape is not a zod defect.
        "zod/consistent-import": "off",
        // Style: schema variable naming is Biome's `useNamingConvention` territory.
        "zod/consistent-schema-var-name": "off",
        "zod/no-number-schema-with-int": "error",
      },
    },
    {
      files: ["packages/server/src/**/*.{ts,tsx}"],
      ignores: [...SANCTIONED_DOMAINS.map((domain) => `${DOMAIN_ROOT}${domain}/**`), `${DOMAIN_ROOT}settings/**`],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              SETTINGS_TABLE_IMPORT,
              {
                regex: PNG_CHUNK_SPECIFIER_PATTERN,
                importNames: [...PNG_CHUNK_SYMBOL_NAMES],
                message: "Use the import or export domain for PNG card-chunk operations.",
              },
            ],
          },
        ],
      },
    },
    {
      files: SANCTIONED_DOMAINS.map((domain) => `${DOMAIN_ROOT}${domain}/**/*.{ts,tsx}`),
      rules: { "no-restricted-imports": ["error", { patterns: [SETTINGS_TABLE_IMPORT] }] },
    },
    {
      files: [`${DOMAIN_ROOT}settings/**/*.{ts,tsx}`],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: PNG_CHUNK_SPECIFIER_PATTERN,
                importNames: [...PNG_CHUNK_SYMBOL_NAMES],
                message: "Use the import or export domain for PNG card-chunk operations.",
              },
            ],
          },
        ],
      },
    },
    {
      // Drizzle. The rule matches any `.delete()`/`.update()` unless told the handle's name, and a Map or Set
      // `.delete()` is not a SQL statement: every persistence call goes through `db` (or `ctx.db`).
      files: ["packages/server/src/**/*.ts", "packages/db/src/**/*.ts"],
      plugins: { drizzle },
      rules: {
        "drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: ["db"] }],
        "drizzle/enforce-update-with-where": ["error", { drizzleObjectName: ["db"] }],
      },
    },
    ...MAINTAINED_GLOBAL_SURFACES.map((surface) => ({
      ...surface,
      // The captured DevTools frontend is vendored; its regexes are not ours to rewrite.
      ignores: [...(surface.ignores ?? []), "tooling/src/snap/lib/devtools-frontend/**"],
      plugins: { "@eslint-community/eslint-comments": eslintComments, regexp },
      rules: globalRules,
    })),
    {
      // The guard's operand-tail regex ends in `>\S*` and `\d*>>?&?\d*`, which overlap on `>>&1`. The two
      // alternatives accept different digit-prefixed redirects (`2>file` matches only one), so merging them
      // changes what the guard strips; tests/tooling/tool-guard.int.test.ts pins the behaviour.
      files: [".claude/hooks/tool-guard.mjs"],
      rules: { "regexp/no-dupe-disjunctions": "off" },
    },
    {
      // The regex guard's own test feeds it a catastrophic pattern on purpose.
      files: ["tests/legacy/server/primitives/regex.test.ts"],
      rules: { "regexp/no-misleading-capturing-group": "off" },
    },
    {
      // Helper/test exemptions do not establish bounded input. Maintained review-mirror, AST and codemod tools keep the native backtracking rule.
      files: [".claude/**", "tooling/**", "tests/**", "scripts/**"],
      ignores: ["tooling/src/review-mirror/**", "tooling/src/ast/**", "tooling/src/codemod/**"],
      rules: { "regexp/no-super-linear-backtracking": "off" },
    },
  ];
}
