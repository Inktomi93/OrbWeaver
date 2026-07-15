// The character-editor facet registry — registry-as-data: the CONTENT master list renders from
// `CHARACTER_CARD_FACETS`, so facet order/tiers/copy live in one place and the id union derives from the
// tuple. Voice = the fields that define the character (loud, first); Extras = authoring aids; Advanced =
// the quiet clerical overrides.

import type { LucideIcon } from "@orb/ui/icons";
import { Anchor, BookOpen, Drama, Hash, Info, Pencil, Send, Sparkles, Zap } from "@orb/ui/icons";

/** The facet tiers, in render order — the CONTENT master list's group headings (the hierarchy fix). */
export const CHARACTER_FACET_TIERS = ["voice", "extras", "advanced"] as const;

/** File-local — consumers read it via `CharacterCardFacet.tier` or derive from `CHARACTER_FACET_TIERS`. */
type CharacterFacetTier = (typeof CHARACTER_FACET_TIERS)[number];

/** The human heading for each tier. */
export const CHARACTER_FACET_TIER_LABELS: Record<CharacterFacetTier, string> = {
  voice: "Voice",
  extras: "Extras",
  advanced: "Advanced",
};

/** The facet ids, in strip order (Voice → Extras → Advanced). The canonical axis tuple — the id type is
 *  derived from it, never re-spelled as an inline union. */
export const CHARACTER_CARD_FACET_IDS = [
  "description",
  "personality",
  "scenario",
  "exampleMessages",
  "creatorNotes",
  "systemPrompt",
  "postHistoryInstructions",
  "depthPrompt",
  "regexScripts",
  "provenance",
] as const;

/** File-local — consumers read it via the exported `CharacterCardFacet["id"]` interface field. */
type CharacterCardFacetId = (typeof CHARACTER_CARD_FACET_IDS)[number];

/** One card-content facet (the master-list row + drill-in header copy). */
export interface CharacterCardFacet {
  readonly id: CharacterCardFacetId;
  readonly tier: CharacterFacetTier;
  readonly label: string;
  /** The plain-language subtitle (the row's second line + the drill-in one-liner). */
  readonly subtitle: string;
  readonly glyph: LucideIcon;
}

/** The registry, in render order. A `tsc` error until every id has a full entry. */
export const CHARACTER_CARD_FACETS: readonly CharacterCardFacet[] = [
  {
    id: "description",
    tier: "voice",
    label: "Description",
    subtitle: "Who they are — the core of the card.",
    glyph: BookOpen,
  },
  {
    id: "personality",
    tier: "voice",
    label: "Personality",
    subtitle: "A summary of traits and temperament.",
    glyph: Drama,
  },
  {
    id: "scenario",
    tier: "voice",
    label: "Scenario",
    subtitle: "The setting or situation the chat opens in.",
    glyph: Anchor,
  },
  {
    id: "exampleMessages",
    tier: "extras",
    label: "Example messages",
    subtitle: "Sample exchanges teaching the model their voice.",
    glyph: Sparkles,
  },
  {
    id: "creatorNotes",
    tier: "extras",
    label: "Creator notes",
    subtitle: "Notes for humans — never sent to the model.",
    glyph: Pencil,
  },
  {
    id: "systemPrompt",
    tier: "advanced",
    label: "System prompt",
    subtitle: "Overrides the assembled system prompt.",
    glyph: Send,
  },
  {
    id: "postHistoryInstructions",
    tier: "advanced",
    label: "Post-history instructions",
    subtitle: "Injected after history, just before the reply.",
    glyph: Send,
  },
  {
    id: "depthPrompt",
    tier: "advanced",
    label: "Note at depth",
    subtitle: "A recurring note spliced in at a fixed depth.",
    glyph: Hash,
  },
  {
    id: "regexScripts",
    tier: "advanced",
    label: "Regex scripts",
    subtitle: "Find/replace passes over the card's text.",
    glyph: Zap,
  },
  {
    id: "provenance",
    tier: "advanced",
    label: "Provenance",
    subtitle: "Creator, version, and import metadata.",
    glyph: Info,
  },
];

/** The one facet by id (for the drill-in header / the CONTEXT Field inspector). A static lookup — an id can
 *  never miss (the union is closed), so no null branch. */
export function facetById(id: CharacterCardFacetId): CharacterCardFacet {
  // The registry is exhaustive over the id union (a `tsc`-checked tuple), so `find` always hits.
  return CHARACTER_CARD_FACETS.find((facet) => facet.id === id) as CharacterCardFacet;
}
