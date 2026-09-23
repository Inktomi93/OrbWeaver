// Gate: css-selector-has-a-writer (#956 / client-architecture-lockdown.md §4.7) — an authored product-CSS
// selector hook must have a semantic PRODUCER. Inert text (a prose string, an arbitrary object property, a
// comment) cannot counterfeit DOM ownership.
//
// FAMILY `css-hook-provenance` — the shared reader is `lib/css-family-source-provenance.ts`'s
// `cssHookProvenanceFact`, the ONE collector over `@ui` + `@client` that the legacy module-global `hookPass`
// hand-rolled and that TWO other policies in this family also consume (`css-family-ownership` and
// `css-family-direct-client-mechanism`; both `-health` siblings declare `facts: []`). The CSS-side reader is
// `lib/css-family-selector-provenance.ts#selectorHookIdentities`.
//
// AUTHORITY: `ordinary`, and the door is NEW. The legacy descriptor's findings came out of
// `cssFamilyFinding`, which minted `column: 1` with a SYNTHETIC composite token (`class:shell-wrapper`,
// `data-density="birdie"`) — guide §2.1's authored-coordinate rule, where `locateFinding` requires the token to be authored
// text at the finding's exact line and column and a synthetic label is authored nowhere. Under the legacy
// engine that worked, because a position was a plain string compared against the finding's own reported
// lexeme (`lib/gate-ignore.ts:180,196`) rather than a source coordinate; under this contract it does not.
// So the anchor MOVED (§4.6 category 6) onto the authored slice the hook fact now publishes:
// `.shell-wrapper`, `[data-density="birdie"]`. MARKER CENSUS 0 = 0 = 0 (measured 2026-09-12 over 7,725
// tracked source files with a 1,196-hit positive control, `css-family-audit-2026-09-12.md`), so the move
// orphans no waiver. The legacy bare `@orb-gate-ignore css-selector-has-a-writer:` door existed and does
// not survive; nothing used it.
//
// A DECLARED HYBRID (§12.4: "a hybrid's dual role is explicit and receipted").
//   RESOURCE half — `product-css` for the selector census, `vendor-css-surface` for the installed Streamdown
//   bundles, `json:baseui-manifest` + `installed-package{base-ui,ast}` for the Base UI state-attribute
//   contract. `product-css` is the smallest CLOSED id that carries the five-home selector identity.
//   COMPILER half — `population: { in: ["@client", "@ui"] }`, identical to the provider's, because the
//   verdict rests on the writer census the provider builds over exactly those roots.
//
// POPULATION PORT: an INTENTIONAL NARROWING that deletes a structurally redundant fence. The legacy
// descriptor carried `scopeSafety: "whole-project"` with NO `scanRoot`, so its admitted set was the whole
// harness corpus (`_shared/ts-workspace.ts#harnessGlobs`, 7,557 files on the real tree at `1692583d6`) —
// and then `lib/css-selector-writers.ts#isProductSource` and `css-family-source-provenance.ts#ownerForPath`
// each discarded everything outside `packages/{ui,client}/src/`, which is `@ui` + `@client` byte for byte
// (`contract/population.ts#POPULATION_ROOTS`). `StaticClassCollector.index`/`.visit` additionally fence on
// their own `sourceSet`, which was already built from that filtered list. The declared population therefore
// admits exactly what the gate ever looked at; the fence is deleted rather than kept as decoration
// (`server-layout` precedent). Legacy sha `1692583d6`.
//
// WHERE A BROKEN RESOURCE REFUSES — not here, but at TWO phases. `resolveResourceDeclarations` acquires the
// POPULATED declarations (`product-css`, `json:baseui-manifest`) at the population phase and withholds this
// owner before `create` runs (guide §3's acquisition-refusal rule). The two UNPOPULATED ones
// (`installed-package`, and `vendor-css-surface` since the #10 mirror retirement left it no repo path —
// `contract/resource-declaration.ts` `GATE_RESOURCE_UNPOPULATED_KINDS`) are filtered out of that
// acquisition, so a non-ready one surfaces when `evaluate` calls its door and `readyResourceValue` throws.
// Either way this module owns no not-ready branch. `mustRefuse[0]` pins the vendor door's evaluate refusal.
//
// DECLARED LIMITS, each with its row:
//   * `hookCoordinate`'s refusal branch is a TYPE OBLIGATION with NO CONSTRUCTIBLE FIXTURE, and the
//     construction was attempted rather than argued (guide §6.1's structurally-unfalsifiable classification). `waivableCoordinate`
//     returns the value whole when the grammar can hold it and its leading paren-free run otherwise; every
//     authored hook slice begins with `.` or `[`, neither of which the grammar excludes, so the run is never
//     empty and `undefined` is unreachable. MEASURED: a `[data-probe="a(b)"]` fixture written as a
//     `mustRefuse` row did not refuse — it reported TWO ordinary findings, coordinate `[data-probe="a`.
//     The branch stays because `waivableCoordinate` is typed `string | undefined` and a silent fallback
//     would mint an unnameable finding; the row was deleted rather than faked.
//   * The vendor ACQUITTAL is measured at ZERO uses for Base UI on the real tree today (2026-09-13: five
//     selected hooks carry Base-UI state-attribute NAMES — `data-active`, `data-orientation`, `data-empty`,
//     `data-nested`, `data-visible` — and all five are acquitted by an AUTHORED writer first; only the
//     Streamdown hook reaches the vendor branch, matching the legacy real-tree `vendor=1`). It is kept
//     because it is the arm that stops a false accusation the day one of those authored writers moves, and
//     `mustPass[4]`/`mustPass[5]` hold both vendors.
//   * The Base UI surface is read for ANATOMY only, so `installedSurfaceFrom` is called with an empty
//     version string — its own header names that the sanctioned call for this family. An anchorless
//     declaration set (its `undefined`) is a REFUSAL here rather than an empty surface, because this
//     policy uses the surface to ACQUIT: going blind silently would accuse every vendor-written selector.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `css-selector-has-a-writer` descriptor at 5545f9ccf12c19cdeafe81d41378ce7eb511e6ee, the parent of the conversion
// `9104f718f` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `1692583d6`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. The legacy descriptor had no `scanRoot`, so its effective population is its in-run path
// filter — lib/css-family-source-provenance.ts `ownerForPath` (via lib/css-selector-writers.ts `isProductSource`),
// `packages/{ui,client}/src/`. Over the SAME 7,567 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`) it admits 1,686 and the final `population` admits 1,686 (the bare harness
// dispatch was 7,567). legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` rejected by both.
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { installedStateAttributeValuesFrom, installedSurfaceFrom, surfaceManifestFrom } from "../lib/baseui-read.ts";
import {
  BASE_UI_INSTALLED_FIXTURE,
  BASE_UI_MANIFEST_PATH,
  CLEAN_PRODUCT_CSS,
  EMPTY_BASE_UI_MANIFEST,
  SELECTOR_FIXTURE,
  SOURCE_ANCHOR,
  STREAMDOWN_BUNDLE,
  STREAMDOWN_EMITTING_BUNDLE,
} from "../lib/css-family-proof-fixtures.ts";
import type { SelectorHookIdentity } from "../lib/css-family-selector-provenance.ts";
import { hookValueMatches, selectorHookIdentities } from "../lib/css-family-selector-provenance.ts";
import { cssHookProvenanceFact } from "../lib/css-family-source-provenance.ts";
import type { SelectorWriterCensus } from "../lib/css-selector-writers.ts";
import type { VendorHookCensus } from "../lib/css-vendor-hooks.ts";
import { readVendorHooks, vendorWritesHook } from "../lib/css-vendor-hooks.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const MESSAGE =
  "an authored product-CSS selector hook has no semantic producer/writer; inert text cannot counterfeit DOM ownership (tooling/src/verify/gates/css-selector-has-a-writer.ts)";

