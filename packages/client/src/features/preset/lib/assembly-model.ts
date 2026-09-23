// Assembly view-model helpers: pure, node-safe. The one home for the per-section type classification
// the rack + inspector both branch on, plus the small static vocabularies the inspector selects over.
// Deriving it once here keeps the three surfaces from drifting.

import type { GenerationType, MarkerType, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES, GENERATION_TYPES, MARKER_TYPES } from "@orb/contracts/preset";
import type { LucideIcon } from "@orb/ui/icons";
import { Pencil } from "@orb/ui/icons";
import { MARKER_COPY } from "../components/prompt-assembly/marker-copy.ts";

/** The three section kinds the rack + inspector branch on (derived from a section, never stamped). */
const SECTION_KINDS = ["literal", "templatedMarker", "plainMarker"] as const;
type SectionKind = (typeof SECTION_KINDS)[number];

/** A templated marker is exactly a key of `DEFAULT_MARKER_TEMPLATES`. */
export function isTemplatedMarker(marker: MarkerType): marker is keyof typeof DEFAULT_MARKER_TEMPLATES {
  return marker in DEFAULT_MARKER_TEMPLATES;
}

/** Classify a section into its rack/inspector KIND (literal · templated marker · plain marker). */
export function sectionKind(section: PromptSection): SectionKind {
  if (section.type === "literal") {
    return "literal";
  }
  return isTemplatedMarker(section.marker) ? "templatedMarker" : "plainMarker";
}

// TYPE-PREDICATE NARROWING (#73, owner-ruled 2026-08-15). ADDITIVE — `sectionKind`/`SectionKind` above
// stay for the 2 call sites that only need a label/branch string (`sectionGlyphIcon`/`headerCopy`,
// never reading marker-only fields afterward). `sectionKind` RETURNS a classification string; it does
// NOT narrow `section`'s TYPE for the caller (control-flow narrowing only tracks a function declared
// `x is T`), so 3 component-prop-boundary sites (`section-drill-in.tsx` `OverrideLocks`,
// `prompt-readout.tsx` `SelectedSectionAttribution`, `section-body.tsx`
// `TemplatedMarkerBody`/`CarrierBody`) re-derive the same guard by hand because a `section: PromptSection`
// prop crosses a JSX boundary with no narrowing to inherit. These predicates give those 3 sites a real
// TS `section is X` guard to narrow their PROP TYPE at, so a future 4th marker sub-kind that needs
// updating here fails `tsc` at every narrowed call site instead of silently landing in only 2 of 3 `if`s
// (Spine-TypeScript-and-Patterns.md §"String-union dispatch discipline").
type MarkerSection = Extract<PromptSection, { type: "marker" }>;
type TemplatedMarkerSection = MarkerSection & { readonly marker: keyof typeof DEFAULT_MARKER_TEMPLATES };
type PlainMarkerSection = MarkerSection & { readonly marker: Exclude<MarkerType, keyof typeof DEFAULT_MARKER_TEMPLATES> };

/** Narrows to the templated-marker arm — same test as `isTemplatedMarker`, applied to the whole section
 *  so a caller crossing a component-prop boundary keeps the narrowing (`section.template`/`.marker` read
 *  safely afterward). */
export function isTemplatedMarkerSection(section: PromptSection): section is TemplatedMarkerSection {
  return section.type === "marker" && isTemplatedMarker(section.marker);
}

/** Narrows to the plain-marker arm (a pure carrier — no `template`/override fields). */
export function isPlainMarkerSection(section: PromptSection): section is PlainMarkerSection {
  return section.type === "marker" && !isTemplatedMarker(section.marker);
}

/** The glyph icon for a section — the MARKER'S OWN glyph (`MARKER_COPY.glyph`), and Pencil for a literal
 *  (the author's own text). Per-marker, not per-kind (side-eye F-17): a kind glyph rendered nine of the
 *  twelve default rows as the same sparkle, so the rack's loudest column carried almost no information.
 *  Pure: returns the icon COMPONENT; the caller renders `<Icon icon={sectionGlyphIcon(section)} />` (JSX
 *  stays out of this node-safe model). */
export function sectionGlyphIcon(section: PromptSection): LucideIcon {
  return section.type === "literal" ? Pencil : MARKER_COPY[section.marker].glyph;
}

