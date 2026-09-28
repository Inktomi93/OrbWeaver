// The preset rack's cache-safety read model. The warning is derived from the same authored config the
// assembler consumes: section order establishes the cached prefix, the canonical parser establishes which
// source spans are real calls, and the registry-backed kit analyzer follows output consumption plus
// turn-state dependencies (including transitive user-macro calls).

import type { MarkerType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import type { MacroRegistry } from "@orb/kit/macro";
import { createDefaultRegistry, macroTextInvalidatesCache, registerUserMacros } from "@orb/kit/macro";
import { isTemplatedMarkerSection } from "./assembly-model.ts";

const PER_TURN_MARKERS: ReadonlySet<MarkerType> = new Set<MarkerType>(["memory", "databank", "guided_instruction", "world_info_before", "world_info_after"]);

function sectionText(section: PromptSection): string | null {
  if (section.type === "literal") {
    return section.content;
  }
  if (isTemplatedMarkerSection(section)) {
    return section.template ?? DEFAULT_MARKER_TEMPLATES[section.marker];
  }
  return null;
}

function changesPerTurn(section: PromptSection, registry: MacroRegistry): boolean {
  if ("trigger" in section && section.trigger !== undefined && section.trigger.length > 0) {
    return true;
  }
  if (section.type === "marker" && PER_TURN_MARKERS.has(section.marker)) {
    return true;
  }
  const text = sectionText(section);
  return text !== null && macroTextInvalidatesCache(text, registry);
}

// Assembly routes explicit-depth sections and non-system roles into chat history before it considers
// static/dynamic system halves. The three plain placement anchors are the exception: they always stay
// in the system walk and cannot carry an explicit injection by contract.
function entersCachedSystemPrefix(section: PromptSection): boolean {
  if (section.type === "marker" && (section.marker === "chat_history" || section.marker === "world_info_before" || section.marker === "world_info_after")) {
    return true;
  }
  if ("inject" in section && section.inject !== undefined) {
    return false;
  }
  return section.role === "system";
}

/** Enabled per-turn sections placed in the cached prefix, in rack order. */
export function cacheInvalidatingSections(config: PromptConfig, presetId: PresetId): readonly PromptSection[] {
  const pivotIndex = config.sections.findIndex((section) => section.type === "marker" && section.marker === "chat_history");
  if (pivotIndex <= 0) {
    return [];
  }
  const registry = createDefaultRegistry();
  registerUserMacros(registry, config.userMacros, { source: { kind: "preset", id: presetId } });
  return config.sections.slice(0, pivotIndex).filter((section) => section.enabled && entersCachedSystemPrefix(section) && changesPerTurn(section, registry));
}