/** The reported COORDINATE for one hook: the authored slice at its own line/column, or its leading
 *  paren-free run when the slice carries a parenthesis the `@orb-waive` grammar cannot hold (#2107 arm c).
 *  A hook with no anchorable head at all REFUSES rather than minting a permanently unwaivable finding. */
function hookCoordinate(hook: SelectorHookIdentity): string {
  const coordinate = waivableCoordinate(hook.authored);
  if (coordinate === undefined) {
    throw new Error(`selector hook has no anchorable coordinate: ${hook.authored}`);
  }
  return coordinate;
}

function missingMessage(hook: SelectorHookIdentity): string {
  return hook.kind === "class"
    ? `selector hook ${hook.authored} has no semantic class producer — ${MESSAGE}`
    : `selector hook ${hook.authored} has no semantic writer — ${MESSAGE}`;
}

/** Read the vendor contract through the four declared doors. Every read is narrowed by
 *  `readyResourceValue`; the interpretation lives in `lib/css-vendor-hooks.ts`. */
function vendorCensus(ctx: GatePolicyContext): VendorHookCensus {
  const manifest = surfaceManifestFrom(readyResourceValue(ctx.resources.json("baseui-manifest")).value);
  if (!manifest.ok) {
    throw new Error(`the committed Base UI surface manifest is unreadable: ${manifest.reason}`);
  }
  const installed = readyResourceValue(ctx.resources.installedPackage({ id: "base-ui", mode: "ast" }));
  if (installed.mode !== "ast") {
    throw new Error("the installed Base UI door answered a mode it was not asked for");
  }
  // THE VERSION IS DELIBERATELY EMPTY. `installedSurfaceFrom`'s header states the contract: `mode: "ast"`
  // publishes PATHS only, so a consumer that compares ANATOMY passes `""` and says so. This policy compares
  // state-attribute NAMES and VALUES; the version-drift arm is `baseui-surface-manifest`'s, and it declares
  // the metadata door for it.
  const surface = installedSurfaceFrom(installed.declarationPaths, "");
  if (surface === undefined) {
    // FAIL CLOSED, LOUDLY. An anchorless declaration set means the reader learned nothing about the
    // installed package — and this policy's use of it is an ACQUITTAL, so a silent empty surface would turn
    // instrument blindness into a wave of false accusations against every Base-UI-written selector.
    throw new Error("the installed Base UI declarations carry no package root, so the vendor acquittal could not be read");
  }
  return readVendorHooks({
    manifest: manifest.manifest,
    installed: surface,
    installedValues: installedStateAttributeValuesFrom(installed.declarationPaths),
    selectorSources: readyResourceValue(ctx.resources.vendorCssSurface()).selectorSources,
  });
}

