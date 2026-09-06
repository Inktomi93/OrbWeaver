// THE VARIANT-ARM MATRIX — population + scope record (task #19 instance 3, lane cb-variant-axis).
// This header IS the design artifact for the suite family (variant-arm-matrix.{def,plan,stories,suite,parity}).
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────────
// packages/ui carries ~40 variants.ts files whose tv() axes (intent/tone/size/shape/…) each pick a
// DIFFERENT rendered outcome — `intent="destructive"` is a different colour pair from `intent="primary"`,
// and a danger arm can fail contrast while the default passes. design-audit judges whichever arms happen
// to render on the surfaces it visits and cannot say which those were; per-primitive CTs test behaviour,
// not every arm's appearance. Nothing at any tier rendered every arm and judged it — until this suite.
//
// ── THE SCOPE SPLIT (state it, never conflate it) ──────────────────────────────────────────────────
// • This CT suite answers "DOES THIS ARM FAIL INTRINSICALLY": each arm is rendered in isolation on the
//   token background, under each shipped theme, and judged with design-audit's own pure check kernels.
//   It is the ratchet that catches a bad arm BEFORE any surface adopts it.
// • The LIVE audit (pnpm snap <route> --design-audit) answers "ON THIS SURFACE": composition-dependent verdicts —
//   text-over-art above all — belong to it and are deliberately OUT OF SCOPE here.
//
// ── ARCHITECTURE (chosen), with the rejected alternatives ─────────────────────────────────────────
// CHOSEN: arms are DERIVED AT RUNTIME from the tv() objects themselves. tailwind-variants 3.2.2 exposes
// `component.variants` / `.defaultVariants` / `.variantKeys` on every tv result (verified against
// node_modules dist/chunk-RZF76H2U.js:250 + dist/types.d.ts:180-184 — typed, not just runtime), so the
// axis/value enumeration reads the SAME object the component renders with. A new arm value added to a
// variants.ts is rendered by the suite AUTOMATICALLY — value-level parity is by construction, and the
// only hand-authored surface is (a) which tv exports are storied and (b) how one arm renders (required
// props/children). The parity suite closes (a): every tv export discovered on disk must be storied here
// or withheld BY NAME below, loud in the missing direction.
//   REJECTED — ts-morph source parity: `as const satisfies` blinds ts-morph initializers (shared-memory
//   as-const-satisfies-blinds-ts-morph-initializer), needs a planted control per shape, and re-derives
//   what the runtime object already states. Runtime introspection is strictly stronger; proven against
//   all 40 files (every variants.ts imports clean in node, zero failures — 2026-09-01 survey).
//   REJECTED — reusing COLLECT_SAMPLES_JS (the design-audit in-page walker) as the gatherer: it is
//   page-scoped (attribution of samples to arms needs selector archaeology), heavyweight per mount
//   (settle observers, reveal scrolls), and ops/walker/** is under active rework by a sibling lane
//   (cb-state-paint) this era. The suite instead gathers RAW facts itself (computed values only) and
//   feeds the instrument's OWN judgment kernels — every threshold, exemption and composite lives in
//   @orb/tooling (checks-* + _shared/wcag), never re-derived here. Where a rule's INPUT itself requires
//   walker-derived machinery (hit-extent probing, sanctioned-carrier tagging), the rule is WITHHELD by
//   name rather than fed a forked derivation — see JUDGED/WITHHELD below.
//
// ── ENVIRONMENT AXES ───────────────────────────────────────────────────────────────────────────────
// • THEME: all THREE shipped themes — hearth (the ABSENCE of data-theme; setting data-theme="hearth"
//   silently falls through to :root, #875 F2), light, mocha. The brief said "light + dark"; the owner
//   corrected that frame 2026-08-30 (shared-memory light-theme-polarity-receipts): a "both themes"
//   receipt silently skips Mocha. Deviation taken with that receipt.
// • STATE: rest AND disabled, on the six renderers that take `ctx.disabled` (button/input/select/
//   slider/switch/toggle — stories.tsx RENDERERS). Un-parked at #1016 once both blockers the first
//   measured run found were answered: the shared classifier is ancestor-aware (#1005), and the <3:1
//   advisory — which fires on STANDARD disabled dimming by design — is now handled the way the CLI
//   already handles a P3 (`ops/run.ts` fail-on floor via `isAtOrAboveSeverity`): TALLIED and PRINTED in
//   the accounting annotation, never failing the arm. A SEVERITY FLOOR, not a new bucket and not a
//   baseline: the row stays visible, and its own planted control (a 1.00:1 disabled twin in
//   VariantArmContrastProbe) proves it still appears.
// • Pointer: the CT default (fine). The coarse tap-target floor already has its own suite
//   (touch-target-floor.suite.ct.tsx); see WITHHELD.
//
// ── RULE SCOPE (all 16 arm-dependent rules from the 2026-08-31 audit accounted for) ────────────────
// JUDGED here, via the @orb/tooling/ui-audit front door: contrast · gray-on-color ·
// control-aspect · text-below-ramp · undersized-ui-text (plus the checkTextStyle
// riders: tight-leading, all-caps-body, justified-text, wide-tracking, crushed-tracking, line-length).
// OUT OF SCOPE by design: text-over-art (composition-dependent — the live audit owns it).
// WITHHELD, each by name with its mechanism reason (asserted in the parity suite so none can rot
// silently): see WITHHELD_RULES below.
//
// ── ACCOUNTING LAW (same as everything else) ───────────────────────────────────────────────────────
// Per rule, per component: candidates = arm cells × environments; every cell lands in exactly one of
// judged / withheld (measurement refused — image-layer backdrop, unresolved base, mid-animation box) /
// excluded (a measurement proving inapplicability — no text subject, no silhouette role, active control
// for the inactive rule). candidates = judged + withheld + excluded is ASSERTED per test. Absence of
// measurement = withheld, never excluded. Unstoried components are withheld BY NAME here, never
// invisible. Zero findings across all arms is the expected SUCCESS; the planted probe arm (stories)
// proves the pipeline CAN fail.
//
// Import direction: tests → @orb/tooling is legal (orchestrator-verified 2026-09-01; the imports:depcruise
// stage cruises `packages tooling` only, and 38 tests/ precedents exist incl. tests/support/ct/
// pixel-contrast.ts importing @orb/tooling/_shared/wcag for exactly this kernel). tv objects are deep-
// imported RELATIVELY from packages/ui/src (the @orb/ui exports map does not re-export variants; the
// house precedent is tests/ui/stream/snap.test.ts:15). packages/ui/src stays READ-ONLY to this suite.

