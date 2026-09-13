// Gate: css-selector-has-a-writer-health — the INSTRUMENT half of the product-CSS selector census. Its
// twin accuses an authored selector; this one accuses the measurement: a selector population of zero, and
// a vendor emission contract whose two sides have drifted apart.
//
// FAMILY `css-hook-provenance`, identical to `css-selector-has-a-writer`'s. THE SPLIT IS AUTHORITY, not
// severity (guide §3): its twin's findings anchor on an authored selector slice and take an ordinary
// waiver, while every finding here is a verdict about the TOOL — "I measured nothing" and "the committed
// contract disagrees with what is installed" are not sites an author absolves, and neither has an authored
// subject to anchor a marker on. `hard` is EARNED here rather than forced by a coordinate problem.
//
// WHAT THIS POLICY DELIBERATELY DOES NOT CARRY, and where it went. The legacy descriptor also reconciled
// the committed Base UI surface manifest against the installed package in both directions
// (`baseUiManifestOnly` / `baseUiInstalledOnly`, reported at the manifest and at a `node_modules` path).
// Those arms are RETIRED, not lost, for two reasons and with a successor:
//
//   1. THE SUBJECT IS NOT CSS. "The committed Base UI record disagrees with the installed package" is
//      `baseui-surface-manifest`'s whole subject — the version-bump tripwire — and a second gate asking it
//      one aggregate over is guide §8 step 3's MERGE case, not a second detector.
//   2. THE SUCCESSOR IS STRICTLY STRONGER. This module compared a SET OF ATTRIBUTE NAMES aggregated across
//      every component, so a state that vanished from one part while surviving on another produced no
//      difference at all. `baseui-surface-manifest#identity()` compares PER PART, and once `part.state`
//      joins that identity (p-baseui-family, #1584) it reports the same drift with the part named.
//
// Both arms were measured UNENFORCED by the §5b audit (cuts w04/w05: iterating `[]` killed no row) and
// measured EMPTY on the real tree at `1692583d6` (manifest 75 attributes, installed 75, symmetric
// difference zero in both directions), so the retirement removes no live catch. The receipt for the
// successor is `baseui-surface-manifest`'s own row, not this module's.
//
// THE SUCCESSOR IS PROVEN IN BOTH DIRECTIONS, and the sentence that said otherwise was BORN STALE — a
// correction worth keeping because of how it happened (`v-css-unit-2-2026-09-13.md` ledger row 5, #2305).
// The retirement above leans on `baseui-surface-manifest`, and each term it leans on is pinned:
//   * the `state` term — cutting `|${part.state.join(",")}` out of `identity()` reds
//     `baseui-surface-manifest:mustFlag[2]` alone;
//   * the VANISHED-PART direction — its `mustFlag[3]`, `count: 2`, "`Select.Separator` vanished from the
//     installed package";
//   * the VANISHED-COMPONENT direction — its `mustFlag[4]`, `count: 1`, "component `Dialog` vanished from
//     the installed package".
// Those last two are the direct analogue of the `baseUiManifestOnly` arm retired here, and they landed in
// `dea1061df` EIGHTEEN MINUTES before the commit that wrote "measured unenforced by any proof row" — an
// ancestor of it, so the claim was false on the tree it shipped on. Read-first §0 ruling 3 is the rule it
// broke: a recorded refusal is a snapshot, not a standing verdict, and it is re-derived before it is
// inherited. #2297 stays OPEN for its OTHER rows and is cited for those, never for these three.
//
// #2309 DOES NOT REACH THIS CITATION, and the check is one read rather than an assumption: it is a
// CHANGED-MODE SELECTION defect — a selected-files resource policy whose per-file visitors receive zero
// source files when only a declared resource changed. `baseui-surface-manifest` declares
// `population: { of: "none" }` and `execution: "entire-population"` and subscribes no visitor, so it has no
// source population to under-select and defers whole under a narrowed request. The arms above cannot go
// stale-clean by that mechanism — which held BEFORE #2309 was repaired (`x-resource-selection-2026-09-13.md`,
// the `policy-effective-population` seam) and holds after it, because the reason is the declared population,
// not the planner.
//
// AUTHORITY: `hard`. No marker door, and the legacy bare `@orb-gate-ignore` door had none in use — marker
// census 0 = 0 = 0, measured 2026-09-12 over 7,725 tracked files with a 1,196-hit positive control.
//
// POPULATION PORT: `{ of: "none" }`. Unlike its twin this policy reads no TypeScript at all — its subjects
// are the product CSS identity and the installed vendor surface, both closed ResourceHost facts. The legacy
// descriptor's whole-harness admitted set reached these arms through nothing but `ctx.root` filesystem
// reads. Legacy sha `1692583d6`.
//
// WHERE A BROKEN RESOURCE REFUSES — not here (`mustRefuse[0]`); the runtime withholds this owner at the
// population phase and the module owns no not-ready branch.
import { PRODUCT_STYLESHEETS, THEME } from "../contract/css-family.ts";
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { CLEAN_PRODUCT_CSS, HOOKLESS_HOMES, STREAMDOWN_BUNDLE, STREAMDOWN_EMITTING_BUNDLE, VENDOR_SURFACE_FIXTURE } from "../lib/css-family-proof-fixtures.ts";
import { selectorHookIdentities } from "../lib/css-family-selector-provenance.ts";
import { readVendorHooks, STREAMDOWN_HOOK_NAME, STREAMDOWN_HOOK_VALUE } from "../lib/css-vendor-hooks.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MESSAGE =
  "the product-CSS selector census is BLIND or its vendor emission contract has drifted — a clean selector verdict rests on both (tooling/src/verify/gates/css-selector-has-a-writer-health.ts)";

