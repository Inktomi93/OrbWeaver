// Gate: css-family-ownership (#951 / client-architecture-lockdown.md §4.3 and §4.7) — a declaration inside
// a sanctioned CSS path must belong to that path's semantic family. Legal path is not responsibility.
//
// FAMILY `css-hook-provenance` — the shared reader is `lib/css-family-source-provenance.ts`'s
// `cssHookProvenanceFact`, the one hook-owner collector over `@ui` + `@client` that the legacy module-global
// `hookPass` hand-rolled and that TWO sibling policies also consume (`css-selector-has-a-writer` and
// `css-family-direct-client-mechanism`; both `-health` siblings declare `facts: []`). The CSS-side readers are
// `lib/css-family-selector-provenance.ts` and `lib/css-rules.ts` (5 gate importers).
//
// AUTHORITY: `ordinary`, and the door is NEW. Every finding here is a claim about an AUTHORED coordinate —
// a selector arm, a declaration's property name — so an author can answer it, and the legacy synthetic
// `cssFamilyFinding` position (`column: 1`, a composite token) is replaced by the authored slice at the real
// column. The INSTRUMENT verdicts and the reviewed direct-skin recipes are not an author's to answer and
// SPLIT into `-health` and `css-family-direct-client-mechanism` under the identical `family`.
//
// A DECLARED HYBRID (§12.4). RESOURCE half: `product-css`, the five-home identity, replacing
// `readCensus(ctx.root)`'s `existsSync`/`readFileSync` and its second CSS parser. COMPILER half:
// `population: { in: ["@client", "@ui"] }`, the hook-owner walk.
//
// POPULATION PORT: an INTENTIONAL NARROWING of a fence that was already redundant. The legacy descriptor was
// `scopeSafety: "whole-project"` with NO `scanRoot` (the whole harness corpus, 7,557 files at `1692583d6`),
// and `css-family-source-provenance.ts#ownerForPath` then discarded everything outside
// `packages/{ui,client}/src/` — `@ui` + `@client` byte for byte. Legacy sha `1692583d6`.
//
// THE ANCHOR GUARD IS RETIRED WITH THE WALK IT GUARDED. `existsSync(join(ctx.root, "package.json"))` told a
// fixture from a gutted checkout; a product identity that cannot be loaded is now a population-phase
// REFUSAL (`mustRefuse[0]`), which is earlier and louder than a guard that could only stay silent.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. `resolveResourceDeclarations` withholds this owner before
// `create` runs (guide §11 ruling 3); the module owns no not-ready branch and reads through
// `readyResourceValue`.
//
// MARKER CENSUS 0 = 0 = 0 (measured 2026-09-12, N=7,725 tracked files, positive control 1,196 — the §5b
// audit's own invocation). The legacy bare `@orb-gate-ignore css-family-ownership:` door existed and does
// not survive the conversion; nothing used it.