import type { DesignAuditRuleId } from "@orb/tooling/ui-audit";
import { badgeVariants } from "../../packages/ui/src/primitives/badge/variants.ts";
import { buttonVariants } from "../../packages/ui/src/primitives/button/variants.ts";
import { cardVariants } from "../../packages/ui/src/primitives/card/variants.ts";
import { checkboxVariants } from "../../packages/ui/src/primitives/checkbox/variants.ts";
import { emptyStateVariants } from "../../packages/ui/src/primitives/empty-state/variants.ts";
import { highlightedTextVariants } from "../../packages/ui/src/primitives/highlighted-text/variants.ts";
import { inputVariants } from "../../packages/ui/src/primitives/input/variants.ts";
import { listRowVariants } from "../../packages/ui/src/primitives/list-row/variants.ts";
import { pickerCellVariants } from "../../packages/ui/src/primitives/picker-cell/variants.ts";
import { selectVariants } from "../../packages/ui/src/primitives/select/variants.ts";
import { sliderVariants } from "../../packages/ui/src/primitives/slider/variants.ts";
import { statusChipVariants } from "../../packages/ui/src/primitives/status-chip/variants.ts";
import { switchVariants } from "../../packages/ui/src/primitives/switch/variants.ts";
import { textVariants } from "../../packages/ui/src/primitives/text/variants.ts";
import { toggleVariants } from "../../packages/ui/src/primitives/toggle/variants.ts";
// Imported beside the re-export below because shapes in THIS file use them (a bare `export … from`
// re-exports without binding locally — the contract/samples.ts lesson).
import type { StoryKey, ThemeArm } from "./variant-arm-matrix.keys.ts";

