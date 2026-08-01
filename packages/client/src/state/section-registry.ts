// The section-registry contract (client-architecture-lockdown.md §6a) — a rail section as ONE
// co-located definition that absorbs the six parallel maps (rail entry · panel defaults · placeholder
// copy · CONTEXT model · list/content/header render). Homed here in state/ because it binds the shell
// vocabulary state owns (SectionId/PanelName/PanelMode — §5 rule 5) to the render + context shapes; a
// feature imports it DOWN, the composition root (main.tsx) assembles the registry. Not a store (no mint)
// — a pure contract module, the `chat-handle.ts` precedent for a types-and-shapes file in the state tier.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { ContextDefinition } from "#lib";
import type { PanelMode, PanelName, SectionId } from "./shell-store";

// The rail's section groups, in divider order — the `--spacing-section` grouping: primary (everyday
// collections) · authoring (create/refine) · insight (analyze). The ONE home for the group axis (state
// owns shell vocabulary, §5 rule 5): the rail consumes these values for its divider order (importing DOWN
// from #state), and `ChromeEntry.group` derives its type from `SectionGroup` — no second spelling anywhere.
export const SECTION_GROUPS = ["primary", "authoring", "insight"] as const;
/** The rail's section-group axis, derived from the SECTION_GROUPS tuple (no inline re-spell). */
export type SectionGroup = (typeof SECTION_GROUPS)[number];

/** A rail entry's mobile fate — an EXPLICIT decision (shell-chrome-unification.md §A): `"tab"` = a
 *  curated thumb-reach bottom-bar tab, `"sheet"` = folds into the mobile You sheet. Homed here with the
 *  rail's other vocabulary (SECTION_GROUPS) so `chrome-registry.ts` derives `ChromeEntry.mobile` from it
 *  the same one-directional way it derives `group` from `SectionGroup` — no second spelling, no cycle. */
export type MobileCuration = "tab" | "sheet";

// The rail's two chrome zones, in DOM order — the ONE home for the rail-zone axis (state owns shell
// vocabulary, §5 rule 5). `chrome-registry.ts` DERIVES `CHROME_ZONES` from this tuple (the one-directional
// direction it already imports in), so the two can never disagree. `rail.brand` is the BRAND CELL at the
// top of the rail: the Weave glyph, which the HOME section claims as its affordance (home-section-spec
// §4.1) — that is how app-shell navigates home without ever spelling `"home"`.
export const RAIL_ZONES = ["rail.nav", "rail.brand"] as const;
/** Which rail slot a section's affordance renders in. @defaultValue "rail.nav" */
export type RailZone = (typeof RAIL_ZONES)[number];

/** A section's rail-button identity + mobile-tab curation. */
export interface RailEntry {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly group: SectionGroup;
  /** The section's bottom-tab-vs-You-sheet fate — an EXPLICIT decision per section: `"tab"` shows it in
   *  the mobile bottom bar, `"sheet"` folds it into the You sheet. */
  readonly mobile: MobileCuration;
  /** Which rail slot this section's affordance lives in. Absent ⇒ `"rail.nav"` (a normal icon button in
   *  its `group`). `"rail.brand"` claims the brand cell — at most one section may, and it gets NO nav
   *  button (one affordance per section, never two). */
  readonly zone?: RailZone;
}

/** A section's declared PANEL CAPABILITY — the shell's "this section has no such pane" arm (owner
 *  decision H3 / arm L-b). Absent ⇒ the section has both panels, exactly as every section does today.
 *  `"unavailable"` is NOT a fourth `PanelMode`: the panel resolves `collapsed` (its track is already
 *  zero-width) and the topbar renders NO toggle for it, so the shell can never offer a door onto a
 *  surface that does not exist ("Home list — this surface isn't wired yet"). */
export interface SectionPanelAvailability {
  readonly list?: "unavailable";
}

/** A section's honest placeholder copy — a distinct (title, description) per section (gate-checked). */
export interface SectionPlaceholderCopy {
  readonly title: string;
  readonly description: string;
}

/** A rail section as ONE definition. `context` is the NON-generic `ContextDefinition` (§6b) — a `tabs`
 *  host mints its own projection via `defineContextTabs<S>`, so `S` never crosses this seam. A section
 *  with neither a real `content` pane nor the DECLARED-PLANNED arm is the refinery bug — structurally
 *  impossible here. */
export interface SectionDefinition {
  readonly id: SectionId;
  readonly rail: RailEntry;
  /** Which panels this section HAS at all (H3 / arm L-b). Absent ⇒ both, as today. */
  readonly panels?: SectionPanelAvailability;
  /** The boot-default panel modes; the persisted per-panel override wins thereafter. */
  readonly panelDefaults: Record<PanelName, PanelMode>;
  readonly placeholder: SectionPlaceholderCopy;
  readonly list?: () => ReactNode;
  /** Content for the LIST panel's `.shell-panel-header` chrome band (north-star §4 N2, D66 A1) — the
   *  section title/count + the panel's ONE primary action. Definition-owned so the domain-agnostic shell
   *  never names a feature; absent ⇒ the band renders empty-but-present (the P1 baseline horizon). */
  readonly listHeader?: () => ReactNode;
  /** REQUIRED — a real content pane, or the DECLARED-PLANNED arm (`{ planned: "<reason>" }`). */
  readonly content: (() => ReactNode) | { readonly planned: string };
  readonly header?: () => ReactNode;
  /** REQUIRED — `{ kind: "none" }` is an explicit decision, never an absence. */
  readonly context: ContextDefinition;
}
