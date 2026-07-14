// The section-registry contract (client-architecture-lockdown.md §6a) — a rail section as ONE
// co-located definition that absorbs the six parallel maps (rail entry · panel defaults · placeholder
// copy · CONTEXT model · list/content/header render). Homed here in state/ because it binds the shell
// vocabulary state owns (SectionId/PanelName/PanelMode — §5 rule 5) to the render + context shapes; a
// feature imports it DOWN, the composition root assembles the registry (M1.cutover). The app-shell
// `RailSectionEntry` / `SectionPlaceholderCopy` shapes are its TEMPORARY twins until the cutover
// collapses the parallel maps into the registry here. Not a store (no mint) — a pure contract module,
// the `chat-handle.ts` precedent for a types-and-shapes file in the state tier.

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve LucideIcon fine (the character-card-facets.ts precedent).
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { ContextDefinition } from "#lib";
import type { PanelMode, PanelName, SectionId } from "./shell-store";

// The rail's section groups, in divider order — the `--spacing-section` grouping. Module-local until a
// consumer needs the tuple (app-shell's SECTION_GROUPS is the temporary twin the cutover collapses here).
const SECTION_GROUPS = ["primary", "authoring", "insight"] as const;
/** The rail's section-group axis, derived from the SECTION_GROUPS tuple (no inline re-spell). */
export type SectionGroup = (typeof SECTION_GROUPS)[number];

/** A section's rail-button identity + mobile-tab curation (the RAIL_SECTIONS entry). */
export interface RailEntry {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly group: SectionGroup;
  /** Only mobilePrimary sections show in the mobile bottom-tab bar; the rest fold into the You sheet. */
  readonly mobilePrimary?: boolean;
}

/** A section's honest placeholder copy — a distinct (title, description) per section (gate-checked). */
export interface SectionPlaceholderCopy {
  readonly title: string;
  readonly description: string;
}

/** A rail section as ONE definition. `S` = the section's CONTEXT-state projection (O5 strict; `void`
 *  for a section whose context reads no shared state). A section with neither a real `content` pane nor
 *  the DECLARED-PLANNED arm is the refinery bug — structurally impossible here. */
export interface SectionDefinition<S = void> {
  readonly id: SectionId;
  readonly rail: RailEntry;
  /** The boot-default panel modes; the persisted per-panel override wins thereafter. */
  readonly panelDefaults: Record<PanelName, PanelMode>;
  readonly placeholder: SectionPlaceholderCopy;
  readonly list?: () => ReactNode;
  /** REQUIRED — a real content pane, or the DECLARED-PLANNED arm (`{ planned: "<reason>" }`). */
  readonly content: (() => ReactNode) | { readonly planned: string };
  readonly header?: () => ReactNode;
  /** REQUIRED — `{ kind: "none" }` is an explicit decision, never an absence. */
  readonly context: ContextDefinition<S>;
}
