// The section-registry contract (client-architecture-lockdown.md §6a) — a rail section as ONE
// co-located definition that absorbs the six parallel maps (rail entry · panel defaults · placeholder
// copy · CONTEXT model · list/content/header render). Homed here in state/ because it binds the shell
// vocabulary state owns (SectionId/PanelName/PanelMode — §5 rule 5) to the render + context shapes; a
// feature imports it DOWN, the composition root (main.tsx) assembles the registry. Not a store (no mint)
// — a pure contract module, the `chat-handle.ts` precedent for a types-and-shapes file in the state tier.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { ContextDefinition } from "#lib";
import type { PanelMode, PanelName } from "./panel-resolve.ts";
import type { SectionId } from "./section-ids.ts";

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

// The rail's three chrome zones, in DOM order — the ONE home for the rail-zone axis (state owns shell
// vocabulary, §5 rule 5). `chrome-registry.ts` DERIVES `CHROME_ZONES` from this tuple (the one-directional
// direction it already imports in), so the two can never disagree. `rail.brand` is the BRAND CELL at the
// top of the rail: the Weave glyph, which the HOME section claims as its affordance
// — that is how app-shell navigates home without ever spelling `"home"`. `rail.end` is the FOOT
// below the spacer, where the modal triggers and the persona widget live; a SECTION may claim it too since
// the config revamp (#866 S1, owner ruling #297: Settings takes the gear's old slot) — the same
// derivation renders it there with a section's active state, and app-shell still never spells `"config"`.
export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;
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
   *  button (one affordance per section, never two). `"rail.end"` puts the button in the FOOT, after the
   *  spacer, ordered `(order, id)` among the modal triggers and widgets there (the Settings section). */
  readonly zone?: RailZone;
}

/** A section's declared PANEL CAPABILITY — the shell's "this section has no such pane" arm (owner
 *  decision H3 / arm L-b). Absent ⇒ the section has both panels, exactly as every section does today.
 *  `"unavailable"` is NOT a fourth `PanelMode`: the panel resolves `collapsed` (its track is already
 *  zero-width) and the topbar renders NO toggle for it, so the shell can never offer a door onto a
 *  surface that does not exist ("Home list — this surface isn't wired yet").
 *
 *  The axis is PER PANEL and covers BOTH: a pane-less section (home declares both) must not ship the
 *  detail-panel toggle either — nor the focus-mode toggle, which on a section with zero panels is a
 *  control whose only job is hiding panels that aren't there. (Its original tell was a cold boot reading
 *  "Exit focus mode": focus used to be DERIVED from "both panels collapsed", which zero panels trivially
 *  satisfied. That derivation is gone — focus is one flag now, item 20 — but the toggle still has nothing
 *  to act on here, so it does not render.) */
export interface SectionPanelAvailability {
  readonly list?: "unavailable";
  readonly context?: "unavailable";
}

/** A section's honest placeholder copy — a distinct (title, description) per section (gate-checked). */
export interface SectionPlaceholderCopy {
  readonly title: string;
  readonly description: string;
}

/** A section's LIST→CONTENT selection, as THE SHELL reads it — the input to the mobile ONE-SHELL rule
 *  (owner-ruled 2026-08-03: "on mobile a list-bearing section with NO selection shows its LIST as the
 *  screen; selecting pushes to CONTENT with a back row"). Before it, every section resolved its LIST to a
 *  closed sheet on a phone and landed the user on a welcome card between them and the rows they came for.
 *
 *  Declared as a subscribe/snapshot PAIR, not a hook, on purpose: the shell reads the ACTIVE section's seam
 *  inside `useShellLayout`, which resolves the panel modes for the whole frame and therefore sits ABOVE
 *  every keyed boundary. One `useSyncExternalStore(selection.subscribe, selection.hasSelection)` call keeps
 *  the HOOK IDENTITY constant while its arguments vary per section; a per-section hook would need a
 *  `key`ed remount (the `SectionContextHost` idiom) that a layout resolve cannot have, or an effect-published
 *  mirror — which lands one commit late and flashes the wrong screen on every section switch.
 *
 *  Every section that renders a `list` already owns exactly this pair (a `createDrillSelectionStore` /
 *  `createKindedSelectionStore` mint, or `active-chat-store`'s landing handle) — the seam publishes it,
 *  it does not invent a second selection home. */
