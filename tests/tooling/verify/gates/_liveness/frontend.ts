// Real-corpus liveness arms (#2149) for the policies whose declared population is the frontend pair,
// `@client` + `@ui` (0042's second chunk). DATA, collected by the one runner
// (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. Occurrence policies get a new
// file where the population admits it; tripwires over a sanctioned home get the home taken away; policies
// whose subject is a stylesheet or the token vault read it through the ResourceHost, so their arm plants into
// the REAL file through the reader's own overlay (`kind: "resource"`, `append`). Every add path, id and
// class string is this arm's own: the add arms share one overlaid pass, and two arms minting the same thing
// would make each other speak.
import { gate as baseuiRenderPropComposition } from "../../../../../tooling/src/verify/gates/baseui-render-prop-composition.ts";
import { gate as classTokenSplice } from "../../../../../tooling/src/verify/gates/class-token-splice.ts";
import { gate as cssFamilyDirectClientMechanism } from "../../../../../tooling/src/verify/gates/css-family-direct-client-mechanism.ts";
import { gate as cssFamilyOwnership } from "../../../../../tooling/src/verify/gates/css-family-ownership.ts";
import { gate as cssSelectorHasAWriter } from "../../../../../tooling/src/verify/gates/css-selector-has-a-writer.ts";
import { gate as densityTier } from "../../../../../tooling/src/verify/gates/density-tier.ts";
import { gate as densityTierSlotMap } from "../../../../../tooling/src/verify/gates/density-tier-slot-map.ts";
import { gate as floorlessControlVocabularyHealth } from "../../../../../tooling/src/verify/gates/floorless-control-vocabulary-health.ts";
import { gate as integerLineBoxes } from "../../../../../tooling/src/verify/gates/integer-line-boxes.ts";
import { gate as macroResolutionHome } from "../../../../../tooling/src/verify/gates/macro-resolution-home.ts";
import { gate as noArbitraryTwValues } from "../../../../../tooling/src/verify/gates/no-arbitrary-tw-values.ts";
import { gate as noBannedTwUtility } from "../../../../../tooling/src/verify/gates/no-banned-tw-utility.ts";
import { gate as noColorLiterals } from "../../../../../tooling/src/verify/gates/no-color-literals.ts";
import { gate as noFloorlessControlInWrap } from "../../../../../tooling/src/verify/gates/no-floorless-control-in-wrap.ts";
import { gate as noHoverDisplaySwap } from "../../../../../tooling/src/verify/gates/no-hover-display-swap.ts";
import { gate as noLayoutContextProps } from "../../../../../tooling/src/verify/gates/no-layout-context-props.ts";
import { gate as noOffTokenInlineStyle } from "../../../../../tooling/src/verify/gates/no-off-token-inline-style.ts";
import { gate as noOffTokenRadiusShadow } from "../../../../../tooling/src/verify/gates/no-off-token-radius-shadow.ts";
import { gate as noRawMatchmedia } from "../../../../../tooling/src/verify/gates/no-raw-matchmedia.ts";
import { gate as noRawSpacingInFeatures } from "../../../../../tooling/src/verify/gates/no-raw-spacing-in-features.ts";
import { gate as noRawTypographyInFeatures } from "../../../../../tooling/src/verify/gates/no-raw-typography-in-features.ts";
import { gate as noRawZIndex } from "../../../../../tooling/src/verify/gates/no-raw-z-index.ts";
import { gate as noTailwindDarkVariant } from "../../../../../tooling/src/verify/gates/no-tailwind-dark-variant.ts";
import { gate as noUntrustedHtmlInMainDom } from "../../../../../tooling/src/verify/gates/no-untrusted-html-in-main-dom.ts";
import { gate as recededInkIntegrity } from "../../../../../tooling/src/verify/gates/receded-ink-integrity.ts";
import { gate as restTransformGrid } from "../../../../../tooling/src/verify/gates/rest-transform-grid.ts";
import { gate as scrollContainerPositioned } from "../../../../../tooling/src/verify/gates/scroll-container-positioned.ts";
import { gate as seedThemeInkContrast } from "../../../../../tooling/src/verify/gates/seed-theme-ink-contrast.ts";
import { gate as spacingTierHomeHealth } from "../../../../../tooling/src/verify/gates/spacing-tier-home-health.ts";
import { gate as subFloorDisclosure } from "../../../../../tooling/src/verify/gates/sub-floor-disclosure.ts";
import { gate as themeOverrideOnlyViaScope } from "../../../../../tooling/src/verify/gates/theme-override-only-via-scope.ts";
import { gate as typographyTierHomeHealth } from "../../../../../tooling/src/verify/gates/typography-tier-home-health.ts";
import { gate as uiSizeViaVariant } from "../../../../../tooling/src/verify/gates/ui-size-via-variant.ts";
import { gate as zIndexTierHealth } from "../../../../../tooling/src/verify/gates/z-index-tier-health.ts";
import { gate as zIndexTierPermission } from "../../../../../tooling/src/verify/gates/z-index-tier-permission.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const FEATURE = "packages/client/src/features/chat/components";
const UI = "packages/ui/src/primitives";
const MARKDOWN_HOME = "packages/ui/src/markdown/";
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const UI_GLOBALS = "packages/ui/src/styles/globals.css";
const UI_TIERS = "packages/ui/src/styles/tiers.css";

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

