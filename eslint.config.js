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
import { SERVER_FACTORY_TIER_REFERENCE_POLICY_ID, serverTypeTier, TYPE_HOME_NATIVE_POLICY_ID } from "@orb/tooling/floor/code-facts/type-home";
import { readAuthoredRepositoryInventory } from "@orb/tooling/floor/compiler/authored-repository";
import { BROWSER_PACKAGES, HELPER_WORLD_DIRS, NODE_TOOL_SURFACE_GLOBS, PACKAGE_WORLDS, TEST_WORLD_PROGRAMS } from "@orb/tooling/floor/compiler/project-worlds";
import { RESERVED_PORT_NUMBERS, STAGE_BAND_PORT_NUMBERS } from "@orb/tooling/floor/host/ports";
import { AMBIENT_SOURCE_PATTERNS } from "@orb/tooling/floor/testing/ambient-source-patterns";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/floor/testing/test-kinds";
import { LEGACY_TEST_ROOT } from "@orb/tooling/floor/testing/test-population";
import { BUTTON_SIZE_OVERFLOW } from "@orb/ui/button/size-hit-area";
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
import { createWrappedNode } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { CHROME_ZONES } from "./packages/client/src/state/chrome-registry.ts";
import { CONFIG_GROUP_IDS } from "./packages/client/src/state/config-group-ids.ts";
import { MODAL_SLOT_IDS } from "./packages/client/src/state/modal-slot-ids.ts";
import { SECTION_IDS } from "./packages/client/src/state/section-ids.ts";
import { BUS_SUBUNIONS, BUSES } from "./packages/contracts/src/bus-registry/index.ts";
import { STRUCTURED_VEHICLES, WIRE_SCHEMA_KEYWORD_VOCABULARY } from "./packages/contracts/src/inference/wire-subset.ts";
import { TABLE_SCOPING } from "./packages/db/src/tenancy/index.ts";
import { ID_BRAND_HOME, nativeCanonicalIdBrand, requireEntityIdTypeNames } from "./tooling/src/floor/code-facts/id-brand.ts";
import { nativeModulePositionSpecifier, relativeClimb, resolveRelativeImport, TOOLING_PREFIX } from "./tooling/src/floor/code-facts/module-specifier.ts";
import { readMemberReference, resolveGlobalMemberOrigin, resolveStableExpression } from "./tooling/src/floor/code-facts/reference-fact.ts";
import { resolveCallableOrigin } from "./tooling/src/floor/code-facts/reference-fact-call.ts";
import { serverFactoryTypeHome } from "./tooling/src/floor/code-facts/server-factory-type-home.ts";
import { readServerPublicBoundary } from "./tooling/src/floor/code-facts/server-public-boundary.ts";
import { isZodShapeCall } from "./tooling/src/floor/code-facts/shape-declaration.ts";
import { readStaticAuthoredScalar } from "./tooling/src/floor/code-facts/static-authored-value.ts";
import {
  declaredByPackage,
  resolveTypeIdentityChain,
  resolveTypeIdentityOrigin,
  resolveTypeMemberOrigin,
} from "./tooling/src/floor/code-facts/type-member-origin.ts";
import { nativeUncastReceiver } from "./tooling/src/floor/code-facts/type-member-origin-core.ts";
import { isFactoryCallFromPackage, zodCandidateCall } from "./tooling/src/floor/code-facts/zod-origin.ts";
import { moduleScopeCalls } from "./tooling/src/floor/compiler/module-entry.ts";
import { INSTRUMENT_TOOLS } from "./tooling/src/floor/instrument/instruments.ts";
import { BASE_UI_NATIVE_INPUT_PATHS } from "./tooling/src/verify/contract/baseui.ts";
import {
  ENTRY_DRIVER_GLOBS,
  ENTRY_PROCESS_PROPERTIES,
  ENTRY_WIRING_GLOBS,
  QUERY_FREE_BOOT_GLOBS,
} from "./tooling/src/verify/contract/compose-query-capability.ts";
import { MANUAL_MEMO_CUSTOM_HOMES, MANUAL_MEMO_EXPORTS } from "./tooling/src/verify/contract/manual-memo.ts";
import { MODEL_PROSE_SEAM_FILES, MODEL_PROSE_SEAM_PREFIXES } from "./tooling/src/verify/contract/model-prose-seam.ts";
import { POPULATION_ROOTS, POPULATION_SETS } from "./tooling/src/verify/contract/population.ts";
import { DEFINITION_SLOTS } from "./tooling/src/verify/contract/registry-definition-home.ts";
import { JSON_RESOURCE_PATHS } from "./tooling/src/verify/contract/resource-json.ts";
import { DOMAIN_ROOT, PNG_CHUNK_SPECIFIER_PATTERN, PNG_CHUNK_SYMBOL_NAMES, SANCTIONED_DOMAINS } from "./tooling/src/verify/contract/serde-core-seal.ts";
import { possibleAmbientCall, readAmbientInvocation } from "./tooling/src/verify/lib/ambient-determinism.ts";
import { surfaceManifestFrom } from "./tooling/src/verify/lib/baseui-manifest.ts";
import { CLIENT_LEXICAL_NATIVE_INPUT_PATHS } from "./tooling/src/verify/lib/client-lexical-native.ts";
import { CLIENT_MAP_NATIVE_INPUT_PATHS, CLIENT_MAP_NATIVE_RULE } from "./tooling/src/verify/lib/client-map-native.ts";
import { DEFINE_CONTEXT_REGION, DEFINE_CONTEXT_TABS, REGISTRY_CONTRACTS_RE } from "./tooling/src/verify/lib/context-definition-shape.ts";
import { createKitIdCallMatcher } from "./tooling/src/verify/lib/id-brand.ts";
import { classifyOriginRefusal, referenceNamesExport } from "./tooling/src/verify/lib/origin-verdict.ts";
import {
  classifyPackageMemberOrigin,
  classifyProjectHomeOrigin,
  locateProjectHome,
  readsAmbientGlobalPath,
} from "./tooling/src/verify/lib/project-home-origin.ts";
import { TIER_IMPLEMENTATION_HOMES as SPACING_HOMES } from "./tooling/src/verify/lib/raw-spacing-tier.ts";
import { TIER_IMPLEMENTATION_HOMES as TYPOGRAPHY_HOMES } from "./tooling/src/verify/lib/raw-typography-tier.ts";
import { isDefinitionHome } from "./tooling/src/verify/lib/registry-definition-home.ts";
import {
  SOURCE_TYPE_SUPPRESSION_EXCLUSIONS,
  SOURCE_TYPE_SUPPRESSION_GLOBS,
  SOURCE_TYPE_SUPPRESSION_RULE,
} from "./tooling/src/verify/lib/source-type-suppression-native.ts";
import { readTailwindClassTokens } from "./tooling/src/verify/lib/tailwind-class-token.ts";
import { FIXTURE_NAMES, readFixtureDoor, registersSnapshotSerializer } from "./tooling/src/verify/lib/test-runner-door.ts";
import {
  CONFIG_ANCHOR_FORMATTER,
  CONFIG_ANCHOR_OWNER,
  TEST_IMPORT_EXCLUSIONS,
  TEST_IMPORT_GLOBS,
  TEST_PACKAGE_SUBPATH_RULE,
  TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS,
  TOOLING_IMPORT_GLOBS,
  TOOLING_ROOT_CONFIG_IMPORT_RULE,
} from "./tooling/src/verify/lib/test-tooling-imports-native.ts";
import { TOOLING_ENTRY_HOMES } from "./tooling/src/verify/lib/tooling-entry-native.ts";
import {
  TYPED_NATIVE_POLICIES,
  typedNativeCompilerContext,
  typedNativeInputIdentity,
  typedNativeInputPaths,
} from "./tooling/src/verify/lib/typed-native-inputs.ts";
import { waivableCoordinate } from "./tooling/src/verify/lib/waivable-coordinate.ts";
import { Z_INDEX_IMPLEMENTATION_HOMES } from "./tooling/src/verify/lib/z-index-homes.ts";

// This config lives at the repo root; projectService/tsconfig discovery is rooted here.
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const NATIVE_TYPED_COMPILER_CONTEXT = typedNativeCompilerContext(ROOT);

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
const AUTHORED_NATIVE_INPUT_PATHS = readAuthoredRepositoryInventory(ROOT).paths;
const AUTHORED_TEST_PATHS = AUTHORED_NATIVE_INPUT_PATHS.filter((path) => path.startsWith("tests/") && (path.endsWith(".ts") || path.endsWith(".tsx")));
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
// Native brace unions preserve OR membership without multiplying the AND alternatives below.
const CALLER_SRC_UNION = `{${CALLER_SRC.join(",")}}`;
const AUTHORED_SRC_UNION = `{${AUTHORED_SRC.join(",")}}`;
const MEMO_NATIVE_SRC_UNION = `{${MEMO_NATIVE_SRC.join(",")}}`;

