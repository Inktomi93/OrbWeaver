// The section VOCABULARY — extracted from shell-store.ts (which re-exports it, so every existing
// import path still resolves) when #181's resolveSectionPath pushed the store over the component-size
// cap. Pure data + guards only; the store owns all state.

/** The rail's navigable sections. `home` leads: it is the landing section (its rail affordance is the
 *  brand glyph, `rail.brand`), and the tuple order IS the rail/mobile-bar order.
 *  EDITING THIS TUPLE: walk the ten coupled sites in client-architecture-lockdown.md §6a (the SECTION_IDS
 *  playbook) — tsc carries only the door Record; the sanitizers, agent-nav vocabulary, CT mirror, mobile
 *  curation and placeholder copy are each a separate hand edit.
 *
 *  `databank` sits at the HEAD of the `authoring` run's library pair (databank · presets), directly after
 *  `config`: it is a library you author into, and the order reads config → the two libraries → refinery.
 *
 *  `extensions` sits DIRECTLY AFTER `config`, and the placement is the decision the tuple order forces you to
 *  make (plugin-ui-plane §4.5b recommends "beside `config`"): an extension page is a thing you configured the
 *  app to have, so it reads as the neighbour of the Configuration workspace rather than as a library you author
 *  into. It leads the `authoring` run so the libraries stay adjacent to each other. */
export const SECTION_IDS = ["home", "chats", "characters", "corpus", "config", "extensions", "databank", "presets", "refinery", "analytics"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** RETIRED section ids → where a user whose storage still names one should LAND. A retired id is not a
 *  vocabulary member (it fails `isSectionId`, `__orb.nav` rejects it, no definition exists), but a stored
 *  `activeSection` is the last place a user WAS — dropping them at the born default would silently teleport
 *  them home from a section they were using yesterday. `worldInfo` heals to `config` and not to `home`
 *  because the world-info library did not disappear: it is a collection in the Configuration workspace now
 *  (R2), so `config` is the same shelf under a new roof. A row retires when nobody could still be carrying
 *  the id — persisted shell state has no expiry, so in practice these rows are permanent. */
export const RETIRED_SECTION_HEAL: Readonly<Record<string, SectionId>> = {
  worldInfo: "config",
};

export function isSectionId(v: unknown): v is SectionId {
  return typeof v === "string" && (SECTION_IDS as readonly string[]).includes(v);
}

/**
 * A URL path SEGMENT → the section it deep-links to, or `null` for "not a section" (#181 — `routes/router.tsx`
 * resolves `/<segment>` through this and 404s on `null`).
 *
 * It is `resolveStoredSection`'s sibling and deliberately NOT the same function: a stored value is a user's
 * last position and must ALWAYS produce a section (its miss arm is the born default), while a URL segment is
 * an assertion that may simply be wrong — `/nonsense` must reach the router's `notFound`, never teleport the
 * visitor home. The two share the vocabulary and the retired-id heal map, which is why this lives beside the
 * store and not in `routes/`: the path spelling IS the section id (no second map to drift), and a link a user
 * bookmarked before a rename lands where their stored id would.
 */
export function resolveSectionPath(segment: string): SectionId | null {
  if (isSectionId(segment)) {
    return segment;
  }
  return RETIRED_SECTION_HEAL[segment] ?? null;
}