/** Does an AUTHORED rendering/DOM terminal emit this hook? The vendor acquittal is asked separately, and
 *  in this order, because a hook with an authored writer never reaches the vendor branch at all — which is
 *  why the real tree measures `vendor=1` against five Base-UI-named hooks. */
function hasAuthoredWriter(hook: SelectorHookIdentity, writers: SelectorWriterCensus): boolean {
  if (hook.kind === "class") {
    return writers.classes.has(hook.name);
  }
  const authored = writers.data.get(hook.name);
  return authored !== undefined && hookValueMatches(hook.operator, hook.value, authored.values);
}

export const gate = defineGate({
  id: "css-selector-has-a-writer",
  family: "css-hook-provenance",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client", "@ui"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [cssHookProvenanceFact],
  resources: [
    { kind: "product-css" },
    { kind: "vendor-css-surface" },
    { kind: "json", id: "baseui-manifest" },
    { kind: "installed-package", id: "base-ui", mode: "ast" },
  ],
  message: MESSAGE,
  fix:
    "write the exact hook from a rendering/DOM terminal (JSX, a canonical class composer, a DOMTokenList " +
    "mutation, a HAST element's `properties`), delete the dead selector, or update the narrow vendor " +
    "contract on both sides. A deliberate inert hook is waived with " +
    "`@orb-waive css-selector-has-a-writer(<position>): <reason>` on the line above the selector, where " +
    '<position> is the hook\'s own AUTHORED SLICE — `.shell-wrapper` for a class, `[data-density="compact"]` ' +
    "for an attribute, brackets and quotes included — and its leading paren-free run when the slice carries " +
    "a parenthesis the marker grammar admits none of.",
  create: (ctx) => ({
    evaluate: () => {
      const { writers } = ctx.fact(cssHookProvenanceFact);
      const hooks = selectorHookIdentities(readyResourceValue(ctx.resources.cssInventory("product")).selectorHooks);
      const vendor = vendorCensus(ctx);
      for (const hook of hooks) {
        if (hasAuthoredWriter(hook, writers) || vendorWritesHook(vendor, hook)) {
          continue;
        }
        ctx.report.file(hook.file, { line: hook.line, column: hook.column, token: hookCoordinate(hook), message: missingMessage(hook) });
      }
      // THE RECEIPT DENOMINATOR CANNOT BE THIS POLICY'S OWN CENSUS. `receiptFailures` reds on
      // `members === 0`, so receipting the census would turn a corpus this family exists to REPORT on
      // (a five-home identity that resolved no hook, no declaration, no candidate) into a withheld TOOL
      // ERROR — the finding never reported at all. The denominator is the SHEET COUNT, which is ≥ 1
      // past the resource guard by construction; the census rides the receipt SOURCE string
      // (§12.3's "-health consumers receipt a CONSTANT", one layer out; refuted-and-repaired on the
      // sibling CSS train by `v-css-train-3-2026-09-13.md`).
      const inventory = readyResourceValue(ctx.resources.cssInventory("product"));
      ctx.receipt({
        kind: "population",
        source: `css-selector-has-a-writer [hooks=${String(hooks.length)}; classes=${String(writers.classes.size)}]`,
        members: inventory.files.length,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/ui/src/styles/tiers.css": '[data-density="birdie"] { --spacing-row: 1rem; }\n',
        [SOURCE_ANCHOR]: 'const density: "compact" | "comfortable" = "compact";\nexport const probe = <div data-density={density} />;\n',
      },
      expect: { count: 1, token: '[data-density="birdie"]', messageIncludes: "no semantic writer" },
      why: 'an exact density arm is dead when the rendered discriminant cannot produce that member — the founding case, and its position is now the authored bracket slice rather than the synthetic `data-density="birdie"` label the legacy engine reported',
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell-wrapper { display: grid; }\n",
        [SOURCE_ANCHOR]: 'const prose = ".shell-wrapper";\nexport const probe = prose;\n',
      },
      expect: { count: 1, token: ".shell-wrapper", messageIncludes: "no semantic class producer" },
      why: "an inert class string cannot counterfeit a rendered shell wrapper, and the class arm's own message discriminates it from the attribute arm",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/styles/globals.css": "[data-birdie] { color: red; }\n",
        [SOURCE_ANCHOR]: "// data-birdie is intentionally prose only\nexport const probe = null;\n",
      },
      expect: { count: 1, token: "[data-birdie]" },
      why: "comment-only data attribute text is not a writer",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/styles/globals.css": '[data-spread="wide"] { color: red; }\n',
        [SOURCE_ANCHOR]: 'const inert = { "data-spread": "wide" };\nexport const probe = inert;\n',
      },
      expect: { count: 1, token: '[data-spread="wide"]' },
      why: "an arbitrary object property is not ownership until it reaches a semantic spread terminal",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/styles/globals.css": "[data-inert-properties] { color: red; }\n",
        [SOURCE_ANCHOR]: 'const inert = { properties: { "data-inert-properties": true } };\nexport const probe = inert;\n',
      },
      expect: { count: 1, token: "[data-inert-properties]" },
      why: "an arbitrary object named properties is not a HAST element writer without the rendered element shape",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/styles/globals.css": '[data-hast-probe="on"] { color: red; }\n',
        [SOURCE_ANCHOR]: 'const node = { type: "text", tagName: "div", properties: { "data-hast-probe": "on" } };\nexport const probe = node;\n',
      },
      expect: { count: 1, token: '[data-hast-probe="on"]' },
      why:
        'CUT f28: a HAST-shaped object whose `type` is NOT `"element"` is not a rendered element writer — it is ' +
        "a text node, and its `properties` bag paints nothing. This row exists because the FIRST sweep " +
        "misclassified the fence: cut alone it killed nothing, and the JOINT cut with both " +
        "`isPropertyAssignment` guards TOOL-ERRORS (`Cannot read properties of undefined (reading " +
        "'getInitializer')`) rather than flagging — which is guide §6.1's TYPE-OBLIGATION shape and NOT " +
        "evidence of redundancy. §4.1 then binds: write the row that would discriminate and RUN it. It passes " +
        "at tip and reds under the cut, so the fence is UNENFORCED-now-pinned, never mutually redundant " +
        "(refuted by `v-css-family-2026-09-13.md` ledger row 2, #2305)",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/styles/globals.css": '[data-mode="compact"] { color: red; }\n',
        [SOURCE_ANCHOR]: "declare const tail: string;\nexport const probe = <div data-mode={`com${tail}`} />;\n",
      },
      expect: { count: 1, token: '[data-mode="compact"]' },
      why: "unsupported dynamic construction stays honestly opaque instead of guessing a value",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/ui/src/styles/globals.css": '[data-streamdown="code-block"] { contain: paint; }\n',
      },
      expect: { count: 1, token: '[data-streamdown="code-block"]' },
      why: "a selector cannot outlive the installed vendor emission contract: the bundles are present and read, and none of them emits the hook, so the ACQUITTAL is withheld and the ordinary arm reports. The two-sided drift verdict is the `-health` sibling's and does not appear in this count",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/ui/src/styles/globals.css": ".twice-selected { color: red; }\n",
        "packages/client/src/styles/globals.css": ".twice-selected { color: blue; }\n",
      },
      expect: { count: 1, token: ".twice-selected" },
      why: "CUT f37: the unit of judgement is the IDENTITY, not the occurrence. One dead class selected in two homes is ONE question and ONE finding, anchored at its first occurrence; without the dedupe it is two findings and a marker over either leaves the other effective",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/ui/src/styles/globals.css": '[data-orbopen="true"] { color: red; }\n',
        [BASE_UI_MANIFEST_PATH]:
          '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": { "Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": [], "handlers": {}, "state": ["orbopen"], "inherits": [], "disposition": "exposed", "why": "" } } } } }\n',
        // The installed package declares the STATE INTERFACE — so the value census carries `data-orbopen` —
        // while publishing NO component entry, so the installed SURFACE does not. That is the exact shape a
        // vendor removal leaves behind, and it is what makes the intersection falsifiable.
        "packages/ui/node_modules/@base-ui/react/select/root/SelectRoot.d.ts":
          'export interface SelectRootState {\n  orbopen: "true" | "false";\n}\nexport interface SelectRootProps {\n  state?: SelectRootState;\n}\n',
      },
      expect: { count: 1, token: '[data-orbopen="true"]' },
      why: "CUT f30: the vendor acquittal is the INTERSECTION of the committed manifest and the INSTALLED surface, never the manifest alone. Here the manifest still names a state the installed package does not publish, so the selector is dead and reports; without the intersection a stale committed row would keep acquitting a hook nothing writes — the exact failure the two-sided vendor contract exists to catch",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/styles/globals.css": '[data-density="compact"] { color: red; }\n',
        [SOURCE_ANCHOR]: 'const density: "compact" | "comfortable" = "compact";\nexport const probe = <div data-density={density} />;\n',
      },
      why: "a rendered literal-union member is an exact semantic writer",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell-wrapper { display: grid; }\n",
        [SOURCE_ANCHOR]: 'export const probe = <div className="shell-wrapper" />;\n',
      },
      why: "a real JSX class terminal writes the shell hook",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell-prefix { display: grid; }\n",
        [SOURCE_ANCHOR]: "declare const runtimeTail: string;\nexport const probe = <div className={`shell-prefix ${String(runtimeTail)}`} />;\n",
      },
      why: "a whitespace-complete literal before a runtime template tail remains exact class evidence",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/styles/globals.css": '[data-spread="wide"] { color: red; }\n',
        [SOURCE_ANCHOR]: 'const attributes = { "data-spread": "wide" } as const;\nexport const probe = <div {...attributes} />;\n',
      },
      why: "the shared exact-terminal resolver follows an object only when JSX actually spreads it",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/ui/src/styles/globals.css": '[data-streamdown="code-block"] { contain: paint; }\n',
        [STREAMDOWN_BUNDLE]: STREAMDOWN_EMITTING_BUNDLE,
      },
      why: "THE VENDOR ACQUITTAL, Streamdown half: the narrow installed emission contract owns its exact selector identity, and the bundle set is read WHOLE rather than through the content-hashed chunk name the legacy reader pinned",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/ui/src/styles/globals.css": '[data-orbopen="true"] { color: red; }\n',
        [BASE_UI_MANIFEST_PATH]:
          '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": { "Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": [], "handlers": {}, "state": ["orbopen"], "inherits": [], "disposition": "exposed", "why": "" } } } } }\n',
        "packages/ui/node_modules/@base-ui/react/select/index.d.ts": 'export * as Select from "./index.parts.js";\n',
        "packages/ui/node_modules/@base-ui/react/select/index.parts.d.ts": 'export { SelectRoot as Root } from "./root/SelectRoot.js";\n',
        "packages/ui/node_modules/@base-ui/react/select/root/SelectRoot.d.ts":
          'export interface SelectRootState {\n  orbopen: "true" | "false";\n}\nexport interface SelectRootProps {\n  state?: SelectRootState;\n}\n',
      },
      why: "THE VENDOR ACQUITTAL, Base UI half: a state attribute present in BOTH the committed manifest and the installed surface, matched on its exact declared value. Measured 0 uses on the real tree today (every Base-UI-named hook there has an authored writer first), so this row is the only thing that proves the arm exists at all",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/features/app-shell/surfaces/shell.css":
          "/* @orb-waive css-selector-has-a-writer(.shell-wrapper): the wrapper is painted by the print stylesheet only. */\n" +
          ".shell-wrapper { display: grid; }\n",
        [SOURCE_ANCHOR]: 'const prose = ".shell-wrapper";\nexport const probe = prose;\n',
      },
      why:
        // THE §6.2 IDENTITY ARM, in its `mustPass`-row shape (guide §6.2 names both homes; `schema-branding.ts:137`
        // is the precedent). It is SELF-CHECKING: `proofFailure` runs `toolFailure` before the arm verdict and
        // fails on ANY `authorityAlarms`, so a wrong position (`dead-position`), a foreign id (`unknown-policy`),
        // an over-broad match and a fixture that stopped flagging each RED this row. A resource finding's marker
        // carrier is the line IMMEDIATELY ABOVE it (`lib/ordinary-waiver.ts#followingResourceCarrier`).
        "THE ORDINARY DOOR, proven once: the exact marker at the reported position suppresses mustFlag[1]'s finding on the byte-identical fixture and raises no alarm",
    },
    {
      mode: "resource",
      files: {
        ...SELECTOR_FIXTURE,
        "packages/client/src/styles/globals.css": "[data-birdie] { color: red; }\n",
        [SOURCE_ANCHOR]: "export const probe = <div data-birdie />;\n",
      },
      why: "CUT f38: a PRESENCE selector asks only whether anything writes the attribute, never which value — a valueless JSX attribute is a writer. Without `hookValueMatches`' presence arm the comparison falls through to the undefined-expected branch and this row reports, which would accuse every boolean state hook on the tree",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        ...CLEAN_PRODUCT_CSS,
        ...BASE_UI_INSTALLED_FIXTURE,
        [SOURCE_ANCHOR]: "export const probe = null;\n",
        [BASE_UI_MANIFEST_PATH]: EMPTY_BASE_UI_MANIFEST,
      },
      expect: { messageIncludes: "vendor-css-surface" },
      why: "a corpus whose installed vendor surface is incomplete (Base UI installed, Streamdown absent) REFUSES at the evaluate-phase door read — the runtime is the accuser (resource-policy-contract.md §4), and the policy owns no not-ready branch that could return a clean zero instead. The committed manifest and the Base UI package ARE supplied so the refusal names the vendor door rather than the json door (population phase) or the installed-package door (read first in `vendorCensus`)",
    },
  ],
});