// Flat config replaces rule arrays. Repeat the applicable native layers in each existing override partition.
function syntaxBlocks(files, selectors, ignores = []) {
  const base = [...selectors, NO_FORM_DEPENDENCY];
  const blocks = [
    { files, ...(ignores.length === 0 ? {} : { ignores }), rules: { "no-restricted-syntax": ["error", ...selectors] } },
    { files, ignores: [...ignores, ...STRICT_SYNTAX_IGNORES], rules: { "no-restricted-syntax": ["error", ...base] } },
    {
      files: files.map((file) => [file, CALLER_SRC_UNION]),
      ignores: [...ignores, ...CALLER_IGNORES],
      rules: { "no-restricted-syntax": ["error", ...base, NO_CALLER_USER_ID] },
    },
    {
      files: files.map((file) => [file, AUTHORED_SRC_UNION]),
      ignores: [...ignores, ...GROUP_IGNORES],
      rules: { "no-restricted-syntax": ["error", ...base, NO_GROUP_BRANCH] },
    },
    {
      files: files.map((file) => [file, CALLER_SRC_UNION]),
      ignores: [...ignores, ...CALLER_IGNORES, ...GROUP_IGNORES],
      rules: { "no-restricted-syntax": ["error", ...base, NO_CALLER_USER_ID, NO_GROUP_BRANCH] },
    },
  ];
  const layered = blocks.flatMap((block) => [
    block,
    {
      files: block.files.map((file) => [...(Array.isArray(file) ? file : [file]), AUTHORED_SRC_UNION]),
      ignores: [...(block.ignores ?? []), ...STRICT_SYNTAX_IGNORES, "**/*.test.{ts,tsx}", ...QUERY_HOMES],
      rules: { "no-restricted-syntax": [...block.rules["no-restricted-syntax"], NO_RAW_QUERY_HOOKS] },
    },
  ]);
  return layered.flatMap((block) => [
    block,
    {
      ...block,
      files: block.files.map((file) => [...(Array.isArray(file) ? file : [file]), MEMO_NATIVE_SRC_UNION]),
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

// Table names are matched from any source, so an unreadable or relabelled door is refused rather than admitted.
// A whole-db namespace, star or dynamic door is refused outright, because its members cannot be told apart here.
// The re-export rows have no homes: a home that re-exported a table would launder it through a namespace import.
const DB_MODULE_SOURCE = String.raw`/^@orb\/db(\/|$)|\/db\/src(\/|$)/`;
const SERVER_SRC = rootSources("@server");
const tableImportDoor = (names) => `ImportSpecifier:matches([imported.name=${names}], [imported.value=${names}])`;
const tableExportDoor = (names) => `ExportSpecifier:matches([local.name=${names}], [local.value=${names}])`;
const DB_STAR_EXPORT = `ExportAllDeclaration[source.value=${DB_MODULE_SOURCE}]`;
const DB_WHOLE_MODULE_DOORS = `:matches(ImportDeclaration[source.value=${DB_MODULE_SOURCE}] > ImportNamespaceSpecifier, ExportAllDeclaration[source.value=${DB_MODULE_SOURCE}], ImportExpression[source.value=${DB_MODULE_SOURCE}])`;
// The vector substrate's primary tables (D20, Knowledge-Cluster inv 1-2).
const VECTOR_TABLES = alternation(["characterEmbeddings", "imageEmbeddings", "chatDigests", "chatSegments", "chatDigestSpeakers", "documentChunks"]);
const VECTOR_WRITE_METHODS = alternation(["insert", "update", "delete"]);
const USERS_MESSAGE =
  "The users table is read and written only by domain/sessions and domain/admin (Spine-Identity-and-Auth §1, invariant 10). Take userId from the resolved Principal instead.";
const VECTOR_MESSAGE =
  "A vector table is named only by its import roles: embeddings (owner), search/persistence (retrieval), chat/memory/persistence (bookkeeping), discovery/persistence (analytics) and the debug probes (D20). Go through the search engine with a producer scope.";
const TABLE_IMPORT_RESTRICTIONS = [
  {
    id: "no-direct-users-read",
    scope: ["packages/server/src/domain/**/*.{ts,tsx}", "packages/server/src/entry/**/*.{ts,tsx}"],
    homes: [
      {
        path: "packages/server/src/domain/sessions/**",
        why: "the resolution tier: it upserts and reads the identity row that becomes the one Principal (Spine-Identity-and-Auth §1)",
      },
      {
        path: "packages/server/src/domain/admin/**",
        why: "user management: it owns a target user's identity row, which the caller's Principal does not describe (Spine-Identity-and-Auth §1)",
      },
    ],
    selectors: [tableImportDoor("'users'"), tableExportDoor("'users'"), DB_WHOLE_MODULE_DOORS].map((selector) => ({ selector, message: USERS_MESSAGE })),
  },
  {
    id: "no-direct-users-read-reexport",
    scope: SERVER_SRC,
    homes: [],
    selectors: [tableExportDoor("'users'"), DB_STAR_EXPORT].map((selector) => ({ selector, message: USERS_MESSAGE })),
  },
  {
    id: "vector-scope-derived",
    scope: SERVER_SRC,
    homes: [
      { path: "packages/server/src/domain/embeddings/**", why: "the vector substrate's owner: it stores and clears every vector row" },
      { path: "packages/server/src/domain/search/persistence/**", why: "the one top-k retrieval engine, which derives owner scope from the producer" },
      {
        path: "packages/server/src/domain/chat/memory/persistence/**",
        why: "digest bookkeeping: which segments are indexed; vector reads go through searchDigests",
      },
      { path: "packages/server/src/domain/discovery/persistence/**", why: "library analytics over loaded vectors with in-memory cosine" },
      { path: "packages/server/src/foundation/observability/debug/**", why: "the debug probes that count substrate rows" },
    ],
    selectors: [tableImportDoor(VECTOR_TABLES), tableExportDoor(VECTOR_TABLES), DB_WHOLE_MODULE_DOORS].map((selector) => ({
      selector,
      message: VECTOR_MESSAGE,
    })),
  },
  {
    id: "vector-scope-derived-reexport",
    scope: SERVER_SRC,
    homes: [],
    selectors: [tableExportDoor(VECTOR_TABLES), DB_STAR_EXPORT].map((selector) => ({ selector, message: VECTOR_MESSAGE })),
  },
  {
    id: "vector-scope-derived-write",
    scope: SERVER_SRC,
    homes: [
      { path: "packages/server/src/domain/embeddings/persistence/**", why: "the one vector writer: embeddings.store and its clear and restamp arms (D20)" },
    ],
    selectors: [
      `CallExpression:matches([callee.property.name=${VECTOR_WRITE_METHODS}], [callee.property.value=${VECTOR_WRITE_METHODS}], [callee.computed=true]:not([callee.property.type='Literal'])):matches([arguments.0.name=${VECTOR_TABLES}], [arguments.0.property.name=${VECTOR_TABLES}], [arguments.0.property.value=${VECTOR_TABLES}], [arguments.0.expression.name=${VECTOR_TABLES}])`,
      // Rebinding keeps the canonical name at every write position, which is what the write selector reads.
      `ImportSpecifier:matches([imported.name=${VECTOR_TABLES}], [imported.value=${VECTOR_TABLES}]):not([local.name=${VECTOR_TABLES}])`,
      `VariableDeclarator:matches([init.name=${VECTOR_TABLES}], [init.expression.name=${VECTOR_TABLES}])`,
      `AssignmentExpression:matches([right.name=${VECTOR_TABLES}], [right.expression.name=${VECTOR_TABLES}])`,
      // An import home's own namespace door would hide the table name from the write position.
      DB_WHOLE_MODULE_DOORS,
    ].map((selector) => ({
      selector,
      message:
        "Only domain/embeddings/persistence inserts, updates or deletes a vector table, under its canonical name (D20). Route the write through embeddings.store.",
    })),
  },
  {
    id: "vector-scope-derived-cosine",
    scope: SERVER_SRC,
    homes: [{ path: "packages/server/src/domain/search/persistence/**", why: "top-k retrieval is search's alone (Knowledge-Cluster inv 2)" }],
    selectors: [":matches(Literal[value=type(string)][value=/vector_distance_cos/], TemplateElement[value.raw=/vector_distance_cos/])"].map((selector) => ({
      selector,
      message:
        "vector_distance_cos is spelled only in domain/search/persistence; discovery uses in-memory cosine and memory delegates to the injected searchDigests op (D20).",
    })),
  },
];

// A registered instrument reports a verdict about the app, where a blind zero reads as a pass, so its result enters
// the shared printVerdict denominator door. Banning the NAME stops an alias, a barrel and a re-export alike; the
// namespace and star forms are banned on the artifacts door itself because they carry no name to match.
const ARTIFACTS_DOOR_SOURCE = "/artifacts(\\.ts)?$/";
const PRINT_RESULT_NAME = "printResult";
const INSTRUMENT_VERDICT_RESTRICTIONS = [
  {
    id: "instrument-verdict-door",
    scope: INSTRUMENT_TOOLS.map((tool) => `tooling/src/${tool}/**/*.{ts,tsx}`),
    homes: [],
    selectors: [
      {
        selector: `ImportDeclaration > ImportSpecifier:matches([imported.name='${PRINT_RESULT_NAME}'], [imported.value='${PRINT_RESULT_NAME}'])`,
        message: "A registered instrument enters the shared verdict door; route its RESULT through printVerdict with declared denominators, never printResult.",
      },
      {
        selector: `ExportNamedDeclaration[source] > ExportSpecifier:matches([local.name='${PRINT_RESULT_NAME}'], [local.value='${PRINT_RESULT_NAME}'])`,
        message: "A registered instrument cannot re-export printResult; route its RESULT through printVerdict with declared denominators.",
      },
      {
        selector: `ImportDeclaration[source.value=${ARTIFACTS_DOOR_SOURCE}] > ImportNamespaceSpecifier`,
        message: "A namespace import of the artifacts door reaches printResult; import print by name and route the RESULT through printVerdict.",
      },
      {
        selector: `ExportAllDeclaration[source.value=${ARTIFACTS_DOOR_SOURCE}]`,
        message: "A star re-export of the artifacts door reaches printResult; route the RESULT through printVerdict.",
      },
    ],
  },
];

// ── IDENTITY WRITERS: invariant 10's bind-once chokepoint and D257's key-beside-handle rule ─────────────────
// HARD (`hardConfig` only): an inline directive cannot excuse a third subject writer. These rules match the users
// table, its write verbs and the subject column by name and spelling, so `users-write-plain-spelling` refuses the
// import alias, the type wrappers and the computed verbs that would hide a users write from them.
const SESSIONS_SRC = "packages/server/src/domain/sessions";
const USERS_PERSISTENCE = `${SESSIONS_SRC}/persistence/users.ts`;
const LINK_CAPABILITY = `${SESSIONS_SRC}/verbs/link-external-id.ts`;
const PROVISION_CAPABILITY = `${SESSIONS_SRC}/verbs/provision-identity.ts`;
const PENDING_SIGNUP_CAPABILITY = `${SESSIONS_SRC}/verbs/pending-signup.ts`;
const CLAIM_WRITER = "claimExternalIdIfUnbound";
const PENDING_JOIN_WRITER = "insertPendingSignupUserStatement";
const SUBJECT_WRITER_NAMES = alternation([CLAIM_WRITER, PENDING_JOIN_WRITER]);
const SUBJECT_KEYS = alternation(["externalId", "external_id"]);
const IDENTITY_WRITER_MESSAGE =
  "Invariant 10: bind users.externalId only through the registered sessions capabilities (provisionIdentity, linkExternalId, the D259 pending-join confirm) and their writers in sessions/persistence/users.ts.";
const PLAIN_SPELLING_MESSAGE =
  "Spell the users table and its write chain plainly: an import alias, a type wrapper or a computed verb hides the write from the identity-writer rules.";
const memberAt = (path, name) => memberNamed(name, path === "" ? "" : `${path}.`);
// `value` is an esquery value, a quoted name or a regex. Each covers the plain, string and template spellings.
const memberSpelledAt = (path, value) =>
  `:matches([${path}.computed=false][${path}.property.name=${value}], [${path}.computed=true][${path}.property.type='Literal'][${path}.property.value=${value}], [${path}.computed=true][${path}.property.type='TemplateLiteral'][${path}.property.expressions.length=0][${path}.property.quasis.0.value.cooked=${value}])`;
const keySpelled = (value) =>
  `:matches([computed=false][key.type='Identifier'][key.name=${value}], [key.type='Literal'][key.value=${value}], [computed=true][key.type='TemplateLiteral'][key.expressions.length=0][key.quasis.0.value.cooked=${value}])`;
const stringSpelled = (value) =>
  `:matches(Literal[value=${value}]:not(TSLiteralType > Literal), TemplateLiteral[expressions.length=0]:not(TSLiteralType > TemplateLiteral) > TemplateElement[value.cooked=${value}])`;
const TYPE_WRAPPER = ":matches(TSAsExpression, TSSatisfiesExpression, TSNonNullExpression, TSTypeAssertion)";
const DATA_WRAPPER = ":matches(TSAsExpression, TSSatisfiesExpression, TSTypeAssertion)";
const usersTableAt = (path) => `:matches([${path}.type='Identifier'][${path}.name='users'], [${path}.type='MemberExpression']${memberAt(path, "users")})`;
const USERS_TABLE_CALL = `CallExpression:matches(${memberAt("callee", "insert")}, ${memberAt("callee", "update")})${usersTableAt("arguments.0")}`;
const USERS_INSERT_VALUES = `CallExpression${memberAt("callee", "values")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "insert")}${usersTableAt("callee.object.arguments.0")}`;
const USERS_UPDATE_SET = `CallExpression${memberAt("callee", "set")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "update")}${usersTableAt("callee.object.arguments.0")}`;
const USERS_ROW_WRITE = `:matches(${USERS_INSERT_VALUES}, ${USERS_UPDATE_SET})`;
const USERS_UPSERT = `CallExpression${memberAt("callee", "onConflictDoUpdate")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "values")}[callee.object.callee.object.type='CallExpression']${memberAt("callee.object.callee.object.callee", "insert")}${usersTableAt("callee.object.callee.object.arguments.0")}`;
const UPSERT_SET_KEY = `Property${keySpelled("'set'")}`;
const USERS_POSITIONAL_INSERT = `CallExpression${memberAt("callee", "select")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "insert")}${usersTableAt("callee.object.arguments.0")}[arguments.length>0]`;
const PERSISTENCE_VERB = (name) => `CallExpression:matches([callee.name='${name}'], ${memberAt("callee", name)})`;
const USERS_DATA_CALL = `:matches(${USERS_ROW_WRITE}, ${USERS_UPSERT}, ${PERSISTENCE_VERB("insertUser")}, ${PERSISTENCE_VERB("updateUser")})`;
// A key or member computed from a binding: a constant can carry the subject column or a write verb under no visible name.
const DYNAMIC_KEY = "Property[computed=true]:not([key.type='Literal'], [key.type='TemplateLiteral'][key.expressions.length=0])";
const DYNAMIC_KEY_WRITE = `${USERS_DATA_CALL} ObjectExpression > ${DYNAMIC_KEY}`;
const DYNAMIC_CALLEE =
  "[callee.type='MemberExpression'][callee.computed=true]:not([callee.property.type='Literal'], [callee.property.type='TemplateLiteral'][callee.property.expressions.length=0])";
const USERS_WRITE_CALL = `CallExpression:matches([callee.name=/^(insertUser|updateUser)$/], ${["insertUser", "updateUser", "set", "values", "onConflictDoUpdate"].map((name) => memberAt("callee", name)).join(", ")})`;
// `externalId: null` and `= undefined` bind no subject (the local-user default).
const nonNullish = (path) =>
  `:not([${path}.type='Literal'][${path}.raw='null']):not([${path}.type='Identifier'][${path}.name='undefined']):not([${path}.type=/^TS(As|Satisfies)Expression$/][${path}.expression.raw='null'])`;
const SUBJECT_KEYED_WRITE = `${USERS_WRITE_CALL} ObjectExpression > Property${keySpelled(SUBJECT_KEYS)}${nonNullish("value")}`;
const SUBJECT_ASSIGNMENT = `AssignmentExpression:matches([operator='='], [operator='??='], [operator='||='], [operator='&&='])[left.type='MemberExpression']${memberSpelledAt("left", SUBJECT_KEYS)}${nonNullish("right")}`;
const INSIDE_SUBJECT_WRITER = `:matches(FunctionDeclaration[id.name=${SUBJECT_WRITER_NAMES}], VariableDeclarator[id.name=${SUBJECT_WRITER_NAMES}]) *`;
const SUBJECT_STRING_MESSAGE = `${IDENTITY_WRITER_MESSAGE} A string spelling of the subject column hides the bind from these rules.`;
// A string spelling of a writer name reaches it through a bracket read, a string import name or a const key.
const writerReference = (name) => [
  { selector: `Identifier[name='${name}']`, message: IDENTITY_WRITER_MESSAGE },
  { selector: stringSpelled(`'${name}'`), message: IDENTITY_WRITER_MESSAGE },
];
// Any string that reads as a users write: a `sql` template, a `sql.raw` argument, or a const either one reads.
const RAW_USERS_WRITE_TEXT = "/\\b(?:insert(?:\\s+or\\s+\\w+)?\\s+into|replace\\s+into|update(?:\\s+or\\s+\\w+)?)\\s+[`\"']?users[`\"']?(?!\\w)/i";
const RAW_USERS_WRITE_HEAD = "/\\b(?:insert(?:\\s+or\\s+\\w+)?\\s+into|replace\\s+into|update(?:\\s+or\\s+\\w+)?)\\s+[`\"']?$/i";
const HANDLE_WITHOUT_KEY = `ObjectExpression:has(> Property${keySpelled("'handle'")}):not(:has(> Property${keySpelled("'handleKey'")}))`;
const IDENTITY_WRITER_RESTRICTIONS = [
  {
    id: "external-id-claim-writer-callers",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [
      { path: LINK_CAPABILITY, why: "the admin link capability hands its caller the unexecuted atomic claim" },
      { path: PROVISION_CAPABILITY, why: "the SSO seam's owner-flip bind rides the same atomic claim" },
    ],
    selectors: writerReference(CLAIM_WRITER),
  },
  {
    id: "external-id-pending-join-writer-callers",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [{ path: PENDING_SIGNUP_CAPABILITY, why: "the D259 pending-join confirm plans through decideProvision and binds through this one statement" }],
    selectors: writerReference(PENDING_JOIN_WRITER),
  },
  {
    id: "external-id-writer-home",
    scope: [USERS_PERSISTENCE],
    homes: [],
    selectors: [
      {
        selector: `Identifier[name=${SUBJECT_WRITER_NAMES}]:not(FunctionDeclaration > Identifier.id, VariableDeclarator > Identifier.id), ${stringSpelled(SUBJECT_WRITER_NAMES)}`,
        message: `${IDENTITY_WRITER_MESSAGE} A wrapper here would expose a registered writer under a name no caller registry names.`,
      },
      { selector: `${SUBJECT_KEYED_WRITE}:not(${INSIDE_SUBJECT_WRITER})`, message: `${IDENTITY_WRITER_MESSAGE} Only a registered writer may bind here.` },
      { selector: `${SUBJECT_ASSIGNMENT}:not(${INSIDE_SUBJECT_WRITER})`, message: `${IDENTITY_WRITER_MESSAGE} Only a registered writer may bind here.` },
      { selector: stringSpelled(SUBJECT_KEYS), message: SUBJECT_STRING_MESSAGE },
      { selector: `${DYNAMIC_KEY_WRITE}:not(${INSIDE_SUBJECT_WRITER})`, message: `${IDENTITY_WRITER_MESSAGE} Write users keys as plain names.` },
      {
        selector: `${USERS_POSITIONAL_INSERT}:has(Identifier[name=${SUBJECT_KEYS}]):not(${INSIDE_SUBJECT_WRITER})`,
        message: `${IDENTITY_WRITER_MESSAGE} A positional insert that reads a subject is a registered writer.`,
      },
    ],
  },
  {
    id: "external-id-subject-binds",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [{ path: PROVISION_CAPABILITY, why: "provisionIdentity builds its users patch by hand, and its subject bind is the verb's bind-once decision" }],
    selectors: [
      { selector: SUBJECT_KEYED_WRITE, message: IDENTITY_WRITER_MESSAGE },
      { selector: SUBJECT_ASSIGNMENT, message: IDENTITY_WRITER_MESSAGE },
    ],
  },
  {
    id: "external-id-opaque-users-writes",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [{ path: PROVISION_CAPABILITY, why: "provisionIdentity builds its users patch by hand, and its subject bind is the verb's bind-once decision" }],
    selectors: [
      { selector: stringSpelled(SUBJECT_KEYS), message: SUBJECT_STRING_MESSAGE },
      {
        selector: `${USERS_ROW_WRITE}:matches([arguments.0.type!='ObjectExpression'], :has(> ObjectExpression:has(> SpreadElement)))`,
        message: `${IDENTITY_WRITER_MESSAGE} Write users data as a literal whose keys are visible.`,
      },
      { selector: DYNAMIC_KEY_WRITE, message: `${IDENTITY_WRITER_MESSAGE} Write users keys as plain names.` },
      {
        selector: `${USERS_UPSERT}:matches([arguments.0.type!='ObjectExpression'], :has(> ObjectExpression:not(:has(> ${UPSERT_SET_KEY}))), :has(> ObjectExpression:has(> ${UPSERT_SET_KEY}[value.type!='ObjectExpression'])), :has(> ObjectExpression:has(> ${UPSERT_SET_KEY}:has(> ObjectExpression:has(> SpreadElement)))))`,
        message: `${IDENTITY_WRITER_MESSAGE} Write the upsert set as a literal whose keys are visible.`,
      },
      {
        selector: `:matches(${PERSISTENCE_VERB("insertUser")}[arguments.1.type!='ObjectExpression'], ${PERSISTENCE_VERB("updateUser")}[arguments.2.type!='ObjectExpression'], ${PERSISTENCE_VERB("insertUser")}:has(> ObjectExpression:has(> SpreadElement)), ${PERSISTENCE_VERB("updateUser")}:has(> ObjectExpression:has(> SpreadElement)))`,
        message: `${IDENTITY_WRITER_MESSAGE} Pass the users row or patch as a literal whose keys are visible.`,
      },
    ],
  },
  {
    id: "external-id-raw-users-writes",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [],
    selectors: [
      { selector: USERS_POSITIONAL_INSERT, message: `${IDENTITY_WRITER_MESSAGE} A positional users insert binds external_id by column order.` },
      {
        selector: `:matches(Literal[value=${RAW_USERS_WRITE_TEXT}], TemplateElement[value.raw=${RAW_USERS_WRITE_TEXT}])`,
        message: `${IDENTITY_WRITER_MESSAGE} Raw SQL cannot write users outside its persistence file.`,
      },
      {
        selector: `TemplateLiteral:has(> TemplateElement[value.raw=${RAW_USERS_WRITE_HEAD}]):has(> :matches(Identifier[name='users'], MemberExpression${memberAt("", "users")}))`,
        message: `${IDENTITY_WRITER_MESSAGE} Raw SQL cannot write users outside its persistence file.`,
      },
    ],
  },
  {
    id: "users-write-plain-spelling",
    scope: rootSources("@server"),
    homes: [],
    selectors: [
      {
        selector:
          "ImportDeclaration[source.value=/^@orb\\u002Fdb(\\u002F|$)/] > ImportSpecifier:matches([imported.name='users'], [imported.value='users'])[local.name!='users']",
        message: PLAIN_SPELLING_MESSAGE,
      },
      { selector: `${TYPE_WRAPPER}${usersTableAt("expression")}`, message: PLAIN_SPELLING_MESSAGE },
      { selector: `${TYPE_WRAPPER} > :matches(${USERS_TABLE_CALL}, ${USERS_INSERT_VALUES})`, message: PLAIN_SPELLING_MESSAGE },
      { selector: `MemberExpression > ChainExpression > :matches(${USERS_TABLE_CALL}, ${USERS_INSERT_VALUES})`, message: PLAIN_SPELLING_MESSAGE },
      { selector: `CallExpression${DYNAMIC_CALLEE}${usersTableAt("arguments.0")}`, message: PLAIN_SPELLING_MESSAGE },
      {
        selector: `CallExpression${DYNAMIC_CALLEE} > MemberExpression.callee > :matches(${USERS_TABLE_CALL}, ${USERS_INSERT_VALUES}).object`,
        message: PLAIN_SPELLING_MESSAGE,
      },
    ],
  },
  {
    id: "handle-key-writer",
    scope: rootSources("@server"),
    homes: [],
    selectors: [
      {
        selector: [
          `${USERS_ROW_WRITE} > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_ROW_WRITE} > ${DATA_WRAPPER} > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_INSERT_VALUES} > ArrayExpression > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_UPSERT} > ObjectExpression > ${UPSERT_SET_KEY} > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_UPSERT} > ObjectExpression > ${UPSERT_SET_KEY} > ${DATA_WRAPPER} > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_UPSERT} > ${DATA_WRAPPER} > ObjectExpression > ${UPSERT_SET_KEY} > ${HANDLE_WITHOUT_KEY}`,
        ].join(", "),
        message:
          "D257: a users write that sets handle also writes handleKey, or the row keeps a stale key that admits a look-alike of the new handle. Write through the sessions persistence verbs, which derive it with handleKey().",
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

// D22 member-card clamp, D16/D18 chat member fan, and the injected-op scope boundary (Spine-Identity-and-Auth §2b).
const MEMBER_CARD_VIEW = "MemberCardView";
const MEMBER_CARD_CLAMPS = alternation(["clampMemberCard", "resolveCardVisibility"]);
const INJECTED_OP_RULE = "injected-op-caller-param";
/** A param name, destructured element, member name or type spelling that carries the caller scope. */
const INJECTED_OP_SCOPE_NAMES = [
  "principal",
  "caller",
  "actor",
  "userId",
  "ownerId",
  "chatId",
  "actorUserId",
  "recipientUserId",
  "forUserId",
  "runAsUserId",
  "hostUserId",
  "subjectUserId",
  "triggeredBy",
  "Principal",
  "UserId",
];
/** Ops whose authority is not the caller's. Each row says why and what ends it; the native suite reds a row
 *  that no longer excuses a live contract declaration, so a stale name cannot license the next op. */
const CALLER_FREE_OPS = [
  {
    op: "ReapAssetsOp",
    why:
      "the authority is structural, not the caller's: `reapIfOrphan` purges an id only when the whole asset-ref registry holds no " +
      "reference to it (`selectReferencedAmong`), so a foreign id that is still referenced is skipped and a foreign id referenced by " +
      "nothing is an orphan blob `collectGarbage` would reap anyway. Un-principal by design (D20, `assets/verbs/reap-if-orphan.ts`) " +
      "and it returns no row data. Ends the day the reap stops consulting the reference registry first.",
  },
  {
    op: "LoadAssetBytesOp",
    why:
      "D20 un-principal blob read for the databank ingest path, which runs after the enqueue authority check (the workload row's " +
      "owner is the gate). `assets/contract/service.ts` names it the un-principal read, distinct from the principal-carrying door. " +
      "Ends if ingest ever runs on caller-supplied ids.",
  },
  {
    op: "LoadCardText",
    why:
      "the embeddings card-text read: the indexer and corpus passes read ids they enumerated themselves (`listEmbeddableCharacterIds`, " +
      "D20 un-principal), and the admin inline embed (`admin/verbs/card-embed.ts`) reaches it only after `getCard({ principal, characterId })` " +
      "owner-verified the id. Ends when the op takes the owner scope, or when a caller reaches it without an owner check first.",
  },
];
// Settings carry the derived vocabulary so a TypeIdOf change in the ids home invalidates cached lint results.
const INJECTED_OP_SETTINGS = {
  [`orb/${INJECTED_OP_RULE}`]: {
    entityIds: requireEntityIdTypeNames(readFileSync(join(ROOT, ID_BRAND_HOME), "utf8")),
    scopeNames: INJECTED_OP_SCOPE_NAMES,
    callerFreeOps: CALLER_FREE_OPS,
  },
};
const SERVER_SCOPE_RESTRICTIONS = [
  {
    id: "member-card-clamped",
    scope: AUTHORED_SRC,
    notUnder: ["packages/contracts/**", `${LEGACY_TEST_ROOT}/**`],
    homes: [],
    selectors: [
      {
        selector: `:matches(TSInterfaceDeclaration, TSTypeAliasDeclaration) > Identifier.id[name='${MEMBER_CARD_VIEW}']`,
        message: "D22: MemberCardView has one home, @orb/contracts/chat; a re-spelled projection is how the clamp levels diverged.",
      },
    ],
  },
  {
    id: "member-card-clamped-clamp",
    scope: SERVER_SRC,
    homes: [
      {
        path: "packages/server/src/domain/chat/substrate/auth/**",
        why: "the one D22 decision site: `clamp.ts` owns `clampMemberCard` and `resolveCardVisibility`",
      },
    ],
    selectors: [
      {
        selector: `:matches(FunctionDeclaration, TSDeclareFunction) > Identifier.id[name=${MEMBER_CARD_CLAMPS}], VariableDeclarator > Identifier.id[name=${MEMBER_CARD_CLAMPS}]`,
        message: "D22: the member-card clamp lives only in domain/chat/substrate/auth; a second clamp re-spells the visibility levels.",
      },
    ],
  },
  {
    id: "member-card-clamped-verb",
    scope: SERVER_SRC,
    homes: [],
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='getRosterCardView']",
        message: "D22: getRosterCardView was the divergent second clamp; read a roster card through chat's getMemberCard.",
      },
    ],
  },
  {
    id: "membership-fan-guard",
    scope: ["packages/server/src/domain/chat/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='emitUserEvent']",
        message:
          "D16/D18: chat is membership-scoped; member-visible state rides emitChatChanged or the chat bus, never an actor-only emitUserEvent that can exclude a co-member.",
      },
    ],
  },
  { id: INJECTED_OP_RULE, scope: ["packages/server/src/domain/*/contract/**/*.{ts,tsx}"], homes: [] },
];

/** Every identifier name in a parameter subtree, the parameter's own binding name included. */
function parameterNames(node, visitorKeys, names = []) {
  if (node.type === "Identifier") {
    names.push(node.name);
  }
  for (const key of visitorKeys[node.type] ?? []) {
    for (const child of [node[key]].flat()) {
      if (typeof child?.type === "string") {
        parameterNames(child, visitorKeys, names);
      }
    }
  }
  return names;
}

// A Promise-returning function type in a contract is an I/O door; the scope must ride its parameters, because
// otherwise the op is safe only by its call sites' discipline. A sync function type is a computation, and an id
// reached through a named parameter type is outside this syntactic check.
const injectedOpCallerParamRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const { entityIds, scopeNames, callerFreeOps } = context.settings[`orb/${INJECTED_OP_RULE}`];
    const entity = new Set(entityIds);
    const scope = new Set(scopeNames);
    const exempt = new Set(callerFreeOps.map(({ op }) => op));
    return {
      "TSTypeAliasDeclaration[typeAnnotation.type='TSFunctionType']"(node) {
        const fn = node.typeAnnotation;
        const returned = fn.returnType?.typeAnnotation;
        if (returned?.type !== "TSTypeReference" || returned.typeName.type !== "Identifier" || returned.typeName.name !== "Promise") {
          return;
        }
        const names = fn.params.flatMap((param) => parameterNames(param, context.sourceCode.visitorKeys));
        if (!names.some((name) => entity.has(name)) || names.some((name) => scope.has(name)) || exempt.has(node.id.name)) {
          return;
        }
        context.report({
          node: node.id,
          message:
            `${node.id.name}: a cross-domain op takes an entity id but no caller. The op is the domain boundary, so it must carry the scope: ` +
            "a `principal: Principal`, an `ownerId`/`userId: UserId`, or the `chatId` the membership check runs on, applied in the implementing " +
            "factory's WHERE. A genuinely un-principal op (D20) takes a CALLER_FREE_OPS row in eslint.config.js with its reason and end condition.",
        });
      },
    };
  },
};
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

// The membership-class table exports, read from the schema-owned registry; the settings value keys the lint cache.
const MEMBERSHIP_TABLE_EXPORTS = Object.entries(TABLE_SCOPING)
  .filter(([, row]) => row.scope === "membership")
  .map(([name]) => name);
if (MEMBERSHIP_TABLE_EXPORTS.length === 0) {
  throw new Error("TABLE_SCOPING declares no membership-class table; orb/membership-write-fan would match nothing");
}
// Inside domain/chat the stronger membership-fan-guard bans the per-person emit outright.
const MEMBERSHIP_WRITE_FAN_RESTRICTIONS = [
  { id: "membership-write-fan", scope: ["packages/server/src/domain/**/*.{ts,tsx}"], notUnder: ["packages/server/src/domain/chat/**"], homes: [] },
];

const CLIENT_LEXICAL_RESTRICTIONS = [
  { id: "zustand-selector-derived", scope: [CLIENT_SRC], homes: [] },
  {
    id: "no-raw-spacing-in-features",
    scope: rootSources("@client", "@ui"),
    homes: Object.entries(SPACING_HOMES).map(([path, { why }]) => ({ path: path.endsWith("/") ? `${path}**` : path, why })),
  },
  {
    id: "no-raw-typography-in-features",
    scope: rootSources("@client", "@ui"),
    homes: Object.entries(TYPOGRAPHY_HOMES).map(([path, { why }]) => ({ path: path.endsWith("/") ? `${path}**` : path, why })),
  },
  { id: "no-hover-display-swap", scope: rootSources("@client", "@ui"), homes: [] },
  { id: "no-floorless-control-in-wrap", scope: rootSources("@client", "@ui"), homes: [] },
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

// A bus event union is a root listed in `@orb/contracts/bus-registry` (it owns a belt there), a listed sub-union,
// or an `Extract`/`Exclude` carve-out of a root. Any other `*BusEvent` / `DomainEvent` alias is unregistered, and so
// is any belt-shaped `*_EVENT_TYPES` const (`satisfies Record<X["type"], …>` or `readonly X["type"][]`). A name
// is identity only inside its registered file, so one `bus-home-<bus>` restriction per bus refuses the same
// alias or belt name declared anywhere else in contracts.
const BUS_ROOT_ALIASES = Object.values(BUSES).map(({ alias }) => alias);
const BUS_ALIASES = [...BUS_ROOT_ALIASES, ...Object.values(BUS_SUBUNIONS).map(({ alias }) => alias)];
const BUS_BELTS = Object.values(BUSES).map(({ belt }) => belt);
const BUS_BELT_INDEX = "TSIndexedAccessType[indexType.type='TSLiteralType'][indexType.literal.value='type']";
const BUS_BELT_SHAPE = `TSSatisfiesExpression :matches(TSTypeReference[typeName.name='Record'] > TSTypeParameterInstantiation > ${BUS_BELT_INDEX}, TSArrayType > ${BUS_BELT_INDEX})`;
const BUS_REGISTRY_RESTRICTIONS = [
  {
    id: "bus-union-registered",
    scope: rootSources("@contracts"),
    homes: [],
    selectors: [
      {
        selector:
          `TSTypeAliasDeclaration[id.name=/^(?:DomainEvent|.*BusEvent)$/]:not([id.name=${alternation(BUS_ALIASES)}])` +
          `:not([typeAnnotation.typeName.name=/^(?:Extract|Exclude)$/][typeAnnotation.typeArguments.params.0.typeName.name=${alternation(BUS_ROOT_ALIASES)}])`,
        message:
          "A bus event union in @orb/contracts belongs in packages/contracts/src/bus-registry/index.ts, which ties it to its `*_EVENT_TYPES` belt; add it there, or derive it with Extract/Exclude from a registered root.",
      },
      {
        selector: `VariableDeclarator[id.name=/_EVENT_TYPES$/]:not([id.name=${alternation(BUS_BELTS)}]) > ${BUS_BELT_SHAPE}`,
        message:
          'A `*_EVENT_TYPES` belt over a `Union["type"]` in @orb/contracts belongs in packages/contracts/src/bus-registry/index.ts beside its union; an unregistered belt is invisible to the totality check.',
      },
    ],
  },
  ...Object.entries(BUSES).map(([name, { alias, belt, file }]) => ({
    id: `bus-home-${name}`,
    scope: rootSources("@contracts"),
    homes: [{ path: file, why: `the registered home of \`${alias}\` and its belt \`${belt}\`` }],
    selectors: [
      {
        selector: `TSTypeAliasDeclaration[id.name='${alias}']`,
        message: `\`${alias}\` is the registered ${name} bus union declared in ${file}; a same-named alias elsewhere in @orb/contracts hides a beltless bus from the registry.`,
      },
      {
        selector: `VariableDeclarator[id.name='${belt}']`,
        message: `\`${belt}\` is the registered ${name} belt declared in ${file}; a same-named const elsewhere in @orb/contracts hides a bus from the registry.`,
      },
    ],
  })),
  ...Object.entries(BUS_SUBUNIONS).map(([name, { alias, file }]) => ({
    id: `bus-home-${name}`,
    scope: rootSources("@contracts"),
    homes: [{ path: file, why: `the registered home of the \`${alias}\` sub-union` }],
    selectors: [
      {
        selector: `TSTypeAliasDeclaration[id.name='${alias}']`,
        message: `\`${alias}\` is the registered sub-union declared in ${file}; a same-named alias elsewhere in @orb/contracts hides a beltless bus from the registry.`,
      },
    ],
  })),
];

// A registry definition is declared in its owning feature's co-located `<id>-<slot>` file and nowhere else, and
// there it is an object literal written in place. The subject is the annotation's type NAME, so an alias of the
// type or a same-named local type is outside it.
const annotatedAs = (path, name) => `[${path}.type='TSTypeReference'][${path}.typeName.name='${name}']`;
const declaredAs = (type) => `VariableDeclarator[id.type='Identifier']${annotatedAs("id.typeAnnotation.typeAnnotation", type)}`;
const DEFINITION_TYPES = [
  { id: "chrome-definition-home", type: "ChromeEntry", slot: DEFINITION_SLOTS.chrome },
  { id: "home-tile-definition-home", type: "HomeTileContribution", slot: DEFINITION_SLOTS.tile },
  { id: "section-definition-home", type: "SectionDefinition", slot: DEFINITION_SLOTS.section, factory: true },
  { id: "config-group-definition-home", type: "ConfigGroupDefinition", slot: DEFINITION_SLOTS.group },
  { id: "collection-definition-home", type: "CollectionContribution", slot: DEFINITION_SLOTS.collection },
].map((definition) => ({ ...definition, home: `packages/client/src/features/*/lib/*${definition.slot}.{ts,tsx}` }));
const CLIENT_DEFINITION_HOME_RESTRICTIONS = DEFINITION_TYPES.map(({ id, type, slot, home, factory = false }) => ({
  id,
  scope: [CLIENT_SRC],
  homes: [{ path: home, why: `The owning feature's co-located ${slot} file is the one home of a ${type} definition.` }],
  selectors: [
    { selector: declaredAs(type), message: `A ${type} is declared only in packages/client/src/features/<owner>/lib/<id>${slot}.{ts,tsx}.` },
    ...(factory
      ? [
          {
            selector: `:matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)${annotatedAs("returnType.typeAnnotation", type)}`,
            message: `A ${type} factory is declared only in packages/client/src/features/<owner>/lib/<id>${slot}.{ts,tsx}.`,
          },
        ]
      : []),
  ],
}));
const CLIENT_DEFINITION_LITERAL_RESTRICTIONS = [
  {
    id: "registry-definition-literal",
    scope: DEFINITION_TYPES.map(({ home }) => home),
    homes: [],
    selectors: DEFINITION_TYPES.map(({ type, slot }) => ({
      selector: `${declaredAs(type)}:not([init.type='ObjectExpression'])`,
      message: `A ${type} definition is an object literal written in its ${slot} file, not an imported or computed value.`,
    })),
  },
];
const CLIENT_CONFIG_HOST = "packages/client/src/features/config/surfaces/config-content-surface.tsx";
const CLIENT_CONFIG_HOST_RESTRICTIONS = [
  {
    id: "config-host-no-feature-import",
    scope: [CLIENT_CONFIG_HOST],
    homes: [],
    selectors: [
      {
        // `#features` door, or two relative hops: the only ways to leave `features/config/` for a sibling feature.
        selector: "ImportDeclaration[source.value=/^(#features.|\\.\\.\\S\\.\\.\\S)/]",
        message: "The config content host reads bodies off the registries; it does not import another feature's internals.",
      },
    ],
  },
];

// Client seals: one door per capability. These match the written name of the sealed symbol (its import
// specifier, a namespace or computed member read), so a barrel that renames the symbol on re-export is not followed.
const BOUND_FIELDS_ROOT = "packages/client/src/forms/editor/bound-fields";
const STATE_ROOT = "packages/client/src/state";
const REGISTRY_FACTORY_NAMES = ["createRegistry", "createContributorRegistry"];
const REGISTRY_FACTORIES = alternation(REGISTRY_FACTORY_NAMES);
// The written name read three ways: an import specifier, a member read (dotted, bracketed or template), and a destructured binding.
const sealedName = (name) =>
  `ImportSpecifier[imported.name='${name}'], MemberExpression${memberNamed(name)}, ObjectPattern > Property[computed=false][key.name='${name}']`;
const REGISTRY_CONTEXT_MESSAGE =
  "A createContext typed over a registry belongs in the createRegistryContext mint (packages/client/src/lib/create-registry-context.tsx); a hand-rolled context, hook and provider trio drifts from the one shape.";
const REGISTRY_CONTEXT_UNREADABLE =
  "This createContext call is on a receiver that is not an import, so whether it is React's context constructor cannot be established. Reported rather than passed; call createContext through a named React import.";
const REGISTRY_NAME = /Registry$/u;
const REGISTRY_ALIAS_HOPS = 8;
// Identity is read from the file's own imports: React's createContext, or a project module's re-export of it (named, renamed, or off a namespace), and every
// *Registry type imported under any local name, plus the local type aliases that reach one. A *Registry type that a
// different module declares under a name without "Registry" in it is not followed.
function writtenTypeNames(type) {
  if (type.type === "TSUnionType") {
    return type.types.flatMap(writtenTypeNames);
  }
  return type.type === "TSTypeReference" ? [type.typeName] : [];
}
function namesRegistry(typeName, registryNames) {
  if (typeName.type === "Identifier") {
    return registryNames.has(typeName.name);
  }
  return typeName.type === "TSQualifiedName" && REGISTRY_NAME.test(typeName.right.name);
}
// A module of this project (relative, `#` or `@orb/`) that re-exports React's createContext keeps its identity; another package's does not.
const PROJECT_MODULE = /^(?:\.|#|@orb\/)/u;
function recordRegistryImport(node, imports) {
  const react = node.source.value === "react" || PROJECT_MODULE.test(node.source.value);
  for (const specifier of node.specifiers) {
    const named = specifier.type === "ImportSpecifier";
    const local = specifier.local.name;
    if (react && named && specifier.imported.name === "createContext") {
      imports.constructors.add(local);
    } else if (react && !named) {
      imports.namespaces.add(local);
    } else {
      imports.others.add(local);
    }
    if (named && REGISTRY_NAME.test(specifier.imported.name)) {
      imports.registryNames.add(local);
    }
  }
}
// A computed member is the constructor when it is a string literal or a template without substitutions that spells the name.
function isCreateContextMember(callee) {
  if (callee.type !== "MemberExpression") {
    return false;
  }
  if (!callee.computed) {
    return callee.property.name === "createContext";
  }
  const { property } = callee;
  if (property.type === "TemplateLiteral") {
    return property.expressions.length === 0 && property.quasis[0].value.cooked === "createContext";
  }
  return property.type === "Literal" && property.value === "createContext";
}
function createContextVerdict(callee, imports) {
  if (callee.type === "Identifier") {
    return imports.constructors.has(callee.name) ? "react" : "other";
  }
  if (!isCreateContextMember(callee)) {
    return "other";
  }
  const receiver = callee.object.type === "Identifier" ? callee.object.name : undefined;
  if (receiver !== undefined && imports.namespaces.has(receiver)) {
    return "react";
  }
  return receiver !== undefined && imports.others.has(receiver) ? "other" : "unreadable";
}
function closeRegistryAliases(aliases, registryNames) {
  for (let hop = 0; hop < REGISTRY_ALIAS_HOPS; hop += 1) {
    const known = registryNames.size;
    for (const { name, refs } of aliases) {
      if (refs.some((ref) => namesRegistry(ref, registryNames))) {
        registryNames.add(name);
      }
    }
    if (registryNames.size === known) {
      return;
    }
  }
}
const registryContextRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const imports = { constructors: new Set(), namespaces: new Set(), others: new Set(), registryNames: new Set() };
    const aliases = [];
    const calls = [];
    return {
      "ImportDeclaration:exit"(node) {
        recordRegistryImport(node, imports);
      },
      "TSTypeAliasDeclaration:exit"(node) {
        aliases.push({ name: node.id.name, refs: writtenTypeNames(node.typeAnnotation) });
      },
      "CallExpression:exit"(node) {
        const argument = (node.typeArguments ?? node.typeParameters)?.params[0];
        if (argument !== undefined) {
          calls.push({ callee: node.callee, argument });
        }
      },
      "Program:exit"() {
        closeRegistryAliases(aliases, imports.registryNames);
        for (const { callee, argument } of calls) {
          const verdict = createContextVerdict(callee, imports);
          if (verdict === "unreadable") {
            context.report({ node: argument, message: REGISTRY_CONTEXT_UNREADABLE });
          } else if (verdict === "react" && writtenTypeNames(argument).some((ref) => namesRegistry(ref, imports.registryNames))) {
            context.report({ node: argument, message: REGISTRY_CONTEXT_MESSAGE });
          }
        }
      },
    };
  },
};
const STATE_MINT_NAMES = ["create", "createStore", "createGatedStore", "createEntityDraftStore"];
const STATE_MINT = alternation(STATE_MINT_NAMES);
const STATE_MAX_FIELDS = 10;
const STATE_FIELD_CAP_MESSAGE = `A state store initializer declares more than ${STATE_MAX_FIELDS} top-level fields; the store is doing several jobs, so split it.`;
const STATE_FILES_SELECTORS = [
  {
    selector: `CallExpression[callee.name=${STATE_MINT}] > ArrowFunctionExpression[body.type='ObjectExpression'][body.properties.length>${STATE_MAX_FIELDS}]`,
    message: STATE_FIELD_CAP_MESSAGE,
  },
  {
    selector: `CallExpression[callee.name=${STATE_MINT}] > :matches(ArrowFunctionExpression, FunctionExpression) > BlockStatement > ReturnStatement > ObjectExpression[properties.length>${STATE_MAX_FIELDS}]`,
    message: STATE_FIELD_CAP_MESSAGE,
  },
];
// The selector arms plus two walks esquery cannot express: the per-file mint tally (the second mint is the finding) and
// the exported-handle spine, which follows the callee chain of `create<T>()(...)` to any depth.
const stateFilesRule = (() => {
  const selectorRule = restrictionRule({ selectors: STATE_FILES_SELECTORS });
  return {
    meta: selectorRule.meta,
    create(context) {
      let mints = 0;
      return {
        ...selectorRule.create(context),
        "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator"(node) {
          for (let cursor = node.init; cursor?.type === "CallExpression"; cursor = cursor.callee) {
            if (cursor.callee.type === "Identifier" && STATE_MINT_NAMES.includes(cursor.callee.name)) {
              context.report({
                node,
                message:
                  "The minted store handle is exported. Export intent-named actions and narrow read hooks, never a raw set/getState handle across the module boundary.",
              });
              return;
            }
          }
        },
        [`CallExpression[callee.name=${STATE_MINT}]`](node) {
          mints += 1;
          if (mints > 1) {
            context.report({ node, message: "A second store-minting call in one state file; one store per file, so split them." });
          }
        },
      };
    },
  };
})();
const CLIENT_SEAL_RESTRICTIONS = [
  {
    id: "bound-field-via-hook",
    scope: [`${BOUND_FIELDS_ROOT}/**/*.{ts,tsx}`],
    homes: [
      {
        path: `${BOUND_FIELDS_ROOT}/use-bound-field.ts`,
        why: "useBoundField is the one home for the bound-field wiring; it reads the raw form context once, so the seal cannot be built without the read it seals",
      },
    ],
    selectors: [
      {
        selector: sealedName("useFieldContext"),
        message:
          "A bound field reaches the raw useFieldContext form context directly. Use useBoundField<T>(shell) from ./use-bound-field; every bound field's context read, touch-gated error and Field prop bundle live in that one hook.",
      },
    ],
  },
  {
    id: "chat-stream-writes-in-bus-only",
    scope: AUTHORED_SRC,
    notUnder: [TEST_FILES, "**/*.spec.{ts,tsx}", ...STRICT_SYNTAX_IGNORES],
    homes: [
      {
        path: "packages/client/src/data/bus/chat-bus-writes.ts",
        why: "the bus applier is the one writer the rule exists to make singular: it turns bus events into turn-slot writes",
      },
    ],
    selectors: [
      {
        selector: sealedName("chatStream"),
        message:
          "The chatStream write api is taken outside the bus applier. Turn slots are driven by bus events through applyChatBusEvent only; components read with useTurnSlot and useTurnPhase.",
      },
    ],
  },
  {
    id: "bus-on-data-no-store-write",
    scope: ["packages/client/src/data/bus/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector:
          ":matches(Property, MethodDefinition)[key.name=/^(onData|onConnectionStateChange)$/] CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.property.name='setState']",
        message:
          "A raw store write (.setState) inside a bus onData or onConnectionStateChange body forks canon into a second store. Route into the pure reducer (apply-chat-bus-event.ts), buffer through the chatStream api, or drive the invalidation seam.",
      },
    ],
  },
  {
    id: "selection-store-via-factory",
    scope: [`${STATE_ROOT}/*-selection-store.ts`],
    homes: [
      {
        path: `${STATE_ROOT}/create-drill-selection-store.ts`,
        why: "the drill factory composes the raw createGatedStore door on purpose; that composition is the seal every per-section selection store mints through",
      },
      {
        path: `${STATE_ROOT}/create-kinded-selection-store.ts`,
        why: "the kinded-selection factory is the same composition one shape over",
      },
      {
        path: `${STATE_ROOT}/message-selection-store.ts`,
        why: "message selection is a bulk multi-select (presence in a Set keyed by message id), a shape the drill factory does not model",
      },
    ],
    selectors: [
      {
        selector: sealedName("createGatedStore"),
        message:
          "A *-selection-store.ts mints the raw createGatedStore door directly. Mint it with createDrillSelectionStore(name, { secondary? }); the per-section drill stores are one shape.",
      },
    ],
  },
  {
    id: "registry-assembly-at-door-only",
    scope: [CLIENT_SRC],
    notUnder: ["packages/client/src/main.tsx", "packages/client/src/**/compose/**"],
    homes: [],
    selectors: [
      {
        selector: `ImportSpecifier[imported.name=${REGISTRY_FACTORIES}], ${REGISTRY_FACTORY_NAMES.map((name) => `MemberExpression${memberNamed(name)}`).join(", ")}, ObjectPattern > Property[computed=false][key.name=${REGISTRY_FACTORIES}]`,
        message:
          "createRegistry and createContributorRegistry are called only at the composition root (main.tsx) or in a compose/ module; any other call site is a private assembly outside the one registration door.",
      },
    ],
  },
  {
    id: "registry-context-via-mint",
    scope: [CLIENT_SRC],
    homes: [],
    selectors: [],
  },
  {
    id: "state-files",
    scope: [`${STATE_ROOT}/*.{ts,tsx}`],
    notUnder: [`${STATE_ROOT}/index.ts`],
    homes: [],
    selectors: STATE_FILES_SELECTORS,
  },
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

// A `page.route` is buried by a LATER `routeTrpc` registered as a sibling statement: Playwright resolves routes LIFO and
// `routeTrpc`'s handler never falls back, so the earlier route never runs. Each side is a statement whose leading call
// (optionally awaited, bound or returned) is the registration; the finding lands on the burying `routeTrpc` statement.
const TRPC_ROUTE_PATTERN = String.raw`/^\*\*\/api\/trpc/`;
const PAGE_ROUTE_CALL = "CallExpression[callee.object.name='page'][callee.property.name='route']";
const TRPC_PAGE_ROUTES = [
  `${PAGE_ROUTE_CALL}[arguments.0.value=${TRPC_ROUTE_PATTERN}]`,
  `${PAGE_ROUTE_CALL}[arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=${TRPC_ROUTE_PATTERN}]`,
  `${PAGE_ROUTE_CALL}[arguments.0.expression.value=${TRPC_ROUTE_PATTERN}]`,
];
const leadingCallStatements = (calls) =>
  `:matches(${calls
    .flatMap((call) => [
      `:matches(ExpressionStatement, ReturnStatement):has(> ${call})`,
      `:matches(ExpressionStatement, ReturnStatement):has(> AwaitExpression:has(> ${call}))`,
      `VariableDeclaration:has(> VariableDeclarator:has(> ${call}))`,
      `VariableDeclaration:has(> VariableDeclarator:has(> AwaitExpression:has(> ${call})))`,
    ])
    .join(", ")})`;
const CT_SPEC_RESTRICTIONS = [
  {
    id: "testid-typed-only-stories",
    scope: ["tests/**/_*stories.tsx", "tests/**/*.stories.tsx"],
    notUnder: [`${LEGACY_TEST_ROOT}/**`],
    homes: [],
  },
  {
    id: "route-trpc-lifo-order",
    scope: ["tests/**/*.ct.tsx"],
    notUnder: [`${LEGACY_TEST_ROOT}/**`],
    homes: [],
    selectors: [
      {
        selector: `${leadingCallStatements(TRPC_PAGE_ROUTES)} ~ ${leadingCallStatements(["CallExpression[callee.name='routeTrpc']"])}`,
        message:
          'A `page.route("**/api/trpc...")` registered before this routeTrpc never runs: Playwright resolves routes LIFO and routeTrpc answers every trpc request. Register the override after routeTrpc, or use trpcHold() and barrier on hold.requested.',
      },
    ],
  },
];

const PROTOTYPE_NATIVE_IGNORES = [...STRICT_SYNTAX_IGNORES, "**/*.d.{ts,mts,cts}", "tooling/src/snap/lib/devtools-frontend/**"];
const PROTOTYPE_MUTATION_SELECTORS = [
  {
    selector: [
      ["Object", ["defineProperty", "defineProperties", "assign"]],
      ["Reflect", ["defineProperty", "set", "deleteProperty"]],
    ]
      .map(
        ([owner, methods]) =>
          `CallExpression[callee.type='MemberExpression'][callee.object.name='${owner}'][arguments.0.type='MemberExpression']` +
          ":matches([arguments.0.computed=false][arguments.0.property.name='prototype'], " +
          "[arguments.0.computed=true][arguments.0.property.value='prototype'], " +
          "[arguments.0.computed=true][arguments.0.property.expressions.length=0][arguments.0.property.quasis.0.value.cooked='prototype'])" +
          `:matches([callee.computed=false][callee.property.name=${alternation(methods)}], ` +
          `[callee.computed=true][callee.property.value=${alternation(methods)}], ` +
          `[callee.computed=true][callee.property.expressions.length=0][callee.property.quasis.0.value.cooked=${alternation(methods)}])`,
      )
      .join(", "),
    message: "Prototype mutation invalidates native own-data provenance; define data on the owning object instead.",
  },
];

// One-home bans: each names the module that owns a capability, and the rest of the product stays out of it.
const INFERENCE_MODULE = String.raw`[source.value=/(^|\x2f|#)inference(\x2f|$)/]`;
const PLANNER_INTERNALS = alternation(["scrubWireSchema", "scrubViolations", "countWireSchemas", "acceptsNamedToolChoice", "acceptsRequiredToolChoice"]);
const STRUCTURED_VEHICLE_VALUES = alternation(STRUCTURED_VEHICLES);
const TOOL_CHOICE_KEY = "toolChoice";
const STRUCTURED_PLAN_MESSAGE =
  "How a schema, a vehicle or a tool choice goes out is the structured planner's alone (packages/inference/src/structured/plan.ts); state the need through planStructuredFor, carriesStructured or forcesToolRound.";
const MACRO_RESOLVER_NAMES = alternation(["resolveRowMacros", "processMacros", "createMacroContext", "evaluateMacros", "renderMessageForDisplay"]);
const MACRO_RESOLUTION_MESSAGE =
  "Macro resolution must stay read-only: saving a resolved field destroys its template. Editable surfaces display and persist the raw template text; a read-only display home is declared on this row.";
const CONTENT_PART_NAME = "ChatContentPart";
const CONTENT_PART_MESSAGE =
  "ChatContentPart is named outside the D51 seam: it is produced once at the request seam's conversion (domain/chat/substrate/wire-history.ts) and consumed by the sealed runner tier; everything upstream stays `content: string`.";
const WIRE_VOCABULARY_MESSAGE =
  "A JSON-Schema wire keyword table is spelled outside the one scrub engine and its inverse lift reader (D93); call scrubWireSchema with the mode this wire speaks, and add a new subset as a mode in packages/contracts/src/inference/wire-subset.ts.";
const MODEL_PROSE_MESSAGE =
  "Model-facing prose is hardcoded at a prompt-assembly seam. Every string whose bytes reach a model is a PROSE-1 slot (a shipped default in a contracts prose catalog, resolved with resolveProse), not a constant (D132).";
const MODEL_PROSE_MIN_WORDS = 12;
const MODEL_PROSE_LOWER_RUN = /[a-z]{3,}/u;
const MODEL_PROSE_OPERATOR_CALLEE = /^(?:logger|log|console)\b|getLog\(\)/u;
// The two vocabularies below come off the wire-subset engine; carrying their digest in the block settings makes a
// vocabulary change invalidate ESLint's result cache for every file these bans judge.
const SERVER_ONE_HOME_SETTINGS = {
  "orb/server-one-home-vocabulary": createHash("sha256")
    .update(JSON.stringify([STRUCTURED_VEHICLES, WIRE_SCHEMA_KEYWORD_VOCABULARY]))
    .digest("hex"),
};

const SERVER_ONE_HOME_RESTRICTIONS = [
  {
    id: "structured-plan-one-home",
    scope: rootSources("@server", "@client", "@contracts", "@kit"),
    notUnder: [TEST_FILES, "packages/contracts/src/inference/**"],
    homes: [],
    selectors: [
      {
        selector: `:matches(ImportDeclaration, ExportNamedDeclaration)${INFERENCE_MODULE} > :matches(ImportSpecifier:matches([imported.name=${PLANNER_INTERNALS}], [imported.value=${PLANNER_INTERNALS}]), ExportSpecifier:matches([local.name=${PLANNER_INTERNALS}], [local.value=${PLANNER_INTERNALS}]))`,
        message: STRUCTURED_PLAN_MESSAGE,
      },
      {
        selector: `MemberExpression:matches([computed=false][property.name=${PLANNER_INTERNALS}], [computed=true][property.value=${PLANNER_INTERNALS}])`,
        message: STRUCTURED_PLAN_MESSAGE,
      },
      {
        selector: `:matches(Literal[value=${STRUCTURED_VEHICLE_VALUES}], TemplateLiteral[expressions.length=0][quasis.0.value.cooked=${STRUCTURED_VEHICLE_VALUES}])`,
        message: STRUCTURED_PLAN_MESSAGE,
      },
    ],
  },
  {
    id: "wire-schema-vocab-one-home",
    scope: rootSources("@server", "@kit", "@inference"),
    notUnder: [TEST_FILES],
    homes: [
      {
        path: "packages/kit/src/json-schema/lift.ts",
        why: "the inverse reader paired with the canonical wire-subset scrub engine (D93); it must recognise the same keyword vocabulary the engine strips",
      },
    ],
  },
  {
    id: "macro-resolution-home",
    scope: rootSources("@client", "@ui"),
    homes: [
      {
        path: "packages/client/src/features/chat/components/ghost-message-row.tsx",
        why: "renders the streaming ghost's read-only content and reasoning through the display pipeline used after commit",
      },
      {
        path: "packages/client/src/features/chat/components/message-content.tsx",
        why: "renders the transcript's read-only Markdown; its edit path swaps to the raw-text textarea before resolution",
      },
      {
        path: "packages/client/src/lib/message-render.ts",
        why: "the canonical client display pipeline: it resolves the kit row atom into Markdown output, never into a writable field",
      },
      {
        path: "packages/client/src/features/chat/components/message-row-parts.tsx",
        why: "resolves settled reasoning and content for the transcript row; its editing branch returns the raw-text textarea first",
      },
    ],
    selectors: [
      {
        selector: `ImportSpecifier:matches([imported.name=${MACRO_RESOLVER_NAMES}], [imported.value=${MACRO_RESOLVER_NAMES}])`,
        message: MACRO_RESOLUTION_MESSAGE,
      },
      { selector: `CallExpression[callee.type='Identifier'][callee.name=${MACRO_RESOLVER_NAMES}]`, message: MACRO_RESOLUTION_MESSAGE },
    ],
  },
  {
    id: "content-part-seam",
    scope: POPULATION_SETS["@product"].flatMap((ref) => rootSources(ref)),
    homes: [
      {
        path: "packages/server/src/domain/chat/contract/results.ts",
        why: "the domain-side request DTO the seam populates: `content: ChatContentPart[]` handed to the runner",
      },
      {
        path: "packages/server/src/domain/chat/substrate/wire-history.ts",
        why: "the one producer: the CONVERT step that turns shaped history into content parts (D51)",
      },
      {
        path: "packages/inference/src/contract/chat.ts",
        why: "the sealed runner tier's request contract, and the shapes derived from it with Extract",
      },
      {
        path: "packages/inference/src/backends/wire/history.ts",
        why: "the shared history converter every openai-shaped backend calls: it maps content parts onto its wire",
      },
      {
        path: "packages/inference/src/backends/v4/prompt.ts",
        why: "the V4 prompt converter reads the parts to lift outbound media before the vendor converter drops what its spec type merely permits",
      },
    ],
    selectors: [
      { selector: `ImportSpecifier:matches([imported.name='${CONTENT_PART_NAME}'], [imported.value='${CONTENT_PART_NAME}'])`, message: CONTENT_PART_MESSAGE },
      { selector: `TSQualifiedName[right.name='${CONTENT_PART_NAME}']`, message: CONTENT_PART_MESSAGE },
      { selector: `TSImportType[qualifier.name='${CONTENT_PART_NAME}']`, message: CONTENT_PART_MESSAGE },
    ],
  },
  {
    id: "no-hardcoded-model-prose",
    scope: [...MODEL_PROSE_SEAM_PREFIXES.map((prefix) => `${prefix}**/*.{ts,tsx}`), ...MODEL_PROSE_SEAM_FILES],
    homes: [],
  },
];

// A file that spells two distinct JSON-Schema keywords is a second keyword table, wherever the strings sit.
const wireSchemaVocabularyRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const vocabulary = new Set(WIRE_SCHEMA_KEYWORD_VOCABULARY);
    const spelled = new Map();
    const note = (node, value) => {
      if (vocabulary.has(value) && !spelled.has(value)) {
        spelled.set(value, node);
      }
    };
    return {
      Literal: (node) => {
        if (typeof node.value === "string") {
          note(node, node.value);
        }
      },
      TemplateLiteral: (node) => {
        if (node.expressions.length === 0) {
          note(node, node.quasis[0].value.cooked);
        }
      },
      "Program:exit": () => {
        if (spelled.size >= 2) {
          const anchor = [...spelled.values()].toSorted((left, right) => left.range[0] - right.range[0])[0];
          context.report({ node: anchor, message: WIRE_VOCABULARY_MESSAGE });
        }
      },
    };
  },
};