export interface SectionSelection {
  /** Subscribe to the section's own selection store; returns the unsubscribe (zustand's own contract). */
  readonly subscribe: (onStoreChange: () => void) => () => void;
  /** Is a member open right now (CONTENT is showing it), as opposed to the section's welcome/overview? */
  readonly hasSelection: () => boolean;
  /** Clear it — what the shell's mobile BACK affordance fires: CONTENT pops, the LIST is the screen again. */
  readonly clear: () => void;
}

/** The LIST-slot pair. `list` and `selection` are ONE decision — the shell cannot apply the mobile
 *  list-as-screen rule to a list it cannot ask "is anything open?" — so tsc carries it: a `list` without a
 *  `selection` does not type-check, and a section with no list may declare neither. That is what makes the
 *  rule un-opt-out-able (a section must not be able to sit out the shell rule silently); `listHeader` rides
 *  the same arm because a band with no list is a band over nothing. */
interface SectionWithList {
  readonly list: () => ReactNode;
  /** Content for the LIST panel's `.shell-panel-header` chrome band (north-star §4 N2, D66 A1) — the
   *  section title/count + the panel's ONE primary action. Definition-owned so the domain-agnostic shell
   *  never names a feature; absent ⇒ the band renders empty-but-present (the P1 baseline horizon). */
  readonly listHeader?: () => ReactNode;
  readonly selection: SectionSelection;
}
interface SectionWithoutList {
  readonly list?: never;
  readonly listHeader?: never;
  readonly selection?: never;
}

/** The `useSelectionTitle` a section with nothing to name declares — the shell then prints the section
 *  label. A shared module-level hook so the field can be REQUIRED (see it on `SectionDefinitionBase`): the
 *  shell calls it unconditionally, which is what keeps the hook at the top level. */
export const NO_SELECTION_TITLE = (): null => null;

/** Everything a rail section declares that is INDEPENDENT of whether it has a LIST pane; the list slots
 *  ride the `SectionWithList | SectionWithoutList` arm the exported alias intersects in. */
interface SectionDefinitionBase {
  readonly id: SectionId;
  readonly rail: RailEntry;
  /** Which panels this section HAS at all (H3 / arm L-b). Absent ⇒ both, as today. */
  readonly panels?: SectionPanelAvailability;
  /** The boot-default panel modes; the persisted per-panel override wins thereafter. */
  readonly panelDefaults: Record<PanelName, PanelMode>;
  readonly placeholder: SectionPlaceholderCopy;
  /** REQUIRED — a real content pane, or the DECLARED-PLANNED arm (`{ planned: "<reason>" }`). */
  readonly content: (() => ReactNode) | { readonly planned: string };
  readonly header?: () => ReactNode;
  /** REQUIRED — `{ kind: "none" }` is an explicit decision, never an absence. */
  readonly context: ContextDefinition;
  /** What the MOBILE topbar calls the current screen — the OPEN member's own name (side-eye P2: every
   *  section but chats named the SECTION over a member, because only chats supplied a topbar `header`).
   *  A hook, called by the shell inside a component KEYED on the active section, so it may read the
   *  section's own cache; `null` = nothing open, or the name has not landed yet — the shell then prints the
   *  section label, never a blank bar.
   *
   *  IT NAMES THE SCREEN, NOT ONLY A MEMBER (#1670). With nothing open, a section MAY answer with its own
   *  roster's name instead of falling back — which is how a phone gets its LIST census printed at all: the
   *  ONE-NAME rule sheds the LIST band's title (`features/app-shell/surfaces/shell.css`) and the count
   *  travels inside it (`components/list-pane-header.tsx`), so the surviving noun has to carry it
   *  (`Characters · 327`). A section that answers `null` here keeps today's bare section label.
   *
   *  REQUIRED on EVERY section, including the ones with no list: `{@link NO_SELECTION_TITLE}` is the answer
   *  "I have no member to name", and spelling it is what lets the shell call this hook unconditionally
   *  (an optional field means a conditional hook call — `useHookAtTopLevel`, and it is right). */
  readonly useSelectionTitle: () => string | null;
}

/** A rail section as ONE definition. `context` is the NON-generic `ContextDefinition` (§6b) — a `tabs`
 *  host mints its own projection via `defineContextTabs<S>`, so `S` never crosses this seam. A section
 *  with neither a real `content` pane nor the DECLARED-PLANNED arm is the refinery bug — structurally
 *  impossible here; so is a `list` with no `selection` (the mobile ONE-SHELL rule, see `SectionSelection`). */
export type SectionDefinition = SectionDefinitionBase & (SectionWithList | SectionWithoutList);