/** The drill-in header's label + one-liner. The LABEL is the section's own NAME when it has one — the
 *  drill-in is reached from a rack row, and a header that renamed "Style guide" to "Literal text" between
 *  the click and the editor reads as having opened something else. The one-liner stays the KIND's copy
 *  (what this slot is), which is the half a name cannot carry. */
export function headerCopy(section: PromptSection): { readonly label: string; readonly oneLiner: string } {
  const named = section.name.trim();
  if (section.type === "marker") {
    const copy = MARKER_COPY[section.marker];
    return { label: named === "" ? copy.label : named, oneLiner: copy.oneLiner };
  }
  return { label: named === "" ? "Literal text" : named, oneLiner: "Your own text, sent exactly as written." };
}

/** The two markers whose card/room override is user-facing — the drill-in always surfaces their
 *  override-lock cluster. */
export const OVERRIDABLE_MARKERS: readonly MarkerType[] = ["main_prompt", "post_history"];

/** The conversation PIVOT — `chat_history`. It can be neither deleted, disabled, nor silenced:
 *  a preset whose pivot is off is an assembly with nowhere to splice
 *  the conversation, which is the exact state the missing-pivot warning exists to prevent. */
export function isPivotSection(section: PromptSection): boolean {
  return section.type === "marker" && section.marker === "chat_history";
}

/** Is this section STRUCTURAL — i.e. a MARKER (§5.2, ST parity)? A marker is part of the prompt's fixed
 *  anatomy: its ⋯ menu omits Duplicate and Delete entirely (never a disabled Delete), and its one
 *  off-switch is the enable toggle. Only `literal` sections are user-authored, and only they are
 *  deletable. The contract's own three-branch union IS the classification — nothing is stamped. */
export function isStructuralSection(section: PromptSection): boolean {
  return section.type === "marker";
}

/** The Placement cluster's ZONE vocabulary (crunch-list O-9★, owner ruling). The two arms are the two
 *  DELIVERIES the assembler actually performs, named for what they do rather than for which side of the
 *  pivot they sit on:
 *
 *   · RELATIVE — the section renders into the system block, ordered among the other prompts. This is a
 *     `setup` (pre-pivot) section with no splice: `injectionDepthFor` returns `null` for it
 *     (`domain/chat/assembly/assemble.ts`), i.e. no depth exists to speak of.
 *   · IN CHAT — the section is spliced into the conversation at a DEPTH. That is exactly a `post`
 *     (post-pivot) section: the same function returns `inject.depth`, or 0 (the tail) when none is set.
 *
 *  So DEPTH and ORDER are In-Chat vocabulary only, and the drill-in renders them only on that arm
 *  (absent, never disabled — the `628a3666` carrier precedent). The zone itself stays DERIVED from the
 *  section's position relative to the pivot, so picking one is a MOVE across it (the same
 *  `moveFieldValues` the drag and the ⋯ Move-above/below item go through — one home, §16 row 17), never a
 *  stored field. */
/*  THE LABELS ARE THE BARE NAMES (side-eye F-26): the em-dash explanations rode INSIDE the option, and the
 *  Select trigger is one truncating line in a half-width pair track — so the committed value rendered
 *  "Relative — ordered among the…", which is O-4's disease in a new box (the half a user reads is the half
 *  that got cut). The explanation is not lost: it is the Zone Field's own `hint`, which states both arms in
 *  full, and it is restated here for the reader of this file. A control's label names the choice; the
 *  teaching belongs to the affordance built for teaching. */
export const ZONE_ITEMS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "setup", label: "Relative" },
  { value: "post", label: "In Chat" },
];

/** Can this section be SPLICED into the conversation (an `inject` depth/order)? The schema's own branch
 *  is the authority: `inject` exists on the LITERAL and TEMPLATED-marker arms only — a PLAIN marker (a
 *  pure carrier) declares no such field, so offering it would write a shape the contract rejects. The
 *  absence IS the answer; nothing is disabled.
 *
 *  TRIGGER-FILTERING IS A SEPARATE AXIS (#1462 fold, #1736): `trigger` is declared on ALL THREE branches
 *  — the three plain markers (`world_info_before`/`world_info_after`/`chat_history`) carry it too (ST
 *  sets `injection_trigger` on every prompt-manager entry, and the assembler honours it —
 *  `sectionTriggers`/`hasActiveMarker`/the pivot's own `sendHistory`). A caller deciding the Triggers
 *  cluster's visibility must NOT use this predicate — it answers the placement question only. */