/** The string a literal or a substitution-free template spells. */
function staticLiteralText(node) {
  if (node.type === "Literal") {
    return typeof node.value === "string" ? node.value : undefined;
  }
  return node.type === "TemplateLiteral" && node.expressions.length === 0 ? node.quasis[0].value.cooked : undefined;
}

/** The string a same-file `const` is bound to, when its initializer is a string literal. */
function constantText(name, scope) {
  for (let current = scope; current !== null; current = current.upper) {
    const definition = current.set.get(name)?.defs[0];
    if (current.set.has(name)) {
      // A `for (const key of …)` binding has no initializer.
      let init = definition?.type === "Variable" && definition.parent.kind === "const" ? (definition.node.init ?? undefined) : undefined;
      while (init?.type === "TSAsExpression" || init?.type === "TSSatisfiesExpression") {
        init = init.expression;
      }
      return init === undefined ? undefined : staticLiteralText(init);
    }
  }
}

/** The string a member or property key spells statically: a plain name, a literal, or a const-bound computed key. */
function staticKeyText(key, computed, scopeOf) {
  if (key.type !== "Identifier") {
    return staticLiteralText(key);
  }
  return computed ? constantText(key.name, scopeOf()) : key.name;
}

// A tool choice is decided by the structured plan; any write of one outside it is a second decider.
const structuredPlanRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const entry = SERVER_ONE_HOME_RESTRICTIONS.find(({ id }) => id === "structured-plan-one-home");
    const writes = (key, computed, node) => {
      if (staticKeyText(key, computed, () => context.sourceCode.getScope(node)) === TOOL_CHOICE_KEY) {
        context.report({ node: key, message: STRUCTURED_PLAN_MESSAGE });
      }
    };
    return {
      ...restrictionRule(entry).create(context),
      Property: (node) => {
        if (node.parent.type === "ObjectExpression") {
          writes(node.key, node.computed, node);
        }
      },
      AssignmentExpression: (node) => {
        if (node.operator === "=" && node.left.type === "MemberExpression") {
          writes(node.left.property, node.left.computed, node);
        }
      },
    };
  },
};

