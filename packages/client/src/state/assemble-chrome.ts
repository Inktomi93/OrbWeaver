// assembleChrome — the PURE, unit-testable assembly the door
// (main.tsx) runs ONCE to produce the flat `ChromeEntry[]` it hands to `createContributorRegistry`.
// Entries come from three sources by DERIVATION, never re-declaration: rail SECTIONS (from each
// `SectionDefinition.rail`), MODAL triggers whose placement maps to a chrome zone (from each
// `ModalDefinition.trigger`), and the feature-owned WIDGET entries. It dupe-checks ids, validates every
// zone against `CHROME_ZONES`, and imposes the canonical per-zone order (the sort below), so a consumer
// filters by zone and TRUSTS the order — the order algebra has ONE home, here.
//
// PLACEMENT_ZONE maps the `MODAL_TRIGGER_PLACEMENTS` that surface as chrome: `rail.end` (the rail's footer
// affordances, §E-3 single-DOM cutover) and `topbar.trail` (the ⌘K command palette).
//
// TRUTH REPAIR, #1789 (owner ruling 2026-09-06): `topbar.trail` used to be DELIBERATELY unmapped, with the
// topbar rendering a bespoke ⌘K chip off its own `useModalRegistry()` lookup — the §E-2 note called that a
// VISIBLE change deferred to N1's skin pass. It is no longer deferred, and the deferral had a cost D73 does
// not tolerate: the zone's CONTENTS and its ORDER came from a second place, so the ONE registry could not
// answer for the affordance its own lens was supposed to own. The chip's rendered anatomy is unchanged —
// `CommandChip` is now the presentation the trail's MODAL arm draws (topbar-trail.tsx), reached through the
// entry, and its lead position is `commandModal.trigger.order` (-10) rather than a JSX position.
//
// The other two placements are NOT chrome, by ruling: `surface` is reached only by an explicit
// `openModal(id)` from inside a feature surface, and `mobile-tab` is the You sheet — whose bar button is the
// INTRINSIC DOOR to the mobile projection OF this registry (a door that is an entry inside the projection it
// opens would be circular; D73 keeps the frame's own grammar intrinsic). The persona identity avatar is no
// longer a modal placement at all — it's a `rail.end` WIDGET entry (`personaChrome`, §E-6), passed through.

import type { ChromeEntry, ChromeZone } from "./chrome-registry.ts";
import { CHROME_ZONES } from "./chrome-registry.ts";
import type { ModalDefinition, ModalTriggerPlacement } from "./modal-registry.ts";
import type { SectionDefinition } from "./section-registry.ts";

const CHROME_ZONE_SET = new Set<string>(CHROME_ZONES);

/** Which modal-trigger placements surface as a chrome entry, and in which zone (today's vocab). */
const PLACEMENT_ZONE: Partial<Record<ModalTriggerPlacement, ChromeZone>> = {
  "rail.end": "rail.end",
  "topbar.trail": "topbar.trail",
};

export interface AssembleChromeInput {
  readonly sections: readonly SectionDefinition[];
  readonly modals: readonly ModalDefinition[];
  readonly widgets: readonly ChromeEntry[];
}

/** A rail section as a rail chrome entry: `order = index` preserves the SECTION_IDS tuple order the rail
 *  groups by; the section's explicit `mobile` curation carries straight through. The ZONE is the section's
 *  own declaration (`rail.brand` for the home section, else the `rail.nav` default) — this is the whole
 *  mechanism by which app-shell navigates home without naming it. */
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

/** A mapped modal trigger as a chrome entry: every presentation axis comes off the trigger, so a lens never
 *  re-decides one. `order` falls back to the derivation index — deterministic, but arbitrary — which is why
 *  a trigger whose position is a DECISION declares it (⌘K's `-10` leads `topbar.trail`); `mobile` is spread
 *  only when declared (exactOptionalPropertyTypes: an explicit `undefined` is not the same as absent, and
 *  absent is what `ChromeEntry` documents as "the zone's default"). The affordance opens the modal (the
 *  behavior arm carries only the id). */
function modalEntry(def: ModalDefinition, zone: ChromeZone, index: number): ChromeEntry {
  return {
    id: def.id,
    label: def.trigger.label,
    icon: def.trigger.icon,
    zone,
    order: def.trigger.order ?? index,
    ...(def.trigger.mobile === undefined ? {} : { mobile: def.trigger.mobile }),
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
