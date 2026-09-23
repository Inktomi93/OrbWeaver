// Shared `mode: "resource"` fixture MATERIAL for the css-family policies.
//
// WHY IT EXISTS. `resolveResourceDeclarations` acquires EVERY declared resource at the population phase and
// throws on the first non-ready one, so a proof row that omits a declared resource is a `[population]` TOOL
// ERROR rather than the finding it was written to prove (resource-policy-contract.md §3.5 — the reason
// `depcruise-grant-liveness` spreads `PACKAGE_FIXTURE_FILES` into every row). Five policies × ~14 rows ×
// four resource identities is not a per-row hand write.
//
// EVERY CONSTANT BELOW IS INERT BY CONSTRUCTION: the five product sheets carry legal declarations, the
// vendor surface carries an empty manifest against an empty installed surface, and the Base UI mini package
// publishes exactly the declaration file its `ast` door needs. A row that wants an arm to FIRE overrides one
// entry; nothing fires from the spread alone. That is what makes `count` exact in the rows that use it.
import { CLIENT_GLOBALS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
/** Minimal namespace evidence for the color, blur and spacing runtime seams. Generator freshness
 * belongs to baseline theme-css --check; no fixture copies the current generated population. */
export const THEME_FAMILIES = "@theme {\n  --color-probe: black;\n  --blur-probe: 1px;\n  --spacing-probe: 1px;\n}\n";

/** The five product stylesheets, each legal and silent. A row overrides the one home it is about. */
export const CLEAN_PRODUCT_CSS: Readonly<Record<string, string>> = {
  [THEME]: "@theme {\n  --color-background: black;\n}\n",
  [UI_GLOBALS]: ":root { font-size: 100%; }\n",
  // A tier selector rather than `:root`, because the tier grammar admits only the closed carrier set — and
  // its hook is WRITTEN by `TIER_WRITER` below, so the selector census reads it as owned.
  [TIERS]: '[data-surface-tier="base"] { color: red; }\n',
  [CLIENT_GLOBALS]: ":root { --probe-client: 0; }\n",
  [SHELL]: ":root { view-transition-name: none; }\n",
};

/** An admitted `@client`/`@ui` source. A hybrid policy's population is `@client` + `@ui`, and a population
 *  admitting NOTHING is a `[population]` tool error rather than a falsifier — every row needs an anchor. */
export const SOURCE_ANCHOR = "packages/client/src/features/probe.tsx";

/** The writer for the clean tiers sheet's one hook. It lives in its OWN file rather than in the anchor,
 *  because a row that overrides `SOURCE_ANCHOR` to prove an inert spelling must not silently un-write the
 *  fixture's own baseline selector — which reads as an extra finding in every one of that row's counts. */
const TIER_WRITER = "packages/ui/src/primitives/tier-probe.tsx";
export const INERT_SOURCE: Readonly<Record<string, string>> = {
  [SOURCE_ANCHOR]: "export const probe = null;\n",
  [TIER_WRITER]: 'export const tier = <div data-surface-tier="base" />;\n',
};

const BASE_UI_PKG = "packages/ui/node_modules/@base-ui/react";
const STREAMDOWN_PKG = "packages/ui/node_modules/streamdown";

/** The committed Base UI surface manifest, describing an EMPTY installed surface. */
export const EMPTY_BASE_UI_MANIFEST = '{ "version": "9.9.9", "components": {} }\n';

/** The installed Base UI half alone: metadata + one `*CssVars.d.ts`, which is also everything the
 *  `installed-package{base-ui,ast}` door needs. Separate so a refusal row can install Base UI WITHOUT
 *  Streamdown and have the vendor surface be the first door that refuses. */
export const BASE_UI_INSTALLED_FIXTURE: Readonly<Record<string, string>> = {
  "packages/ui/package.json": '{ "name": "@orb/ui", "version": "0.0.0" }\n',
  [`${BASE_UI_PKG}/package.json`]: '{ "name": "@base-ui/react", "version": "9.9.9" }\n',
  [`${BASE_UI_PKG}/select/SelectCssVars.d.ts`]: "export type SelectCssVars = never;\n",
};

/** The `vendor-css-surface` identity: the installed Base UI metadata + at least one `*CssVars.d.ts`, and
 *  at least one Streamdown `dist/` bundle — no committed mirror side any more (#10). `styles.css` is not
 *  decoration: it is `streamdown`'s declared `directoryAnchor`, because the real package's `exports` map
 *  refuses `./package.json`. */
export const VENDOR_SURFACE_FIXTURE: Readonly<Record<string, string>> = {
  ...BASE_UI_INSTALLED_FIXTURE,
  [`${STREAMDOWN_PKG}/package.json`]: '{ "name": "streamdown", "version": "9.9.9" }\n',
  [`${STREAMDOWN_PKG}/styles.css`]: ".streamdown {}\n",
  [`${STREAMDOWN_PKG}/dist/bundle.js`]: "export const inert = {};\n",
};

/** The Streamdown bundle path a row overrides to make the vendor EMIT the contracted hook. */
export const STREAMDOWN_BUNDLE = `${STREAMDOWN_PKG}/dist/bundle.js`;
/** The emission spelling the installed bundles carry. */
export const STREAMDOWN_EMITTING_BUNDLE = 'export const vendor = {"data-streamdown":"code-block"};\n';

/** The committed manifest path, for a row that overrides it. */
export const BASE_UI_MANIFEST_PATH = "tooling/src/verify/gates/baseui-surface.manifest.json";

/** Every resource identity the selector policies declare, all inert. */
export const SELECTOR_FIXTURE: Readonly<Record<string, string>> = {
  ...CLEAN_PRODUCT_CSS,
  ...INERT_SOURCE,
  ...VENDOR_SURFACE_FIXTURE,
  [BASE_UI_MANIFEST_PATH]: EMPTY_BASE_UI_MANIFEST,
};

/** Every resource identity the ownership policies declare, all inert. */
export const OWNERSHIP_FIXTURE: Readonly<Record<string, string>> = { ...CLEAN_PRODUCT_CSS, ...INERT_SOURCE };

/** THE COMPLETE RUNTIME-WRITER SEAMS: every DECLARED MEMBER of each seam written AT LEAST ONCE, which is all
 *  the health arm asks. No cardinality is promised here or asserted there — a seam is complete when its
 *  vocabulary is covered, and an additional legitimate carrier changes nothing.
 *
 *  MEASURED, as these constants are committed (#2305): density covers its 8 members —
 *  `DENSITY_SELECTORS` × `DENSITY_SPACING` — with TWO arms, and `BLUR_SEAM_COMPLETE` and
 *  `COLORIZATION_SEAM_COMPLETE` each cover their 2 members with ONE carrier writing 2 declarations. Twelve
 *  declared members in all, across the three seams.
 *
 *  THIS COMMENT PROMISED `CLIENT_BLUR_FILL.size * 2` = 4 FOR ONE LEG TOO LONG, over constants the same
 *  commit had shrunk to 2 — a retired expression, in the retired shape, contradicted by the
 *  `ONE CARRIER EACH` note five lines below it (the CSS unit-2 verifier review ledger row 4).
 *
 *  A health row that wants ONE seam incomplete overrides ONE of these; every other row spreads them so the
 *  coverage arm is silent and whatever else the row exercises is the only thing its count can be about. */
const DENSITY_ARM = (selector: string): string =>
  `${selector} { --spacing-field: 0.25rem; --spacing-row: 0.375rem; --spacing-block: 0.5rem; --spacing-section: 1rem; }\n`;
const DENSITY_COMPLETE = `[data-surface-tier="base"] { color: red; }\n${DENSITY_ARM('[data-density="comfortable"]')}${DENSITY_ARM('[data-density="compact"]')}`;
// ONE CARRIER EACH, and the shrink is the point (#2305). While the health arm counted DECLARATIONS these
// fixtures had to invent a second arbitrary carrier apiece — a duplicate `:root` block and a made-up
// `[data-theme-colorization][data-x]` — purely to reach a factor that named no vocabulary. The arm now asks
// COVERAGE of the declared member sets, so one honest carrier writing every member is the complete seam.
export const BLUR_SEAM_COMPLETE = ":root { --blur-fill-chrome: 1px; --blur-fill-dense: 1px; }\n";
export const COLORIZATION_SEAM_COMPLETE =
  "[data-theme-colorization] { --color-border: color-mix(in oklab, black, white); --color-sidebar-border: color-mix(in oklab, black, white); }\n";
export const CLIENT_SEAMS_COMPLETE = `${BLUR_SEAM_COMPLETE}${COLORIZATION_SEAM_COMPLETE}`;

/** Five nonempty homes WITH every runtime-writer namespace and seam complete: the shape in which the
 *  health policy is silent, so a row that adds one defect measures exactly that defect. */
export const HEALTHY_HOMES: Readonly<Record<string, string>> = {
  ...CLEAN_PRODUCT_CSS,
  [THEME]: THEME_FAMILIES,
  [TIERS]: DENSITY_COMPLETE,
  [CLIENT_GLOBALS]: CLIENT_SEAMS_COMPLETE,
};

/** Five homes carrying NO class and NO data-attribute selector at all — the zero-hook census. */
export const HOOKLESS_HOMES: Readonly<Record<string, string>> = {
  [THEME]: "@theme {\n  --color-background: black;\n}\n",
  [UI_GLOBALS]: ":root { font-size: 100%; }\n",
  [TIERS]: ":root { --probe-tier: 0; }\n",
  [CLIENT_GLOBALS]: ":root { --probe-client: 0; }\n",
  [SHELL]: ":root { view-transition-name: none; }\n",
};

/** A live client JSX class producer, for a row that must give a shell hook a real writer. */
export function shellClassProducer(...classes: readonly string[]): string {
  return `export const shellProbe = <div className=${JSON.stringify(classes.join(" "))} />;\n`;
}