/** The runtime introspection surface of a tv() result (typed by tailwind-variants' own TVReturnType —
 *  dist/types.d.ts:180-184 declares `variants`/`defaultVariants` on the component). Values are class
 *  payloads (string | string[] | slot record); only the KEYS are read here. */
export interface TvIntrospection {
  readonly variants: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly defaultVariants: Readonly<Record<string, unknown>>;
}

/** Narrow a tv export to its introspection surface, loudly. A tv() without a variants block (or a
 *  non-tv export) is a STORY AUTHORING ERROR, not a silent skip. */
export function introspectTv(candidate: unknown, name: string): TvIntrospection {
  const record = candidate as { readonly variants?: unknown; readonly defaultVariants?: unknown };
  if (typeof candidate !== "function" || typeof record.variants !== "object" || record.variants === null) {
    throw new Error(`variant-arm-matrix: "${name}" is not a tv() result with a variants block — story table is stale`);
  }
  return {
    variants: record.variants as TvIntrospection["variants"],
    defaultVariants: (typeof record.defaultVariants === "object" && record.defaultVariants !== null
      ? record.defaultVariants
      : {}) as TvIntrospection["defaultVariants"],
  };
}

export interface VariantArmStoryDef {
  /** Story key — the keys-module vocabulary; renderers `satisfies Record<StoryKey, …>`, so def ↔
   *  renderer drift is a COMPILE error (the three-way pin, variant-arm-matrix.keys.ts). */
  readonly key: StoryKey;
  /** Source path relative to packages/ui/src — the parity suite joins this against the disk census. */
  readonly source: string;
  /** The exported tv identifier inside that source file. */
  readonly exportName: string;
  readonly tv: TvIntrospection;
  /** Renders a disabled twin per arm cell — the inactive-control-legibility subject. */
  readonly supportsDisabled: boolean;
  /** The renderer is GUARANTEED to paint direct text in every arm — makes a zero-text gather a loud
   *  instrument failure instead of a silent "excluded". False only where the control genuinely renders
   *  no text node (Switch, Input). */
  readonly expectText: boolean;
}

interface DefArgs extends Omit<VariantArmStoryDef, "tv"> {
  readonly tv: unknown;
}

const def = (args: DefArgs): VariantArmStoryDef => ({
  ...args,
  tv: introspectTv(args.tv, `${args.source}::${args.exportName}`),
});

/** v1 storied set — the components whose axes carry the arm-dependent COLOUR pairs and text/box steps
 *  (badge/button/toggle/text are the flagship intent/tone carriers). Growth path: story a withheld row,
 *  move it up here, delete its withheld entry — the parity suite REDs any drift in either direction. */
