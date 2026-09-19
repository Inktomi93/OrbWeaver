// The seven historical appearance invariants #953 must reach in the rated browser matrix. Selectors live
// beside the carrier contract, never in tooling: the client owns which rendered subjects carry its law.
// This is deliberately a literal policy, not a generic appearance DSL or a second matrix planner.

const APPEARANCE_HISTORICAL_ROW_IDS = [
  "compact-portal-carried",
  "dark-name-time-short-bubble",
  "light-art-scrim-glass-elevation",
  "mobile-compact-large-document",
  "hover-pointer",
  "density-preview",
  "opposite-os-app-prepaint",
] as const;

type AppearanceHistoricalRowId = (typeof APPEARANCE_HISTORICAL_ROW_IDS)[number];

const CASCADE_SOURCES = ["client-global", "dynamic", "generated-theme", "inline", "owner-custom-css", "shell", "ui-global", "ui-tier"] as const;
type AppearanceExpectedCascadeSource = (typeof CASCADE_SOURCES)[number];

interface AppearanceHistoricalSubject {
  readonly id: string;
  readonly selector: string;
  readonly population: "one" | "many";
  readonly sample: "carrier" | "geometry" | "interactive" | "pixel";
}

export interface AppearanceHistoricalCascade {
  readonly selector: string;
  readonly property: string;
  readonly sources: readonly AppearanceExpectedCascadeSource[];
  readonly overloadedSources?: readonly AppearanceExpectedCascadeSource[];
}

type AppearanceHistoricalMerge =
  | {
      readonly mechanism: "merge-required";
      readonly selector: string;
      readonly owner: string;
      readonly conflict: { readonly axis: string; readonly loser: string; readonly winner: string };
    }
  | {
      readonly mechanism: "merge-not-applicable";
      readonly reason: "direct-carrier";
      readonly selector: string;
      readonly owner: string;
    };

export interface AppearanceHistoricalRow {
  readonly id: AppearanceHistoricalRowId;
  readonly surface: "chat" | "config-sizing" | "shell";
  readonly subjects: readonly AppearanceHistoricalSubject[];
  readonly cascade: readonly AppearanceHistoricalCascade[];
  readonly merge: AppearanceHistoricalMerge;
  readonly requiredChecks: readonly string[];
  readonly optionalSubjectIds: readonly string[];
}

const COMMON_SCOPE = '[data-slot="theme-scope"]:has(.shell-grid)';
const GRID = ".shell-grid";
const PORTAL = '[data-slot="portal-root"]';
const POPUP = `${PORTAL} [data-slot="dialog-popup"]`;
const CARRIED_SCOPE = `${COMMON_SCOPE} [data-slot="theme-scope"]`;
const MESSAGE_ROW = '[data-slot="message-row"]';
const MESSAGE_BODY = `${MESSAGE_ROW} [data-slot="message-row-body"]`;
const BUBBLE = `${MESSAGE_ROW} [data-slot="message-bubble"]`;
const CONTENT_COLUMN = `${MESSAGE_ROW} [data-slot="message-content-column"]`;
// R2 is explicitly one ordinary short message, not a sticky attribution band; every selector is scoped
// through the same relational row so census, pixels, merge and cascade cannot judge different siblings.
const SHORT_ROW = `${MESSAGE_ROW}:has([data-slot="message-name-row"]:not([data-sticky]) [data-slot="message-attribution"]):has([data-slot="message-metadata-timestamp"])`;
const SHORT_BUBBLE = `${SHORT_ROW} [data-slot="message-bubble"]`;
const SHORT_NAME_ROW = `${SHORT_ROW} [data-slot="message-name-row"]:not([data-sticky])`;
const SHORT_ATTRIBUTION = `${SHORT_NAME_ROW} [data-slot="message-attribution"]`;
const SHORT_TIMESTAMP = `${SHORT_NAME_ROW} [data-slot="message-metadata-timestamp"]`;
const SHORT_CONTENT_COLUMN = `${SHORT_ROW} [data-slot="message-content-column"]`;
// R5 takes the same relational posture around the one ordinary row whose action cluster it reveals.
const ACTION_ROW = `${MESSAGE_ROW}:has([data-slot="message-name-row"]:not([data-sticky]) [data-slot="message-actions-row"])`;
const ACTION_BUBBLE = `${ACTION_ROW} [data-slot="message-bubble"]`;
const ACTION_NAME_ROW = `${ACTION_ROW} [data-slot="message-name-row"]:not([data-sticky])`;
const ACTIONS_SLOT = `${ACTION_NAME_ROW} [data-slot="message-actions-slot"]`;
const ACTIONS_ROW = `${ACTIONS_SLOT} [data-slot="message-actions-row"]`;
const ACTION_BUTTONS = `${ACTIONS_ROW} button:not([disabled])`;
const BACKGROUND_LAYER = '[data-slot="theme-background-layer"]';
const SCRIM = '[data-slot="theme-background-scrim"]';
const LIST_PANEL = '.shell-panel[data-panel-side="list"]';
// THE PANE'S GLASS IS NOT ON THE PANE (#1154, re-pointed at #2431). Both glass declarations — the
// backdrop-filter and the translucent tint — moved onto a `::before` fill carrier at `z-index: -1` so the
// pane itself stops being one composited layer (a backdrop-filter on the pane turns off per-paint baseline
// snapping for every text node inside it). The invariant is unchanged and so is its subject; only the box
// carrying the paint moved, so the row names the carrier the way CSS does.
const LIST_PANEL_GLASS = `${LIST_PANEL}::before`;
const LIST_PANEL_INK = `${LIST_PANEL} .shell-panel-header`;
const TOPBAR = ".shell-topbar";
const SHELL_CONTENT = ".shell-content";
// Home's expanded list deliberately leaves the wide identity wrapper empty, while the narrow title and
// Jump label trade visibility at the shell container breakpoint. This union always names real rendered
// ink without binding the invariant to either responsive arm.
const THEME_INK = ":is(.shell-topbar-title, .shell-topbar-jump-label)";
const MATRIX_FIXTURE_INK = "--orb-matrix-fixture-ink";
const DIALOG_VIEWPORT = '[data-slot="dialog-viewport"]';
// THE PREVIEW OF THE OPTION YOU HAVE NOT PICKED (#929/#1099 F9). Density's spacing art used to be ONE
// detached box following the DRAFT value; it is now folded into each option, so `[data-slot=
// "density-preview"]` alone resolves to TWO nodes and a `population: "one"` subject would be an instrument
// lying about which one it sampled. Narrowing to the UNCHECKED cell keeps both checks that lean on this
// subject saying exactly what they always said: with two options, the unchecked one is by construction the
// OPPOSITE density of the shell (`opposite-density`), and picking the other one swaps which node this
// selector resolves to — so the sampled spacing vector still changes across the mutation while the outer
// carrier and the dialog popup stay byte-stable (`token-isolation`).
const DENSITY_PREVIEW = '[data-slot="picker-cell"][aria-checked="false"] [data-slot="density-preview"]';
const STRUCTURAL_INTERACTIVES = ".shell-main :is(button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]))";