/** A new feature file rendering one element with `className`. */
function featureClass(name: string, className: string): RealCorpusOverlay {
  return add(`${FEATURE}/liveness-${name}.tsx`, `export const G = <div className="${className}" />;\n`);
}

export const FRONTEND_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: baseuiRenderPropComposition,
    overlays: [add(`${UI}/menu/liveness-menu.tsx`, 'export const G = <Menu.Trigger asChild><button type="button">x</button></Menu.Trigger>;\n')],
    messageIncludes: "asChild",
  },
  {
    policy: classTokenSplice,
    overlays: [add("packages/ui/src/liveness-splice.tsx", 'const side = "end";\nexport const x = <div className={`inset-${side}-0 p-2`} />;\n')],
    messageIncludes: "INSIDE a class token",
  },
  {
    policy: cssFamilyDirectClientMechanism,
    // Every report this policy can make is one of three hardcoded recipes, all licensed by the central grant
    // table, so no overlay can plant a new one: its liveness is GRANT CONSUMPTION. On the real tree all three
    // grants are consumed; with the client sheet carrying no recipe at all, they go stale.
    overlays: [{ kind: "resource", path: CLIENT_GLOBALS, source: ":root {\n  --liveness-probe: 0;\n}\n" }],
    messageIncludes: "css-family-direct-client-mechanism:dialog-popup",
    grantConsumption: true,
  },
  {
    policy: cssFamilyOwnership,
    overlays: [{ kind: "resource", path: UI_GLOBALS, append: '\n[data-density="compact"] {\n  --spacing-row: 0.5rem;\n}\n' }],
    messageIncludes: "density mapping belongs in tiers.css",
  },
  {
    policy: cssSelectorHasAWriter,
    overlays: [{ kind: "resource", path: UI_TIERS, append: '\n[data-density="liveness"] {\n  --spacing-row: 1rem;\n}\n' }],
    messageIncludes: "no semantic writer",
  },
  {
    policy: densityTier,
    overlays: [featureClass("density", "rounded-card border border-border bg-card")],
    messageIncludes: "operation: elevated-radius",
  },
  {
    policy: densityTierSlotMap,
    // A tier-mapped slot stamped outside packages/ui/src/.
    overlays: [add(`${FEATURE}/liveness-rogue-slot.tsx`, 'export const G = <div data-slot="list-row-root" />;\n')],
    messageIncludes: "ROGUE STAMP",
  },
  {
    policy: floorlessControlVocabularyHealth,
    // The declaring source keeps a control size but loses every floorless arm the vocabulary derives.
    overlays: [{ kind: "neutralise", path: `${UI}/button/variants.ts`, source: "export const buttonVariants = { size: { sm: 'h-control-sm' } };\n" }],
    messageIncludes: "no longer",
  },
  {
    policy: integerLineBoxes,
    overlays: [{ kind: "resource", path: CLIENT_GLOBALS, append: "\n.liveness-probe {\n  line-height: 1.37;\n}\n" }],
    // The policy passes no message of its own, so the verdict is its declared one, at the planted sheet.
    messageIncludes: "A line box off the integer-px grid",
  },
  {
    policy: macroResolutionHome,
    overlays: [add("packages/client/src/features/preset/liveness-editor.tsx", 'import { processMacros } from "@orb/kit/macro";\nprocessMacros();\n')],
    messageIncludes: "processMacros",
  },
  {
    policy: noArbitraryTwValues,
    overlays: [featureClass("arbitrary", "w-[137px] p-[7px]")],
    messageIncludes: "arbitrary Tailwind value",
  },
  {
    policy: noBannedTwUtility,
    overlays: [featureClass("banned", "w-fit max-w-prose px-block")],
    messageIncludes: "max-w-prose",
  },
  {
    policy: noColorLiterals,
    overlays: [featureClass("color", "text-[#abc]")],
    messageIncludes: "arbitrary hex color class",
  },
  {
    policy: noFloorlessControlInWrap,
    overlays: [
      add(
        "packages/client/src/features/rpg/components/liveness-icon-grid.tsx",
        "const ICONS = ['a', 'b', 'c'];\nexport function IconGrid() {\n  return (\n    <div className=\"max-w-64 flex-wrap\">\n      {ICONS.map((name) => (\n        <Button key={name} size=\"glyph-lg\">{name}</Button>\n      ))}\n    </div>\n  );\n}\n",
      ),
    ],
    messageIncludes: "floorless",
  },
  {
    policy: noHoverDisplaySwap,
    overlays: [featureClass("hover-swap", "group-hover/row:hidden")],
    messageIncludes: "hover-keyed DISPLAY utility",
  },
  {
    policy: noLayoutContextProps,
    overlays: [add(`${FEATURE}/liveness-layout-prop.tsx`, "export const G = <EntityCard compact={true} />;\n")],
    messageIncludes: "layout-context prop",
  },
  {
    policy: noOffTokenInlineStyle,
    overlays: [add(`${FEATURE}/liveness-inline-style.tsx`, 'export const G = <div style={{ borderRadius: "8px" }} />;\n')],
    messageIncludes: "off-token raw-literal inline style",
  },
  {
    policy: noOffTokenRadiusShadow,
    overlays: [add(`${UI}/liveness-radius/x.tsx`, 'export const G = <div className="rounded-lg shadow-md" />;\n')],
    messageIncludes: "off-token default-scale radius/shadow",
  },
  {
    policy: noRawMatchmedia,
    overlays: [add(`${FEATURE}/liveness-matchmedia.tsx`, 'export const G = (): unknown => globalThis.matchMedia("(prefers-reduced-motion: reduce)");\n')],
    messageIncludes: "raw `matchMedia` read",
  },
  {
    policy: noRawSpacingInFeatures,
    overlays: [featureClass("spacing", "p-4")],
    messageIncludes: "raw spacing utility",
  },
  {
    policy: noRawTypographyInFeatures,
    overlays: [featureClass("typography", "text-sm")],
    messageIncludes: "raw font-size utility",
  },
  {
    policy: noRawZIndex,
    overlays: [featureClass("z", "z-50")],
    messageIncludes: "raw z-N",
  },
  {
    policy: noTailwindDarkVariant,
    overlays: [add("packages/ui/src/liveness-dark.tsx", 'export const G = <div className="dark:bg-card" />;\n')],
    messageIncludes: "dark: utility",
  },
  {
    policy: noUntrustedHtmlInMainDom,
    overlays: [add(`${FEATURE}/liveness-html.tsx`, "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n")],
    messageIncludes: "dangerouslySetInnerHTML",
  },
  {
    policy: recededInkIntegrity,
    overlays: [
      add(
        `${FEATURE}/liveness-receded.tsx`,
        'import { RECEDED_INK } from "@orb/ui/lib";\nexport const T = <button className={`hover:${RECEDED_INK}`} type="button" />;\n',
      ),
    ],
    messageIncludes: "RECEDED_INK",
  },
  {
    policy: restTransformGrid,
    overlays: [add("packages/ui/src/liveness-rest-transform.tsx", 'export const G = <div className="scale-95 rounded-card" />;\n')],
    messageIncludes: "A REST-state transform",
  },
  {
    policy: scrollContainerPositioned,
    overlays: [featureClass("scroll", "min-h-0 flex-1 overflow-y-auto")],
    messageIncludes: "vertical scroll container",
  },
  {
    policy: seedThemeInkContrast,
    // `border` is a stroke token: painted as TEXT it cannot clear 4.5:1 on the grounds it rests on.
    overlays: [add(`${UI}/liveness-ink/variants.ts`, "import { tv } from 'tailwind-variants';\nexport const livenessInk = tv({ base: 'text-border' });\n")],
    messageIncludes: "text-border",
  },
  {
    policy: spacingTierHomeHealth,
    // A sanctioned home that resolves to no file: the markdown tier home leaves the corpus.
    overlays: [{ kind: "remove", path: MARKDOWN_HOME }],
    messageIncludes: `"${MARKDOWN_HOME}" resolves to no file`,
  },
  {
    policy: subFloorDisclosure,
    overlays: [add(`${FEATURE}/liveness-disclosure.tsx`, 'export const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;\n')],
    messageIncludes: "CollapsibleTrigger",
  },
  {
    policy: themeOverrideOnlyViaScope,
    overlays: [add(`${FEATURE}/liveness-theme-override.tsx`, "export const A = () => <div style={{ '--color-primary': 'red' }} />;\n")],
    messageIncludes: "`--color-*` design token",
  },
  {
    policy: typographyTierHomeHealth,
    overlays: [{ kind: "remove", path: MARKDOWN_HOME }],
    messageIncludes: `"${MARKDOWN_HOME}" resolves to no file`,
  },
  {
    policy: uiSizeViaVariant,
    overlays: [add(`${FEATURE}/liveness-size.tsx`, 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="size-auto">x</Button>;\n')],
    messageIncludes: "sizes come from variants",
  },
  {
    policy: zIndexTierHealth,
    overlays: [{ kind: "remove", path: MARKDOWN_HOME }],
    messageIncludes: MARKDOWN_HOME,
  },
  {
    policy: zIndexTierPermission,
    // A REVIEWED-GRANT fold, as for the pointer tier: every z-index spelling in the markdown home folds into
    // one candidate the central grant licenses. This path sorts before every real markdown file, so the fold
    // anchors here, and its site list names line 3 only if the fold read this file's two spellings.
    overlays: [
      add(`${MARKDOWN_HOME}_liveness-z.tsx`, 'export const probe = 1;\n\nexport const x = <><div className="z-50" /><div className="z-[60]" /></>;\n'),
    ],
    messageIncludes: "line(s): 1, 3.",
    granted: true,
  },
];