export const VARIANT_ARM_STORY_DEFS: readonly VariantArmStoryDef[] = [
  def({ key: "badge", source: "primitives/badge/variants.ts", exportName: "badgeVariants", tv: badgeVariants, supportsDisabled: false, expectText: true }),
  def({ key: "button", source: "primitives/button/variants.ts", exportName: "buttonVariants", tv: buttonVariants, supportsDisabled: true, expectText: false }),
  def({ key: "card", source: "primitives/card/variants.ts", exportName: "cardVariants", tv: cardVariants, supportsDisabled: false, expectText: true }),
  // STORIED FROM #1110, the run that gave it a variants block at all. Its `tone` axis is COLOUR-BEARING
  // (the quiet arm swaps the checked fill off the accent onto `foreground/55`), which is exactly the class
  // this matrix exists to judge before a surface adopts it — the Switch `tone` precedent one row down.
  def({
    key: "checkbox",
    source: "primitives/checkbox/variants.ts",
    exportName: "checkboxVariants",
    tv: checkboxVariants,
    supportsDisabled: true,
    expectText: false,
  }),
  def({
    key: "empty-state",
    source: "primitives/empty-state/variants.ts",
    exportName: "emptyStateVariants",
    tv: emptyStateVariants,
    supportsDisabled: false,
    expectText: true,
  }),
  def({
    key: "highlighted-text",
    source: "primitives/highlighted-text/variants.ts",
    exportName: "highlightedTextVariants",
    tv: highlightedTextVariants,
    supportsDisabled: false,
    expectText: true,
  }),
  def({ key: "input", source: "primitives/input/variants.ts", exportName: "inputVariants", tv: inputVariants, supportsDisabled: true, expectText: false }),
  def({
    key: "list-row",
    source: "primitives/list-row/variants.ts",
    exportName: "listRowVariants",
    tv: listRowVariants,
    supportsDisabled: false,
    expectText: true,
  }),
  def({
    key: "picker-cell",
    source: "primitives/picker-cell/variants.ts",
    exportName: "pickerCellVariants",
    tv: pickerCellVariants,
    supportsDisabled: false,
    expectText: true,
  }),
  def({ key: "select", source: "primitives/select/variants.ts", exportName: "selectVariants", tv: selectVariants, supportsDisabled: true, expectText: false }),
  def({ key: "slider", source: "primitives/slider/variants.ts", exportName: "sliderVariants", tv: sliderVariants, supportsDisabled: true, expectText: true }),
  def({
    key: "status-chip",
    source: "primitives/status-chip/variants.ts",
    exportName: "statusChipVariants",
    tv: statusChipVariants,
    supportsDisabled: false,
    expectText: true,
  }),
  def({ key: "switch", source: "primitives/switch/variants.ts", exportName: "switchVariants", tv: switchVariants, supportsDisabled: true, expectText: false }),
  def({ key: "text", source: "primitives/text/variants.ts", exportName: "textVariants", tv: textVariants, supportsDisabled: false, expectText: true }),
  def({ key: "toggle", source: "primitives/toggle/variants.ts", exportName: "toggleVariants", tv: toggleVariants, supportsDisabled: true, expectText: true }),
];

/** Every tv export with a variants block that v1 does NOT story — BY NAME, with the reason, keyed
 *  "source::export". The parity suite asserts storied ∪ withheld === the on-disk census exactly, so a
 *  new variants.ts (or a new tv export in an old one) REDS until it is placed in one of the two sets. */