function modelProseText(node) {
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? node.value : "";
    case "TemplateLiteral":
      return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(" ");
    case "BinaryExpression":
      return `${modelProseText(node.left)} ${modelProseText(node.right)}`;
    case "ArrayExpression":
      return node.elements.map((element) => (element === null ? "" : modelProseText(element))).join(" ");
    case "CallExpression":
      return node.callee.type === "MemberExpression" && node.callee.object.type === "ArrayExpression" ? modelProseText(node.callee.object) : "";
    default:
      return "";
  }
}

/** Climb from a literal to the outermost same-unit aggregation (`+` chain or `[…].join(…)`), so a chunk-split dodge is one unit. */
function modelProseUnit(literal) {
  let top = literal;
  for (;;) {
    const parent = top.parent;
    if (parent?.type === "BinaryExpression" && parent.operator === "+") {
      top = parent;
    } else if (
      parent?.type === "ArrayExpression" &&
      parent.parent?.type === "MemberExpression" &&
      !parent.parent.computed &&
      parent.parent.property.name === "join" &&
      parent.parent.parent?.type === "CallExpression"
    ) {
      top = parent.parent.parent;
    } else {
      return top;
    }
  }
}

// A refusal, a log line or a thrown error faces an operator, never a model.
function isOperatorFacing(node, sourceCode) {
  for (let current = node; current !== undefined && current !== null; current = current.parent) {
    if (current.type === "ThrowStatement") {
      return true;
    }
    if (current.type === "NewExpression" && sourceCode.getText(current.callee).endsWith("Error")) {
      return true;
    }
    if (current.type === "CallExpression" && MODEL_PROSE_OPERATOR_CALLEE.test(sourceCode.getText(current.callee))) {
      return true;
    }
  }
  return false;
}

const modelProseRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const judged = new Set();
    const check = (node) => {
      const top = modelProseUnit(node);
      if (judged.has(top)) {
        return;
      }
      judged.add(top);
      const text = modelProseText(top);
      if ((text.match(/\S+/gu) ?? []).length >= MODEL_PROSE_MIN_WORDS && MODEL_PROSE_LOWER_RUN.test(text) && !isOperatorFacing(top, context.sourceCode)) {
        context.report({ node: top, message: MODEL_PROSE_MESSAGE });
      }
    };
    return {
      Literal: (node) => {
        if (typeof node.value === "string") {
          check(node);
        }
      },
      TemplateLiteral: check,
    };
  },
};

// HARD bans on the verify framework's own gate modules. They are registered on `restrictionPlugin` and enabled
// only by `hardConfig`: never spread into RESTRICTIONS, so no inline disable, bulk suppression or home can excuse them.
const GATE_MODULES = ["tooling/src/verify/gates/**/*.{ts,tsx}"];
const GATE_PROOF_FIXTURES = ["tooling/src/verify/gates/_proof/**"];
const BINDING_RESOLUTION_MESSAGE =
  "A gate module resolves no binding or origin itself (docs/law/gate-runtime-standardization.md §3): read through floor/code-facts/reference-fact.ts (resolveStableExpression, resolveModuleMemberOrigin, resolveGlobalMemberOrigin) or lib/origin-verdict.ts, or add the missing question to a shared reader.";
const bindingMember = (name) => ({
  selector: `:matches(MemberExpression${memberNamed(name)}, ObjectPattern > Property[computed=false][key.name='${name}'])`,
  message: `${BINDING_RESOLUTION_MESSAGE} Member: \`${name}\`.`,
});
// `Symbol#getDeclarations` shares its name with the syntax accessors on variable statements, so only the chain that
// starts at a symbol read is a resolution.
const symbolRead = (prefix) =>
  `[${prefix}type='CallExpression'][${prefix}callee.type='MemberExpression']:matches(${memberNamed("getSymbol", `${prefix}callee.`)}, ${memberNamed("getSymbolOrThrow", `${prefix}callee.`)})`;
const VERIFY_HARD_RESTRICTIONS = [
  {
    id: "policy-binding-resolution",
    scope: GATE_MODULES,
    notUnder: GATE_PROOF_FIXTURES,
    homes: [],
    selectors: [
      ...["getDefinitionNodes", "getDefinitions", "findReferences", "findReferencesAsNodes", "getImplementations"].map(bindingMember),
      ...["getValueDeclaration", "getValueDeclarationOrThrow", "getAliasedSymbol", "getAliasedSymbolOrThrow"].map(bindingMember),
      {
        selector: `MemberExpression${memberNamed("getDeclarations")}:matches(${symbolRead("object.")}, [object.type='TSNonNullExpression']${symbolRead("object.expression.")})`,
        message: `${BINDING_RESOLUTION_MESSAGE} Member: \`getDeclarations\`.`,
      },
    ],
  },
];

// D34: the db never re-spells a union. The runtime half (tests/db/schema/enum-tuples.suite.test.ts) judges the values.
const DB_SCHEMA_RESTRICTIONS = [
  {
    id: "db-enum-from-tuple",
    scope: ["packages/db/src/schema/**/*.ts"],
    homes: [],
    selectors: [
      {
        selector: "Property:matches([key.name='enum'], [key.value='enum']) :matches(ArrayExpression, CallExpression)",
        message:
          "A Drizzle column enum derives from a named tuple (an @orb/contracts or @orb/kit export, or a local `as const satisfies` tuple), never an inline array or a call result (D34).",
      },
    ],
  },
];

// ── Tooling plumbing literals (Core-Tooling-Law §4.4): ONE port registry, ONE load-budget policy ──────────────
// A number has no declaration to resolve, so both laws are syntax: a numeric literal and the NAME of its position.
// The registry values are IMPORTED, so a new reserved row or stage band widens the port law without an edit here.
// The root runner configs take the same selectors in the HARD profile (`hardConfig`).
const PORT_POSITION_NAMES = String.raw`/^port$|Port$|_PORT$|^PORT$/`;
const WALL_CLOCK_OPTION_NAMES = alternation(["timeout", "timeoutMs", "testTimeout", "hookTimeout", "actionTimeout", "navigationTimeout"]);
const keyNamed = (names) => `:matches(Property[computed=false][key.type='Identifier'][key.name=${names}], Property[key.type='Literal'][key.value=${names}])`;
const REGISTRY_PORT_VALUES = [...new Set([...RESERVED_PORT_NUMBERS, ...STAGE_BAND_PORT_NUMBERS])].map((port) => `[value=${port}]`).join(", ");
const PORT_LITERAL_SELECTOR = `Literal[value=type(number)]:matches(${REGISTRY_PORT_VALUES}, ${keyNamed(PORT_POSITION_NAMES)} > .value, VariableDeclarator[id.type='Identifier'][id.name=${PORT_POSITION_NAMES}] > .init)`;
const PORT_LITERAL_MESSAGE =
  "A TCP port outside the one registry: read the named row from floor/host/ports.ts or allocate a stage band; a new port is a new reserved row there, never a number picked at the call site (Core-Tooling-Law §4.4).";
// A name carrying BASE is the sanctioned quiet-box declaration; `*_BUDGET_MS` is a verdict threshold, not a clock.
const WALL_CLOCK_SELECTORS = [
  `${keyNamed(WALL_CLOCK_OPTION_NAMES)} > Literal.value[value=type(number)]`,
  "VariableDeclarator[id.type='Identifier'][id.name=/(?:_TIMEOUT_MS|TimeoutMs)$/]:not([id.name=/BASE|Base/]) > Literal.init[value=type(number)]",
  "CallExpression[callee.type='Identifier'][callee.name='setTimeout'][arguments.1.type='Literal'][arguments.1.value=type(number)][arguments.1.value>=5000]",
];
const WALL_CLOCK_MESSAGE =
  "A fixed wall clock reads as a false red on a contended box: name the quiet-box literal <X>_BASE_MS and derive the ceiling with budget(<X>_BASE_MS) (tooling) or scaledBudget(<X>_BASE_MS) (tests/tooling/_load-budget.ts) (Core-Tooling-Law §4.4).";
const VENDORED_DEVTOOLS = "tooling/src/snap/lib/devtools-frontend/**";
const TOOLING_LITERAL_RESTRICTIONS = [
  {
    id: "tooling-clock-budget",
    scope: ["tooling/src/**/*.{ts,tsx}", "tests/tooling/**/*.{ts,tsx}"],
    notUnder: [VENDORED_DEVTOOLS],
    homes: [],
    selectors: WALL_CLOCK_SELECTORS.map((selector) => ({ selector, message: WALL_CLOCK_MESSAGE })),
  },
  {
    id: "tooling-port-registry",
    scope: ["tooling/src/**/*.{ts,tsx}", "tests/e2e/support/**/*.{ts,tsx}"],
    notUnder: [VENDORED_DEVTOOLS],
    homes: [{ path: "tooling/src/floor/host/ports.ts", why: "the registry is the one module that spells port numbers; every other file reads a named row" }],
    selectors: [{ selector: PORT_LITERAL_SELECTOR, message: PORT_LITERAL_MESSAGE }],
  },
];
const RUNNER_CONFIG_FILES = ["vitest.config.ts", "playwright*.config.ts"];
// The retired `@orb-gate-ignore` grammar suppresses nothing; a comment that opens with it reads like protection it
// no longer gives. `location: "start"` is the mention fence: prose and string fixtures that quote it stay inert.
const RETIRED_GATE_MARKER = { terms: ["@orb-gate-ignore"], location: "start" };
// The node helper executables are `.mjs`; the retired gate's harness corpus loaded them beside the TS sources.
const RETIRED_GATE_MARKER_FILES = ["packages/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "tooling/src/**/*.{ts,tsx}", `${HELPER_WORLD_DIRS.node}/**/*.mjs`];

// ── UI primitive walls ─────────────────────────────────────────────────────────────────────────────────
// Variant constructors stay private and SVG geometry goes through the icon API: ordinary rules. CT color, CT inline
// providers and overlay anatomy are HARD: the retired gate took its exceptions as central reviewed grants, so no
// inline disable may excuse them. They are registered with the plugin below and enabled only in `hardConfig`.
// The retired gate judged a CT color per source line: a color call opened on a line whose text reaches a digit before
// any `)`, or a hex literal. A line-text test follows a call split across concatenation operands, template chunks or a
// `.join` array, which no node-shaped selector can. Comments and test narration (a title, an `expect` message) are
// blanked first; template substitutions stay executable evidence.
const CT_COLOR_LINE = /(?:oklch|\brgba?)\\?\((?=[^)\n]*\d)|#[0-9a-fA-F]{3,8}\b/u;
const CT_NARRATION_CALLEES = new Set(["test", "it", "describe", "suite", "bench"]);
const calleeRoot = (callee) => {
  let node = callee;
  while (node.type === "MemberExpression" && !node.computed) {
    node = node.object;
  }
  return node.type === "Identifier" ? node.name : undefined;
};
const narrationArgIndex = (root) => {
  if (root === "expect") {
    return 1;
  }
  return CT_NARRATION_CALLEES.has(root) ? 0 : -1;
};
const uiCtColorRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const { sourceCode } = context;
    const blanked = sourceCode.getAllComments().map(({ range }) => range);
    return {
      "CallExpression[arguments.length>0]"(call) {
        const arg = call.arguments[narrationArgIndex(calleeRoot(call.callee))];
        if (arg?.type === "Literal" && typeof arg.value === "string") {
          blanked.push(arg.range);
        } else if (arg?.type === "TemplateLiteral") {
          blanked.push(...arg.quasis.map(({ range }) => range));
        }
      },
      "Program:exit"() {
        let text = sourceCode.text;
        for (const [start, end] of blanked) {
          text = text.slice(0, start) + text.slice(start, end).replace(/[^\r\n]/gu, " ") + text.slice(end);
        }
        text.split(/\r?\n/u).forEach((line, index) => {
          const column = line.search(CT_COLOR_LINE);
          if (column >= 0) {
            context.report({ loc: { line: index + 1, column }, message: "A hardcoded color in a CT: assert colors through TOKENS." });
          }
        });
      },
    };
  },
};
const OVERLAY_PART = (part) => `:matches(MemberExpression[computed=false], JSXMemberExpression)[property.name='${part}']`;
const OVERLAY_DIRS = { anchored: ["popover", "menu", "select", "autocomplete", "tooltip"], modal: ["dialog", "alert-dialog", "drawer"] };
const overlayScope = (names) => names.map((name) => `packages/ui/src/primitives/${name}/${name}.tsx`);
const UI_PRIMITIVE_RESTRICTIONS = [
  {
    id: "ui-variants-barrel-private",
    scope: ["packages/ui/src/**/index.ts"],
    homes: [],
    selectors: [
      {
        selector: ":matches(ExportAllDeclaration, ExportNamedDeclaration)[source.value=/(^|\\u002F)variants$/]",
        message: "A barrel never re-exports its private variants: a feature composing raw variants bypasses the component skin.",
      },
    ],
  },
  {
    id: "ui-no-inline-svg",
    scope: ["packages/ui/src/**/*.tsx"],
    notUnder: ["packages/ui/src/**/charts/**"],
    homes: [],
    selectors: [
      {
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='svg']",
        message: "No inline <svg> outside the chart layer: render the governed Icon component.",
      },
    ],
  },
];
const UI_CT_COLOR_RESTRICTION = { id: "ui-ct-no-color-literal", scope: ["tests/ui/**/*.ct.tsx"] };
const UI_HARD_RESTRICTIONS = [
  {
    id: "ui-ct-no-inline-provider",
    scope: ["tests/ui/**/*.ct.tsx", "tests/ui/**/*.fixtures.tsx"],
    homes: [],
    selectors: [
      {
        selector:
          "JSXOpeningElement:matches([name.type='JSXIdentifier'][name.name=/Provider$/], [name.type='JSXMemberExpression'][name.property.name=/Provider$/])",
        message: "An inline provider in a test: global providers live in CtProviders.",
      },
    ],
  },
  {
    id: "ui-overlay-anchored-anatomy",
    scope: overlayScope(OVERLAY_DIRS.anchored),
    homes: [],
    selectors: [
      {
        selector: `Program:has(${OVERLAY_PART("Popup")}):not(:has(${OVERLAY_PART("Positioner")}))`,
        message: "An anchored overlay with a .Popup needs its .Positioner.",
      },
    ],
  },
  {
    id: "ui-overlay-modal-anatomy",
    scope: overlayScope(OVERLAY_DIRS.modal),
    homes: [],
    selectors: [
      { selector: `Program:not(:has(${OVERLAY_PART("Backdrop")}):has(${OVERLAY_PART("Popup")}))`, message: "A modal overlay must use .Backdrop + .Popup." },
      { selector: `Program:has(${OVERLAY_PART("Positioner")})`, message: "A modal overlay must NOT have a .Positioner." },
    ],
  },
];

const RESTRICTIONS = [
  {
    id: "no-test-fabrication",
    scope: ["tests/**/*.{ts,tsx}"],
    notUnder: [`${LEGACY_TEST_ROOT}/**`],
    homes: [],
    selectors: [
      {
        selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
        message: "An assertion to any erases the test contract; build a real value or keep deliberate invalid-input evidence beside its boundary.",
      },
      {
        selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
        message: "An unknown double cast fabricates the target contract; build a real value or narrow it instead (D325).",
      },
    ],
  },
  {
    id: "no-prototype-mutation",
    scope: MAINTAINED_GLOBAL_SURFACES.flatMap(({ files }) => files),
    notUnder: PROTOTYPE_NATIVE_IGNORES,
    homes: [],
    selectors: PROTOTYPE_MUTATION_SELECTORS,
  },
  ...DB_SCHEMA_RESTRICTIONS,
  ...Z_INDEX_RESTRICTIONS,
  ...BASEUI_RESTRICTIONS,
  ...UI_PRIMITIVE_RESTRICTIONS,
  ...CLASS_TOKEN_RESTRICTIONS,
  ...DETERMINISM_RESTRICTIONS,
  ...INFRA_AUTH_RESTRICTIONS,
  ...TABLE_IMPORT_RESTRICTIONS,
  ...INSTRUMENT_VERDICT_RESTRICTIONS,
  ...CLASS_RESTRICTIONS,
  ...ROLE_DATA_RESTRICTIONS,
  ...TURN_IDENTITY_RESTRICTIONS,
  ...SERVER_SCOPE_RESTRICTIONS,
  ...CLIENT_REGISTRY_RESTRICTIONS,
  ...BUS_REGISTRY_RESTRICTIONS,
  ...CLIENT_DEFINITION_HOME_RESTRICTIONS,
  ...CLIENT_DEFINITION_LITERAL_RESTRICTIONS,
  ...CLIENT_CONFIG_HOST_RESTRICTIONS,
  ...CLIENT_CONTEXT_RESTRICTIONS,
  ...CLIENT_MAP_RESTRICTIONS,
  ...CLIENT_LEXICAL_RESTRICTIONS,
  ...MEMBERSHIP_WRITE_FAN_RESTRICTIONS,
  ...SERVER_ONE_HOME_RESTRICTIONS,
  ...CT_SPEC_RESTRICTIONS,
  ...TOOLING_LITERAL_RESTRICTIONS,
  // Only tooling drives browser pages, so app code may close over module scope.
  { id: "evaluate-no-scope-capture", scope: rootSources("@tooling"), homes: [] },
  { id: "assumes-single-replica", scope: rootSources("@server", "@inference"), notUnder: ["packages/server/src/**/persistence/**"], homes: [] },
  ...CLIENT_SEAL_RESTRICTIONS,
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

// These two policies retain authored regexes, static templates and the nearest carrier, not class extraction.
function rawTierClassRule(pattern, message) {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const report = (node) => {
        if (!pattern.test(context.sourceCode.getText(node))) {
          return;
        }
        const ancestors = context.sourceCode.getAncestors(node);
        const attribute = ancestors.findLast((ancestor) => ancestor.type === "JSXAttribute");
        const call = ancestors.findLast((ancestor) => ancestor.type === "CallExpression");
        if (
          (attribute?.name.type === "JSXIdentifier" && attribute.name.name === "className") ||
          (call?.callee.type === "Identifier" && call.range[0] === call.callee.range[0] && Z_CLASS_COMPOSERS.has(call.callee.name))
        ) {
          context.report({ node, message });
        }
      };
      return { "Literal[value=type(string)]": report, "TemplateLiteral[expressions.length=0]": report };
    },
  };
}