export function supportsArrangement(section: PromptSection): boolean {
  return section.type === "literal" || isTemplatedMarker(section.marker);
}

/** chat_history carries the transcript's own per-message roles — no editable role field. */
export function hasRoleField(section: PromptSection): boolean {
  return !(section.type === "marker" && section.marker === "chat_history");
}

/** A `{value,label}` toggle item over a static vocabulary (the Triggers multi-toggle set). */
interface ToggleItem {
  readonly value: string;
  readonly label: string;
}

/** The human label per turn-type (the multi-toggle chips + the row Triggers pill). */
const GENERATION_TYPE_LABELS: Record<GenerationType, string> = {
  normal: "Normal",
  continue: "Continue",
  impersonate: "Impersonate",
  swipe: "Swipe",
  regenerate: "Regenerate",
  quiet: "Quiet",
};

export const GENERATION_TYPE_ITEMS: readonly ToggleItem[] = GENERATION_TYPES.map((value) => ({
  value,
  label: GENERATION_TYPE_LABELS[value],
}));

/** The Triggers-pill label for a section's trigger list, comma-joined. Empty/undefined ⇒ `null`. */
export function triggersPillLabel(trigger: readonly GenerationType[] | undefined): string | null {
  if (trigger === undefined || trigger.length === 0) {
    return null;
  }
  return trigger.map((t) => GENERATION_TYPE_LABELS[t]).join(", ");
}

/** A section id for a newly-added section — a plain unique string (section ids are config-local, not
 *  a branded entity id). */
function newSectionId(): string {
  return globalThis.crypto.randomUUID();
}

/** One entry the Add menu offers: a literal, or a specific not-yet-placed marker. */
export interface AddableSection {
  /** `null` = a literal; a `MarkerType` = that marker. */
  readonly marker: MarkerType | null;
  readonly label: string;
}

/** The Add-menu options given the sections already placed: "Literal text" + every ABSENT marker. */
export function addableSections(sections: readonly PromptSection[]): readonly AddableSection[] {
  const placed = new Set(sections.flatMap((s) => (s.type === "marker" ? [s.marker as MarkerType] : [])));
  const markers: AddableSection[] = MARKER_TYPES.filter((m) => !placed.has(m)).map((marker) => ({
    marker,
    label: MARKER_COPY[marker].label,
  }));
  return [{ marker: null, label: "Literal text" }, ...markers];
}

/** Build a fresh section to append. Markers seed their default framing implicitly; a literal starts
 *  empty. */
export function makeSection(marker: MarkerType | null): PromptSection {
  if (marker === null) {
    return {
      type: "literal",
      id: newSectionId(),
      name: "New literal",
      role: "system",
      content: "",
      enabled: true,
    };
  }
  return {
    type: "marker",
    id: newSectionId(),
    name: MARKER_COPY[marker].label,
    marker,
    role: "system",
    enabled: true,
  };
}

/** The steer token every guided-action template carries — where the user's composer text lands. ONE home
 *  (the card header copy + the empty/lint resolver both read it). */
export const GUIDED_INPUT_TOKEN = "{{input}}";

/** The guided-action card footer's derived state (F8). An EMPTY template is the ghosted default, NOT a
 *  customization: at resolve an empty template returns the bare (neutralized) steer input (kit/guided) —
 *  the field ghosts `factoryDefault` for that state, so the footer reads "Default" like an untouched card
 *  (matching opening/continue's default display). The missing-`{{input}}` lint therefore bites ONLY a
 *  non-empty template that dropped the token (that steer really vanishes) — never the empty case, where the
 *  bare input IS exactly what lands (so the old "won't land anywhere" copy was false for it). */
export interface GuidedFooterState {
  readonly isEmpty: boolean;
  readonly isDefault: boolean;
  readonly missingInputLint: boolean;
}
export function guidedFooterState(prompt: string, factoryDefault: string): GuidedFooterState {
  const isEmpty = prompt.trim().length === 0;
  return {
    isEmpty,
    isDefault: isEmpty || prompt === factoryDefault,
    missingInputLint: isEmpty ? false : !prompt.includes(GUIDED_INPUT_TOKEN),
  };
}