export const WITHHELD_VARIANT_SOURCES: Readonly<Record<string, string>> = {
  "art/web-weave/variants.ts::webWeaveVariants": "decorative art canvas — no judged-rule subject (no text/control); interactive axis is pointer plumbing",
  "charts/chart/variants.ts::chartVariants": "chart shell needs seeded series data to render — story in a charts wave",
  "charts/meter/variants.ts::arcMeterVariants":
    "meter arms need value/threshold data props — story in a charts wave (danger axis IS colour-bearing; first candidate)",
  "charts/meter/variants.ts::bipolarMeterVariants": "meter arms need value/threshold data props — story in a charts wave",
  "charts/meter/variants.ts::linearMeterVariants": "meter arms need value/threshold data props — story in a charts wave",
  "charts/meter/variants.ts::meterVariants": "dispatch wrapper over the three meter kinds above — covered when they are",
  "charts/meter/variants.ts::segmentedClockVariants": "meter arms need value/threshold data props — story in a charts wave",
  "charts/meter/variants.ts::trackBarVariants": "meter arms need value/threshold data props — story in a charts wave (accent axis IS colour-bearing)",
  "charts/meter/variants.ts::waystoneVariants": "meter arms need value/threshold data props — story in a charts wave",
  "charts/stat-figure/variants.ts::statFigureVariants": "needs stat/delta data props — story in a charts wave (direction axis is colour-bearing)",
  "content/theme-swatch/variants.ts::themeSwatchVariants": "renders a THEME's own palette preview — judging it against the ambient theme is a category error",
  "diff/variants.ts::diffSegmentVariants":
    "kind axis is colour-bearing but segments render only inside the diff view's structured model — story with a diff fixture",
  "layout/variants.ts::containerVariants": "spacing/geometry axes only — no judged-rule subject changes across arms",
  "layout/variants.ts::gridVariants": "spacing/geometry axes only",
  "layout/variants.ts::rowVariants": "spacing/geometry axes only",
  "layout/variants.ts::sectionVariants": "spacing/geometry axes only",
  "layout/variants.ts::stackVariants": "spacing/geometry axes only",
  "primitives/avatar/variants.ts::avatarVariants":
    "size/shape/aspect are box axes; ring=accent is a decor arm — story when the decor rule family is judgeable (see WITHHELD_RULES)",
  "primitives/collapsible/variants.ts::collapsibleVariants": "open/close animation state dominates — needs a settled-state harness",
  "primitives/command/variants.ts::commandVariants": "palette requires the command dialog open flow — story with the popup wave",
  "primitives/compare-blocks/variants.ts::compareBlocksVariants":
    "decision axis is colour-bearing but needs the two-block comparison model — story with a fixture",
  "primitives/crossfade-image/variants.ts::crossfadeImageVariants": "image media — no text/control subject; buried-raster class is the live audit's",
  "primitives/dialog/variants.ts::dialogVariants": "portal/overlay mount — needs the open flow; size axis is geometry",
  "primitives/drawer/variants.ts::drawerVariants": "portal/overlay mount — needs the open flow; side axis is geometry",
  "primitives/field/variants.ts::fieldVariants": "orientation/multiline are layout axes over a composed control — the composed controls are storied directly",
  "primitives/log-viewer/variants.ts::logViewerVariants":
    "level axis is colour-bearing but rows render inside the virtualized viewer — story with a log fixture",
  "primitives/media-tile-grid/variants.ts::mediaTileGridVariants": "media grid needs tile assets; over-art verdicts are the live audit's",
  "primitives/number-field/variants.ts::numberFieldVariants": "size axis duplicates input's field/inline pair around the same input chrome — input is storied",
  "primitives/option-strip/variants.ts::optionStripVariants":
    "its one axis (highlighted) is interaction-state-driven (aria-activedescendant), not a prop — needs a driven harness",
  "primitives/save-bar/variants.ts::saveBarVariants": "sticky positioning chrome — geometry axis only",
  "primitives/selection-bar/variants.ts::selectionBarVariants": "sticky/floating placement chrome — geometry axis only",
  "primitives/separator/variants.ts::separatorVariants": "orientation axis on a 1px rule — no judged-rule subject",
  "primitives/series-row/variants.ts::seriesRowVariants":
    "divider[true] is a hairline-geometry axis — no judged-rule subject (caught by the parity suite's own first run)",
  "primitives/skeleton/variants.ts::skeletonVariants": "placeholder shimmer — no text/control subject",
  "primitives/table/variants.ts::tableVariants": "density/align/sortActive need a populated table model — story with a table fixture",
  "primitives/tabs/variants.ts::tabsVariants": "layout axis is geometry; tab colour states are selection-driven, not arms",
  "primitives/toast/variants.ts::toastVariants": "placement axis needs the toast viewport/provider flow — story with the popup wave",
};

// The theme axis is homed in the keys module (the pure vocabulary home) — re-exported here so the
// suite's population imports stay one door.
export type { ThemeArm } from "./variant-arm-matrix.keys.ts";
export { THEME_ARMS } from "./variant-arm-matrix.keys.ts";

/** A REAL product defect the matrix found, pinned two-sided until its owning fix lands: the suite stays
 *  green on the KNOWN defect (this is not an allowlist — any OTHER finding still reds), AND the row
 *  itself reds when the defect stops reproducing, forcing its deletion in the fixing commit. Every row
 *  is dated, counted (a partial fix reds), and carries its receipt. */
export interface ExpectedFinding {
  readonly story: StoryKey;
  readonly theme: ThemeArm;
  readonly rule: DesignAuditRuleId;
  /** Every substring must appear in the finding's selector (the arm identity). */
  readonly cellContains: readonly string[];
  /** Exactly how many cells this defect occupies. */
  readonly count: number;
  readonly reason: string;
}