const DISPLAY_UTILITIES = new Set([
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "table",
  "inline-table",
  "table-caption",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row-group",
  "table-row",
  "flow-root",
  "list-item",
  "contents",
  "hidden",
]);
const HOVER_VARIANT_RE = /^(?:not-)?(?:group-|peer-)?hover(?:\/[A-Za-z0-9_-]+)?$/u;
const ARBITRARY_HOVER_VARIANT_RE = /^\[&[^\]]*:hover[^\]]*\]$/u;
const hoverDisplayRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = (node) => {
      for (const part of readTailwindClassTokens(context.sourceCode.getText(node))) {
        if (
          DISPLAY_UTILITIES.has(part.utility) &&
          part.variants.some((variant) => HOVER_VARIANT_RE.test(variant) || ARBITRARY_HOVER_VARIANT_RE.test(variant))
        ) {
          context.report({
            loc: {
              start: context.sourceCode.getLocFromIndex(node.range[0] + part.offset),
              end: context.sourceCode.getLocFromIndex(node.range[0] + part.offset + part.token.length),
            },
            message: "Hover-keyed display swaps move the hit-test boundary; reserve the box and swap visibility or opacity instead.",
          });
        }
      }
    };
    return { "Literal[value=type(string)]": report, TemplateElement: report };
  },
};

const STORE_HOOK_RE = /^use[A-Z].*Store$/u;
const STORE_ARRAY_REBUILDS = new Set(["map", "filter", "flatMap", "slice", "concat", "toSorted", "toReversed", "toSpliced"]);
const STORE_OBJECT_DERIVATIONS = new Set(["keys", "values", "entries"]);

function storeSelector(call, sourceCode) {
  if (call.callee.type !== "Identifier" || call.range[0] !== call.callee.range[0]) {
    return;
  }
  const hook = sourceCode.getText(call.callee);
  if (!STORE_HOOK_RE.test(hook) && hook !== "useStore") {
    return;
  }
  const selector = call.arguments[hook === "useStore" ? 1 : 0];
  return selector !== undefined &&
    ["ArrowFunctionExpression", "FunctionExpression"].includes(selector.type) &&
    contextDirectArgument(call, selector, sourceCode)
    ? selector
    : undefined;
}

function storeCallDerivation(call, sourceCode) {
  const callee = call.callee;
  if (callee.type !== "MemberExpression" || callee.computed || call.range[0] !== callee.range[0]) {
    return;
  }
  const name = callee.property.type === "Identifier" ? callee.property.name : undefined;
  if (
    callee.object.type === "Identifier" &&
    callee.range[0] === callee.object.range[0] &&
    sourceCode.getText(callee.object) === "Object" &&
    STORE_OBJECT_DERIVATIONS.has(name)
  ) {
    return `Object.${name}(...) derivation`;
  }
  return STORE_ARRAY_REBUILDS.has(name) ? `array-rebuilding .${name}(...) call` : undefined;
}

function storeFreshDerivation(raw, sourceCode) {
  let node = raw;
  while (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
    node = node.expression;
  }
  if (node.type === "ObjectExpression" || node.type === "ArrayExpression") {
    return node.type === "ObjectExpression" ? "object literal" : "array literal";
  }
  if (node.type === "ConditionalExpression") {
    return storeFreshDerivation(node.consequent, sourceCode) ?? storeFreshDerivation(node.alternate, sourceCode);
  }
  if (node.type === "LogicalExpression") {
    return storeFreshDerivation(node.left, sourceCode) ?? storeFreshDerivation(node.right, sourceCode);
  }
  const call = node.type === "ChainExpression" ? node.expression : node;
  return call.type === "CallExpression" ? storeCallDerivation(call, sourceCode) : undefined;
}

function storeReturnOwner(node, sourceCode) {
  return sourceCode.getAncestors(node).findLast((ancestor) => {
    if (ancestor.type === "ArrowFunctionExpression" || ancestor.type === "FunctionDeclaration") {
      return true;
    }
    // The original output grammar excludes accessor and constructor boundaries, unlike ordinary methods.
    return ancestor.type === "FunctionExpression" && !["get", "set", "constructor"].includes(ancestor.parent.kind);
  });
}

const storeDerivedRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const returns = new Map();
    return {
      "ReturnStatement[argument]"(node) {
        if (node.argument === null) {
          return;
        }
        const owner = storeReturnOwner(node, context.sourceCode);
        const outputs = returns.get(owner) ?? [];
        outputs.push(node.argument);
        returns.set(owner, outputs);
      },
      "CallExpression:exit"(node) {
        const selector = storeSelector(node, context.sourceCode);
        if (selector === undefined) {
          return;
        }
        const outputs = selector.body.type === "BlockStatement" ? (returns.get(selector) ?? []) : [selector.body];
        const kind = outputs.map((output) => storeFreshDerivation(output, context.sourceCode)).find((value) => value !== undefined);
        if (kind !== undefined) {
          context.report({
            node: node.callee,
            message: `Store selector returns a fresh reference; use useShallow or a stable field/default. DERIVATION: ${kind}.`,
          });
        }
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

const typedTestIdRule = (message) => ({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      "JSXAttribute[name.type='JSXIdentifier'][name.name='data-testid']"(node) {
        const value = node.value;
        const literal = value?.type === "Literal" && typeof value.value === "string";
        if (literal || (value?.type === "JSXExpressionContainer" && contextLiteral(value.expression) !== undefined)) {
          context.report({ node: node.name, message });
        }
      },
    };
  },
});

// Playwright's poll loop pops the interval array it is handed, so a schedule shared by reference leaves every later
// poll on the 1000ms default. Only a module-scope object that carries `intervals` is resolvable as shared; a function-local
// options object is minted per call.
const POLL_SCHEDULE_MESSAGE =
  "A poll `intervals` schedule shared by identifier is drained by the first poll; mint it inline (`intervals: [50, 100]`) or from a factory call such as evidencePoll().";
function moduleScopeIntervalsObject(sourceCode, identifier) {
  for (let scope = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable === undefined) {
      continue;
    }
    const init = variable.defs.length === 1 && variable.defs[0].type === "Variable" ? variable.defs[0].node.init : null;
    return (
      (scope.type === "module" || scope.type === "global") &&
      init?.type === "ObjectExpression" &&
      init.properties.some(
        (property) => property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "intervals",
      )
    );
  }
  return false;
}
const ctPollIntervalsSharedRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = (node) => context.report({ node, message: POLL_SCHEDULE_MESSAGE });
    const judgeProperty = (property) => {
      if (property.type === "SpreadElement") {
        if (property.argument.type === "Identifier" && moduleScopeIntervalsObject(context.sourceCode, property.argument)) {
          report(property.argument);
        }
      } else if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "intervals") {
        if (property.shorthand) {
          report(property);
        } else if (property.value.type === "Identifier") {
          report(property.value);
        }
      }
    };
    const judgeOptions = (options) => {
      if (options?.type === "Identifier") {
        if (moduleScopeIntervalsObject(context.sourceCode, options)) {
          report(options);
        }
      } else if (options?.type === "ObjectExpression") {
        options.properties.forEach(judgeProperty);
      }
    };
    return {
      "CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.property.type='Identifier']"(call) {
        const { callee } = call;
        if (callee.property.name === "toPass") {
          judgeOptions(call.arguments[0]);
        } else if (callee.property.name === "poll" && callee.object.type === "Identifier" && callee.object.name === "expect") {
          judgeOptions(call.arguments[1]);
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

const FLOORLESS_BUTTON_SIZES = new Set(
  Object.entries(BUTTON_SIZE_OVERFLOW)
    .filter(([, overflows]) => overflows)
    .map(([size]) => size),
);
if (FLOORLESS_BUTTON_SIZES.size === 0) {
  throw new Error("Native floorless-control vocabulary resolved no overflowing Button sizes");
}
const FLOORLESS_WRAP = /\bflex-wrap\b/u;
const FLOORLESS_ROW_FLOOR = /\bmin-h-touch-target\b|\bmin-h-control-[a-z]+\b|pointer-coarse:min-h-[a-z-]+/u;
const FLOORLESS_STACK_CONTROL = /rows\s*=\s*(?:\{\s*)?["']control["']/u;

function floorlessVariableBody(declaration, sourceCode) {
  const init = declaration.init;
  if (init === null || !["ArrowFunctionExpression", "FunctionExpression"].includes(init.type) || sourceCode.getTokenBefore(init)?.value !== "=") {
    return;
  }
  return init.body;
}

function floorlessComponentBodies(program, sourceCode) {
  const declarations = program.body.map((node) => (node.type.startsWith("Export") ? node.declaration : node)).filter(Boolean);
  const bodies = new Map();
  for (const node of declarations) {
    if (node.type === "FunctionDeclaration" && node.id !== null && !bodies.has(node.id.name)) {
      bodies.set(node.id.name, node.body);
    }
  }
  for (const node of declarations.filter((declaration) => declaration.type === "VariableDeclaration")) {
    for (const declaration of node.declarations) {
      if (declaration.id.type !== "Identifier" || bodies.has(declaration.id.name)) {
        continue;
      }
      bodies.set(declaration.id.name, floorlessVariableBody(declaration, sourceCode));
    }
  }
  return bodies;
}

function floorlessMapCall(node, sourceCode) {
  const call = node?.type === "ChainExpression" ? node.expression : node;
  if (call?.type !== "CallExpression" || call.callee.type !== "MemberExpression" || call.callee.computed) {
    return;
  }
  return sourceCode.getText(call.callee).endsWith(".map") && sourceCode.getFirstToken(call).range[0] === call.callee.range[0] ? call : undefined;
}

function floorlessDirectCallback(callback, call, sourceCode) {
  const before = sourceCode.getTokenBefore(callback);
  const afterCallee = sourceCode.getTokenAfter(call.typeArguments ?? call.callee);
  const opening = afterCallee.value === "?." ? sourceCode.getTokenAfter(afterCallee) : afterCallee;
  return before?.value === "," || before?.range[0] === opening.range[0];
}

function floorlessMappedRow(child, sourceCode) {
  if (child.type !== "JSXExpressionContainer") {
    return;
  }
  const call = floorlessMapCall(child.expression, sourceCode);
  if (call === undefined || sourceCode.getTokenAfter(sourceCode.getFirstToken(child)).range[0] !== call.range[0]) {
    return;
  }
  const callback = call.arguments[0];
  if (callback?.type !== "ArrowFunctionExpression" || !floorlessDirectCallback(callback, call, sourceCode) || callback.body.type !== "JSXElement") {
    return;
  }
  // ESTree erases parentheses; the declared map-row grammar unwraps exactly one return wrapper.
  const beforeBody = sourceCode.getTokenBefore(callback.body);
  const direct = beforeBody.value === "=>" || (beforeBody.value === "(" && sourceCode.getTokenBefore(beforeBody).value === "=>");
  return direct ? callback.body : undefined;
}

const floorlessControlRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const counts = new Map();
    const sizes = [];
    const stacks = [];
    let bodies;
    const rowIsFloorless = (element) => {
      const opening = element.openingElement;
      const ownClass = opening.attributes.find((attribute) => attribute.type === "JSXAttribute" && attribute.name.name === "className");
      if (ownClass !== undefined && FLOORLESS_ROW_FLOOR.test(sourceCode.getText(ownClass))) {
        return false;
      }
      return (counts.get(element) ?? 0) > 0 || (counts.get(bodies.get(sourceCode.getText(opening.name))) ?? 0) > 0;
    };
    const mappedWithin = (owner, container) => {
      let current = owner.parent;
      while (current !== null && current !== undefined && current !== container) {
        if (["ArrowFunctionExpression", "FunctionExpression"].includes(current.type)) {
          const call = floorlessMapCall(current.parent, sourceCode);
          if (call !== undefined && floorlessDirectCallback(current, call, sourceCode)) {
            return true;
          }
        }
        current = current.parent;
      }
      return false;
    };
    const wrapContainer = (opening) => {
      let current = opening.selfClosing ? opening.parent.parent : opening.parent;
      while (current !== null && current !== undefined) {
        if (current.type === "JSXElement" && !current.openingElement.selfClosing && FLOORLESS_WRAP.test(sourceCode.getText(current.openingElement))) {
          return current;
        }
        current = current.parent;
      }
    };
    const report = (start, token) =>
      context.report({
        loc: { start: sourceCode.getLocFromIndex(start), end: sourceCode.getLocFromIndex(start + token.length) },
        message: 'Floorless Button controls repeat at a wrapping or vertical pitch; use a control size, Stack rows="control", or an explicit row floor.',
      });
    const rowWeight = (child) => {
      const mapped = floorlessMappedRow(child, sourceCode);
      const row = child.type === "JSXElement" ? child : mapped;
      if (row === undefined || !rowIsFloorless(row)) {
        return 0;
      }
      return mapped === undefined ? 1 : 2;
    };
    const judgeStack = (stack) => {
      if (FLOORLESS_STACK_CONTROL.test(sourceCode.getText(stack.openingElement))) {
        return;
      }
      if (stack.children.reduce((weight, child) => weight + rowWeight(child), 0) >= 2) {
        report(stack.openingElement.name.range[0], "Stack");
      }
    };
    const judgeSize = ({ node, token }) => {
      const container = wrapContainer(node.parent);
      if (container !== undefined && (mappedWithin(node.parent, container) || (counts.get(container) ?? 0) >= 2)) {
        report(node.value.range[0] + 1, token);
      }
    };
    return {
      Program: (program) => {
        bodies = floorlessComponentBodies(program, sourceCode);
      },
      "JSXElement:exit"(node) {
        if (!node.openingElement.selfClosing && sourceCode.getText(node.openingElement.name) === "Stack") {
          stacks.push(node);
        }
      },
      "JSXAttribute:exit"(node) {
        if (node.name.name !== "size" || node.value?.type !== "Literal" || sourceCode.getText(node.parent.name) !== "Button") {
          return;
        }
        const token = sourceCode.getText(node.value).slice(1, -1);
        if (!FLOORLESS_BUTTON_SIZES.has(token)) {
          return;
        }
        sizes.push({ node, token });
        let ancestor = node.parent;
        while (ancestor !== null && ancestor !== undefined) {
          counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
          ancestor = ancestor.parent;
        }
      },
      "Program:exit"() {
        stacks.forEach(judgeStack);
        sizes.forEach(judgeSize);
      },
    };
  },
};

const MEMBERSHIP_TABLE_MODULE = /^@orb\/db(?:\/schema)?$/u;
const MEMBERSHIP_WRITE_VERBS = new Set(["insert", "update", "delete"]);
// The chained calls only a drizzle statement carries; `cache.delete(key)` has the same call shape and none of these.
const DRIZZLE_WRITE_CHAIN = new Set(["set", "values", "returning", "where", "onConflictDoUpdate", "onConflictDoNothing"]);
// Both address one human: the user bus, and the durable inbox delivered to one recipient.
const PER_PERSON_EMITS = new Set(["emitUserEvent", "emitNotification"]);
const DOCUMENT_ROOM_FAN = "fanDatabankRoomsForDocument";

function staticPropertyName(member) {
  if (!member.computed && member.property.type === "Identifier") {
    return member.property.name;
  }
  return member.computed && member.property.type === "Literal" && typeof member.property.value === "string" ? member.property.value : undefined;
}

function unchained(node) {
  return node.type === "ChainExpression" ? node.expression : node;
}

/** The callee name of `emitX(…)`, `ctx.emitX(…)`, `ctx?.emitX(…)` and `ctx["emitX"](…)`, with its report anchor. */
function calleeNameOf(call) {
  const callee = unchained(call.callee);
  if (callee.type === "Identifier") {
    return { name: callee.name, anchor: callee };
  }
  if (callee.type === "MemberExpression") {
    const name = staticPropertyName(callee);
    return name === undefined ? undefined : { name, anchor: callee.property };
  }
}

// Walks `.insert(T).values(…).returning(…)`: the statement is a drizzle write when a chained call is a builder step.
function followsDrizzleWriteChain(call) {
  let current = call;
  for (;;) {
    const member = current.parent;
    if (member?.type !== "MemberExpression" || member.object !== current) {
      return false;
    }
    if (DRIZZLE_WRITE_CHAIN.has(staticPropertyName(member))) {
      return true;
    }
    const next = member.parent;
    if (next?.type !== "CallExpression" || next.callee !== member) {
      return false;
    }
    current = next;
  }
}

// The exported name a value import binds; a type-only specifier binds no runtime table.
function importedValueName(specifier) {
  return specifier.type === "ImportSpecifier" && specifier.importKind !== "type" ? (specifier.imported.name ?? specifier.imported.value) : undefined;
}

function isAwaited(call) {
  const parent = call.parent?.type === "ChainExpression" ? call.parent.parent : call.parent;
  return parent?.type === "AwaitExpression";
}

// One finding per file: a membership-class write whose only announcement is a per-person emit. Any other emit,
// or an awaited document room fan, puts the write on a shared plane and acquits the file.
const membershipWriteFanRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const tables = new Set(context.settings["orb/membership-tables"] ?? []);
    if (tables.size === 0) {
      throw new Error("orb/membership-write-fan needs the orb/membership-tables setting");
    }
    const locals = new Set();
    const namespaces = new Set();
    let writes = false;
    let perPerson;
    let roomFan = false;
    const isMembershipTable = (node) => {
      const target = unchained(node);
      if (target.type === "Identifier") {
        return locals.has(target.name);
      }
      return (
        target.type === "MemberExpression" &&
        target.object.type === "Identifier" &&
        namespaces.has(target.object.name) &&
        tables.has(staticPropertyName(target))
      );
    };
    return {
      ImportDeclaration: (node) => {
        if (node.importKind === "type" || !MEMBERSHIP_TABLE_MODULE.test(String(node.source.value))) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            namespaces.add(specifier.local.name);
          }
          if (tables.has(importedValueName(specifier))) {
            locals.add(specifier.local.name);
          }
        }
      },
      CallExpression: (node) => {
        const callee = calleeNameOf(node);
        if (callee === undefined) {
          return;
        }
        if (callee.name === DOCUMENT_ROOM_FAN) {
          roomFan ||= isAwaited(node);
          return;
        }
        if (callee.name.startsWith("emit")) {
          if (PER_PERSON_EMITS.has(callee.name)) {
            perPerson ??= callee.anchor;
          } else {
            roomFan = true;
          }
          return;
        }
        const table = node.arguments[0];
        if (
          MEMBERSHIP_WRITE_VERBS.has(callee.name) &&
          unchained(node.callee).type === "MemberExpression" &&
          table !== undefined &&
          isMembershipTable(table) &&
          followsDrizzleWriteChain(node)
        ) {
          writes = true;
        }
      },
      "Program:exit": () => {
        if (writes && perPerson !== undefined && !roomFan) {
          context.report({
            node: perPerson,
            message:
              "A membership-class write is announced only to its actor: every other member keeps the pre-write projection. Emit a room fan beside the per-person emit (the chat bus, the domain's injected room-fan op, or roomEntityChanged).",
          });
        }
      },
    };
  },
};

// Use the maintained module-position grammar with the native parser's existing node maps, never a Program.
function nativeImportLiteral(context, node) {
  const services = context.sourceCode.parserServices;
  const compilerNode = services.esTreeNodeToTSNodeMap?.get(node);
  if (compilerNode === undefined) {
    throw new Error("Native import boundaries require the TypeScript parser's node maps");
  }
  const specifier = nativeModulePositionSpecifier(compilerNode);
  if (specifier === undefined) {
    return null;
  }
  const literal = services.tsNodeToESTreeNodeMap.get(specifier);
  return literal?.type === "Literal" && typeof literal.value === "string" ? literal : null;
}

const testPackageSubpathRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const importer = relative(context.cwd, context.filename).replaceAll("\\", "/");
    const check = (node) => {
      const literal = nativeImportLiteral(context, node);
      if (literal !== null && relativeClimb(importer, literal.value) !== undefined) {
        context.report({ node: literal, message: "Tests use package public entries and @orb/testkit world doors, not relative source reaches." });
      }
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      CallExpression: check,
      ImportExpression: check,
      TSImportType: check,
    };
  },
};

const toolingRootConfigImportRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const importer = relative(context.cwd, context.filename).replaceAll("\\", "/");
    return {
      ImportDeclaration: (node) => {
        const target = resolveRelativeImport(importer, node.source.value);
        if (target === null || target.startsWith(TOOLING_PREFIX)) {
          return;
        }
        // Both operations execute the one maintained Knip config; neither may borrow any other root target.
        if (
          target === "knip.ts" &&
          (importer === "tooling/src/verify/ops/application-knip.ts" || importer === "tooling/src/verify/ops/knip-negative-liveness.ts")
        ) {
          return;
        }
        context.report({
          node: node.source,
          message: "Tooling relative imports stay inside tooling/src; root-config access requires its exact maintained subject and target.",
        });
      },
    };
  },
};

const TEST_TOOLING_IMPORT_NATIVE_SETTINGS = {
  "orb/test-tooling-import-inputs": createHash("sha256")
    .update(JSON.stringify(TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(ROOT, path), "utf8")])))
    .digest("hex"),
};

// These rules consume only the parser's owning native Program; no secondary compiler world is built.
function nativeDeclarationContext(context) {
  const services = context.sourceCode.parserServices;
  if (
    services.program === undefined ||
    services.program === null ||
    services.esTreeNodeToTSNodeMap === undefined ||
    services.tsNodeToESTreeNodeMap === undefined
  ) {
    throw new Error("Native declaration contracts require the parser's owning TypeScript Program and node maps");
  }
  return { ...services, checker: services.program.getTypeChecker() };
}

function nativeAliasFlag(symbol) {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0;
}

function nativeDeclarationExported(node, checker) {
  if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    return true;
  }
  if (node.name === undefined) {
    return false;
  }
  const symbol = checker.getSymbolAtLocation(node.name);
  const module = checker.getSymbolAtLocation(node.getSourceFile());
  return (
    symbol !== undefined &&
    module !== undefined &&
    checker.getExportsOfModule(module).some((exported) => exported === symbol || (nativeAliasFlag(exported) && checker.getAliasedSymbol(exported) === symbol))
  );
}

const testFactoryContractRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const check = (node) => {
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      if (!ts.isFunctionDeclaration(declaration) || declaration.name === undefined || !nativeDeclarationExported(declaration, native.checker)) {
        return;
      }
      const name = declaration.name.text;
      const parameters = declaration.parameters;
      const typeFlags =
        // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript formatting options compose a compiler-owned bitfield.
        ts.TypeFormatFlags.UseTypeOfFunction |
        ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.UseFullyQualifiedType |
        ts.TypeFormatFlags.WriteTypeArgumentsOfSignature;
      const pure =
        name.startsWith("make") &&
        parameters.some(
          (parameter) =>
            parameter.name.getText() === "db" ||
            native.checker.typeToString(native.checker.getTypeAtLocation(parameter), parameter, typeFlags).includes("Database"),
        );
      const persisted = name.startsWith("seed") && !parameters.some((parameter) => parameter.name.getText() === "db");
      if (pure || persisted) {
        context.report({
          node: native.tsNodeToESTreeNodeMap.get(declaration.name),
          message: pure
            ? "a `make*` PURE builder accepts a db — a pure builder must stay db-free; persistence belongs to a `seed*` builder (docs/law/Spine-Testing.md §4)."
            : "a `seed*` PERSISTED builder has no `db` parameter — a persisted builder must take one; a db-free builder belongs under the `make*` prefix (docs/law/Spine-Testing.md §4).",
        });
      }
    };
    return { FunctionDeclaration: check, TSDeclareFunction: check };
  },
};

