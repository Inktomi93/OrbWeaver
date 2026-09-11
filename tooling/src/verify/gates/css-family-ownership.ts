// Gate: css-family-ownership (#951 / client-architecture-lockdown.md §4.3 and §4.7).
// The descriptor keeps permanent polar controls; policy, selector parsing, and declaration provenance
// live in lib modules below the 450-line ceiling.
//
// COUPLED SITE — the five `censusControlFiles({...})` rows below are a HAND-SPELLED oracle for
// `EXPECTED_DECLARATION_CENSUS` / `_TOTAL` / `_DIRECT_THEME_DECLARATIONS` in lib/css-family-census.ts.
// They deliberately do NOT derive from the manifest (css-family-proof-fixtures.ts:17-18) so a manifest
// bump cannot launder its own proof — which makes every manifest bump owe BOTH edits in one commit.
// Four consecutive commits paid only the manifest half and left this arm red for five days (#1956):
// 1416f2c98 (#1684, theme 306→304: direct 200→199, rules 106→105), d6870e275 (#1868, theme 304→312 and
// shell 349→351), 03b8cb94f (#1869, shell 351→353), d72339a26 (#1869 #1870, ui globals 189→190). Each
// delta is an INTENDED ownership change annotated at its own sheet in the manifest; the stylesheets
// themselves never drifted from it. The clean control restates the manifest exactly; the four flag rows
// are single-declaration perturbations OF that control, so they move with it.