import { CLIENT_GLOBALS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import { defineGate } from "../contract/policy.ts";
import { MESSAGE } from "../lib/css-family-census.ts";
import { reportCssFamilyOwnership } from "../lib/css-family-policy.ts";
import { OWNERSHIP_FIXTURE, SOURCE_ANCHOR, shellClassProducer } from "../lib/css-family-proof-fixtures.ts";
import { cssHookProvenanceFact } from "../lib/css-family-source-provenance.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SHELL_PROBE = "packages/client/src/features/app-shell/probe.tsx";

export const gate = defineGate({
  id: "css-family-ownership",
  family: "css-hook-provenance",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client", "@ui"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [cssHookProvenanceFact],
  resources: [{ kind: "product-css" }],
  message: MESSAGE,
  fix:
    "move the declaration to its semantic home; do not relabel it, add an allowlist, change source order, or " +
    "narrow theme/custom-CSS behavior. A deliberate site is waived with " +
    "`@orb-waive css-family-ownership(<position>): <reason>` on the line above, where <position> is the " +
    'AUTHORED TEXT the finding points at — the selector arm for a selector verdict (`[data-density="compact"]`, ' +
    "`.button`, and its leading paren-free run for `:is(...)`/`:where(...)`), the hook's own slice for a " +
    'provenance verdict (`.shell-rail`, `[data-slot="button"]`), the property name for a declaration verdict ' +
    "(`--color-fresh-palette`), and `@layer` for an authored layer.",
  create: (ctx) => ({
    evaluate: () => {
      const { owners } = ctx.fact(cssHookProvenanceFact);
      const inventory = readyResourceValue(ctx.resources.cssInventory("product"));
      const declarations = reportCssFamilyOwnership({
        inventory,
        owners,
        report: (file, details) => {
          ctx.report.file(file, details);
        },
      });
      // THE RECEIPT DENOMINATOR CANNOT BE THIS POLICY'S OWN CENSUS. `receiptFailures` reds on
      // `members === 0`, so receipting the census would turn a corpus this family exists to REPORT on
      // (a five-home identity that resolved no hook, no declaration, no candidate) into a withheld TOOL
      // ERROR — the finding never reported at all. The denominator is the SHEET COUNT, which is ≥ 1
      // past the resource guard by construction; the census rides the receipt SOURCE string
      // (§12.3's "-health consumers receipt a CONSTANT", one layer out; refuted-and-repaired on the
      // sibling CSS train by `v-css-train-3-2026-09-13.md`).
      ctx.receipt({
        kind: "population",
        source: `css-family-ownership [declarations=${String(declarations)}; hooks=${String(owners.size)}]`,
        members: inventory.files.length,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [UI_GLOBALS]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 1, token: '[data-density="compact"]', messageIncludes: "density mapping belongs in tiers.css" },
      why: "density planted in UI globals is routed to tiers.css",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [CLIENT_GLOBALS]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 1, token: '[data-density="compact"]' },
      why: "density planted in client globals is routed to tiers.css",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 2, token: '[data-density="compact"]' },
      why: "density in shell violates BOTH the density home and the shell-root grammar — two arms, one selector, and the count is the claim",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [UI_GLOBALS]: "@layer base { :root { color-scheme: dark; } }\n" },
      expect: { count: 1, token: "@layer" },
      why: "an authored layer destroys the global unlayered-wins mechanism",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [THEME]: "@theme { --color-background: black; }\n",
        [SHELL]: ".shell-grid { --color-fresh-palette: oklch(0.5 0.1 40); }\n",
        [SHELL_PROBE]: shellClassProducer("shell-grid"),
      },
      expect: { count: 1, token: "--color-fresh-palette" },
      why: "a new palette/value in shell is caught from the generated colour namespace even though the exact name is new — the namespace comes from the direct @theme block, not from a list",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-progress { overflow: hidden; }\n",
        [SOURCE_ANCHOR]: 'export const probe = <div className="client-progress" />;\n',
      },
      expect: { count: 1, token: ".client-progress", messageIncludes: "UI globals selects class:client-progress" },
      why: "a class selected in UI globals but produced only by client source violates dependency direction",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: '[data-slot="client-progress"] { overflow: hidden; }\n',
        [SOURCE_ANCHOR]: 'export const probe = <div data-slot="client-progress" />;\n',
      },
      expect: { count: 1, token: '[data-slot="client-progress"]' },
      why: "the producer-direction arm covers JSX data-slot hooks, not only class strings",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]: '[data-slot="button"] { border-radius: 1rem; }\n',
        "packages/ui/src/primitives/button.tsx": 'export const button = <button data-slot="button" />;\n',
      },
      expect: { count: 1, token: '[data-slot="button"]', messageIncludes: "directly skins UI-only slot:button" },
      why: "a bare client-global skin of a UI-only component belongs in the component tv() variant — and it is NOT one of the three reviewed direct-skin recipes, which the sibling grant policy owns",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [TIERS]: ".button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button", messageIncludes: "outside the closed density carrier/slot grammar" },
      why: "a component skin planted in tiers.css is outside the density selector grammar",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: ".button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button", messageIncludes: "not rooted in shell structure" },
      why: "a component skin planted in shell.css is not rooted in the shell frame",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: ".shell-grid + .button { padding: 1rem; }\n", [SHELL_PROBE]: shellClassProducer("shell-grid") },
      expect: { count: 1, token: ".shell-grid + .button" },
      why: "a shell sibling does not root the subject painted after it",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: ".button:has(.shell-grid) { padding: 1rem; }\n", [SHELL_PROBE]: shellClassProducer("shell-grid") },
      expect: { count: 1, token: ".button:has" },
      why: "a shell descendant inside :has() does not make the outer component a shell subject. The COORDINATE is the leading paren-free run because the marker grammar admits no parenthesis (#2107 arm c); the whole selector is in the message",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: ":is(.shell-grid, .button) { padding: 1rem; }\n", [SHELL_PROBE]: shellClassProducer("shell-grid") },
      expect: { count: 1, token: ":is" },
      why: "every :is() alternative used as the root must be shell-rooted",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: ":where(.shell-grid, .button) { padding: 1rem; }\n", [SHELL_PROBE]: shellClassProducer("shell-grid") },
      expect: { count: 1, token: ":where" },
      why: "every :where() alternative used as the root must be shell-rooted",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [SHELL]: ".button:not(.shell-never), .shell-grid { padding: 1rem; }\n",
        [SHELL_PROBE]: shellClassProducer("shell-never", "shell-grid"),
      },
      expect: { count: 1, token: ".button:not" },
      why: "a negated shell class cannot launder one selector-list arm through a valid sibling arm",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: '[data-probe=".shell-grid"] .button { padding: 1rem; }\n' },
      expect: { count: 1, token: '[data-probe=".shell-grid"] .button' },
      why: "attribute value text that looks like a shell class is not a shell subject or ancestor",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [SHELL]: ':is([data-probe=".shell-grid"], .shell-panel) .button { padding: 1rem; }\n',
        [SHELL_PROBE]: shellClassProducer("shell-panel"),
      },
      expect: { count: 1, token: ":is" },
      why: "an attribute value cannot counterfeit the shell ancestry of one :is() branch",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: ':where([data-probe=".shell-grid"]) .button { padding: 1rem; }\n' },
      expect: { count: 1, token: ":where" },
      why: "an attribute value cannot counterfeit shell ancestry inside :where()",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-progress { overflow: hidden; }\n",
        "packages/ui/src/content/copy.ts": 'export const copy = "client-progress";\n',
        "packages/client/src/features/probe.ts": 'import { cn } from "@orb/ui/lib";\nexport const classes = cn("client-progress");\n',
      },
      expect: { count: 1, token: ".client-progress" },
      why: "an inert UI prose string cannot launder a class produced only by a real client class-composer call",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-helper-class { overflow: hidden; }\n",
        "packages/ui/src/helpers/probe.ts":
          'const helper = { cn: (...values: string[]) => values.join(" ") };\nexport const classes = helper.cn("client-helper-class");\n',
        [SOURCE_ANCHOR]: 'export const probe = <div className="client-helper-class" />;\n',
      },
      expect: { count: 1, token: ".client-helper-class" },
      why: "an unrelated helper.cn call is not provenance for an @orb/ui class producer",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-counterfeit-property { overflow: hidden; }\n",
        "packages/ui/src/content/probe.ts": 'export const metadata = { className: "client-counterfeit-property" };\n',
        [SOURCE_ANCHOR]: 'export const probe = <div className="client-counterfeit-property" />;\n',
      },
      expect: { count: 1, token: ".client-counterfeit-property" },
      why: "an inert object property named className is not a rendered UI class carrier",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-fake-list .client-fake-list-optional .client-fake-name { overflow: hidden; }\n",
        "packages/ui/src/content/probe.ts":
          "const data = { className: '', classList: { add: (..._values: string[]) => undefined, toggle: (..._values: string[]) => undefined } };\n" +
          'data.classList.add("client-fake-list");\n' +
          'data?.["classList"]?.["toggle"]?.("client-fake-list-optional");\n' +
          'data["className"] = "client-fake-name";\n',
        [SOURCE_ANCHOR]: 'export const probe = <div className="client-fake-list client-fake-list-optional client-fake-name" />;\n',
      },
      expect: { count: 3, token: ".client-fake-list" },
      why: "classList/className-shaped objects do not become DOM class producers by spelling, including optional computed access and assignment",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-ignored-wrapper-argument { overflow: hidden; }\n",
        "packages/ui/src/components/probe.ts":
          'import { cn } from "#lib";\n' +
          'const ignoresArguments = (..._values: unknown[]): string => cn("ui-static");\n' +
          'export const classes = ignoresArguments("client-ignored-wrapper-argument");\n',
        [SOURCE_ANCHOR]: 'export const probe = <div className="client-ignored-wrapper-argument" />;\n',
      },
      expect: { count: 1, token: ".client-ignored-wrapper-argument" },
      why: "a wrapper that does not forward its call-site arguments cannot launder them through canonical cn",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: ".shell-invented-without-writer { display: grid; }\n" },
      expect: { count: 1, token: ".shell-invented-without-writer", messageIncludes: "no live packages/client JSX" },
      why: "a shell prefix declares the structural namespace but cannot invent a rendered structural name",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: '[data-shell-invented="true"] { display: grid; }\n' },
      expect: { count: 1, token: '[data-shell-invented="true"]' },
      why: "a data-shell attribute needs a live JSX writer just like a shell class",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-direct-name { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement.className = "client-direct-name";\n',
      },
      expect: { count: 1, token: ".client-direct-name" },
      why: "direct className assignment is a live client class producer, so the UI-globals selector is a dependency-direction violation rather than a dead hook",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-computed-name { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement["className"] = "client-computed-name";\n',
      },
      expect: { count: 1, token: ".client-computed-name" },
      why: "computed className assignment is a live client class producer",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-bracket-add { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement.classList["add"]("client-bracket-add");\n',
      },
      expect: { count: 1, token: ".client-bracket-add" },
      why: "bracketed DOMTokenList mutation is a live client class producer",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-optional-toggle { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts":
          'declare const element: HTMLElement | undefined;\nelement?.["classList"]?.["toggle"]?.("client-optional-toggle");\n',
      },
      expect: { count: 1, token: ".client-optional-toggle" },
      why: "optional computed DOMTokenList mutation is a live client class producer",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-list-alias { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nconst tokens = element.classList;\ntokens.add("client-list-alias");\n',
      },
      expect: { count: 1, token: ".client-list-alias" },
      why: "a DOMTokenList alias remains a live client class producer without repeating the classList property spelling",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-spread-add { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts":
          'declare const element: HTMLElement;\nconst values = ["client-spread-add"] as const;\nelement.classList.add(...values);\n',
      },
      expect: { count: 1, token: ".client-spread-add" },
      why: "a spread into a DOMTokenList mutator remains a live client class producer",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".client-optional-spread-toggle { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts":
          "declare const element: HTMLElement | undefined;\n" +
          'const values = ["client-optional-spread-toggle"] as const;\n' +
          'element?.["classList"]?.["toggle"]?.(...values);\n',
      },
      expect: { count: 1, token: ".client-optional-spread-toggle" },
      why: "spread values survive optional and computed DOMTokenList mutation syntax",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [SHELL]: ":root { color-scheme: dark; }\n" },
      expect: { count: 1, token: "color-scheme" },
      why: "the one document-root declaration in shell is the view-transition reset, not a general global-mechanism door",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [THEME]: "@theme { --color-background: black; --blur-seed: 0; }\n",
        [CLIENT_GLOBALS]: ".stray-carrier { --blur-fill-chrome: 1px; }\n",
      },
      expect: { count: 1, token: "--blur-fill-chrome", messageIncludes: "closed runtime writer seams" },
      why:
        "THE STRAY-CARRIER HALF of the seam contract, and it belongs HERE rather than in the `-health` " +
        "sibling (#2305). A seam member written OUTSIDE its seam position — the reduced-transparency " +
        "property under a class rather than `:root` — is a generated-family write no seam sanctions, so it " +
        "is an ORDINARY finding at the declaration an author can move. The `-health` arm asks the opposite " +
        "question (is every declared member written AT ALL) and is silent here; between them a member can " +
        "neither vanish nor be written somewhere it does not belong",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [THEME]: "@theme { --color-background: black; --spacing-row: 0.5rem; }\n:root { color-scheme: dark; }\n" },
      why: "generated @theme declarations are counted as declarations and define the live generated namespaces",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [THEME]: "@theme {\n  --color-background: black;\n  @media (forced-colors: active) {\n    --probe-nested: white;\n  }\n}\n",
        [SHELL]: ".shell-grid { --probe-runtime: white; }\n",
        [SHELL_PROBE]: shellClassProducer("shell-grid"),
      },
      why: "only DIRECT @theme declarations mint generated namespaces; a declaration nested one at-rule deeper cannot widen the writer wall. This is the row that pins the shared parser's `CssAtRule.declarations` predicate — nested rules are separate facts — against the hand parser it replaced",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [TIERS]:
          '[data-density="comfortable"] { --spacing-field: var(--orb-density-comfortable-field); --spacing-row: var(--orb-density-comfortable-row); --spacing-block: var(--orb-density-comfortable-block); --spacing-section: var(--orb-density-comfortable-section); }\n' +
          '[data-density="compact"] { --spacing-field: var(--orb-density-compact-field); --spacing-row: var(--orb-density-compact-row); --spacing-block: var(--orb-density-compact-block); --spacing-section: var(--orb-density-compact-section); }\n',
      },
      why: "both symmetric density runtime writers belong in tiers.css and each maps all four intents",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".scroll-fade-x { --fade-start-stop: 0%; }\n",
        "packages/ui/src/lib/scroll.ts": 'export const SCROLL_FADE_X_CLASS = "scroll-fade-x";\n',
        "packages/ui/src/lib/index.ts": 'export { SCROLL_FADE_X_CLASS } from "./scroll.ts";\n',
        "packages/client/src/feature.tsx":
          'import { SCROLL_FADE_X_CLASS } from "../../ui/src/lib/index.ts";\nexport const probe = <div className={SCROLL_FADE_X_CLASS} />;\n',
      },
      why: "a live client className imported through the UI public barrel proves both producer directions without admitting an inert literal — AND the local fade-stop seam still acquits, which is the half of the retired `fade` seam expectation that survived its count",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]: 'html[data-blur-modals] [data-slot="dialog-popup"] { backdrop-filter: blur(1rem); }\n',
        "packages/ui/src/primitives/dialog.tsx": 'export const dialog = <div data-slot="dialog-popup" />;\n',
      },
      why: "a client appearance carrier may treat a UI primitive without becoming its component skin",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [SHELL]: ".shell-grid { display: grid; --rail-w: 3rem; }\n:root { view-transition-name: none; }\n",
        [SHELL_PROBE]: shellClassProducer("shell-grid"),
      },
      why: "shell-rooted geometry and the exact view-transition reset remain in the shell home",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [SHELL]:
          ".shell-grid > .button { padding: 1rem; }\n" +
          ".shell-grid .button { margin: 0; }\n" +
          ":is(.shell-grid, .shell-panel) .button { display: block; }\n" +
          '.shell-grid:where([data-elevation="ramp"]) .button { color: inherit; }\n',
        [SHELL_PROBE]: shellClassProducer("shell-grid", "shell-panel"),
      },
      why: "shell subjects and ancestors remain valid through child/descendant combinators and all-shell :is() alternatives",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]:
          ".shared-cn { overflow: hidden; }\n" +
          ".shared-tv { display: block; }\n" +
          ".shared-namespace-cn { opacity: 1; }\n" +
          ".shared-wrapper { visibility: visible; }\n" +
          ".shared-declared-wrapper { display: block; }\n" +
          ".shared-block-wrapper { display: block; }\n" +
          ".shared-function-wrapper { display: block; }\n",
        "packages/ui/src/components/probe.ts":
          'import { cn as mergeClasses, tv as defineVariant } from "#lib";\n' +
          'import * as styles from "#lib";\n' +
          'export const sharedClass = mergeClasses("shared-cn");\n' +
          'export const sharedVariant = defineVariant({ base: "shared-tv" });\n' +
          'export const sharedNamespace = styles["cn"]("shared-namespace-cn");\n' +
          "const wrapped = (...values: unknown[]): string => mergeClasses(...values);\n" +
          'export const sharedWrapper = wrapped("shared-wrapper");\n' +
          "export function declared(...values: unknown[]): string { return mergeClasses(...values); }\n" +
          "const blockArrow = (...values: unknown[]): string => { return mergeClasses(...values); };\n" +
          "const functionExpression = function (...values: unknown[]): string { return mergeClasses(...values); };\n" +
          'export const sharedDeclared = declared("shared-declared-wrapper");\n' +
          'export const sharedBlock = blockArrow("shared-block-wrapper");\n' +
          'export const sharedFunction = functionExpression("shared-function-wrapper");\n',
        [SOURCE_ANCHOR]:
          'export const probe = <div className="shared-cn shared-tv shared-namespace-cn shared-wrapper shared-declared-wrapper shared-block-wrapper shared-function-wrapper" />;\n',
      },
      why: "canonical @orb/ui cn/tv producers remain UI-owned through a barrel, named aliases, namespace-computed access, and a forwarding wrapper",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: `[data-probe=".client-attribute-text"] { overflow: hidden; }\n[data-copy='.client-attribute-single'] { display: block; }\n`,
        [SOURCE_ANCHOR]: 'export const probe = <div className="client-attribute-text client-attribute-single" />;\n',
      },
      why: "class-looking text inside quoted attribute values is selector data, not a class selector",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]: ".shared-jsx-spread { overflow: hidden; }\n",
        "packages/ui/src/components/probe.tsx": 'const attributes = { className: "shared-jsx-spread" };\nexport const uiProbe = <div {...attributes} />;\n',
        [SOURCE_ANCHOR]: 'export const probe = <div className="shared-jsx-spread" />;\n',
      },
      why: "a className object property is live ownership when the object is actually spread into JSX",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [SHELL]: '.shell-written { display: grid; }\n[data-shell-written="true"] .shell-written { grid-template-columns: 1fr; }\n',
        [SHELL_PROBE]: 'export const shellProbe = <div className="shell-written" data-shell-written="true" />;\n',
      },
      why: "written shell class and data-shell hooks remain valid structural roots",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [SHELL]: '.shell-written-spread { display: grid; }\n[data-shell-written-spread="true"] .shell-written-spread { grid-template-columns: 1fr; }\n',
        [SHELL_PROBE]:
          'const attributes = { className: "shell-written-spread", "data-shell-written-spread": "true" };\nexport const shellProbe = <div {...attributes} />;\n',
      },
      why: "className and data-shell properties are live structural writers when their object is actually spread into JSX",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [UI_GLOBALS]: "/* @layer base { .fake { color: red; } } */\n:root { font-size: 100%; }\n" },
      why: "comment text cannot manufacture an authored-layer finding",
    },
    {
      mode: "resource",
      files: { ...OWNERSHIP_FIXTURE, [THEME]: "@theme { --color-background: black; }\n@layer base { :root { color-scheme: dark; } }\n" },
      why: "CUT f01: the authored-layer arm judges the four AUTHORED sheets and NOT the generated theme, which ships its own layer. Without the `AUTHORED_STYLESHEETS` fence this row reports one finding against a file no author writes",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [THEME]: "@theme { --color-background: black; --fade-seed: 0%; }\n",
        [UI_GLOBALS]: ".scroll-fade-x { --fade-start-stop: 0%; }\n",
      },
      why: "CUT f06: the LOCAL FADE-STOP seam, and the row exists because the first sweep read the fence as unenforced for want of a FIXTURE rather than for want of a fence — the earlier row's `--fade-start-stop` sat outside any MINTED token family, so it never reached the seam at all. Here `theme.css` mints `--fade-`, which is what makes the declaration a generated-family write that only the seam acquits. This is the half of the retired `fade` seam expectation that survived its count",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [UI_GLOBALS]:
          '/* @orb-waive css-family-ownership([data-density="compact"]): the density probe is deliberate here while the tier map is rebuilt. */\n' +
          '[data-density="compact"] { --spacing-row: 0.5rem; }\n',
      },
      why:
        // THE §4.2 IDENTITY ARM, in its `mustPass`-row shape (guide §4.2 names both homes; `schema-branding.ts:137`
        // is the precedent). It is SELF-CHECKING: `proofFailure` runs `toolFailure` before the arm verdict and
        // fails on ANY `authorityAlarms`, so a wrong position (`dead-position`), a foreign id (`unknown-policy`),
        // an over-broad match and a fixture that stopped flagging each RED this row. A resource finding's marker
        // carrier is the line IMMEDIATELY ABOVE it (`lib/ordinary-waiver.ts#followingResourceCarrier`).
        "THE ORDINARY DOOR, proven once: the exact marker at the reported position suppresses the mustFlag[0] finding and raises no alarm. Its twin is mustFlag[0], which reports the identical selector with no marker",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]: 'html [data-slot="dialog-popup"] { border-radius: 1rem; }\n',
        "packages/ui/src/primitives/dialog.tsx": 'export const dialog = <div data-slot="dialog-popup" />;\n',
      },
      why: "THE PARTITION ROW: one of the three REVIEWED direct-skin recipes is silent HERE because its verdict belongs to `css-family-direct-client-mechanism`, whose grant licenses it 1:1. Cutting `isDirectClientUiMechanism` out of this policy reds this row",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [THEME]: "@theme { --color-background: black; }\n", [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { messageIncludes: "product-css" },
      why: "a product CSS identity missing four of its five homes REFUSES at the population phase and withholds this owner — the successor of the legacy `existsSync(package.json)` real-tree anchor, which could only stay silent",
    },
  ],
});