const SPACING_PROPERTIES = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"] as const;
const SPACING_SOURCES = [
  "client-global",
  "inline",
  "generated-theme",
  "owner-custom-css",
  "ui-tier",
] as const satisfies readonly AppearanceExpectedCascadeSource[];
const THEME_SOURCES = ["generated-theme", "owner-custom-css", "inline"] as const satisfies readonly AppearanceExpectedCascadeSource[];

function spacingCascade(selector: string): readonly AppearanceHistoricalCascade[] {
  return SPACING_PROPERTIES.map((property) => ({ selector, property, sources: SPACING_SOURCES }));
}

export const APPEARANCE_HISTORICAL_ROWS = [
  {
    id: "compact-portal-carried",
    surface: "config-sizing",
    subjects: [
      { id: "common-scope", selector: COMMON_SCOPE, population: "one", sample: "carrier" },
      { id: "grid", selector: GRID, population: "one", sample: "geometry" },
      { id: "portal", selector: PORTAL, population: "one", sample: "carrier" },
      { id: "dialog-viewport", selector: DIALOG_VIEWPORT, population: "one", sample: "geometry" },
      { id: "popup", selector: POPUP, population: "one", sample: "geometry" },
      // Config deliberately mounts multiple preview ThemeScopes. The outer app carrier is singular; its
      // nested carried population is not, and collapsing it to `one` makes honest preview growth fail as
      // an instrument defect.
      { id: "carried-scope", selector: CARRIED_SCOPE, population: "many", sample: "carrier" },
    ],
    cascade: [
      ...spacingCascade(GRID),
      ...spacingCascade(POPUP),
      { selector: PORTAL, property: "--color-background", sources: THEME_SOURCES },
      { selector: CARRIED_SCOPE, property: "--color-background", sources: THEME_SOURCES },
    ],
    merge: {
      mechanism: "merge-not-applicable",
      reason: "direct-carrier",
      selector: COMMON_SCOPE,
      owner: "packages/client/src/features/app-shell/surfaces/app-shell.tsx#AppShell",
    },
    requiredChecks: ["density-owner", "spacing-match", "theme-carried", "popup-contained", "popup-hit-owner", "modal-stacking", "cls-budget"],
    optionalSubjectIds: [],
  },
  {
    id: "dark-name-time-short-bubble",
    surface: "chat",
    subjects: [
      { id: "message-carrier", selector: SHORT_ROW, population: "many", sample: "carrier" },
      { id: "bubble", selector: SHORT_BUBBLE, population: "many", sample: "geometry" },
      { id: "name-row", selector: SHORT_NAME_ROW, population: "many", sample: "geometry" },
      { id: "attribution", selector: SHORT_ATTRIBUTION, population: "many", sample: "pixel" },
      { id: "timestamp", selector: SHORT_TIMESTAMP, population: "many", sample: "pixel" },
      { id: "content-column", selector: SHORT_CONTENT_COLUMN, population: "many", sample: "geometry" },
    ],
    cascade: [
      // The transparent header is an intentional absence of authored background paint, proven by the
      // semantic computed-style check below. Official cascade evidence stays on the two authored ink
      // declarations; demanding a background declaration would turn the required absence into an error.
      { selector: SHORT_ATTRIBUTION, property: "color", sources: ["client-global", "ui-global", "ui-tier", "inline"] },
      { selector: SHORT_TIMESTAMP, property: "color", sources: ["client-global", "ui-global", "ui-tier", "inline"] },
    ],
    merge: {
      mechanism: "merge-required",
      selector: SHORT_ATTRIBUTION,
      owner: "packages/client/src/features/chat/components/message-row-header.tsx#MessageRowHeader",
      conflict: { axis: "tailwind-core", loser: "items-center", winner: "items-baseline" },
    },
    requiredChecks: ["header-structure", "header-transparent", "inherited-ink", "composited-contrast", "content-contained", "bubble-hit-owner", "cls-budget"],
    optionalSubjectIds: [],
  },
  {
    id: "light-art-scrim-glass-elevation",
    surface: "shell",
    subjects: [
      { id: "art-shell", selector: `${GRID}[data-has-bg-image]`, population: "one", sample: "geometry" },
      { id: "background-layer", selector: BACKGROUND_LAYER, population: "one", sample: "geometry" },
      { id: "scrim", selector: SCRIM, population: "one", sample: "geometry" },
      { id: "list-panel", selector: LIST_PANEL, population: "one", sample: "geometry" },
      { id: "list-panel-glass", selector: LIST_PANEL_GLASS, population: "one", sample: "carrier" },
      { id: "panel-ink", selector: LIST_PANEL_INK, population: "one", sample: "pixel" },
      { id: "active-scope", selector: COMMON_SCOPE, population: "one", sample: "carrier" },
    ],
    cascade: [
      { selector: BACKGROUND_LAYER, property: "background-size", sources: ["inline", "client-global"] },
      { selector: BACKGROUND_LAYER, property: "filter", sources: ["inline", "client-global"] },
      { selector: SCRIM, property: "opacity", sources: ["inline", "client-global"] },
      { selector: LIST_PANEL, property: "background-color", sources: ["client-global"], overloadedSources: ["shell"] },
      { selector: LIST_PANEL_GLASS, property: "backdrop-filter", sources: ["client-global"] },
      { selector: COMMON_SCOPE, property: MATRIX_FIXTURE_INK, sources: ["owner-custom-css"] },
    ],
    merge: {
      mechanism: "merge-not-applicable",
      reason: "direct-carrier",
      selector: LIST_PANEL,
      owner: "packages/client/src/features/app-shell/components/panel-chrome.tsx#PanelChrome",
    },
    requiredChecks: ["art-settings", "glass-wins-elevation", "composited-contrast", "viewport-cover", "panel-contained", "art-stack", "cls-budget"],
    optionalSubjectIds: [],
  },
  {
    id: "mobile-compact-large-document",
    surface: "chat",
    subjects: [
      { id: "html", selector: "html", population: "one", sample: "carrier" },
      { id: "common-scope", selector: COMMON_SCOPE, population: "one", sample: "carrier" },
      { id: "grid", selector: GRID, population: "one", sample: "geometry" },
      { id: "main", selector: ".shell-main", population: "one", sample: "geometry" },
      { id: "topbar", selector: TOPBAR, population: "one", sample: "geometry" },
      { id: "content", selector: SHELL_CONTENT, population: "one", sample: "geometry" },
      { id: "message-row", selector: MESSAGE_ROW, population: "many", sample: "geometry" },
      { id: "message-body", selector: MESSAGE_BODY, population: "many", sample: "geometry" },
      { id: "content-column", selector: CONTENT_COLUMN, population: "many", sample: "geometry" },
      { id: "bubble", selector: BUBBLE, population: "many", sample: "geometry" },
      { id: "visible-interactives", selector: STRUCTURAL_INTERACTIVES, population: "many", sample: "interactive" },
    ],
    cascade: [
      { selector: "html", property: "--font-scale", sources: ["inline"] },
      ...spacingCascade(COMMON_SCOPE),
      { selector: BUBBLE, property: "display", sources: ["client-global", "ui-global", "ui-tier", "shell"] },
    ],
    merge: {
      mechanism: "merge-required",
      selector: MESSAGE_BODY,
      owner: "packages/client/src/features/chat/components/message-row.tsx#MessageRow",
      conflict: { axis: "tailwind-core", loser: "items-center", winner: "items-start" },
    },
    requiredChecks: [
      "environment-identity",
      "root-scale-density-layout",
      "viewport-containment",
      "horizontal-overflow",
      "touch-floor",
      "hit-owner",
      "topbar-content-separation",
      "layout-animation",
      "cls-budget",
    ],
    optionalSubjectIds: [],
  },
  {
    id: "hover-pointer",
    surface: "chat",
    subjects: [
      { id: "bubble", selector: ACTION_BUBBLE, population: "many", sample: "geometry" },
      { id: "name-row", selector: ACTION_NAME_ROW, population: "many", sample: "geometry" },
      // The wrapper is deliberately h-0: it preserves the cluster's width while contributing no phantom
      // header height. Its carrier existence is the invariant; the nested action row owns the footprint.
      { id: "actions-slot", selector: ACTIONS_SLOT, population: "many", sample: "carrier" },
      { id: "actions-row", selector: ACTIONS_ROW, population: "many", sample: "geometry" },
      { id: "action-buttons", selector: ACTION_BUTTONS, population: "many", sample: "interactive" },
      { id: "message-carrier", selector: ACTION_ROW, population: "many", sample: "carrier" },
    ],
    cascade: [
      { selector: ACTIONS_ROW, property: "opacity", sources: ["client-global", "ui-global", "ui-tier"] },
      { selector: ACTIONS_ROW, property: "pointer-events", sources: ["client-global", "ui-global", "ui-tier"] },
    ],
    merge: {
      mechanism: "merge-not-applicable",
      reason: "direct-carrier",
      selector: ACTIONS_ROW,
      owner: "packages/client/src/features/chat/lib/message-actions-reveal.ts#messageActionsRevealClass",
    },
    requiredChecks: ["rest-reveal-polarity", "footprint-stable", "coarse-door", "touch-floor", "hit-owner", "cls-zero"],
    optionalSubjectIds: [],
  },
  {
    id: "density-preview",
    surface: "config-sizing",
    subjects: [
      { id: "outer-scope", selector: COMMON_SCOPE, population: "one", sample: "carrier" },
      { id: "portal", selector: PORTAL, population: "one", sample: "carrier" },
      { id: "dialog-viewport", selector: DIALOG_VIEWPORT, population: "one", sample: "geometry" },
      { id: "dialog-popup", selector: POPUP, population: "one", sample: "geometry" },
      { id: "density-preview", selector: DENSITY_PREVIEW, population: "one", sample: "carrier" },
    ],
    cascade: [...spacingCascade(POPUP), ...spacingCascade(DENSITY_PREVIEW)],
    merge: {
      mechanism: "merge-not-applicable",
      reason: "direct-carrier",
      selector: DENSITY_PREVIEW,
      owner: "packages/client/src/features/app-shell/components/appearance-density-cards.tsx#DensityDiagram",
    },
    requiredChecks: ["opposite-density", "token-isolation", "modal-stacking", "popup-contained", "rect-stable", "persistence-isolation", "cls-budget"],
    optionalSubjectIds: [],
  },
  {
    id: "opposite-os-app-prepaint",
    surface: "shell",
    subjects: [
      { id: "prepaint-html", selector: "html", population: "one", sample: "carrier" },
      { id: "active-scope", selector: COMMON_SCOPE, population: "one", sample: "carrier" },
      { id: "portal", selector: PORTAL, population: "one", sample: "carrier" },
      { id: "carried-scope", selector: CARRIED_SCOPE, population: "one", sample: "carrier" },
      { id: "theme-ink", selector: THEME_INK, population: "many", sample: "pixel" },
    ],
    cascade: [
      { selector: COMMON_SCOPE, property: "--color-background", sources: THEME_SOURCES },
      { selector: COMMON_SCOPE, property: "color-scheme", sources: THEME_SOURCES },
      { selector: PORTAL, property: "--color-background", sources: THEME_SOURCES },
      { selector: PORTAL, property: "color-scheme", sources: THEME_SOURCES },
      { selector: COMMON_SCOPE, property: MATRIX_FIXTURE_INK, sources: ["owner-custom-css"] },
    ],
    merge: {
      mechanism: "merge-not-applicable",
      reason: "direct-carrier",
      selector: COMMON_SCOPE,
      owner: "packages/ui/src/content/theme-scope/theme-scope.tsx#ThemeScope",
    },
    requiredChecks: ["os-app-opposite", "prepaint-continuity", "theme-pixel-identity", "phase-accounting", "cls-budget"],
    optionalSubjectIds: ["carried-scope"],
  },
] as const satisfies readonly AppearanceHistoricalRow[];