import { CLIENT_GLOBALS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import type { GateDescriptor } from "../contract/gate.ts";
import { MESSAGE } from "../lib/css-family-census.ts";
import { auditCssFamilies } from "../lib/css-family-policy.ts";
import { censusControlFiles, shellClassProducer } from "../lib/css-family-proof-fixtures.ts";
import { beginHookOwnerCollection, visitHookOwnerNode } from "../lib/css-family-source-provenance.ts";
import { STATIC_CLASS_KINDS } from "../lib/static-class-expression.ts";

export const gate: GateDescriptor = {
  name: "css-family-ownership",
  docRow: "client-architecture-lockdown.md §4.3 / §4.7 (#951)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MESSAGE,
  fix: "move the declaration to its semantic home; do not relabel it, add an allowlist, change source order, or narrow theme/custom-CSS behavior",
  begin: beginHookOwnerCollection,
  kinds: STATIC_CLASS_KINDS,
  visit: visitHookOwnerNode,
  finalize: auditCssFamilies,
  mustFlag: [
    {
      files: { [UI_GLOBALS]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 1, token: "data-density" },
      why: "density planted in UI globals is routed to tiers.css",
    },
    {
      files: { [CLIENT_GLOBALS]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 1, token: "data-density" },
      why: "density planted in client globals is routed to tiers.css",
    },
    {
      files: { [SHELL]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 2, token: "data-density" },
      why: "density in shell violates both the density home and shell-root grammar",
    },
    {
      files: { [UI_GLOBALS]: "@layer base { :root { color-scheme: dark; } }\n" },
      expect: { count: 1, token: "@layer" },
      why: "an authored layer destroys the global unlayered-wins mechanism",
    },
    {
      files: {
        [THEME]: "@theme { --color-background: black; }\n",
        [SHELL]: ".shell-grid { --color-fresh-palette: oklch(0.5 0.1 40); }\n",
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid"),
      },
      expect: { count: 1, token: "--color-fresh-palette" },
      why: "a new palette/value in shell is caught from the generated color namespace, even though the exact name is new",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-progress { overflow: hidden; }\n",
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-progress" />;\n',
      },
      expect: { count: 1, token: "class:client-progress" },
      why: "a class selected in UI globals but produced only by client source violates dependency direction",
    },
    {
      files: {
        [UI_GLOBALS]: '[data-slot="client-progress"] { overflow: hidden; }\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div data-slot="client-progress" />;\n',
      },
      expect: { count: 1, token: "slot:client-progress" },
      why: "the producer-direction arm covers JSX data-slot hooks, not only class strings",
    },
    {
      files: {
        [CLIENT_GLOBALS]: '[data-slot="button"] { border-radius: 1rem; }\n',
        "packages/ui/src/primitives/button.tsx": 'export const button = <button data-slot="button" />;\n',
      },
      expect: { count: 1, token: "slot:button" },
      why: "a bare client-global skin of a UI-only component belongs in the component tv() variant",
    },
    {
      files: { [TIERS]: ".button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button" },
      why: "a component skin planted in tiers.css is outside the density selector grammar",
    },
    {
      files: { [SHELL]: ".button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button" },
      why: "a component skin planted in shell.css is not rooted in the shell frame",
    },
    {
      files: {
        [SHELL]: ".shell-grid + .button { padding: 1rem; }\n",
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid"),
      },
      expect: { count: 1, token: ".shell-grid + .button" },
      why: "a shell sibling does not root the subject painted after it",
    },
    {
      files: {
        [SHELL]: ".button:has(.shell-grid) { padding: 1rem; }\n",
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid"),
      },
      expect: { count: 1, token: ".button:has(.shell-grid)" },
      why: "a shell descendant inside :has() does not make the outer component a shell subject",
    },
    {
      files: {
        [SHELL]: ":is(.shell-grid, .button) { padding: 1rem; }\n",
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid"),
      },
      expect: { count: 1, token: ":is(.shell-grid, .button)" },
      why: "every :is() alternative used as the root must be shell-rooted",
    },
    {
      files: {
        [SHELL]: ":where(.shell-grid, .button) { padding: 1rem; }\n",
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid"),
      },
      expect: { count: 1, token: ":where(.shell-grid, .button)" },
      why: "every :where() alternative used as the root must be shell-rooted",
    },
    {
      files: {
        [SHELL]: ".button:not(.shell-never), .shell-grid { padding: 1rem; }\n",
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-never", "shell-grid"),
      },
      expect: { count: 1, token: ".button:not(.shell-never)" },
      why: "a negated shell class cannot launder one selector-list arm through a valid sibling arm",
    },
    {
      files: { [SHELL]: '[data-probe=".shell-grid"] .button { padding: 1rem; }\n' },
      expect: { count: 1, token: '[data-probe=".shell-grid"] .button' },
      why: "attribute value text that looks like a shell class is not a shell subject or ancestor",
    },
    {
      files: {
        [SHELL]: ':is([data-probe=".shell-grid"], .shell-panel) .button { padding: 1rem; }\n',
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-panel"),
      },
      expect: { count: 1, token: ':is([data-probe=".shell-grid"], .shell-panel) .button' },
      why: "an attribute value cannot counterfeit the shell ancestry of one :is() branch",
    },
    {
      files: { [SHELL]: ':where([data-probe=".shell-grid"]) .button { padding: 1rem; }\n' },
      expect: { count: 1, token: ':where([data-probe=".shell-grid"]) .button' },
      why: "an attribute value cannot counterfeit shell ancestry inside :where()",
    },
    {
      files: censusControlFiles({ themeDirect: 203, themeRules: 109, ui: 191, tiers: 47, client: 127, shell: 353 }),
      expect: { count: 2, token: "census:ui-globals" },
      why: "adding one otherwise legal declaration makes both the UI-home and total ratchets stale",
    },
    {
      files: censusControlFiles({ themeDirect: 203, themeRules: 109, ui: 190, tiers: 47, client: 127, shell: 352 }),
      expect: { count: 2, token: "census:shell" },
      why: "deleting one otherwise legal declaration makes both the shell-home and total ratchets stale",
    },
    {
      files: censusControlFiles({ themeDirect: 203, themeRules: 109, ui: 189, tiers: 47, client: 128, shell: 353 }),
      expect: { count: 2, token: "census:ui-globals" },
      why: "moving one declaration preserves the total but makes both source and destination home ratchets stale",
    },
    {
      files: censusControlFiles({ themeDirect: 202, themeRules: 110, ui: 190, tiers: 47, client: 127, shell: 353 }),
      expect: { count: 1, token: "census:theme-direct" },
      why: "moving one generated declaration out of direct @theme keeps every home total stable but trips the generated-output ratchet",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-progress { overflow: hidden; }\n",
        "packages/ui/src/content/copy.ts": 'export const copy = "client-progress";\n',
        "packages/client/src/features/probe.ts": 'import { cn } from "@orb/ui/lib";\nexport const classes = cn("client-progress");\n',
      },
      expect: { count: 1, token: "class:client-progress" },
      why: "an inert UI prose string cannot launder a class produced only by a real client class-composer call",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-helper-class { overflow: hidden; }\n",
        "packages/ui/src/helpers/probe.ts":
          'const helper = { cn: (...values: string[]) => values.join(" ") };\nexport const classes = helper.cn("client-helper-class");\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-helper-class" />;\n',
      },
      expect: { count: 1, token: "class:client-helper-class" },
      why: "an unrelated helper.cn call is not provenance for an @orb/ui class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-counterfeit-property { overflow: hidden; }\n",
        "packages/ui/src/content/probe.ts": 'export const metadata = { className: "client-counterfeit-property" };\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-counterfeit-property" />;\n',
      },
      expect: { count: 1, token: "class:client-counterfeit-property" },
      why: "an inert object property named className is not a rendered UI class carrier",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-fake-list .client-fake-list-optional .client-fake-name { overflow: hidden; }\n",
        "packages/ui/src/content/probe.ts":
          "const data = { className: '', classList: { add: (..._values: string[]) => undefined, toggle: (..._values: string[]) => undefined } };\n" +
          'data.classList.add("client-fake-list");\n' +
          'data?.["classList"]?.["toggle"]?.("client-fake-list-optional");\n' +
          'data["className"] = "client-fake-name";\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-fake-list client-fake-list-optional client-fake-name" />;\n',
      },
      expect: { count: 3, token: "class:client-fake-list" },
      why: "classList/className-shaped objects do not become DOM class producers by spelling, including optional computed access and assignment",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-ignored-wrapper-argument { overflow: hidden; }\n",
        "packages/ui/src/components/probe.ts":
          'import { cn } from "#lib";\n' +
          'const ignoresArguments = (..._values: unknown[]): string => cn("ui-static");\n' +
          'export const classes = ignoresArguments("client-ignored-wrapper-argument");\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-ignored-wrapper-argument" />;\n',
      },
      expect: { count: 1, token: "class:client-ignored-wrapper-argument" },
      why: "a wrapper that does not forward its call-site arguments cannot launder them through canonical cn",
    },
    {
      files: { [SHELL]: ".shell-invented-without-writer { display: grid; }\n" },
      expect: { count: 1, token: "class:shell-invented-without-writer" },
      why: "a shell prefix declares the structural namespace but cannot invent a rendered structural name",
    },
    {
      files: { [SHELL]: '[data-shell-invented="true"] { display: grid; }\n' },
      expect: { count: 1, token: "attr:data-shell-invented" },
      why: "a data-shell attribute needs a live JSX writer just like a shell class",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-direct-name { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement.className = "client-direct-name";\n',
      },
      expect: { count: 1, token: "class:client-direct-name" },
      why: "direct className assignment is a live client class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-computed-name { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement["className"] = "client-computed-name";\n',
      },
      expect: { count: 1, token: "class:client-computed-name" },
      why: "computed className assignment is a live client class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-bracket-add { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement.classList["add"]("client-bracket-add");\n',
      },
      expect: { count: 1, token: "class:client-bracket-add" },
      why: "bracketed DOMTokenList mutation is a live client class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-optional-toggle { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts":
          'declare const element: HTMLElement | undefined;\nelement?.["classList"]?.["toggle"]?.("client-optional-toggle");\n',
      },
      expect: { count: 1, token: "class:client-optional-toggle" },
      why: "optional computed DOMTokenList mutation is a live client class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-list-alias { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nconst tokens = element.classList;\ntokens.add("client-list-alias");\n',
      },
      expect: { count: 1, token: "class:client-list-alias" },
      why: "a DOMTokenList alias remains a live client class producer without repeating the classList property spelling",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-spread-add { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts":
          'declare const element: HTMLElement;\nconst values = ["client-spread-add"] as const;\nelement.classList.add(...values);\n',
      },
      expect: { count: 1, token: "class:client-spread-add" },
      why: "a spread into a DOMTokenList mutator remains a live client class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-optional-spread-toggle { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts":
          "declare const element: HTMLElement | undefined;\n" +
          'const values = ["client-optional-spread-toggle"] as const;\n' +
          'element?.["classList"]?.["toggle"]?.(...values);\n',
      },
      expect: { count: 1, token: "class:client-optional-spread-toggle" },
      why: "spread values survive optional and computed DOMTokenList mutation syntax",
    },
    {
      files: { [SHELL]: ":root { color-scheme: dark; }\n" },
      expect: { count: 1, token: "color-scheme" },
      why: "the one document-root declaration in shell is the view-transition reset, not a general global-mechanism door",
    },
    {
      files: { [TIERS]: '[data-density="compact"] { --spacing-field: 0.25rem; --spacing-row: 0.375rem; --spacing-block: 0.5rem; --spacing-section: 1rem; }\n' },
      expect: { count: 1, token: 'density-arm:[data-density="comfortable"]' },
      why: "one density arm without its symmetric counterpart is a stale runtime contract, not a valid partial map",
    },
  ],
  mustPass: [
    {
      files: { [THEME]: "@theme { --color-background: black; --spacing-row: 0.5rem; }\n:root { color-scheme: dark; }\n" },
      why: "generated @theme declarations are counted as declarations and define the live generated namespaces",
    },
    {
      files: {
        [THEME]: "@theme {\n  --color-background: black;\n  @media (forced-colors: active) {\n    --probe-nested: white;\n  }\n}\n",
        [SHELL]: ".shell-grid { --probe-runtime: white; }\n",
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid"),
      },
      why: "only direct @theme declarations mint generated namespaces; a nested declaration cannot widen the writer wall",
    },
    {
      files: {
        [TIERS]:
          '[data-density="comfortable"] { --spacing-field: var(--orb-density-comfortable-field); --spacing-row: var(--orb-density-comfortable-row); --spacing-block: var(--orb-density-comfortable-block); --spacing-section: var(--orb-density-comfortable-section); }\n' +
          '[data-density="compact"] { --spacing-field: var(--orb-density-compact-field); --spacing-row: var(--orb-density-compact-row); --spacing-block: var(--orb-density-compact-block); --spacing-section: var(--orb-density-compact-section); }\n',
      },
      why: "both symmetric density runtime writers belong in tiers.css and each maps all four intents",
    },
    {
      files: {
        [UI_GLOBALS]: ".scroll-fade-x { --fade-start-stop: 0%; }\n",
        "packages/ui/src/lib/scroll.ts": 'export const SCROLL_FADE_X_CLASS = "scroll-fade-x";\n',
        "packages/ui/src/lib/index.ts": 'export { SCROLL_FADE_X_CLASS } from "./scroll.ts";\n',
        "packages/client/src/feature.tsx":
          'import { SCROLL_FADE_X_CLASS } from "../../ui/src/lib/index.ts";\nexport const probe = <div className={SCROLL_FADE_X_CLASS} />;\n',
      },
      why: "a live client className imported through the UI public barrel proves both producer directions without admitting an inert literal",
    },
    {
      files: {
        [CLIENT_GLOBALS]: 'html[data-blur-modals] [data-slot="dialog-popup"] { backdrop-filter: blur(1rem); }\n',
        "packages/ui/src/primitives/dialog.tsx": 'export const dialog = <div data-slot="dialog-popup" />;\n',
      },
      why: "a client appearance carrier may treat a UI primitive without becoming its component skin",
    },
    {
      files: {
        [SHELL]: ".shell-grid { display: grid; --rail-w: 3rem; }\n:root { view-transition-name: none; }\n",
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid"),
      },
      why: "shell-rooted geometry and the exact view-transition reset remain in the shell home",
    },
    {
      files: {
        [SHELL]:
          ".shell-grid > .button { padding: 1rem; }\n" +
          ".shell-grid .button { margin: 0; }\n" +
          ":is(.shell-grid, .shell-panel) .button { display: block; }\n" +
          '.shell-grid:where([data-elevation="ramp"]) .button { color: inherit; }\n',
        "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid", "shell-panel"),
      },
      why: "shell subjects and ancestors remain valid through child/descendant combinators and all-shell :is() alternatives",
    },
    {
      files: {
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
        "packages/client/src/features/probe.tsx":
          'export const probe = <div className="shared-cn shared-tv shared-namespace-cn shared-wrapper shared-declared-wrapper shared-block-wrapper shared-function-wrapper" />;\n',
      },
      why: "canonical @orb/ui cn/tv producers remain UI-owned through a barrel, named aliases, namespace-computed access, and a forwarding wrapper",
    },
    {
      files: {
        [UI_GLOBALS]: `[data-probe=".client-attribute-text"] { overflow: hidden; }\n[data-copy='.client-attribute-single'] { display: block; }\n`,
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-attribute-text client-attribute-single" />;\n',
      },
      why: "class-looking text inside quoted attribute values is selector data, not a class selector",
    },
    {
      files: {
        [UI_GLOBALS]: ".shared-jsx-spread { overflow: hidden; }\n",
        "packages/ui/src/components/probe.tsx": 'const attributes = { className: "shared-jsx-spread" };\nexport const uiProbe = <div {...attributes} />;\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="shared-jsx-spread" />;\n',
      },
      why: "a className object property is live ownership when the object is actually spread into JSX",
    },
    {
      files: {
        [SHELL]: '.shell-written { display: grid; }\n[data-shell-written="true"] .shell-written { grid-template-columns: 1fr; }\n',
        "packages/client/src/features/app-shell/probe.tsx": 'export const shellProbe = <div className="shell-written" data-shell-written="true" />;\n',
      },
      why: "written shell class and data-shell hooks remain valid structural roots",
    },
    {
      files: {
        [SHELL]: '.shell-written-spread { display: grid; }\n[data-shell-written-spread="true"] .shell-written-spread { grid-template-columns: 1fr; }\n',
        "packages/client/src/features/app-shell/probe.tsx":
          'const attributes = { className: "shell-written-spread", "data-shell-written-spread": "true" };\n' +
          "export const shellProbe = <div {...attributes} />;\n",
      },
      why: "className and data-shell properties are live structural writers when their object is actually spread into JSX",
    },
    {
      files: censusControlFiles({ themeDirect: 203, themeRules: 109, ui: 190, tiers: 47, client: 127, shell: 353 }),
      why: "the exact declaration manifest as of #1869/#1870, including direct generated @theme declarations, is the clean control",
    },
    {
      files: { [UI_GLOBALS]: "/* @layer base { .fake { color: red; } } */\n:root { font-size: 100%; }\n" },
      why: "comment text cannot manufacture an authored-layer finding",
    },
  ],
};
