// Assembly view-model helpers: pure, node-safe. The one home for the per-section type classification
// the rack + inspector both branch on, plus the small static vocabularies the inspector selects over.
// Deriving it once here keeps the three surfaces from drifting.

import type { GenerationType, MarkerType, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES, GENERATION_TYPES, MARKER_TYPES } from "@orb/contracts/preset";
import type { MessageRole } from "@orb/kit/message-role";
import { MARKER_COPY } from "../components/prompt-assembly/marker-copy";

/** The three section kinds the rack + inspector branch on (derived from a section, never stamped). */
export const SECTION_KINDS = ["literal", "templatedMarker", "plainMarker"] as const;
type SectionKind = (typeof SECTION_KINDS)[number];

/** The rack's two view modes. */
export const ASSEMBLY_MODES = ["compose", "preview"] as const;

/** A templated marker is exactly a key of `DEFAULT_MARKER_TEMPLATES`. */
export function isTemplatedMarker(
  marker: MarkerType,
): marker is keyof typeof DEFAULT_MARKER_TEMPLATES {
  return marker in DEFAULT_MARKER_TEMPLATES;
}

/** Classify a section into its rack/inspector KIND (literal · templated marker · plain marker). */
export function sectionKind(section: PromptSection): SectionKind {
  if (section.type === "literal") {
    return "literal";
  }
  return isTemplatedMarker(section.marker) ? "templatedMarker" : "plainMarker";
}

/** The two markers whose card/room override is user-facing — the inspector always surfaces their
 *  override-lock cluster. */
export const OVERRIDABLE_MARKERS: readonly MarkerType[] = ["main_prompt", "post_history"];

/** chat_history carries the transcript's own per-message roles — no editable role field. */
export function hasRoleField(section: PromptSection): boolean {
  return !(section.type === "marker" && section.marker === "chat_history");
}

/** A section's `role` (defaulted `system` in the schema). Non-system roles surface a U/A cue on the row. */
export function sectionRole(section: PromptSection): MessageRole {
  return section.role;
}

/** A `{value,label}` toggle item over a static vocabulary (the Triggers multi-toggle set). */
interface ToggleItem {
  readonly value: string;
  readonly label: string;
}

/** The human label per turn-type (the multi-toggle chips + the row Triggers pill). */
export const GENERATION_TYPE_LABELS: Record<GenerationType, string> = {
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
  const placed = new Set(
    sections.flatMap((s) => (s.type === "marker" ? [s.marker as MarkerType] : [])),
  );
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