// EMPTY, AND IT EARNED IT TWICE. A row lived here for exactly as long as its defect did: the first
// disabled-axis run (#1016) measured a disabled Slider's label at 3.19:1 under light, the row pinned it
// two-sided, and when the owning fix landed the SAME DAY (ARM B — the shared classifier now derives a
// text's inactive kind from a control that NAMES it, and reads Base UI's [data-disabled] composite
// spelling: tooling/src/_shared/wcag.ts) the row went RED exactly as designed — "EXPECTED-FINDING row no
// longer matches its defect", matched 0 of 3 — and was deleted in the fixing commit. That red IS the
// mechanism working; a row that could not produce it would be an allowlist.
//
// This suite's first run (2026-09-01) found a real arm-intrinsic
// defect — Badge intent=primary tone=soft under LIGHT only: primary ink over its own 15% tint at
// 3.97:1 (< AA 4.5:1) at all three sizes, Hearth/Mocha passing — and the row pinned here carried it
// two-sided until the owner routed the token fix to a parallel lane the same hour, at which point a
// self-retiring pin would red on arrival, so the row came out and the suite expects the arm to PASS.
// A row enters this table ONLY on an orchestrator ruling that the fix is NOT being routed now; every
// row is dated, count-exact, and carries its full repro inline (the badge episode is the template).
export const EXPECTED_FINDINGS: readonly ExpectedFinding[] = [];

/** Rules this suite judges (kernels imported from @orb/tooling/ui-audit — never re-derived math). */
export const JUDGED_RULES: readonly DesignAuditRuleId[] = [
  "contrast",
  "gray-on-color",
  "control-aspect",
  "text-below-ramp",
  "undersized-ui-text",
  // JUDGED since #1016 (was withheld while the disabled axis was parked). It is a P3, so it rides the
  // suite's severity floor: counted in the per-rule accounting and printed as an advisory, never a fail.
  "inactive-control-legibility",
];

/** Composition-dependent — the live audit owns it (scope split, header). */
export const OUT_OF_SCOPE_RULES: readonly DesignAuditRuleId[] = ["text-over-art"];

/** Arm-dependent rules v1 WITHHOLDS, by name, with the mechanism reason. The parity suite asserts
 *  JUDGED ∪ OUT_OF_SCOPE ∪ keys(WITHHELD_RULES) covers the audited arm-dependent set exactly. */
export const WITHHELD_RULES: Readonly<Record<string, string>> = {
  "off-theme-font":
    "FontCensusInput is mid-rework on this very tree (uncommitted: faces + probeUsable, the glyph-metric availability probe of ops/walker/census-text.ts) — its input now REQUIRES walker-derived measurement; re-judge when the #23 shape lands",
  "hover-contrast":
    "transient-state forcing (CDP force + data-* twin scan) is walker machinery under active rework (cb-state-paint); checks-hover is not front-door-exported",
  "quiet-state":
    "checkQuietState is not exported from the ui-audit front door (a one-line tooling export, out of this lane's fence), and the on/off pair needs driven state",
  "glow-shadow":
    "the `sanctioned` carrier flag is derived in ops/walker/census-glow.ts (under cb-state-paint rework) — feeding sanctioned=false would false-positive every owner effect carrier",
  "radial-halo": "same sanctioned-carrier derivation as glow-shadow",
  "radial-spotlight-glow": "same sanctioned-carrier derivation as glow-shadow",
  "border-accent-on-rounded":
    "badgeLike/tabContext/statusContext/selectionRail are walker-derived carrier flags (ops/walker/census-decor.ts, under rework) — a thin re-spelling forks the mechanism being fixed",
  "side-tab": "same walker-derived carrier flags as border-accent-on-rounded",
  "tap-target":
    "the effective hit box needs the walker's hit-extent probe (::before touch-target union, elementFromPoint rings); the coarse floor is already covered per size arm by tests/ui/touch-target-floor.suite.ct.tsx",
};
