// The character-editor facet registry — registry-as-data: the CONTENT master list renders from
// `CHARACTER_CARD_FACETS`, so facet order/tiers/copy live in one place and the id union derives from the
// tuple. Voice = the fields that define the character (loud, first); Extras = authoring aids; Advanced =
// the quiet clerical overrides.

import type { LucideIcon } from "@orb/ui/icons";
import { Anchor, BookOpen, Drama, Hash, Info, Pencil, Send, Sparkles, Zap } from "@orb/ui/icons";
import type { CharacterCardFormValues } from "./character-card-form-model.ts";
import { CHARACTER_FACET_LABELS } from "./character-names.ts";

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

// Every id's row, so an omitted facet fails `tsc`; render order comes from the id tuple.
const CHARACTER_CARD_FACET_ROWS: Readonly<Record<CharacterCardFacetId, Omit<CharacterCardFacet, "id">>> = {
  description: {
    tier: "voice",
    label: CHARACTER_FACET_LABELS.description,
    subtitle: "Who they are: the core of the card.",
    glyph: BookOpen,
  },
  personality: {
    tier: "voice",
    label: CHARACTER_FACET_LABELS.personality,
    subtitle: "A summary of traits and temperament.",
    glyph: Drama,
  },
  scenario: {
    tier: "voice",
    label: CHARACTER_FACET_LABELS.scenario,
    subtitle: "The setting or situation the chat opens in.",
    glyph: Anchor,
  },
  exampleMessages: {
    tier: "extras",
    label: CHARACTER_FACET_LABELS.exampleMessages,
    subtitle: "Sample exchanges teaching the model their voice.",
    glyph: Sparkles,
  },
  creatorNotes: {
    tier: "extras",
    label: CHARACTER_FACET_LABELS.creatorNotes,
    subtitle: "Notes for humans: never sent to the model.",
    glyph: Pencil,
  },
  systemPrompt: {
    tier: "advanced",
    label: CHARACTER_FACET_LABELS.systemPrompt,
    subtitle: "Overrides the assembled system prompt.",
    glyph: Send,
  },
  postHistoryInstructions: {
    tier: "advanced",
    label: CHARACTER_FACET_LABELS.postHistoryInstructions,
    subtitle: "Injected after history, just before the reply.",
    glyph: Send,
  },
  depthPrompt: {
    tier: "advanced",
    label: CHARACTER_FACET_LABELS.depthPrompt,
    subtitle: "A recurring note spliced in at a fixed depth.",
    glyph: Hash,
  },
  regexScripts: {
    tier: "advanced",
    label: CHARACTER_FACET_LABELS.regexScripts,
    subtitle: "Find/replace passes over the card's text.",
    glyph: Zap,
  },
  provenance: {
    tier: "advanced",
    label: CHARACTER_FACET_LABELS.provenance,
    subtitle: "Creator, version, and import metadata.",
    glyph: Info,
  },
};

/** The one facet by id (for the drill-in header / the CONTEXT Field inspector). */
export function facetById(id: CharacterCardFacetId): CharacterCardFacet {
  return { id, ...CHARACTER_CARD_FACET_ROWS[id] };
}

/** The registry, in render order. */
export const CHARACTER_CARD_FACETS: readonly CharacterCardFacet[] = CHARACTER_CARD_FACET_IDS.map(facetById);

/** A facet preview is present exactly when the facet has authored content. */
export type CharacterFacetFill = { readonly filled: true; readonly preview: string } | { readonly filled: false; readonly preview: null };

function facetPreview(id: CharacterCardFacet["id"], values: CharacterCardFormValues, attachedRegexCount: number): string | null {
  switch (id) {
    case "depthPrompt": {
      const text = values.depthPromptText.trim();
      return text === "" ? null : text;
    }
    case "regexScripts": {
      return attachedRegexCount === 0 ? null : `${attachedRegexCount} ${attachedRegexCount === 1 ? "script" : "scripts"}`;
    }
    case "provenance": {
      const parts = [values.creator.trim(), values.cardVersion.trim()].filter((part) => part !== "");
      return parts.length === 0 ? null : parts.join(" · ");
    }
    case "description":
    case "personality":
    case "scenario":
    case "exampleMessages":
    case "systemPrompt":
    case "postHistoryInstructions":
    case "creatorNotes": {
      const text = values[id].trim();
      return text === "" ? null : text;
    }
  }
}

/** Resolve the preview and its fill marker from one reading of the draft. */
export function facetFillState(id: CharacterCardFacet["id"], values: CharacterCardFormValues, attachedRegexCount: number): CharacterFacetFill {
  const preview = facetPreview(id, values, attachedRegexCount);
  return preview === null ? { filled: false, preview: null } : { filled: true, preview };
}