const BLIND = `the selector census learned ZERO authored hooks from the five product stylesheets — every "this hook has a writer" verdict below it is vacuous. ${MESSAGE}`;
const VENDOR_UNSELECTED = `Streamdown still emits the contracted ${STREAMDOWN_HOOK_NAME}="${STREAMDOWN_HOOK_VALUE}" hook but no product stylesheet selects it: the narrow vendor contract is stale on the CSS side. ${MESSAGE}`;
const VENDOR_UNEMITTED = `a product stylesheet selects Streamdown's ${STREAMDOWN_HOOK_NAME}="${STREAMDOWN_HOOK_VALUE}" hook but no installed bundle emits it: the narrow vendor contract is stale on the VENDOR side. ${MESSAGE}`;

/** THE EMPTY VENDOR SIDES the surface reader hands a policy that declares only `vendor-css-surface`. The
 *  Base UI reconciliation moved to `baseui-surface-manifest` (see the header), so this module reads the
 *  Streamdown half alone and states the other two as empty rather than pretending to have measured them. */
const NO_BASE_UI = { version: "", components: {} } as const;

export const gate = defineGate({
  id: "css-selector-has-a-writer-health",
  family: "css-hook-provenance",
  authority: "hard",
  severity: "error",
  population: {
    of: "none",
    why: "the product CSS identity and the installed vendor surface are closed ResourceHost facts; this policy judges no TypeScript source",
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "product-css" }, { kind: "vendor-css-surface" }],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: () => {
      const inventory = readyResourceValue(ctx.resources.cssInventory("product"));
      const hooks = selectorHookIdentities(inventory.selectorHooks);
      // An ABSENCE verdict cannot anchor on its own subject (guide §3). The sheets are declared, read and
      // present whenever the resource resolved, so the anchor is the first present product stylesheet.
      const anchor = subjectAnchor(new Set(inventory.files.map(({ path }) => path)), [...PRODUCT_STYLESHEETS]);
      const sheet = anchor(THEME);
      if (hooks.length === 0) {
        ctx.report.file(sheet, { line: 1, column: 1, message: BLIND });
      }
      const vendor = readVendorHooks({
        manifest: NO_BASE_UI,
        installed: NO_BASE_UI,
        installedValues: new Map(),
        selectorSources: readyResourceValue(ctx.resources.vendorCssSurface()).selectorSources,
      });
      const selected = hooks.some(
        (hook) => hook.kind === "data" && hook.name === STREAMDOWN_HOOK_NAME && hook.operator === "=" && hook.value === STREAMDOWN_HOOK_VALUE,
      );
      if (vendor.streamdownEmitted !== selected) {
        ctx.report.file(sheet, { line: 1, column: 1, message: vendor.streamdownEmitted ? VENDOR_UNSELECTED : VENDOR_UNEMITTED });
      }
      // The denominator is the SHEET COUNT, never the hook census: `receiptFailures` reds on `members === 0`,
      // so receipting the census would turn this policy's own blindness finding into a TOOL ERROR — §12.3's
      // "a `-health` consumer receipts a CONSTANT, never its census", one layer out.
      ctx.receipt({ kind: "population", source: `css-selector-has-a-writer-health [hooks=${String(hooks.length)}]`, members: inventory.files.length });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...VENDOR_SURFACE_FIXTURE, ...HOOKLESS_HOMES },
      expect: { count: 1, line: 1, messageIncludes: "learned ZERO authored hooks" },
      why: "THE BLINDNESS TRIPWIRE: five present sheets carrying only `:root`/at-rule declarations select no class and no data attribute, so the census is empty and every writer verdict resting on it is vacuous. Its cut direction is the TRIPWIRE direction — opening the fence makes it flag FEWER, so its falsifier is this row going green",
    },
    {
      mode: "resource",
      files: { ...VENDOR_SURFACE_FIXTURE, ...CLEAN_PRODUCT_CSS, [STREAMDOWN_BUNDLE]: STREAMDOWN_EMITTING_BUNDLE },
      expect: { count: 1, line: 1, messageIncludes: "stale on the CSS side" },
      why: "the vendor EMITS the contracted hook and no product stylesheet selects it — the two-sided arm's first direction, discriminated by its own message because the count is 1 in both directions",
    },
    {
      mode: "resource",
      files: {
        ...VENDOR_SURFACE_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        "packages/ui/src/styles/globals.css": '[data-streamdown="code-block"] { contain: paint; }\n',
      },
      expect: { count: 1, line: 1, messageIncludes: "stale on the VENDOR side" },
      why: "a product stylesheet selects the hook and the installed bundles — read WHOLE, not through a content-hashed chunk name — no longer emit it. This is the rot receipt: a Streamdown bump that renames its chunk cannot silence this arm the way it silenced the legacy literal path",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...VENDOR_SURFACE_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        "packages/ui/src/styles/globals.css": '[data-streamdown="code-block"] { contain: paint; }\n',
        [STREAMDOWN_BUNDLE]: STREAMDOWN_EMITTING_BUNDLE,
      },
      why: "both sides of the narrow vendor contract agree, and the census is non-empty: the instrument is healthy and says nothing",
    },
    {
      mode: "resource",
      files: { ...VENDOR_SURFACE_FIXTURE, ...HOOKLESS_HOMES, "packages/client/src/styles/globals.css": ".probe-hook { color: red; }\n" },
      why: "ONE authored class hook is a non-empty census — the blindness arm is about zero, not about few, and this row is the fence that keeps it from firing on a small corpus",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS },
      expect: { messageIncludes: "vendor-css-surface" },
      why: "no installed vendor surface at all: the runtime refuses at the population phase and withholds this owner, rather than the policy reporting a clean two-sided agreement it could not measure",
    },
    {
      mode: "resource",
      files: { ...VENDOR_SURFACE_FIXTURE, "packages/ui/src/styles/theme.css": "@theme { --color-background: black; }\n" },
      expect: { messageIncludes: "product-css" },
      why: "a product CSS identity missing four of its five homes refuses at the population phase; the blindness arm above answers an EMPTY census, never an UNREADABLE one",
    },
  ],
});
