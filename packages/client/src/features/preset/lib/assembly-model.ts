// Assembly view-model helpers: pure, node-safe. The one home for the per-section type classification
// the rack + inspector both branch on, plus the small static vocabularies the inspector selects over.
// Deriving it once here keeps the three surfaces from drifting.

import type { GenerationType, MarkerType, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES, GENERATION_TYPES, MARKER_TYPES } from "@orb/contracts/preset";
import type { LucideIcon } from "@orb/ui/icons";
import { Anchor, Pencil, Sparkles } from "@orb/ui/icons";
import { MARKER_COPY } from "../components/prompt-assembly/marker-copy";

/** The three section kinds the rack + inspector branch on (derived from a section, never stamped). */
const SECTION_KINDS = ["literal", "templatedMarker", "plainMarker"] as const;
type SectionKind = (typeof SECTION_KINDS)[number];

/** The rack's two view modes. */
export const ASSEMBLY_MODES = ["compose", "preview"] as const;

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

/** The glyph icon for a section (literal → Pencil · templated marker → Sparkles · plain marker → Anchor)
 *  — the rack row + the body-editor header both cue the same kind. Pure: returns the icon COMPONENT; the
 *  caller renders `<Icon icon={sectionGlyphIcon(section)} size="sm" />` (JSX stays out of this node-safe model). */
export function sectionGlyphIcon(section: PromptSection): LucideIcon {
  const kind = sectionKind(section);
  if (kind === "literal") {
    return Pencil;
  }
  return kind === "templatedMarker" ? Sparkles : Anchor;
}

/** The header label + one-liner for a section (marker copy, or the neutral literal framing) — shared by
 *  the CENTER body-editor header and the CONTEXT inspector header. */
export function headerCopy(section: PromptSection): { readonly label: string; readonly oneLiner: string } {
  if (section.type === "marker") {
    const copy = MARKER_COPY[section.marker];
    return { label: copy.label, oneLiner: copy.oneLiner };
  }
  return { label: "Literal text", oneLiner: "Your own text, sent exactly as written." };
}

/** The two markers whose card/room override is user-facing — the inspector always surfaces their
 *  override-lock cluster. */
export const OVERRIDABLE_MARKERS: readonly MarkerType[] = ["main_prompt", "post_history"];

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
