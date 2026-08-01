// assembleChrome (shell-chrome-unification.md §A/§E-2) — the PURE, unit-testable assembly the door
// (main.tsx) runs ONCE to produce the flat `ChromeEntry[]` it hands to `createContributorRegistry`.
// Entries come from three sources by DERIVATION, never re-declaration: rail SECTIONS (from each
// `SectionDefinition.rail`), MODAL triggers whose placement maps to a chrome zone (from each
// `ModalDefinition.trigger`), and the feature-owned WIDGET entries. It dupe-checks ids, validates every
// zone against `CHROME_ZONES`, and imposes the canonical per-zone order (the sort below), so a consumer
// filters by zone and TRUSTS the order — the order algebra has ONE home, here.
//
// PLACEMENT_ZONE maps the `MODAL_TRIGGER_PLACEMENTS` that surface as chrome. Only `rail.end → rail.end`
// maps: the rail consumes these rail.end entries as its footer affordances (§E-3 single-DOM cutover).
// `topbar.trail` (⌘K) is DELIBERATELY absent — the topbar still renders its bespoke ⌘K chip (whose modal id
// is already derived from the trigger placement); folding ⌘K into a generically-rendered topbar.trail entry
// is a VISIBLE change deferred to N1's skin pass. `surface`/`mobile-tab` have no chrome zone (a feature
// surface reached by `openModal(id)` · the mobile bar). The persona identity avatar is no longer a modal
// placement at all — it's a `rail.end` WIDGET entry (`personaChrome`, §E-6), passed straight through below.

import type { ChromeEntry, ChromeZone } from "./chrome-registry";
import { CHROME_ZONES } from "./chrome-registry";
import type { ModalDefinition, ModalTriggerPlacement } from "./modal-registry";
import type { SectionDefinition } from "./section-registry";

const CHROME_ZONE_SET = new Set<string>(CHROME_ZONES);

/** Which modal-trigger placements surface as a chrome entry, and in which zone (today's vocab). */
const PLACEMENT_ZONE: Partial<Record<ModalTriggerPlacement, ChromeZone>> = {
  "rail.end": "rail.end",
};

export interface AssembleChromeInput {
  readonly sections: readonly SectionDefinition[];
  readonly modals: readonly ModalDefinition[];
  readonly widgets: readonly ChromeEntry[];
}

/** A rail section as a rail chrome entry: `order = index` preserves the SECTION_IDS tuple order the rail
 *  groups by; the section's explicit `mobile` curation carries straight through. The ZONE is the section's
 *  own declaration (`rail.brand` for the home section, else the `rail.nav` default) — this is the whole
 *  mechanism by which app-shell navigates home without naming it (home-section-spec §4.1). */
function sectionEntry(def: SectionDefinition, index: number): ChromeEntry {
  return {
    id: def.id,
    label: def.rail.label,
    icon: def.rail.icon,
    zone: def.rail.zone ?? "rail.nav",
    group: def.rail.group,
    order: index,
    mobile: def.rail.mobile,
    behavior: { kind: "section", sectionId: def.id },
  };
}

/** A mapped modal trigger as a chrome entry: label/icon from the trigger, `order = index` for a
 *  deterministic per-zone order. The affordance opens the modal (behavior arm carries only the id). */
function modalEntry(def: ModalDefinition, zone: ChromeZone, index: number): ChromeEntry {
  return {
    id: def.id,
    label: def.trigger.label,
    icon: def.trigger.icon,
    zone,
    order: index,
    behavior: { kind: "modal", modalId: def.id },
  };
}

/**
 * Derives + validates + orders the full chrome entry list. THROWS on a duplicate id across all sources
 * (the shadow-def the contributor registry only catches at runtime — caught eagerly here) or a zone
 * outside CHROME_ZONES. Returns entries in canonical order: `order` ascending, then `id` — a total order,
 * so the result is deterministic regardless of input order and stable within every zone once filtered.
 */
export function assembleChrome({ sections, modals, widgets }: AssembleChromeInput): readonly ChromeEntry[] {
  const entries: ChromeEntry[] = [
    ...sections.map(sectionEntry),
    ...modals.flatMap((def, index) => {
      const zone = PLACEMENT_ZONE[def.trigger.placement];
      return zone === undefined ? [] : [modalEntry(def, zone, index)];
    }),
    ...widgets,
  ];

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`assembleChrome: duplicate chrome entry id "${entry.id}"`);
    }
    seen.add(entry.id);
    if (!CHROME_ZONE_SET.has(entry.zone)) {
      throw new Error(`assembleChrome: chrome entry "${entry.id}" declares zone "${entry.zone}", not one of CHROME_ZONES`);
    }
  }

  return entries.toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}