function nativeFixtureSubject(declaration, checker) {
  if (ts.isFunctionDeclaration(declaration)) {
    return nativeDeclarationExported(declaration, checker) ? { output: declaration, annotation: declaration.type } : null;
  }
  if (!ts.isVariableDeclaration(declaration)) {
    throw new Error("Native fixture output selected another declaration kind");
  }
  const statement = declaration.parent.parent;
  if (!(ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))) {
    return null;
  }
  const initializer = declaration.initializer;
  const output = initializer !== undefined && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ? initializer : declaration;
  return { output, annotation: output.type };
}

const opaqueTestFixtureRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const check = (node) => {
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      const subject = nativeFixtureSubject(declaration, native.checker);
      if (subject === null) {
        return;
      }
      const { output, annotation } = subject;
      const signature = ts.isFunctionLike(output) ? native.checker.getSignatureFromDeclaration(output) : undefined;
      const type = signature === undefined ? native.checker.getTypeAtLocation(output) : native.checker.getReturnTypeOfSignature(signature);
      if (type.flags !== ts.TypeFlags.Unknown) {
        return;
      }
      const anchor = annotation ?? declaration.name;
      const token = anchor === undefined ? undefined : waivableCoordinate(anchor.getText());
      if (token !== undefined) {
        const start = anchor.getStart();
        context.report({
          loc: { start: context.sourceCode.getLocFromIndex(start), end: context.sourceCode.getLocFromIndex(start + token.length) },
          message: "An exported fixture output is unknown; return its real contract instead of erasing the consumer's field obligations.",
        });
      }
    };
    return { FunctionDeclaration: check, TSDeclareFunction: check, VariableDeclarator: check };
  },
};

const contextReturnTypeRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const check = (node) => {
      if (node.name !== "ReturnType") {
        return;
      }
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      const symbol = native.checker.getSymbolAtLocation(declaration);
      const declarations = symbol?.declarations ?? [];
      if (declarations.length > 0) {
        if (
          declarations.some(
            (item) =>
              native.program.isSourceFileDefaultLibrary(item.getSourceFile()) ||
              item.getSourceFile().fileName.replaceAll("\\", "/").includes("/node_modules/@types/"),
          ) &&
          declarations.every((item) => {
            const source = item.getSourceFile();
            let current = item.parent;
            while (current !== undefined && !ts.isModuleDeclaration(current)) {
              current = current.parent;
            }
            return (
              source.isDeclarationFile &&
              (!source.statements.some((statement) => ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
                (current !== undefined && current.name.getText().replaceAll(/["']/gu, "") === "global"))
            );
          })
        ) {
          context.report({ node, message: "The DI bundle type must be an explicit, hand-written interface, never reflected off a builder with ReturnType." });
        }
        return;
      }
      context.report({
        node,
        message: "Whether this ReturnType is TypeScript's reflected utility or a local type CANNOT be established: the checker binds it to no declaration.",
      });
    };
    return { Identifier: check };
  },
};

function verifyNativeCompilerContext(context, native) {
  const roster = typedNativeCompilerContext(context.cwd).configs;
  if (roster === undefined) {
    return;
  }
  const config = native.program.getCompilerOptions().configFilePath;
  if (typeof config !== "string" || !roster.includes(relative(context.cwd, config).replaceAll("\\", "/"))) {
    throw new Error("Native typed parser Program does not match the admitted compiler cache context");
  }
}

const typeHomeDeclarationRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      misplacedType:
        "An exported type belongs in its canonical domain, wire, package or foundation contract home unless its local factory signature owns it (D324; Spine-TypeScript §7.4).",
      misplacedSchema: "An exported zod shape schema belongs in its canonical domain, wire, package or foundation contract home (Spine-TypeScript §7.4).",
    },
  },
  create(context) {
    const native = nativeDeclarationContext(context);
    verifyNativeCompilerContext(context, native);
    const path = relative(context.cwd, context.filename).replaceAll("\\", "/");
    const checkType = (node) => {
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      const shape = ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration);
      if (!(shape && nativeDeclarationExported(declaration, native.checker))) {
        return;
      }
      if (serverFactoryTypeHome(declaration, path, { kind: "parser", checker: native.checker, program: native.program, source: declaration.getSourceFile() })) {
        return;
      }
      context.report({ node: native.tsNodeToESTreeNodeMap.get(declaration.name), messageId: "misplacedType" });
    };
    const checkSchema = (node) => {
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      const candidate = ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.initializer !== undefined;
      if (!(candidate && nativeDeclarationExported(declaration, native.checker) && isZodShapeCall(nativeWrappedNode(declaration.initializer, native)))) {
        return;
      }
      context.report({ node: native.tsNodeToESTreeNodeMap.get(declaration.name), messageId: "misplacedSchema" });
    };
    return { TSInterfaceDeclaration: checkType, TSTypeAliasDeclaration: checkType, VariableDeclarator: checkSchema };
  },
};

const serverFactoryPublicBoundaryRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      crossTierFactoryType:
        "Factory type {{name}} is local to {{owner}} but exposed to {{consumer}}; move the shared API to its sanctioned owner contract (D324).",
      unreadableFactoryExposure: "Cross-tier factory exposure cannot be established: {{detail}}.",
    },
  },
  create(context) {
    const native = nativeDeclarationContext(context);
    verifyNativeCompilerContext(context, native);
    const consumer = relative(context.cwd, context.filename).replaceAll("\\", "/");
    const reportSubjects = (declarations, reported, seen) => {
      for (const declaration of declarations) {
        if (seen.has(declaration)) {
          continue;
        }
        seen.add(declaration);
        context.report({
          node: reported,
          messageId: "crossTierFactoryType",
          data: {
            name: declaration.name?.text ?? "default",
            owner: relative(context.cwd, declaration.getSourceFile().fileName),
            consumer,
          },
        });
      }
    };
    const inspect = (raw, reported, seen, projectDoor) => {
      const symbol = native.checker.getSymbolAtLocation(raw);
      const target = symbol !== undefined && nativeAliasFlag(symbol) ? native.checker.getAliasedSymbol(symbol) : symbol;
      const declarations = target?.declarations ?? [];
      if (declarations.length === 0) {
        if (projectDoor) {
          context.report({ node: reported, messageId: "unreadableFactoryExposure", data: { detail: "the native public reference has no declaration" } });
        }
        return;
      }
      if (
        !declarations.some((declaration) => {
          const owner = relative(context.cwd, declaration.getSourceFile().fileName).replaceAll("\\", "/");
          return serverTypeTier(owner) !== undefined && serverTypeTier(owner) !== serverTypeTier(consumer);
        })
      ) {
        return;
      }
      const boundary = readServerPublicBoundary(
        raw,
        {
          kind: "parser",
          program: native.program,
          checker: native.checker,
          source: raw.getSourceFile(),
        },
        context.cwd,
        consumer,
      );
      reportSubjects(boundary.trace.declarations, reported, seen);
      if (boundary.kind === "unresolved") {
        context.report({ node: reported, messageId: "unreadableFactoryExposure", data: { detail: boundary.detail } });
      }
    };
    const moduleExports = (literal, reported, seen) => {
      const symbol = native.checker.getSymbolAtLocation(literal);
      if (symbol === undefined) {
        context.report({ node: reported, messageId: "unreadableFactoryExposure", data: { detail: "the native module reference has no declaration" } });
        return;
      }
      for (const exported of native.checker.getExportsOfModule(symbol)) {
        const target = nativeAliasFlag(exported) ? native.checker.getAliasedSymbol(exported) : exported;
        for (const declaration of target.declarations ?? []) {
          inspect(declaration.name ?? declaration, reported, seen, true);
        }
      }
    };
    const importDeclaration = (node) => {
      const raw = native.esTreeNodeToTSNodeMap.get(node);
      const projectDoor = node.source.value.startsWith(".") || node.source.value.startsWith("#") || node.source.value.startsWith("@orb/");
      for (const specifier of node.specifiers) {
        const seen = new Set();
        if (specifier.type === "ImportNamespaceSpecifier") {
          moduleExports(raw.moduleSpecifier, specifier.local, seen);
        } else {
          inspect(native.esTreeNodeToTSNodeMap.get(specifier.local), specifier.local, seen, projectDoor);
        }
      }
    };
    const exportNamedDeclaration = (node) => {
      for (const specifier of node.specifiers) {
        inspect(native.esTreeNodeToTSNodeMap.get(specifier.local), specifier.local, new Set(), node.source !== null);
      }
    };
    const exportAllDeclaration = (node) => {
      moduleExports(native.esTreeNodeToTSNodeMap.get(node).moduleSpecifier, node.source, new Set());
    };
    const importExpression = (node) => {
      const raw = native.esTreeNodeToTSNodeMap.get(node);
      if (ts.isCallExpression(raw) && raw.arguments[0] !== undefined && ts.isStringLiteral(raw.arguments[0])) {
        moduleExports(raw.arguments[0], node, new Set());
      } else {
        context.report({ node, messageId: "unreadableFactoryExposure", data: { detail: "a computed dynamic import has no explicit public boundary" } });
      }
    };
    const importType = (node) => {
      const raw = native.esTreeNodeToTSNodeMap.get(node);
      if (raw.qualifier === undefined) {
        moduleExports(raw.argument.literal, node, new Set());
      } else {
        inspect(raw.qualifier, node, new Set(), true);
      }
    };
    return {
      ImportDeclaration: importDeclaration,
      ExportNamedDeclaration: exportNamedDeclaration,
      ExportAllDeclaration: exportAllDeclaration,
      ImportExpression: importExpression,
      TSImportType: importType,
    };
  },
};

function nativeWrappedNode(node, native) {
  return createWrappedNode(node, { typeChecker: native.checker, sourceFile: node.getSourceFile() });
}

function toolingEntryRule(ops) {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const native = nativeDeclarationContext(context);
      if (typedNativeCompilerContext(context.cwd).configs === undefined) {
        throw new Error("HARD tool entry requires an admitted native compiler context");
      }
      verifyNativeCompilerContext(context, native);
      const homes = [TOOLING_ENTRY_HOMES.runner, ...(ops ? [TOOLING_ENTRY_HOMES.guard] : [])].map((home) => {
        const source = native.program.getSourceFile(join(context.cwd, home.path));
        const located = locateProjectHome(
          source === undefined ? [] : [nativeWrappedNode(source, native)],
          (file) => relative(context.cwd, file.getFilePath()).replaceAll("\\", "/"),
          home,
        );
        if (located.members === 0 || located.unresolved !== 0) {
          throw new Error(`HARD tool entry home/export unavailable: ${home.path} (${home.names.join(", ")})`);
        }
        return located;
      });
      let entered = false;
      const entersHome = (callee) => homes.some((home) => classifyProjectHomeOrigin(callee, home) === "home");
      const callExpression = (node) => {
        if (!ops) {
          entered ||= entersHome(nativeWrappedNode(native.esTreeNodeToTSNodeMap.get(node.callee), native));
        }
      };
      return {
        CallExpression: callExpression,
        "Program:exit"(node) {
          const source = native.esTreeNodeToTSNodeMap.get(node);
          if (native.program.getSourceFile(source.fileName) !== source) {
            throw new Error("HARD tool entry parser source does not belong to its admitted native Program");
          }
          if (ops) {
            entered = moduleScopeCalls(nativeWrappedNode(source, native)).some((call) => entersHome(call.getExpression()));
          }
          if (!entered) {
            context.report({
              node,
              loc: { line: 1, column: 0 },
              message: ops
                ? "An ops library requires a module-scope call to canonical refuseDirectInvocation or runTool; no proven entry exists."
                : "A tool cli.ts must call the canonical runTool export; no proven entry exists.",
            });
          }
        },
      };
    },
  };
}

function ambientDeterminismRule(clock) {
  const memberName = clock ? "now" : "random";
  const globalName = clock ? "Date" : "Math";
  const message = clock
    ? "Read time from the injected clock (@orb/kit/time), not Date.now() or zero-argument new Date()."
    : "Draw entropy from an injected seeded PRNG, not Math.random().";
  const candidate = (node, wrapped) => {
    if (node.type === "NewExpression") {
      return clock && node.arguments.length === 0 && referenceNamesExport(wrapped.getExpression(), "Date");
    }
    if (!possibleAmbientCall(wrapped, memberName)) {
      return false;
    }
    if (ts.isIdentifier(wrapped.getExpression().compilerNode)) {
      return true;
    }
    const member = readMemberReference(wrapped.getExpression());
    return member.kind === "resolved" && member.value.name === memberName;
  };
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const native = nativeDeclarationContext(context);
      let found;
      const inspect = (node) => {
        const wrapped = nativeWrappedNode(native.esTreeNodeToTSNodeMap.get(node), native);
        if (!candidate(node, wrapped)) {
          return;
        }
        const verdict = readAmbientInvocation(wrapped, [
          { globalName, memberPath: node.type === "NewExpression" ? [] : [memberName], token: `${globalName}.${memberName}` },
        ]);
        if (verdict.kind === "other" || found !== undefined) {
          return;
        }
        found = { node, unreadable: verdict.kind === "unreadable" };
      };
      return {
        CallExpression: inspect,
        NewExpression: inspect,
        "Program:exit"() {
          if (found !== undefined) {
            context.report({
              node: found.node,
              message: found.unreadable ? "Whether this call reads the ambient clock or generator CANNOT be established; its callee is unreadable." : message,
            });
          }
        },
      };
    },
  };
}

const MINT_MODULE_GENERATORS = new Map([
  ["node:crypto", new Set(["randomUUID"])],
  ["crypto", new Set(["randomUUID"])],
  ["nanoid", new Set(["nanoid"])],
  ["uuid", new Set(["v4"])],
  ["@paralleldrive/cuid2", new Set(["createId"])],
]);

const mintViaCastRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const castId = createKitIdCallMatcher("castId");
    const generator = (origin) => {
      if (origin.kind === "unresolved") {
        return false;
      }
      const target = origin.value.target;
      if (target.kind === "global") {
        return target.globalName === "crypto" && target.memberPath.join(".") === "randomUUID";
      }
      const module = target.canonical.kind === "external-door" ? target.canonical.moduleSpecifier : target.moduleSpecifier;
      return target.memberPath.length === 0 && MINT_MODULE_GENERATORS.get(module)?.has(target.exportedName) === true;
    };
    const mintedArgument = (argument) => {
      const direct = resolveCallableOrigin(argument);
      let minted = generator(direct);
      let receiver = argument;
      while (!minted) {
        const callee = receiver.getExpression();
        if (!ts.isPropertyAccessExpression(callee.compilerNode)) {
          break;
        }
        const next = callee.getExpression();
        if (!ts.isCallExpression(next.compilerNode)) {
          break;
        }
        receiver = next;
        minted = generator(resolveCallableOrigin(receiver));
      }
      return { minted, unreadable: !minted && direct.kind === "unresolved" && classifyOriginRefusal(direct.reason, argument.getExpression()) === "unreadable" };
    };
    return {
      CallExpression: (node) => {
        const call = nativeWrappedNode(native.esTreeNodeToTSNodeMap.get(node), native);
        const seam = castId(call);
        if (seam === "other") {
          return;
        }
        let unreadable = seam === "unreadable";
        let minted = false;
        const argument = call.getArguments()[0];
        if (!unreadable && argument !== undefined && ts.isCallExpression(argument.compilerNode)) {
          ({ minted, unreadable } = mintedArgument(argument));
        }
        if (minted || unreadable) {
          context.report({
            node: native.tsNodeToESTreeNodeMap.get(call.getExpression().compilerNode),
            message: minted
              ? "castId wraps a fresh-id generator; use mintTypeId or the canonical prefixless newId mint."
              : "Whether this cast seam launders a fresh-id generator CANNOT be established; its seam or argument is unreadable.",
          });
        }
      },
    };
  },
};

const zustandSelectorStabilityRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const metadata = TYPED_NATIVE_POLICIES.find((entry) => entry.id === "zustand-selector-stability");
    const home = native.program.getSourceFiles().find((source) => source.fileName.replaceAll("\\", "/").endsWith(`/${metadata.home}`));
    const module = home === undefined ? undefined : native.checker.getSymbolAtLocation(home);
    const configFile = native.program.getCompilerOptions().configFilePath;
    const clientOwner = typeof configFile === "string" && configFile.replaceAll("\\", "/").endsWith("/packages/client/tsconfig.json");
    if (
      (home !== undefined || clientOwner) &&
      (module === undefined || !native.checker.getExportsOfModule(module).some((symbol) => symbol.getName() === metadata.exportedName))
    ) {
      throw new Error("GatedStoreHook home/export is unavailable; store-hook identity cannot be established");
    }
    const storeIdentity = (identity) =>
      (identity.name === metadata.exportedName &&
        identity.declarations.length > 0 &&
        identity.declarations.every((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith(`/${metadata.home}`))) ||
      (identity.name === "UseBoundStore" && declaredByPackage(identity.declarations, "zustand"));
    const literalSelector = (argument) => {
      if (argument === undefined || !ts.isArrowFunction(argument.compilerNode) || argument.getParameters().length !== 1) {
        return false;
      }
      let body = argument.getBody();
      while (
        ts.isParenthesizedExpression(body.compilerNode) ||
        ts.isAsExpression(body.compilerNode) ||
        ts.isSatisfiesExpression(body.compilerNode) ||
        ts.isNonNullExpression(body.compilerNode)
      ) {
        body = body.getExpression();
      }
      return ts.isObjectLiteralExpression(body.compilerNode) || ts.isArrayLiteralExpression(body.compilerNode);
    };
    return {
      CallExpression: (node) => {
        const call = nativeWrappedNode(native.esTreeNodeToTSNodeMap.get(node), native);
        const argument = call.getArguments()[0];
        if (!literalSelector(argument)) {
          return;
        }
        const callee = call.getExpression();
        const type = callee.getType();
        const unreadable = type.isAny() || type.isUnknown();
        const chain = unreadable ? undefined : resolveTypeIdentityChain(callee);
        const store = chain?.kind === "resolved" && chain.value.some(storeIdentity);
        if (store || unreadable) {
          context.report({
            node: native.tsNodeToESTreeNodeMap.get(callee.compilerNode),
            message: unreadable
              ? "Whether this fresh-literal selector belongs to a store hook CANNOT be established; its callee type is erased."
              : "A zustand selector returns a fresh object or array; select a stored reference, a stable default, or useShallow.",
          });
        }
      },
    };
  },
};

function nativeReviewedReport(context) {
  const groups = new Map();
  return {
    add(operation, node, verdict) {
      const group = groups.get(operation) ?? [];
      group.push({ node, verdict });
      groups.set(operation, group);
    },
    flush(message, unreadable) {
      for (const [operation, group] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
        const anchor = group.find((candidate) => candidate.verdict !== "unreadable") ?? group[0];
        context.report({
          node: anchor.node,
          message: `${anchor.verdict === "unreadable" ? unreadable : message} Operation: ${operation}; line(s): ${[...new Set(group.map((candidate) => candidate.node.loc.start.line))].join(", ")}.`,
        });
      }
    },
  };
}

const AMBIENT_GLOBAL_RECEIVERS = new Set(["globalThis", "self", "window"]);
const TIME_FORMATTERS = new Set(["DateTimeFormat", "RelativeTimeFormat"]);
const TIME_LOCALE_MEMBERS = new Set(["toLocaleDateString", "toLocaleString", "toLocaleTimeString"]);

function nativeIntlFormatterOrigin(wrapped, name) {
  const origin = resolveGlobalMemberOrigin(wrapped);
  if (origin.kind === "resolved") {
    return origin.value.globalName === "Intl" && origin.value.memberPath.length === 1 ? "home" : "other";
  }
  if (readsAmbientGlobalPath(wrapped, AMBIENT_GLOBAL_RECEIVERS, ["Intl", name])) {
    return "home";
  }
  return classifyOriginRefusal(origin.reason, wrapped);
}

const rawIntlTimeRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const report = nativeReviewedReport(context);
    const check = (node, formatter) => {
      const value = native.esTreeNodeToTSNodeMap.get(node);
      const name = nativeCalledMemberName(value);
      if (!(formatter ? TIME_FORMATTERS : TIME_LOCALE_MEMBERS).has(name)) {
        return;
      }
      const wrapped = nativeWrappedNode(value, native);
      const verdict = formatter ? nativeIntlFormatterOrigin(wrapped, name) : classifyPackageMemberOrigin(wrapped, ["typescript"]);
      if (verdict !== "other") {
        const member = readMemberReference(wrapped);
        report.add(formatter ? "intl-formatter" : "tolocale", native.tsNodeToESTreeNodeMap.get(member.value.nameNode.compilerNode), verdict);
      }
    };
    return {
      MemberExpression: (node) => {
        check(node, true);
      },
      CallExpression: (node) => {
        check(node.callee, false);
      },
      "Program:exit"() {
        report.flush(
          "Render time through the memoized @orb/kit/time seam, not raw Intl or toLocale formatting.",
          "Whether this expression is the ECMAScript time API CANNOT be established; its binding cannot be placed.",
        );
      },
    };
  },
};

const listRowAdoptionRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const surfaceNames = new Set(["LibrarySurfaceShell", "LibraryListLayout", "createCollectionSurface"]);
    const rowNames = new Set(["ListRow", "LibraryRow"]);
    const renderNames = new Set(["renderItem", "renderRow"]);
    const callbacks = [];
    const returns = [];
    let surface = false;
    const unwrap = (value) => (ts.isParenthesizedExpression(value) ? value.expression : value);
    const returnedRoot = (callback) => {
      const returned = ts.isArrowFunction(callback)
        ? callback.body
        : returns.find(
            (statement) =>
              statement.getSourceFile() === callback.getSourceFile() &&
              statement.getStart() >= callback.getStart() &&
              statement.end <= callback.end &&
              statement.expression !== undefined,
          )?.expression;
      if (returned === undefined) {
        return;
      }
      const root = unwrap(returned);
      if (ts.isJsxElement(root)) {
        return root.openingElement;
      }
      return ts.isJsxSelfClosingElement(root) ? root : undefined;
    };
    const interactive = (opening) =>
      opening.attributes.properties.some((property) => ts.isJsxAttribute(property) && ["onClick", "role", "href"].includes(property.name.getText()));
    return {
      ImportSpecifier: (node) => {
        const imported = native.esTreeNodeToTSNodeMap.get(node);
        surface ||= surfaceNames.has((imported.propertyName ?? imported.name).text);
      },
      ReturnStatement: (node) => {
        returns.push(native.esTreeNodeToTSNodeMap.get(node));
      },
      CallExpression: (node) => {
        const call = native.esTreeNodeToTSNodeMap.get(node);
        if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "map" && call.arguments[0] !== undefined) {
          callbacks.push(call.arguments[0]);
        }
      },
      JSXAttribute: (node) => {
        const attribute = native.esTreeNodeToTSNodeMap.get(node);
        if (!renderNames.has(attribute.name.getText()) || attribute.initializer === undefined || !ts.isJsxExpression(attribute.initializer)) {
          return;
        }
        let expression = attribute.initializer.expression;
        if (expression === undefined) {
          return;
        }
        if (ts.isIdentifier(expression)) {
          const origin = resolveStableExpression(nativeWrappedNode(expression, native));
          if (origin.kind !== "resolved" || origin.value.getSourceFile().compilerNode !== expression.getSourceFile()) {
            return;
          }
          expression = unwrap(origin.value.compilerNode);
        }
        if (ts.isArrowFunction(expression)) {
          callbacks.push(expression);
        }
      },
      "Program:exit"() {
        if (!surface) {
          return;
        }
        for (const callback of callbacks) {
          const opening = returnedRoot(callback);
          if (opening === undefined || rowNames.has(opening.tagName.getText())) {
            continue;
          }
          if (interactive(opening)) {
            context.report({
              node: native.tsNodeToESTreeNodeMap.get(opening.tagName),
              message: "Root an interactive LIST-region row render in ListRow or LibraryRow.",
            });
          }
        }
      },
    };
  },
};

const testFixtureImportsRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const tooling = context.filename.replaceAll("\\", "/").includes("/tests/tooling/");
    const invalidDoor = (door, imported) =>
      door.kind === "runner" ||
      (door.kind === "unresolved" && imported) ||
      (door.kind === "project" && tooling && !registersSnapshotSerializer(door.sourceFile));
    const check = (node) => {
      const wrapped = nativeWrappedNode(native.esTreeNodeToTSNodeMap.get(node), native);
      const imported = ts.isImportSpecifier(wrapped.compilerNode);
      const member = imported ? undefined : readMemberReference(wrapped);
      const memberName = member?.kind === "resolved" ? member.value.name : undefined;
      const name = imported ? wrapped.getName() : memberName;
      if (!FIXTURE_NAMES.has(name)) {
        return;
      }
      const door = readFixtureDoor(wrapped);
      if (invalidDoor(door, imported)) {
        context.report({
          node: imported ? node.imported : native.tsNodeToESTreeNodeMap.get(member.value.nameNode.compilerNode),
          message: "Enter test/it/expect through the composed fixture door; tooling tests require the door that installs the RESULT snapshot serializer.",
        });
      }
    };
    return { ImportSpecifier: check, MemberExpression: check };
  },
};

const zodModernSpellingsRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const zodCall = (node, name) => isFactoryCallFromPackage(node, name, "zod");
    const boolEnum = (call, members) => {
      const texts = members.filter((member) => ts.isStringLiteral(member.compilerNode)).map((member) => member.getLiteralText());
      return (
        zodCall(call, "enum") &&
        members.length === 2 &&
        texts.length === 2 &&
        texts[0] !== texts[1] &&
        texts.every((text) => text === "true" || text === "false")
      );
    };
    const arraySpelling = (call, name, members) => {
      if (name === "union") {
        return zodCall(call, "union") && members.length >= 2 && members.every((member) => zodCall(member, "literal"));
      }
      return name === "enum" && boolEnum(call, members);
    };
    return {
      CallExpression: (node) => {
        const call = nativeWrappedNode(native.esTreeNodeToTSNodeMap.get(node), native);
        const candidate = zodCandidateCall(call);
        if (candidate === undefined) {
          return;
        }
        const args = call.getArguments();
        const first = args[0];
        let invalid = false;
        if (candidate.name === "strict" && args.length === 0) {
          const member = readMemberReference(call.getExpression());
          invalid = member.kind === "resolved" && zodCall(member.value.receiver, "object");
        } else if (args.length === 1 && first !== undefined && ts.isArrayLiteralExpression(first.compilerNode)) {
          invalid = arraySpelling(call, candidate.name, first.getElements());
        }
        if (invalid) {
          context.report({
            node: native.tsNodeToESTreeNodeMap.get(candidate.nameNode.compilerNode),
            message: "Use the modern zod spelling: strictObject, multi-value literal, or the pinned envBool codec; preserve the existing accepted vocabulary.",
          });
        }
      },
    };
  },
};

const manualAutosaveFlushRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const bodies = new Map();
    const arrayOps = new Set(["pushFieldValue", "removeFieldValue", "insertFieldValue", "moveFieldValues"]);
    const ownerBody = (call) => {
      let body = call.parent;
      while (
        !(ts.isSourceFile(body) || ts.isFunctionDeclaration(body) || ts.isFunctionExpression(body) || ts.isArrowFunction(body) || ts.isMethodDeclaration(body))
      ) {
        body = body.parent;
      }
      return body;
    };
    const formOrigin = (wrapped) => {
      const origin = resolveTypeMemberOrigin(wrapped);
      if (origin.kind === "resolved") {
        return declaredByPackage(origin.value.declarations, "@tanstack/form-core") ? "form" : "other";
      }
      return classifyOriginRefusal(origin.reason, wrapped);
    };
    return {
      CallExpression: (node) => {
        const call = native.esTreeNodeToTSNodeMap.get(node);
        const wrapped = nativeWrappedNode(call.expression, native);
        const member = readMemberReference(wrapped);
        if (member.kind !== "resolved" || !(arrayOps.has(member.value.name) || member.value.name === "handleSubmit")) {
          return;
        }
        const verdict = formOrigin(wrapped);
        if (verdict === "other") {
          return;
        }
        const body = ownerBody(call);
        const state = bodies.get(body) ?? {};
        const slot = member.value.name === "handleSubmit" ? "submit" : "array";
        state[slot] ??= { node: native.tsNodeToESTreeNodeMap.get(member.value.nameNode.compilerNode), proven: verdict === "form" };
        bodies.set(body, state);
      },
      "Program:exit"() {
        for (const { array, submit } of bodies.values()) {
          if (array !== undefined && submit !== undefined) {
            context.report({
              node: array.node,
              message:
                array.proven && submit.proven
                  ? "A structural form array edit and handleSubmit share one body; the autosave driver's store subscription already persists the edit."
                  : "Whether both calls belong to the form API CANNOT be established; a manual structural-edit flush cannot be admitted.",
            });
          }
        }
      },
    };
  },
};

const chatTrpcSurfaceRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const proxyChain = (wrapped) => {
      const segments = [];
      let root = wrapped;
      let readable = true;
      while (ts.isPropertyAccessExpression(root.compilerNode) || ts.isElementAccessExpression(root.compilerNode)) {
        const read = readMemberReference(root);
        if (read.kind !== "resolved") {
          readable = false;
          break;
        }
        segments.unshift(read.value.name);
        root = read.value.receiver;
      }
      return { segments, readable, identity: resolveTypeIdentityOrigin(root) };
    };
    const check = (node) => {
      const wrapped = nativeWrappedNode(native.esTreeNodeToTSNodeMap.get(node), native);
      const member = readMemberReference(wrapped);
      if (member.kind !== "resolved" || member.value.name !== "mutationOptions") {
        return;
      }
      const origin = resolveTypeMemberOrigin(wrapped);
      if (origin.kind === "resolved" && !declaredByPackage(origin.value.declarations, "@trpc/tanstack-react-query")) {
        return;
      }
      if (origin.kind === "unresolved" && classifyOriginRefusal(origin.reason, wrapped) === "other") {
        return;
      }
      const { segments, readable, identity } = proxyChain(wrapped);
      const proven =
        origin.kind === "resolved" &&
        readable &&
        identity.kind === "resolved" &&
        identity.value.name === "TRPCOptionsProxy" &&
        declaredByPackage(identity.value.declarations, "@trpc/tanstack-react-query");
      if (proven && segments[0] !== "chat") {
        return;
      }
      context.report({
        node: native.tsNodeToESTreeNodeMap.get(member.value.nameNode.compilerNode),
        message: proven
          ? "Chat mutation dispatch belongs in features/chat/hooks; surfaces compose the verb hook."
          : "Whether this mutationOptions chain names the chat router CANNOT be established; its proxy root is unreadable.",
      });
    };
    return { MemberExpression: check };
  },
};

const multiplexedMutationErrorRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const metadata = TYPED_NATIVE_POLICIES.find((entry) => entry.id === "no-multiplexed-mutation-error");
    const home = native.program.getSourceFiles().find((source) => source.fileName.replaceAll("\\", "/").endsWith(`/${metadata.home}`));
    const module = home === undefined ? undefined : native.checker.getSymbolAtLocation(home);
    if (module === undefined || !native.checker.getExportsOfModule(module).some((symbol) => symbol.getName() === metadata.exportedName)) {
      throw new Error("EntityMutationResult home/export is unavailable; mutation error identity cannot be established");
    }
    const operand = (value) => {
      const wrapped = nativeWrappedNode(native.esTreeNodeToTSNodeMap.get(value), native);
      const member = readMemberReference(wrapped);
      if (member.kind === "unresolved" || member.value.name !== "error") {
        return { verdict: "other" };
      }
      const origin = resolveTypeMemberOrigin(wrapped);
      if (origin.kind === "unresolved") {
        return { verdict: classifyOriginRefusal(origin.reason, wrapped), member: member.value };
      }
      const declarations = origin.value.declarations;
      const owned = declarations.length > 0 && declarations.every((declaration) => declaration.getSourceFile().compilerNode === home);
      const vendor =
        declarations.length > 0 &&
        declarations.every((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes("/node_modules/@tanstack/query-core/"));
      return { verdict: owned || vendor ? "mutation" : "other", member: member.value };
    };
    const check = (node) => {
      if (node.operator !== "??" && node.operator !== "||") {
        return;
      }
      const left = operand(node.left);
      const right = operand(node.right);
      if (left.verdict === "other" || right.verdict === "other") {
        return;
      }
      context.report({
        node: native.tsNodeToESTreeNodeMap.get(left.member.nameNode.compilerNode),
        message:
          left.verdict === "unreadable" || right.verdict === "unreadable"
            ? "Whether both errors are sticky mutation slots CANNOT be established: an operand's receiver is unreadable."
            : "Do not multiplex sticky mutation errors; render each mutation's own error slot.",
      });
    };
    return { LogicalExpression: check };
  },
};

// The existing authored-value primitive receives this parser's checker, never a second semantic owner.
function nativeAuthoredScalar(node, native) {
  return readStaticAuthoredScalar(nativeWrappedNode(node, native));
}

const INTERACTIVE_WIDGET_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "tab",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "combobox",
  "textbox",
  "searchbox",
  "listbox",
  "menu",
  "menubar",
  "radiogroup",
  "tablist",
  "tree",
  "treeitem",
  "grid",
  "gridcell",
  "scrollbar",
]);

const interactiveFeatureRoleRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const check = (node) => {
      if (node.name.type !== "JSXIdentifier" || node.name.name !== "role") {
        return;
      }
      const attribute = native.esTreeNodeToTSNodeMap.get(node);
      const containsWidget = nativeSubtreeSome(attribute, (value) => {
        if (!(ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) || ts.isIdentifier(value))) {
          return false;
        }
        let owner = value.parent;
        while (owner !== undefined && !ts.isJsxAttribute(owner)) {
          owner = owner.parent;
        }
        if (owner !== attribute) {
          return false;
        }
        const fact = nativeAuthoredScalar(value, native);
        return fact.kind === "resolved" && typeof fact.value === "string" && INTERACTIVE_WIDGET_ROLES.has(fact.value);
      });
      if (containsWidget) {
        context.report({ node: node.name, message: "Interactive ARIA roles in features must come from an @orb/ui widget, not a hand-rolled layout element." });
      }
    };
    return { JSXAttribute: check };
  },
};

function nativeUnwrapExpression(raw) {
  let node = raw;
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
    node = node.expression;
  }
  return node;
}

function nativeSubtreeSome(node, predicate) {
  return predicate(node) || ts.forEachChild(node, (child) => nativeSubtreeSome(child, predicate) || undefined) === true;
}

function nativeOwningCallable(node) {
  let callable = node.parent;
  while (callable !== undefined) {
    if (ts.isFunctionDeclaration(callable) || ts.isArrowFunction(callable) || ts.isFunctionExpression(callable) || ts.isMethodDeclaration(callable)) {
      return callable;
    }
    callable = callable.parent;
  }
}

function nativePortalExpression(attribute) {
  const initializer = attribute?.initializer;
  return initializer !== undefined && ts.isJsxExpression(initializer) && initializer.expression !== undefined
    ? nativeUnwrapExpression(initializer.expression)
    : undefined;
}

const baseUiPortalContainerRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const tags = new Set(
      baseUiBindings(context.sourceCode.ast)
        .filter((binding) => !binding.typeOnly)
        .map((binding) => `${binding.local}.Portal`),
    );
    const declarations = (node) => native.checker.getSymbolAtLocation(node)?.declarations ?? [];
    const check = (node) => {
      if (!tags.has(context.sourceCode.getText(node.name))) {
        return;
      }
      const portal = native.esTreeNodeToTSNodeMap.get(node);
      const callable = nativeOwningCallable(portal);
      const parameters = callable?.parameters ?? [];
      const present = parameters.some((parameter) => native.checker.getTypeAtLocation(parameter).getProperty("container") !== undefined);
      if (!present) {
        context.report({
          node: node.name,
          message: "The owning callable accepts no `container` prop at all; the caller cannot place this sealed Base UI portal.",
        });
        return;
      }
      const attribute = portal.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText() === "container");
      const expression = nativePortalExpression(attribute);
      const parameterRead = (value) => ts.isIdentifier(value) && declarations(value).some((declaration) => parameters.includes(declaration));
      const bindingFromParameter = (binding) => {
        let ancestor = binding.parent;
        while (ancestor !== undefined && !ts.isParameter(ancestor)) {
          ancestor = ancestor.parent;
        }
        if (ancestor !== undefined) {
          return parameters.includes(ancestor);
        }
        ancestor = binding.parent;
        while (ancestor !== undefined && !ts.isVariableDeclaration(ancestor)) {
          ancestor = ancestor.parent;
        }
        return ancestor?.initializer !== undefined && parameterRead(nativeUnwrapExpression(ancestor.initializer));
      };
      const forbidden =
        expression === undefined ||
        (ts.isIdentifier(expression) && expression.text === "undefined") ||
        expression.kind === ts.SyntaxKind.NullKeyword ||
        nativeSubtreeSome(
          expression,
          (value) => ts.isPropertyAccessExpression(value) && value.name.text === "body" && value.expression.getText() === "document",
        );
      const consumes =
        !forbidden &&
        nativeSubtreeSome(
          expression,
          (value) =>
            (ts.isPropertyAccessExpression(value) && value.name.text === "container" && parameterRead(nativeUnwrapExpression(value.expression))) ||
            (ts.isIdentifier(value) &&
              value.text === "container" &&
              declarations(value).some((declaration) => ts.isBindingElement(declaration) && bindingFromParameter(declaration))),
        );
      if (!consumes) {
        context.report({
          node: attribute === undefined ? node.name : native.tsNodeToESTreeNodeMap.get(attribute.name),
          message: "The container prop exists but this Base UI Portal target does not consume it; the caller seam is a dead wire.",
        });
      }
    };
    return { JSXOpeningElement: check };
  },
};

function nativeCalledMemberName(callee) {
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  if (
    ts.isElementAccessExpression(callee) &&
    (ts.isStringLiteral(callee.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(callee.argumentExpression))
  ) {
    return callee.argumentExpression.text;
  }
}

function nativePackageCallRule(methods, grouped) {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const native = nativeDeclarationContext(context);
      const groups = new Map();
      const propertyDeclarations = (receiver, name) =>
        native.checker.getNonNullableType(native.checker.getTypeAtLocation(receiver)).getProperty(name)?.declarations ?? [];
      const isHome = (declarations) =>
        declarations.length > 0 &&
        declarations.every((declaration) => declaration.getSourceFile().fileName.replaceAll("\\", "/").includes("/node_modules/@tanstack/query-core/"));
      const verdictFor = (receiver, name) => {
        const direct = propertyDeclarations(receiver, name);
        const uncast = propertyDeclarations(nativeUncastReceiver(receiver, native.checker), name);
        if (isHome(direct) || isHome(uncast)) {
          return "home";
        }
        return direct.length > 0 ? "other" : "unreadable";
      };
      const report = (candidate, sites = [candidate]) => {
        const text = context.sourceCode.getText(candidate.node);
        const start = candidate.node.range[0] + Math.max(text.lastIndexOf(candidate.name), 0);
        context.report({
          loc: { start: context.sourceCode.getLocFromIndex(start), end: context.sourceCode.getLocFromIndex(start + candidate.name.length) },
          message:
            candidate.verdict === "unreadable"
              ? `Whether ${candidate.name} is TanStack Query's client member CANNOT be established: the checker cannot place this receiver.`
              : `Imperative ${candidate.name} belongs in the central data seam, not inline at the caller. Line(s): ${sites.map((site) => site.node.loc.start.line).join(", ")}.`,
        });
      };
      const check = (node) => {
        const callee = native.esTreeNodeToTSNodeMap.get(node.callee);
        const name = nativeCalledMemberName(callee);
        if (name === undefined || !methods.includes(name)) {
          return;
        }
        const verdict = verdictFor(callee.expression, name);
        if (verdict === "other") {
          return;
        }
        const candidate = { node: node.callee, name, verdict };
        if (!grouped) {
          report(candidate);
        } else {
          const sites = groups.get(name) ?? [];
          sites.push(candidate);
          groups.set(name, sites);
        }
      };
      return {
        CallExpression: check,
        "Program:exit"() {
          for (const [, sites] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
            report(sites.find((site) => site.verdict === "home") ?? sites[0], sites);
          }
        },
      };
    },
  };
}

function nativeBareString(type) {
  if (ts.isParenthesizedTypeNode(type)) {
    return nativeBareString(type.type);
  }
  const arms = ts.isUnionTypeNode(type) ? type.types : [type];
  const kinds = arms.map((raw) => {
    let arm = raw;
    while (ts.isParenthesizedTypeNode(arm)) {
      arm = arm.type;
    }
    if (arm.kind === ts.SyntaxKind.StringKeyword) {
      return "string";
    }
    return arm.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(arm) && arm.literal.kind === ts.SyntaxKind.NullKeyword) ? "nullable" : null;
  });
  return kinds.includes("string") && kinds.every((kind) => kind !== null);
}

const brandNamePositionRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const ids = native.program.getSourceFiles().find((source) => source.fileName.replaceAll("\\", "/").endsWith(`/${ID_BRAND_HOME}`));
    if (ids === undefined) {
      throw new Error("Native canonical brand vocabulary is absent from the owning Program");
    }
    const brands = new Map();
    for (const declaration of ids.statements) {
      if (!ts.isTypeAliasDeclaration(declaration)) {
        continue;
      }
      const brand = nativeCanonicalIdBrand(native.checker.getTypeAtLocation(declaration.type), declaration.type, native.checker);
      if (brand !== null) {
        const typeName = declaration.name.text;
        const name = typeName.charAt(0).toLowerCase() + typeName.slice(1);
        if (brands.has(name)) {
          throw new Error(`Duplicate canonical id-brand position ${name}`);
        }
        brands.set(name, { typeName, brand });
      }
    }
    const check = (node) => {
      const mapped = native.esTreeNodeToTSNodeMap.get(node);
      const declaration = ts.isIdentifier(mapped) && ts.isParameter(mapped.parent) && mapped.parent.name === mapped ? mapped.parent : mapped;
      if (
        !((ts.isParameter(declaration) || ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration)) && ts.isIdentifier(declaration.name)) ||
        declaration.type === undefined ||
        !nativeBareString(declaration.type)
      ) {
        return;
      }
      const name = declaration.name.text;
      const expected = brands.get(name);
      if (expected !== undefined) {
        context.report({
          node: native.tsNodeToESTreeNodeMap.get(declaration.name),
          message: `${name} is bare string, but canonical ${expected.typeName} (${expected.brand}) owns this position. (@orb/kit/ids)`,
        });
      }
    };
    return { Identifier: check, TSPropertySignature: check, PropertyDefinition: check };
  },
};

const COMMENTED_CODE = /^\s*(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|throw|await)\b.*[;{}]\s*$/u;

// Prose routinely opens with a statement keyword; only a line comment that also ENDS like a statement is parked code.
const commentedCodeRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Program: () => {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === "Line" && COMMENTED_CODE.test(comment.value)) {
            context.report({
              loc: comment.loc,
              message: "Commented-out code; delete it (git history keeps it). Comments are for prose, not parked code (.claude/rules/comments.md).",
            });
          }
        }
      },
    };
  },
};

const CT_STORY_MODULE = /(?:_ct-stories|\.fixtures)(?:\.tsx)?$/u;
const CT_JSX_TREE = new Set(["JSXElement", "JSXFragment", "JSXOpeningElement", "JSXAttribute", "JSXExpressionContainer"]);
const CT_REWRITE_SCOPES = new Set(["ArrowFunctionExpression", "FunctionDeclaration", "FunctionExpression"]);

// playwright-ct rewrites each JSX/array reference of an imported story into a generated const, so one binding with
// two rewrite sites in a scope fails the whole bundle at eval. Separate test callbacks and mount trees are separate scopes.
const ctStorySingleImportRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const imported = new Set();
    const components = new Set();
    const occurrences = [];
    const report = (node, name) =>
      context.report({
        node,
        message: `The CT story \`${name}\` is declared into this scope twice; playwright-ct fails the bundle at eval. Import it once and reference it once per JSX tree or array scope.`,
      });
    return {
      ImportDeclaration: (node) => {
        for (const specifier of node.specifiers.filter(({ type }) => type !== "ImportNamespaceSpecifier")) {
          const name = specifier.local.name;
          if (/^[A-Z]/u.test(name) && CT_STORY_MODULE.test(node.source.value)) {
            components.add(name);
          }
          if (imported.has(name)) {
            report(specifier, name);
          }
          imported.add(name);
        }
      },
      ArrayExpression: (node) => {
        const scope = sourceCode.getAncestors(node).findLast((ancestor) => CT_REWRITE_SCOPES.has(ancestor.type)) ?? sourceCode.ast;
        for (const element of node.elements.filter((candidate) => candidate?.type === "Identifier")) {
          occurrences.push({ scope, name: element.name, node: element });
        }
      },
      JSXOpeningElement: (node) => {
        if (node.name.type !== "JSXIdentifier") {
          return;
        }
        let root = node;
        while (CT_JSX_TREE.has(root.parent.type)) {
          root = root.parent;
        }
        occurrences.push({ scope: root, name: node.name.name, node: node.name });
      },
      "Program:exit"() {
        const seen = new Map();
        for (const occurrence of occurrences.filter(({ name }) => components.has(name))) {
          const names = seen.get(occurrence.scope) ?? new Set();
          seen.set(occurrence.scope, names);
          if (names.has(occurrence.name)) {
            report(occurrence.node, occurrence.name);
          }
          names.add(occurrence.name);
        }
      },
    };
  },
};

const EVALUATE_METHODS = new Set(["evaluate", "evaluateAll"]);
const FUNCTION_NODES = new Set(["FunctionDeclaration", "ArrowFunctionExpression", "FunctionExpression"]);

function evaluateMethodName(callee) {
  if (callee.type !== "MemberExpression") {
    return "";
  }
  if (callee.computed) {
    return callee.property.type === "Literal" ? String(callee.property.value) : "";
  }
  return callee.property.type === "Identifier" ? callee.property.name : "";
}

/** A binding is module-scoped when no function boundary lies between it and the file: a top-level block or loop binding counts, a local of any function does not. */
function isModuleScoped(scope) {
  for (let current = scope; current !== null; current = current.upper) {
    if (current.type === "function" || current.type === "function-expression-name") {
      return false;
    }
  }
  return true;
}

/** ESLint seeds builtins and browser globals as global-scope variables with no definitions, so only a defined variable is a capture. */
function isModuleCapture(reference, self) {
  const variable = reference.resolved;
  return variable !== null && variable !== self && variable.defs.length > 0 && reference.isValueReference && isModuleScoped(variable.scope);
}

