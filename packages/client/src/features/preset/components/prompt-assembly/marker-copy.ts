// Plain-language per-marker copy for the Assembly — a `Record<MarkerType, …>` keyed exhaustively off the
// `MarkerType` enum, so adding a marker and forgetting its copy is a tsc error here, not a blank row in
// production. `label` names the rack row/drill-in header; `oneLiner` explains the marker; `subtitle` is
// the terser rack-row source hint.
//
// CARRIER_ATTRIBUTION (preset-surface-redesign §5.2) is the second map: a PLAIN marker carries no
// `template` field in the schema — that absence IS the carrier distinction — so its drill-in body slot
// renders a SOURCE-ATTRIBUTION panel instead of a textarea, naming where the substance flows from and
// (where one exists) the library that manages it. Keyed off the derived plain-marker union, so a new
// plain marker is a tsc error here rather than an empty body slot.

import type { DEFAULT_MARKER_TEMPLATES, MarkerType } from "@orb/contracts/preset";
import type { LucideIcon } from "@orb/ui/icons";
import { BookOpen, CircleUser, Drama, History, Library, MapPin, MessagesSquare, Scroll, ScrollText, Sparkles, Zap } from "@orb/ui/icons";

export interface MarkerCopy {
  readonly label: string;
  readonly oneLiner: string;
  readonly subtitle: string;
  /** The rack row's TYPE GLYPH. Per-MARKER, not per-kind (side-eye F-17): a kind glyph made nine of the
   *  twelve default rows identical sparkle discs — the loudest column in the pane carrying near-zero
   *  information. The mock draws a distinct glyph per slot, and the glyph is the only thing that lets the
   *  eye find "the character card's description" without reading. */
  readonly glyph: LucideIcon;
  /** A FIXED-BY-PRODUCT firing cue for the rack row (crunch item 16 / the mock's `⚡ steered turns`). Not
   *  the section's editable `trigger` list — this is a fact about the MARKER that no preset can change, so
   *  it belongs to the registry rather than to a stored field. Absent for every marker that fires on every
   *  generation (almost all of them); a marker with BOTH renders its own trigger list, since that is the
   *  half the user chose. */
  readonly firesCue?: string;
}

/** The plain-language copy for every marker slot. Exhaustive over `MarkerType` by construction. */
export const MARKER_COPY: Record<MarkerType, MarkerCopy> = {
  ["main_prompt"]: {
    label: "Main prompt",
    oneLiner: "Your top-level system instruction — the character's card can replace it in place.",
    subtitle: "your core system instruction",
    glyph: Sparkles,
  },
  ["char_description"]: {
    label: "Character description",
    oneLiner: "The active character's description, wrapped by this section's framing.",
    subtitle: "from the character card",
    glyph: BookOpen,
  },
  ["char_personality"]: {
    label: "Character personality",
    oneLiner: "The active character's personality summary.",
    subtitle: "from the character card",
    glyph: Drama,
  },
  ["scenario"]: {
    label: "Scenario",
    oneLiner: "The scene or setting the character card declares.",
    subtitle: "from the character card",
    glyph: MapPin,
  },
  ["dialogue_examples"]: {
    label: "Dialogue examples",
    oneLiner: "Example exchanges that teach the character's voice.",
    subtitle: "from the character card",
    glyph: ScrollText,
  },
  ["post_history"]: {
    label: "Post-history instructions",
    oneLiner: "A reminder placed after the conversation — the character's card can replace it in place.",
    subtitle: "reminder after the conversation",
    glyph: Sparkles,
  },
  ["persona"]: {
    label: "Persona",
    oneLiner: "Who YOU are in the scene — your persona's description.",
    subtitle: "from your persona",
    glyph: CircleUser,
  },
  ["memory"]: {
    label: "Memory",
    oneLiner: "Long-term notes carried forward from earlier in the chat.",
    subtitle: "remembered past events",
    glyph: History,
  },
  ["compact_summary"]: {
    label: "Summary",
    oneLiner: "The running summary of the conversation so far (from /compact).",
    subtitle: "conversation summary",
    glyph: Scroll,
  },
  ["guided_instruction"]: {
    label: "Guided instruction",
    oneLiner: "The wrapper that lands when you steer a generation (see Guided actions).",
    subtitle: "your steer, wrapped",
    glyph: Zap,
    // The assembler renders this slot ONLY when a guided steer resolved (`assemble.ts` →
    // `serverMarkerValue`'s `ctx.guidedInstruction`), so on an ordinary turn the row costs nothing and
    // contributes nothing. That is the one row where "always on" would misread, hence the cue.
    firesCue: "steered turns",
  },
  ["chat_history"]: {
    label: "Chat history",
    oneLiner: "The conversation itself — the pivot everything sits before or after.",
    subtitle: "the conversation",
    glyph: MessagesSquare,
  },
  ["world_info_before"]: {
    label: "World info (before)",
    oneLiner: "Lorebook entries positioned to sit before the conversation.",
    subtitle: "lorebook — before",
    glyph: Library,
  },
  ["world_info_after"]: {
    label: "World info (after)",
    oneLiner: "Lorebook entries positioned to sit after the conversation.",
    subtitle: "lorebook — after",
    glyph: Library,
  },
};

/** The "manage it over there" door. Every carrier whose substance is authored elsewhere is authored in a
 *  Configuration-workspace COLLECTION (world info left the rail at R2), so the door carries a collection KIND
 *  and the consumer fires `goToCollection`, which lands the reader on that library with its group already
 *  open rather than on a closed door. If a carrier's source is ever a rail SECTION again, this becomes a
 *  kinded union in the feature's `contract/` — not a second field here. */
interface CarrierManageDoor {
  readonly label: string;
  /** The `CollectionContribution.id` — a host-opaque string, spelled here because a cross-feature import of
   *  the owning feature's constant is dep-cruiser RED (every landed `goToCollection` call site does the same). */
  readonly collection: string;
}

/** Where a CARRIER's substance comes from, and where you go to manage it. `manage` is absent when the
 *  source is the conversation itself — there is nowhere to navigate, and a link to nothing is worse than
 *  none (§16 row 30: the link is a cross-SURFACE navigation echo, never a route fork). */
export interface CarrierAttribution {
  /** What flows in, stated as the reason this body is not editable here. */
  readonly sentence: string;
  readonly manage?: CarrierManageDoor | undefined;
}

/** The world-info library's collection kind (see {@link ManageCollectionDoor.collection}). */
const WORLD_INFO_COLLECTION = "worldInfo";

/** The PLAIN markers — exactly the `MarkerType`s with no `template` field (the schema's own branch is the
 *  authority; no flag is invented). Derived, so a new plain marker fails `tsc` at the map below. */
type PlainMarker = Exclude<MarkerType, keyof typeof DEFAULT_MARKER_TEMPLATES>;

export const CARRIER_ATTRIBUTION: Record<PlainMarker, CarrierAttribution> = {
  ["chat_history"]: {
    sentence: "This is the conversation itself — every message in the chat, spliced in at this point. There is nothing to write here.",
  },
  ["world_info_before"]: {
    sentence:
      "This content is pulled from World info and cannot be edited here — which entries are active is decided per chat, as the conversation triggers them.",
    manage: { label: "Manage in World info", collection: WORLD_INFO_COLLECTION },
  },
  ["world_info_after"]: {
    sentence:
      "This content is pulled from World info and cannot be edited here — which entries are active is decided per chat, as the conversation triggers them.",
    manage: { label: "Manage in World info", collection: WORLD_INFO_COLLECTION },
  },
};