// Playwright serializes an evaluate callback with Function.prototype.toString(); a module-scope binding it names does not
// exist in the page, so the call dies in-browser as a silent ReferenceError.
const evaluateNoScopeCaptureRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const callbacks = [];
    const lookup = (from, name) => {
      let scope = from;
      while (scope !== null && !scope.set.has(name)) {
        scope = scope.upper;
      }
      return scope?.set.get(name);
    };
    const captureWithin = (fn, self) => {
      for (const reference of sourceCode.getScope(fn).through.filter((candidate) => isModuleCapture(candidate, self))) {
        if (!sourceCode.getAncestors(reference.identifier).some(({ type }) => type === "TSTypeQuery")) {
          context.report({
            node: reference.identifier,
            message: `The .evaluate() callback references the module-scope binding \`${reference.resolved.name}\`, which does not exist in the page. Thread it through the evaluate argument or move it inside the callback.`,
          });
        }
      }
    };
    // A callback imported from another module is out of per-file reach: its declaring file is not parsed here, and an
    // import binding may as well be a script string. Only a callback declared in this file is judged.
    const judgeReference = (arg) => {
      const variable = lookup(sourceCode.getScope(arg), arg.name);
      for (const def of variable?.defs ?? []) {
        const fn = def.type === "FunctionName" ? def.node : def.node.init;
        if (FUNCTION_NODES.has(fn?.type)) {
          captureWithin(fn, variable);
        }
      }
    };
    return {
      CallExpression: (node) => {
        const [arg] = node.arguments;
        if (arg !== undefined && EVALUATE_METHODS.has(evaluateMethodName(node.callee))) {
          callbacks.push(arg);
        }
      },
      "Program:exit"() {
        for (const arg of callbacks) {
          if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
            captureWithin(arg, null);
          } else if (arg.type === "Identifier") {
            judgeReference(arg);
          }
        }
      },
    };
  },
};

const SINGLE_REPLICA_ANNOTATION = "ASSUMES(single-replica)";
const STATE_CONSTRUCTORS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);
const ARRAY_MUTATORS = new Set(["push", "shift", "splice", "unshift"]);

// What a module-scope `new X(...)` holds: a non-literal-seeded Map/Set/WeakMap/WeakSet, or an instance of a class declared
// in this file with a non-readonly field. An imported factory is out of structural reach, a declared limit.
function singleReplicaConstruction(init, classes) {
  if (init.callee.type !== "Identifier") {
    return "";
  }
  const name = init.callee.name;
  if (STATE_CONSTRUCTORS.has(name)) {
    const seededByLiteral = init.arguments.length === 1 && init.arguments[0].type === "ArrayExpression";
    return seededByLiteral ? "" : `a \`new ${name}()\``;
  }
  const mutable = classes
    .get(name)
    ?.body.body.some((member) => (member.type === "PropertyDefinition" || member.type === "AccessorProperty") && !member.readonly);
  return mutable === true ? `an instance of the locally-declared class \`${name}\` with a non-readonly field` : "";
}

// Module-scope per-process state needs a file-level ASSUMES(single-replica) comment naming its replacement seam. Array
// literal seeds that are never mutated and classes whose fields are all readonly are immutable, so they stay silent.
const assumesSingleReplicaRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const isMutated = (declarator) =>
      sourceCode
        .getDeclaredVariables(declarator)
        .flatMap(({ references }) => references)
        .some(({ identifier }) => {
          const member = identifier.parent;
          return (
            member.type === "MemberExpression" &&
            member.object === identifier &&
            !member.computed &&
            ARRAY_MUTATORS.has(member.property.name) &&
            member.parent.type === "CallExpression" &&
            member.parent.callee === member
          );
        });
    const detailOf = (declarator, classes) => {
      const init = declarator.init;
      if (init?.type === "ArrayExpression") {
        return isMutated(declarator) ? "an array accumulator mutated via push/shift/splice/unshift" : "";
      }
      return init?.type === "NewExpression" ? singleReplicaConstruction(init, classes) : "";
    };
    return {
      Program: (program) => {
        if (sourceCode.getAllComments().some(({ value }) => value.includes(SINGLE_REPLICA_ANNOTATION))) {
          return;
        }
        const statements = program.body.map((statement) =>
          statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement,
        );
        const classes = new Map(statements.filter((s) => s?.type === "ClassDeclaration" && s.id !== null).map((s) => [s.id.name, s]));
        const declarators = statements.flatMap((statement) => (statement?.type === "VariableDeclaration" ? statement.declarations : []));
        for (const declarator of declarators) {
          const detail = detailOf(declarator, classes);
          if (detail !== "") {
            const id = declarator.id;
            // An annotated identifier's range includes `: Type`; the bare name is the position that carries the finding.
            const loc =
              id.type === "Identifier" ? { start: id.loc.start, end: { line: id.loc.start.line, column: id.loc.start.column + id.name.length } } : id.loc;
            context.report({
              loc,
              message: `Module-scope mutable per-process state (${detail}); annotate the file with ASSUMES(single-replica) naming a DB-backed replacement seam, or move the state out of module scope.`,
            });
          }
        }
      },
    };
  },
};

const DECLARATION_NATIVE_RESTRICTIONS = TYPED_NATIVE_POLICIES.filter(({ ruleId, hard }) => !hard && ruleId.startsWith("orb/"));

// D46: `ctx.dump` walks a guest value on the HOST stack, so a deep value overflows it and corrupts the shared
// WASM runtime for every plugin in the process. The membrane names `dump` only inside its one top-level
// helper, and inside it only in a statement after `if (!handleSafeToDump(...)) { return }`, the module's own
// iterative depth/node guard. Every `dump` spelling is judged, including a string key bound elsewhere in the
// module. The int test over the real snippet path proves the guard's effect: same handle, every refusal exits.
const PLUGIN_MEMBRANE = "packages/server/src/infra/plugin-host/membrane.ts";
const PLUGIN_DUMP_HELPER = "Program > FunctionDeclaration[id.name='tryDumpGuestValue']";
// esquery 1.7 mis-parses a chained `:has(> A > B)`, so the exit test nests one `:has` per level.
const PLUGIN_DUMP_GUARD_EXIT =
  "IfStatement[test.operator='!'][test.argument.type='CallExpression'][test.argument.callee.name='handleSafeToDump']" +
  ":has(> BlockStatement.consequent:has(> :matches(ReturnStatement, ThrowStatement)))";
const PLUGIN_DUMP_SPELLINGS = [
  "MemberExpression[property.name='dump']",
  "Property[key.name='dump']",
  ":matches(Literal[value='dump'], TemplateElement[value.cooked='dump'])",
];
const PLUGIN_DUMP_MESSAGE =
  "A QuickJS membrane `dump` outside `tryDumpGuestValue` can materialize guest-controlled recursive structure without the iterative handle depth/node guard; the walk runs on the HOST stack, so an overflow corrupts the shared WASM runtime for every plugin in the process (D46). Route guest values through `tryDumpGuestValue`.";
const PLUGIN_DUMP_ORDER_MESSAGE =
  "Inside `tryDumpGuestValue`, `dump` may appear only after `if (!handleSafeToDump(ctx, handle)) { return ... }`: a guard after the materialization cannot stop the host-stack walk that already ran (D46).";
const PLUGIN_DUMP_SELECTORS = [
  ...PLUGIN_DUMP_SPELLINGS.map((spelling) => ({ selector: `${spelling}:not(${PLUGIN_DUMP_HELPER} *)`, message: PLUGIN_DUMP_MESSAGE })),
  ...PLUGIN_DUMP_SPELLINGS.flatMap((spelling) => [
    { selector: `${PLUGIN_DUMP_HELPER} > BlockStatement > :not(${PLUGIN_DUMP_GUARD_EXIT} ~ *) ${spelling}`, message: PLUGIN_DUMP_ORDER_MESSAGE },
    // A parameter default or destructure runs before the body, so the guard cannot precede it.
    { selector: `${PLUGIN_DUMP_HELPER} > :not(BlockStatement) ${spelling}`, message: PLUGIN_DUMP_ORDER_MESSAGE },
  ]),
  {
    selector: ":matches(ImportSpecifier, ImportDefaultSpecifier, ImportNamespaceSpecifier)[local.name='handleSafeToDump']",
    message: "`handleSafeToDump` is the membrane's own iterative guard; an imported same-named function is not that walk (D46).",
  },
];

const restrictionPlugin = {
  rules: {
    "tooling-cli-entry": toolingEntryRule(false),
    "tooling-ops-direct-invocation": toolingEntryRule(true),
    ...Object.fromEntries(RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)])),
    ...Object.fromEntries(VERIFY_HARD_RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)])),
    ...Object.fromEntries(IDENTITY_WRITER_RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)])),
    ...Object.fromEntries(UI_HARD_RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)])),
    [UI_CT_COLOR_RESTRICTION.id]: uiCtColorRule,
    [TYPE_HOME_NATIVE_POLICY_ID]: typeHomeDeclarationRule,
    [SERVER_FACTORY_TIER_REFERENCE_POLICY_ID]: serverFactoryPublicBoundaryRule,
    "no-inline-invalidate-outside-seam": nativePackageCallRule(["invalidateQueries"], true),
    "client-cache-surgery-only-in-data": nativePackageCallRule(
      ["invalidateQueries", "setQueryData", "cancelQueries", "getQueryData", "removeQueries", "resetQueries"],
      true,
    ),
    "no-inline-optimistic-in-surface": nativePackageCallRule(["cancelQueries", "setQueryData"], false),
    "baseui-portal-container-seam": baseUiPortalContainerRule,
    "no-interactive-role-in-features": interactiveFeatureRoleRule,
    "no-multiplexed-mutation-error": multiplexedMutationErrorRule,
    "no-raw-clock": ambientDeterminismRule(true),
    "no-raw-random": ambientDeterminismRule(false),
    "no-manual-autosave-flush": manualAutosaveFlushRule,
    "no-chat-trpc-in-surface": chatTrpcSurfaceRule,
    "no-mint-via-cast": mintViaCastRule,
    "zustand-selector-stability": zustandSelectorStabilityRule,
    "test-fixture-imports": testFixtureImportsRule,
    "zod-modern-spellings": zodModernSpellingsRule,
    "no-raw-intl-time": rawIntlTimeRule,
    "list-row-adoption": listRowAdoptionRule,
    "brand-in-name-position": brandNamePositionRule,
    [INJECTED_OP_RULE]: injectedOpCallerParamRule,
    "test-factory-contract": testFactoryContractRule,
    "no-opaque-test-fixture": opaqueTestFixtureRule,
    "no-context-returntype": contextReturnTypeRule,
    "no-raw-z-index": rawZIndexRule,
    "no-raw-spacing-in-features": rawTierClassRule(
      /\b(?:gap|p[xytrbl]?|m[xytrbl]?|space-[xy])-(?:[1-9]\d*|\d+\.\d+|\[[^\]]+\])/u,
      "Raw spacing in a class carrier; use a layout primitive or spacing intent token.",
    ),
    "no-raw-typography-in-features": rawTierClassRule(
      /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[[^\]]+\])/u,
      "Raw typography in a class carrier; use a typography intent token.",
    ),
    "no-hover-display-swap": hoverDisplayRule,
    "zustand-selector-derived": storeDerivedRule,
    "baseui-derives-not-respells": baseUiDerivesRule(false),
    "baseui-derives-not-respells-health": baseUiDerivesRule(true),
    "plugin-dump-guard": restrictionRule({ selectors: PLUGIN_DUMP_SELECTORS }),
    "baseui-state-data-attributes": baseUiStateRule,
    "context-definition-shape": contextDefinitionRule,
    "no-mutating-register-api": registerApiRule,
    "structured-plan-one-home": structuredPlanRule,
    "wire-schema-vocab-one-home": wireSchemaVocabularyRule,
    "no-hardcoded-model-prose": modelProseRule,
    "state-files": stateFilesRule,
    "registry-context-via-mint": registryContextRule,
    [CLIENT_MAP_NATIVE_RULE.slice("orb/".length)]: parallelMapRule,
    "testid-typed-only": typedTestIdRule('Freeform data-testid string; use the typed registry via testId("key").'),
    "testid-typed-only-stories": typedTestIdRule(
      'Freeform data-testid string in a CT story; use storyTestId("key") for a story-only id or testId("key") for a production id.',
    ),
    "ct-poll-intervals-shared": ctPollIntervalsSharedRule,
    "scroll-container-positioned": scrollContainerRule,
    "ui-size-via-variant": uiSizeRule,
    "no-floorless-control-in-wrap": floorlessControlRule,
    "membership-write-fan": membershipWriteFanRule,
    [TEST_PACKAGE_SUBPATH_RULE.slice("orb/".length)]: testPackageSubpathRule,
    [TOOLING_ROOT_CONFIG_IMPORT_RULE.slice("orb/".length)]: toolingRootConfigImportRule,
    "evaluate-no-scope-capture": evaluateNoScopeCaptureRule,
    "assumes-single-replica": assumesSingleReplicaRule,
    "commented-code": commentedCodeRule,
    "ct-story-single-import": ctStorySingleImportRule,
  },
};
function typedNativeSettings(entry) {
  return {
    [`orb/typed-native-inputs/${entry.id}`]: createHash("sha256")
      .update(typedNativeInputIdentity(entry, NATIVE_TYPED_COMPILER_CONTEXT.identity))
      .update(
        JSON.stringify(
          typedNativeInputPaths(entry, AUTHORED_NATIVE_INPUT_PATHS, ROOT, NATIVE_TYPED_COMPILER_CONTEXT.configs).map((path) => [
            path,
            readFileSync(join(ROOT, path), "utf8"),
          ]),
        ),
      )
      .digest("hex"),
  };
}

const RESTRICTION_BLOCKS = [...RESTRICTIONS, ...DECLARATION_NATIVE_RESTRICTIONS].map(({ id, scope, notNamed = [], notUnder = [], homes, deferred = [] }) => {
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
    ...(TYPED_NATIVE_POLICIES.some((entry) => entry.id === id)
      ? {
          settings: typedNativeSettings(TYPED_NATIVE_POLICIES.find((entry) => entry.id === id)),
        }
      : {}),
    ...(CLIENT_MAP_RESTRICTIONS.some((entry) => entry.id === id) ? { settings: CLIENT_MAP_NATIVE_SETTINGS } : {}),
    ...(CLIENT_LEXICAL_RESTRICTIONS.some((entry) => entry.id === id) ? { settings: CLIENT_LEXICAL_NATIVE_SETTINGS } : {}),
    ...(id === INJECTED_OP_RULE ? { settings: INJECTED_OP_SETTINGS } : {}),
    ...(MEMBERSHIP_WRITE_FAN_RESTRICTIONS.some((entry) => entry.id === id) ? { settings: { "orb/membership-tables": MEMBERSHIP_TABLE_EXPORTS } } : {}),
    ...(SERVER_ONE_HOME_RESTRICTIONS.some((entry) => entry.id === id) ? { settings: SERVER_ONE_HOME_SETTINGS } : {}),
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
    // JSX syntax options compose with the maintained-test owning Programs below.
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
    // no-misused-promises 0, require-await 0, await-thenable 0 (zero false-positive cost). These rules remain shipped-source-only;
    // maintained tests receive their own native policies. (`await-thenable` was adopted once the db-layer seam was
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
    // Test worlds overlap; the parser selects the actual owner instead of upward project-service discovery.
    files: rootSources("@tests"),
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
    files: ["tests/**/*.{ts,tsx}"],
    ignores: [LEGACY_TEST_LINT_GLOB],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never", arrayLiteralTypeAssertions: "never" },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    ignores: [LEGACY_TEST_LINT_GLOB, TOOLING_TESTS],
    plugins: { "@typescript-eslint": tseslint.plugin },
    settings: typedNativeSettings(TYPED_NATIVE_POLICIES.find(({ ruleId }) => ruleId === "@typescript-eslint/no-unsafe-type-assertion")),
    rules: { "@typescript-eslint/no-unsafe-type-assertion": "error" },
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
    // match no parser block above. The browser test program is the one that includes them, and the typed native
    // rules the authored-source blocks enable here (orb/no-raw-intl-time, orb/zustand-selector-stability) need
    // its checker: a syntax-only parser crashes those rules and leaves the file with no native compiler owner.
    files: ["scripts/probes/st-goldens/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: [TEST_WORLD_PROGRAMS.browser], projectService: false, tsconfigRootDir: ROOT, sourceType: "module" },
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
    Object.hasOwn(block.rules, "orb/no-test-fabrication") ||
    Object.hasOwn(block.rules, "@typescript-eslint/consistent-type-assertions") ||
    Object.hasOwn(block.rules, "@typescript-eslint/no-unsafe-type-assertion") ||
    [
      ...INFRA_AUTH_RESTRICTIONS,
      ...TABLE_IMPORT_RESTRICTIONS,
      ...CLASS_RESTRICTIONS,
      ...ROLE_DATA_RESTRICTIONS,
      ...TURN_IDENTITY_RESTRICTIONS,
      ...SERVER_SCOPE_RESTRICTIONS,
      ...DETERMINISM_RESTRICTIONS,
      ...CLASS_TOKEN_RESTRICTIONS,
      ...Z_INDEX_RESTRICTIONS,
      ...BASEUI_RESTRICTIONS,
      ...CLIENT_CONTEXT_RESTRICTIONS,
      ...CLIENT_MAP_RESTRICTIONS,
      ...CLIENT_LEXICAL_RESTRICTIONS,
      ...DECLARATION_NATIVE_RESTRICTIONS,
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
  // Generated subjects keep the same owning compiler routes; only unrelated lint rules remain excluded.
  ...DECLARATION_NATIVE_RESTRICTIONS.flatMap(({ scope, notUnder = [], notNamed = [] }) => [
    {
      files: scope.flatMap((file) => GENERATED_SOURCE.map((generated) => [...(Array.isArray(file) ? file : [file]), generated])),
      ignores: [...notUnder, ...notNamed, "tests/**"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: true, tsconfigRootDir: ROOT, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
    },
    {
      files: scope.flatMap((file) => GENERATED_SOURCE.map((generated) => [...(Array.isArray(file) ? file : [file]), generated, "tests/**"])),
      ignores: [...notUnder, ...notNamed, "tests/legacy/**"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: TEST_TREE_PROJECTS, projectService: false, tsconfigRootDir: ROOT, ecmaFeatures: { jsx: true } },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
    },
  ]),
];

export default ORDINARY_CONFIG;

// HARD rules run separately so their no-inline-config policy cannot invalidate ordinary native exceptions.
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
  ...[UI_CT_COLOR_RESTRICTION, ...UI_HARD_RESTRICTIONS].map(({ id, scope }) => ({
    files: scope,
    plugins: { orb: restrictionPlugin },
    rules: { [`orb/${id}`]: "error" },
  })),
  ...IDENTITY_WRITER_RESTRICTIONS.map(({ id, scope, notUnder = [], homes }) => ({
    files: scope,
    ...(notUnder.length + homes.length === 0 ? {} : { ignores: [...notUnder, ...homes.map(({ path }) => path)] }),
    plugins: { orb: restrictionPlugin },
    rules: { [`orb/${id}`]: "error" },
  })),
  {
    files: ["tests/**/*.{ts,tsx}"],
    ignores: [`${LEGACY_TEST_ROOT}/**`],
    plugins: { orb: restrictionPlugin },
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
    rules: { "orb/ct-poll-intervals-shared": "error" },
  },
  {
    files: RUNNER_CONFIG_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...WALL_CLOCK_SELECTORS.map((selector) => ({ selector, message: WALL_CLOCK_MESSAGE })),
        { selector: PORT_LITERAL_SELECTOR, message: PORT_LITERAL_MESSAGE },
      ],
    },
  },
  { files: RETIRED_GATE_MARKER_FILES, rules: { "no-warning-comments": ["error", RETIRED_GATE_MARKER] } },
  { files: [PLUGIN_MEMBRANE], plugins: { orb: restrictionPlugin }, rules: { "orb/plugin-dump-guard": "error" } },
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
  {
    files: TEST_IMPORT_GLOBS,
    ignores: TEST_IMPORT_EXCLUSIONS,
    plugins: { orb: restrictionPlugin },
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
    settings: TEST_TOOLING_IMPORT_NATIVE_SETTINGS,
    rules: { [TEST_PACKAGE_SUBPATH_RULE]: "error" },
  },
  {
    files: TOOLING_IMPORT_GLOBS,
    plugins: { orb: restrictionPlugin },
    settings: TEST_TOOLING_IMPORT_NATIVE_SETTINGS,
    rules: { [TOOLING_ROOT_CONFIG_IMPORT_RULE]: "error" },
  },
  {
    files: [CONFIG_ANCHOR_OWNER],
    settings: TEST_TOOLING_IMPORT_NATIVE_SETTINGS,
    rules: {
      "no-restricted-exports": ["error", { restrictedNamedExports: [CONFIG_ANCHOR_FORMATTER] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: `ExportNamedDeclaration > ExportSpecifier[local.name='${CONFIG_ANCHOR_FORMATTER}']:not([exported.name='${CONFIG_ANCHOR_FORMATTER}'])`,
          message: "The registry formatter stays private; registry-owned bodies receive their anchor id.",
        },
        {
          selector: `ExportDefaultDeclaration > :matches(Identifier[name='${CONFIG_ANCHOR_FORMATTER}'], FunctionDeclaration[id.name='${CONFIG_ANCHOR_FORMATTER}'])`,
          message: "The registry formatter stays private; registry-owned bodies receive their anchor id.",
        },
      ],
    },
  },
  // These two syntax-only blocks sit BEFORE the typed hard blocks below: a later block's parserOptions win the merge, and the
  // tooling-entry rules those blocks enable need the compiler context on the files both cover.
  {
    // Gate modules quote the parked-code shapes in their own prose and fixtures. The node helper executables are `.mjs`.
    files: ["**/*.{ts,tsx}", `${HELPER_WORLD_DIRS.node}/**/*.mjs`],
    ignores: ["tooling/src/verify/gates/**", `${LEGACY_TEST_ROOT}/**`],
    plugins: { orb: restrictionPlugin },
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
    rules: { "orb/commented-code": "error" },
  },
  {
    files: ["tests/**/*.ct.tsx", "tests/**/*_ct-stories.tsx"],
    ignores: [`${LEGACY_TEST_ROOT}/**`],
    plugins: { orb: restrictionPlugin },
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
    rules: { "orb/ct-story-single-import": "error" },
  },
  ...TYPED_NATIVE_POLICIES.filter((entry) => entry.hard).map((entry) => ({
    files: entry.scope,
    plugins: { orb: restrictionPlugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: false, projectService: true, programs: null, tsconfigRootDir: ROOT, sourceType: "module" },
    },
    settings: typedNativeSettings(entry),
    rules: { [entry.ruleId]: "error" },
  })),
  ...VERIFY_HARD_RESTRICTIONS.map(({ id, scope, notUnder }) => ({
    files: scope,
    ignores: notUnder,
    plugins: { orb: restrictionPlugin },
    rules: { [`orb/${id}`]: "error" },
  })),
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
  const prototypeRules = {
    "no-extend-native": "error",
    "no-proto": "error",
    "no-restricted-properties": [
      "error",
      ...["Object", "Reflect"].map((object) => ({
        object,
        property: "setPrototypeOf",
        message: "Prototype mutation invalidates native own-data provenance; create the intended object without replacing its prototype.",
      })),
    ],
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
    ...MAINTAINED_GLOBAL_SURFACES.map((surface) => ({
      ...surface,
      ignores: [...(surface.ignores ?? []), ...PROTOTYPE_NATIVE_IGNORES],
      rules: prototypeRules,
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
